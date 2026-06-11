/**
 * Combined dashboard feed.
 * GET /api/dashboard?range=daily|weekly|monthly|total
 *
 * Returns:
 *   ga4:      { totals, bySource }
 *   typeform: { responses }
 *   funnel:   { visitors, quiz_submitters, quiz_finished, checkout_filled, buyers, revenue }
 *   tiers:    { tier269, tier419, tier468, tier618, downsell199, late, friend }
 *   errors:   { ... } when any source fails
 */

import { NextRequest, NextResponse } from "next/server";
import * as klaviyo from "@/lib/klaviyo";
import * as typeform from "@/lib/typeform";
import * as ga4 from "@/lib/ga4";
import { CONFIG } from "@/lib/config";

export const dynamic = "force-dynamic";

const LISTS  = CONFIG.klaviyo.lists;
const PRICES = CONFIG.klaviyo.tierPrices;

function getRange(range: string) {
  const now = new Date();
  const end = new Date(now);
  let start: Date;
  let label: string;

  switch (range) {
    case "daily":
      start = new Date(now); start.setUTCHours(0, 0, 0, 0);
      label = "Today";
      break;
    case "weekly":
      start = new Date(now); start.setUTCDate(start.getUTCDate() - 7);
      label = "Last 7 days";
      break;
    case "monthly":
      start = new Date(now); start.setUTCDate(start.getUTCDate() - 30);
      label = "Last 30 days";
      break;
    case "total":
    default:
      start = new Date("2024-01-01T00:00:00Z");
      label = "All time";
  }

  return {
    startISO: start.toISOString(),
    endISO:   end.toISOString(),
    ga4Start: start.toISOString().slice(0, 10),
    ga4End:   end.toISOString().slice(0, 10),
    label,
  };
}

/** Helper: count list-or-segment members, returns 0 on error. Tries list first, segment second. */
async function safeCount(id: string, key: string, errors: any): Promise<number> {
  if (!id) return 0;
  try {
    return await klaviyo.countMembers(id);
  } catch (e: any) {
    errors[`klaviyo_${key}`] = e.message;
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") || "weekly";
  /**
   * page param controls the GA4 page filter:
   *   - "all" (default) → use all CONFIG.ga4.landingPages
   *   - any configured pagePath (URL-decoded) → filter to just that one page
   * Unknown values fall back to "all" so the dashboard never blows up.
   */
  const pageParam   = req.nextUrl.searchParams.get("page") || "all";
  const allLanding  = CONFIG.ga4.landingPages.map((p) => p.path);
  const ga4Pages    = pageParam === "all" || !allLanding.includes(pageParam)
                       ? undefined        // undefined = use all configured pages
                       : [pageParam];     // single-page filter
  const { startISO, endISO, ga4Start, ga4End, label } = getRange(range);

  const out: any = {
    range,
    label,
    page: ga4Pages ? ga4Pages[0] : "all",
    landingPages: CONFIG.ga4.landingPages,   // expose to UI so it can render the picker
    ga4: null,
    typeform: null,
    funnel: null,
    tiers: null,
    errors: {},
  };

  // --- GA4 ----------------------------------------------------------
  const ga4Promise = (async () => {
    try {
      const [totals, bySource] = await Promise.all([
        ga4.totalsByRange(ga4Start, ga4End, ga4Pages),
        ga4.sessionsBySource(ga4Start, ga4End, ga4Pages),
      ]);
      out.ga4 = { totals, bySource };
    } catch (e: any) {
      out.errors.ga4 = e.message;
    }
  })();

  // --- Klaviyo lists -----------------------------------------------
  // NOTE: Klaviyo list counts are CUMULATIVE (all-time) — they don't shrink
  // when you switch to "Today / Weekly". Only GA4 + Typeform respect the range.
  const klaviyoPromise = (async () => {
    const errors = out.errors;
    const tier269     = await safeCount(LISTS.buyer269,      "buyer_269",     errors);
    const tier419     = await safeCount(LISTS.buyer419,      "buyer_419",     errors);
    const tier468     = await safeCount(LISTS.buyer468,      "buyer_468",     errors);
    const tier618     = await safeCount(LISTS.buyer618,      "buyer_618",     errors);
    const downsell199 = await safeCount(LISTS.buyerDownsell, "buyer_downsell", errors);
    const late        = await safeCount(LISTS.buyerLate,     "buyer_late",    errors);
    const friend      = await safeCount(LISTS.friend,        "friend",        errors);

    const quizSubmitters = await safeCount(LISTS.quizSubmitters, "quiz_submitters", errors);
    const quizFinished   = await safeCount(LISTS.quizFinished,   "quiz_finished",   errors);
    const checkoutFilled = await safeCount(LISTS.checkout,       "checkout",        errors);
    const abandonedCart  = await safeCount(LISTS.abandonedCart,  "abandoned_cart",  errors);
    const allBuyers      = await safeCount(LISTS.buyersAll,      "buyers_all",      errors);

    const revenue =
      tier269 * PRICES.tier269 +
      tier419 * PRICES.tier419 +
      tier468 * PRICES.tier468 +
      tier618 * PRICES.tier618 +
      downsell199 * PRICES.downsell199 +
      late * PRICES.late495;

    out.tiers = { tier269, tier419, tier468, tier618, downsell199, late, friend };
    out.funnel = {
      visitors:         null, // filled after GA4 promise resolves
      quiz_submitters:  quizSubmitters,
      quiz_finished:    quizFinished,
      checkout_filled:  checkoutFilled,
      abandoned_cart:   abandonedCart,
      buyers:           allBuyers || (tier269 + tier419 + tier468 + tier618 + downsell199 + late),
      revenue,
    };
    /* Expose list IDs so the frontend knows what to fetch when a card is clicked. */
    out.listIds = {
      quiz_submitters: LISTS.quizSubmitters,
      quiz_finished:   LISTS.quizFinished,
      checkout_filled: LISTS.checkout,
      abandoned_cart:  LISTS.abandonedCart,
      buyers:          LISTS.buyersAll,
      friend:          LISTS.friend,
      tier269:         LISTS.buyer269,
      tier419:         LISTS.buyer419,
      tier468:         LISTS.buyer468,
      tier618:         LISTS.buyer618,
      downsell:        LISTS.buyerDownsell,
      late:            LISTS.buyerLate,
    };

    /* --- Email-sequence tracks (Received + Opened) ---
     * Both run the same "hybrid: segments if filled, else auto-compute from
     * events" logic. Computed in parallel since they're independent.
     */
    async function computeTrack(cfg: any, errorKey: string) {
      const anySegment = cfg.stages.some((s: any) => !!s.segmentId);
      if (anySegment) {
        const stages = await Promise.all(
          cfg.stages.map(async (s: any) => {
            if (!s.segmentId) return { ...s, count: null, configured: false, mode: "segment" };
            const count = await safeCount(s.segmentId, `${errorKey}_day${s.day}`, errors);
            return { ...s, count, configured: true, mode: "segment" };
          })
        );
        return { label: cfg.label, stages, mode: "segment" };
      }
      try {
        const engagement = await klaviyo.getEmailEngagement({
          sourceListId:   cfg.sourceListId,
          metricName:     cfg.metricName,
          subjectPattern: cfg.subjectPattern,
          maxDay:         cfg.stages.length,
          lookbackDays:   cfg.lookbackDays,
        });
        const stages = cfg.stages.map((s: any) => {
          const match = engagement.stages.find((e) => e.day === s.day);
          return {
            ...s,
            count:      match ? match.count : 0,
            profiles:   match ? match.profiles : [],
            configured: true,
            mode:       "events",
          };
        });
        return {
          label:             cfg.label,
          stages,
          mode:              "events",
          totalListProfiles: engagement.totalListProfiles,
          totalMatched:      engagement.totalMatched,
        };
      } catch (e: any) {
        errors[errorKey] = e.message;
        return {
          label: cfg.label,
          stages: cfg.stages.map((s: any) => ({ ...s, count: null, configured: false, mode: "events" })),
          mode: "events",
        };
      }
    }

    const [emailReceived, emailSequence] = await Promise.all([
      computeTrack(CONFIG.klaviyo.emailReceived, "email_received"),
      computeTrack(CONFIG.klaviyo.emailSequence, "email_sequence"),
    ]);
    out.emailReceived = emailReceived;
    out.emailSequence = emailSequence;
  })();

  // --- Typeform ----------------------------------------------------
  const typeformPromise = (async () => {
    try {
      const count = await typeform.countResponses({
        // Typeform wants ISO with T: 2024-01-01T00:00:00 (NO space)
        since: startISO.slice(0, 19),
        until: endISO.slice(0, 19),
      });
      out.typeform = { responses: count };
    } catch (e: any) {
      out.errors.typeform = e.message;
    }
  })();

  await Promise.all([ga4Promise, klaviyoPromise, typeformPromise]);

  // Stitch GA4 visitors into the funnel object now that both have resolved.
  if (out.funnel && out.ga4?.totals?.users != null) {
    out.funnel.visitors = out.ga4.totals.users;
  }

  return NextResponse.json(out);
}
