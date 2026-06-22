/**
 * GET /api/csv/checkout-tracker?token=<secret>
 *
 * Combines THREE Klaviyo lists into one CSV with a derived "Tag" column:
 *
 *   master list:  VgLXm8 (Back in the Body Checkout Pop up)  — everyone who
 *                 ever filled the checkout form. Profiles from XchbFC and
 *                 TnSzYp that aren't already in VgLXm8 are appended too,
 *                 so no buyer or abandoned-cart entry gets dropped.
 *
 *   Tag logic (Purchaser wins over Abandoned wins over Pending):
 *     Purchaser  = email is in XchbFC  (Any Buyers segment)
 *     Abandoned  = email is in TnSzYp  (Abandoned Cart list)
 *     Pending    = neither — submitted the form, hasn't purchased or
 *                  triggered the abandoned-cart trigger yet
 *
 *   Sorted by Klaviyo profile id ASC so the order is STABLE across
 *   refreshes (new entries append at the BOTTOM), letting the Google
 *   Sheet user type manual notes (Instagram handle etc.) next to each
 *   row safely.
 *
 *   When someone moves from Abandoned → Purchaser (or Pending → Purchaser),
 *   the next refresh updates their Tag automatically — same row, same
 *   manual notes, just a different Tag value.
 */

import { NextRequest, NextResponse } from "next/server";
import * as klaviyo from "@/lib/klaviyo";

export const dynamic = "force-dynamic";

const LIST_CHECKOUT  = "VgLXm8";   // Back in the Body Checkout Pop up
const LIST_BUYERS    = "XchbFC";   // Back in the Body Checkout — Any Buyers (segment)
const LIST_ABANDONED = "TnSzYp";   // Back in the Body — Abandoned Cart

const csvCell = (v: any) =>
  `"${String(v ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const expected = process.env.CSV_EXPORT_TOKEN;
  if (!expected) {
    return new NextResponse("Server misconfigured: CSV_EXPORT_TOKEN missing", { status: 500 });
  }
  if (token !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    /* Fetch all three lists/segments + metrics in parallel. */
    const metricsPromise = fetch("https://a.klaviyo.com/api/metrics/", {
      headers: {
        Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        revision: "2024-07-15",
        Accept: "application/json",
      },
    }).then((r) => r.json());

    const [checkout, buyers, abandoned, metricsResp] = await Promise.all([
      klaviyo.getMembers(LIST_CHECKOUT,  5000),
      klaviyo.getMembers(LIST_BUYERS,    5000),
      klaviyo.getMembers(LIST_ABANDONED, 5000),
      metricsPromise,
    ]);

    /* Find the metric ids we care about so we can pull their event dates. */
    const allMetrics = metricsResp?.data || [];
    const paidMetricId     = allMetrics.find((m: any) => m.attributes?.name === "Successfully Paid")?.id;
    const checkoutMetricId = allMetrics.find((m: any) => m.attributes?.name === "Started Checkout")?.id;

    /* Per-profile dates: most recent Successfully Paid + Started Checkout in
       the last 365 days. Used to fill the "Date" column with the actual
       action timestamp (when they paid / when they filled the form), instead
       of the profile's original Klaviyo creation date (which can be years off). */
    const sinceISO = new Date(Date.now() - 365 * 86400000).toISOString();
    const paidDates     = new Map<string, string>();
    const checkoutDates = new Map<string, string>();

    async function fetchEventDates(metricId: string | undefined, target: Map<string, string>) {
      if (!metricId) return;
      const filter = `and(equals(metric_id,"${metricId}"),greater-or-equal(datetime,${sinceISO}))`;
      let url: string | null = `https://a.klaviyo.com/api/events/?filter=${encodeURIComponent(filter)}&page[size]=100&sort=-datetime`;
      while (url) {
        const resp: any = await fetch(url, {
          headers: {
            Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
            revision: "2024-07-15",
            Accept: "application/json",
          },
        }).then((r) => r.json());
        for (const ev of resp?.data || []) {
          const pid = ev?.relationships?.profile?.data?.id;
          if (!pid) continue;
          const dt: string = ev?.attributes?.datetime || "";
          const current = target.get(pid);
          if (!current || dt > current) target.set(pid, dt);
        }
        url = resp?.links?.next || null;
      }
    }

    await Promise.all([
      fetchEventDates(paidMetricId, paidDates),
      fetchEventDates(checkoutMetricId, checkoutDates),
    ]);

    /* Lowercased email sets for fast Tag lookup. */
    const buyerEmails    = new Set<string>();
    const abandonedEmails = new Set<string>();
    for (const p of buyers)    { const e = (p?.attributes?.email || "").toLowerCase(); if (e) buyerEmails.add(e); }
    for (const p of abandoned) { const e = (p?.attributes?.email || "").toLowerCase(); if (e) abandonedEmails.add(e); }

    /* Build a single deduplicated profile pool. Checkout list seeded first
       (the "master"), then buyers + abandoned profiles that aren't already
       in the pool are appended — covers edge cases where someone made it
       into the buyer or abandoned set without going through the popup. */
    const pool = new Map<string, any>();
    const add = (p: any) => {
      const email = (p?.attributes?.email || "").toLowerCase();
      if (!email) return;
      if (!pool.has(email)) pool.set(email, p);
    };
    checkout.forEach(add);
    buyers.forEach(add);
    abandoned.forEach(add);

    /* Date column appended at the END so adding it doesn't shift any
       existing column positions (existing IMPORTDATA formulas keep working). */
    const headers = ["Email", "First Name", "Last Name", "Phone", "WhatsApp", "Tag", "Created", "Profile ID", "Submitted At"];

    const rows = Array.from(pool.values()).map((p: any) => {
      const a = p?.attributes || {};
      const x = a.properties || {};
      const email = (a.email || "").toLowerCase();

      let tag = "Pending";
      if (buyerEmails.has(email))         tag = "Purchaser";    // Purchaser wins
      else if (abandonedEmails.has(email)) tag = "Abandoned";

      /* Pick the most meaningful date for this row:
           - Purchaser → "Successfully Paid" event date (when they paid)
           - Abandoned/Pending → "Started Checkout" event date (when they
             filled the form, which is what Klaviyo's segment UI shows as
             "Date added")
           - Fallbacks: v3 popup submitted_at, then Klaviyo profile created. */
      const dateValue =
        (tag === "Purchaser" ? paidDates.get(p.id) : "") ||
        checkoutDates.get(p.id) ||
        x.submitted_at ||
        a.created ||
        "";

      return [
        a.email || "",
        a.first_name || "",
        a.last_name || "",
        a.phone_number || "",
        x.whatsapp || "",
        tag,
        a.created || "",
        p.id,
        dateValue,
      ];
    });

    /* Stable sort by Profile ID ASC. ULID-style ids are chronological so
       new profiles land at the bottom and existing rows never reorder.
       This is what lets manual notes (Instagram handle) in the linked
       tracker sheet stay aligned with the right person forever. */
    rows.sort((a, b) => String(a[7] || "").localeCompare(String(b[7] || "")));

    const csv = [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="checkout-tracker.csv"`,
        "Cache-Control":       "public, max-age=600, s-maxage=600",
      },
    });
  } catch (e: any) {
    return new NextResponse(`Error: ${e?.message || String(e)}`, { status: 500 });
  }
}
