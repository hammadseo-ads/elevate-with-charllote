/**
 * Dashboard feed split into 4 independently-cached sections so the user can
 * refresh ONE part of the dashboard without re-fetching the slow stuff
 * (especially email tracks, which scan 30 days of Klaviyo events).
 *
 * Sections:
 *   ga4            — totals + traffic by source        (keys: range, page)   ~2-3 sec
 *   funnel         — Klaviyo list counts + Typeform    (keys: range)         ~3-5 sec
 *   emailReceived  — 7-day Received-Email track        (no keys, constant)   ~10-15 sec
 *   emailOpened    — 7-day Opened-Email track          (no keys, constant)   ~10-15 sec
 *
 * GET /api/dashboard?range=X&page=Y[&sections=ga4,funnel,...]
 *   sections optional, defaults to all 4
 *
 * POST /api/dashboard/refresh[?section=ga4]
 *   ?section invalidates only that section's cache. No param = invalidate all.
 *
 * Each section has its own cache tag so per-section refresh works.
 */

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import * as klaviyo from "@/lib/klaviyo";
import * as typeform from "@/lib/typeform";
import * as ga4 from "@/lib/ga4";
import { CONFIG } from "@/lib/config";

/** Cache tags — exported so the /refresh route can target individual sections. */
export const DASHBOARD_TAGS = {
  all:           "dashboard",
  ga4:           "dashboard:ga4",
  funnel:        "dashboard:funnel",
  emailReceived: "dashboard:emailReceived",
  emailOpened:   "dashboard:emailOpened",
};

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

async function safeCount(id: string, key: string, errors: any): Promise<number> {
  if (!id) return 0;
  try {
    return await klaviyo.countMembers(id);
  } catch (e: any) {
    errors[`klaviyo_${key}`] = e.message;
    return 0;
  }
}

/* ============================================================
   Section 1: GA4 (totals + bySource) — keyed by (range, page)
   ============================================================ */
async function computeGA4(range: string, pageParam: string) {
  const allLanding = CONFIG.ga4.landingPages.map((p) => p.path);
  const ga4Pages   = pageParam === "all" || !allLanding.includes(pageParam)
                     ? undefined
                     : [pageParam];
  const { ga4Start, ga4End } = getRange(range);
  const errors: Record<string, string> = {};
  let ga4Data: any = null;
  try {
    const [totals, bySource] = await Promise.all([
      ga4.totalsByRange(ga4Start, ga4End, ga4Pages),
      ga4.sessionsBySource(ga4Start, ga4End, ga4Pages),
    ]);
    ga4Data = { totals, bySource };
  } catch (e: any) {
    errors.ga4 = e.message;
  }
  return { ga4: ga4Data, errors, cachedAt: new Date().toISOString() };
}

/* ============================================================
   Section 2: Funnel (Klaviyo lists + Typeform) — keyed by range
   ============================================================ */
async function computeFunnel(range: string) {
  const { startISO, endISO } = getRange(range);
  const errors: Record<string, string> = {};

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

  /* Typeform (range-respecting) */
  let typeformCount: number | null = null;
  try {
    typeformCount = await typeform.countResponses({
      since: startISO.slice(0, 19),
      until: endISO.slice(0, 19),
    });
  } catch (e: any) {
    errors.typeform = e.message;
  }

  return {
    tiers:    { tier269, tier419, tier468, tier618, downsell199, late, friend },
    funnel: {
      visitors:         null,   // filled in by frontend after merging with ga4
      quiz_submitters:  quizSubmitters,
      quiz_finished:    quizFinished,
      checkout_filled:  checkoutFilled,
      abandoned_cart:   abandonedCart,
      buyers:           allBuyers || (tier269 + tier419 + tier468 + tier618 + downsell199 + late),
      revenue,
    },
    listIds: {
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
    },
    typeform: { responses: typeformCount },
    errors,
    cachedAt: new Date().toISOString(),
  };
}

/* ============================================================
   Section 3 & 4: Email tracks — no keys (constant across range/page)
   ============================================================ */
async function computeEmailTrack(cfg: any, errorKey: string) {
  const errors: Record<string, string> = {};
  const anySegment = cfg.stages.some((s: any) => !!s.segmentId);
  if (anySegment) {
    const stages = await Promise.all(
      cfg.stages.map(async (s: any) => {
        if (!s.segmentId) return { ...s, count: null, configured: false, mode: "segment" };
        const count = await safeCount(s.segmentId, `${errorKey}_day${s.day}`, errors);
        return { ...s, count, configured: true, mode: "segment" };
      })
    );
    return { track: { label: cfg.label, stages, mode: "segment" }, errors, cachedAt: new Date().toISOString() };
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
      track: {
        label:             cfg.label,
        stages,
        mode:              "events",
        totalListProfiles: engagement.totalListProfiles,
        totalMatched:      engagement.totalMatched,
      },
      errors,
      cachedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    errors[errorKey] = e.message;
    return {
      track: {
        label: cfg.label,
        stages: cfg.stages.map((s: any) => ({ ...s, count: null, configured: false, mode: "events" })),
        mode: "events",
      },
      errors,
      cachedAt: new Date().toISOString(),
    };
  }
}

async function computeEmailReceived() {
  return await computeEmailTrack(CONFIG.klaviyo.emailReceived, "email_received");
}
async function computeEmailOpened() {
  return await computeEmailTrack(CONFIG.klaviyo.emailSequence, "email_sequence");
}

/* ============================================================
   Cached wrappers — each section has its own tag for per-section invalidation
   ============================================================ */
const getCachedGA4 = unstable_cache(
  async (range: string, pageParam: string) => computeGA4(range, pageParam),
  ["dashboard-ga4-v1"],
  { revalidate: 86400, tags: [DASHBOARD_TAGS.ga4, DASHBOARD_TAGS.all] }
);
const getCachedFunnel = unstable_cache(
  async (range: string) => computeFunnel(range),
  ["dashboard-funnel-v1"],
  { revalidate: 86400, tags: [DASHBOARD_TAGS.funnel, DASHBOARD_TAGS.all] }
);
const getCachedEmailReceived = unstable_cache(
  async () => computeEmailReceived(),
  ["dashboard-email-received-v1"],
  { revalidate: 86400, tags: [DASHBOARD_TAGS.emailReceived, DASHBOARD_TAGS.all] }
);
const getCachedEmailOpened = unstable_cache(
  async () => computeEmailOpened(),
  ["dashboard-email-opened-v1"],
  { revalidate: 86400, tags: [DASHBOARD_TAGS.emailOpened, DASHBOARD_TAGS.all] }
);

/* ============================================================
   GET handler — pick sections, run only those, merge.
   ============================================================ */
const ALL_SECTIONS = ["ga4", "funnel", "emailReceived", "emailOpened"] as const;
type Section = typeof ALL_SECTIONS[number];

export async function GET(req: NextRequest) {
  const range     = req.nextUrl.searchParams.get("range") || "weekly";
  const pageParam = req.nextUrl.searchParams.get("page") || "all";
  const sectionsParam = req.nextUrl.searchParams.get("sections");
  const requested: Section[] = sectionsParam
    ? (sectionsParam.split(",").filter((s): s is Section => ALL_SECTIONS.includes(s as Section)))
    : [...ALL_SECTIONS];

  const allLanding = CONFIG.ga4.landingPages.map((p) => p.path);
  const ga4Pages   = pageParam === "all" || !allLanding.includes(pageParam)
                     ? undefined
                     : [pageParam];
  const { label } = getRange(range);

  const out: any = {
    range,
    label,
    page: ga4Pages ? ga4Pages[0] : "all",
    landingPages: CONFIG.ga4.landingPages,
    sectionsLoaded: requested,
    errors: {},
  };

  const tasks: Promise<void>[] = [];

  if (requested.includes("ga4")) {
    tasks.push(getCachedGA4(range, pageParam).then((r) => {
      out.ga4 = r.ga4;
      out.ga4CachedAt = r.cachedAt;
      Object.assign(out.errors, r.errors);
    }));
  }
  if (requested.includes("funnel")) {
    tasks.push(getCachedFunnel(range).then((r) => {
      out.tiers    = r.tiers;
      out.funnel   = r.funnel;
      out.listIds  = r.listIds;
      out.typeform = r.typeform;
      out.funnelCachedAt = r.cachedAt;
      Object.assign(out.errors, r.errors);
    }));
  }
  if (requested.includes("emailReceived")) {
    tasks.push(getCachedEmailReceived().then((r) => {
      out.emailReceived = r.track;
      out.emailReceivedCachedAt = r.cachedAt;
      Object.assign(out.errors, r.errors);
    }));
  }
  if (requested.includes("emailOpened")) {
    tasks.push(getCachedEmailOpened().then((r) => {
      out.emailSequence = r.track;
      out.emailOpenedCachedAt = r.cachedAt;
      Object.assign(out.errors, r.errors);
    }));
  }

  await Promise.all(tasks);

  /* Stitch GA4 visitors into funnel if BOTH sections were requested in this call. */
  if (out.funnel && out.ga4?.totals?.users != null) {
    out.funnel.visitors = out.ga4.totals.users;
  }

  return NextResponse.json(out);
}
