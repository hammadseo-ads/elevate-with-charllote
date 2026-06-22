/**
 * GET /api/csv/list/<listId>?token=<secret>
 *
 * Streams a Klaviyo list (or segment — auto-fallback) as CSV with rich
 * columns + auto-classified channel. Designed for Google Sheets:
 *
 *   =IMPORTDATA("https://<domain>/api/csv/list/TnSzYp?token=...")
 *
 * Sheets refreshes IMPORTDATA() every ~1 hour automatically.
 *
 * Security: requires `token` query param to match env var
 *           CSV_EXPORT_TOKEN. Without it → 401.
 *
 * Caching:  10 minutes server-side so a hot sheet doesn't hammer Klaviyo
 *           and Google Sheets can re-pull freely without rate-limit pain.
 */

import { NextRequest, NextResponse } from "next/server";
import * as klaviyo from "@/lib/klaviyo";

export const dynamic = "force-dynamic";

/** Classify the row's acquisition channel using the same rules as our
 *  manual buyer analysis (Meta Ads / Klaviyo Email / Instagram / etc). */
function classifyChannel(props: any): string {
  const adPlatform = (props.ad_platform || props.first_ad_platform || "").toLowerCase();
  const kx        = props.first_kx       || props._kx        || "";
  const fbclid    = props.first_fbclid   || props.fbclid     || "";
  const utmSrc    = (props.first_utm_source   || props.utm_source   || "").toLowerCase();
  const utmMed    = (props.first_utm_medium   || props.utm_medium   || "").toLowerCase();
  const utmCamp   = String(props.first_utm_campaign || props.utm_campaign || "");
  const firstUrl  = props.first_touch_url || "";

  if (firstUrl.indexOf("mcp_token=") > -1) return "Instagram (ManyChat)";
  if ((utmMed === "paid" || utmMed === "cpc") && /^\d{10,}$/.test(utmCamp)) return "Meta Ads";
  if (kx || utmSrc.indexOf("klaviyo") > -1) return "Klaviyo Email";
  if (utmSrc === "ig" || utmSrc.indexOf("instagram") > -1) return "Instagram";
  if (utmSrc.indexOf("facebook") > -1 || utmSrc === "fb") return "Facebook";
  if (adPlatform === "meta" || fbclid) return "Instagram (organic)";
  return "Unknown";
}

/** Wrap a value for safe CSV inclusion (quoted, "" escapes embedded ", removes
 *  any newlines so a stray CR/LF in user data doesn't break the row count). */
const csvCell = (v: any) =>
  `"${String(v ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

export async function GET(
  req: NextRequest,
  { params }: { params: { listId: string } }
) {
  /* ---------- auth ---------- */
  const token = req.nextUrl.searchParams.get("token") || "";
  const expected = process.env.CSV_EXPORT_TOKEN;
  if (!expected) {
    return new NextResponse("Server misconfigured: CSV_EXPORT_TOKEN missing", { status: 500 });
  }
  if (token !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  /* ---------- listId validation ---------- */
  const listId = params.listId;
  if (!/^[A-Za-z0-9]{4,12}$/.test(listId)) {
    return new NextResponse("Invalid listId", { status: 400 });
  }

  /* ---------- fetch + format ---------- */
  try {
    const profiles = await klaviyo.getMembers(listId, 2000);

    const headers = [
      "Email","First Name","Last Name","Phone","WhatsApp",
      "Program","Total USD","VIP","Bring a Friend",
      "Friend Name","Friend Email","Friend WhatsApp",
      "Submitted At","Days Since Abandoned",
      "Channel","Ad Platform","From Paid Ad",
      "Landing Page","First Referrer","Last Touch URL",
      "UTM Source","UTM Medium","UTM Campaign",
      "Created","Last Updated","Profile ID",
    ];

    const now = Date.now();

    const rows = profiles.map((p: any) => {
      const a = p?.attributes || {};
      const x = a.properties  || {};

      const submittedAt = x.submitted_at || a.created || "";
      let daysSince: number | string = "";
      if (submittedAt) {
        daysSince = Math.floor((now - new Date(submittedAt).getTime()) / 86400000);
      }

      return [
        a.email || "",
        a.first_name || "",
        a.last_name || "",
        a.phone_number || "",
        x.whatsapp || "",
        x.program || "",
        x.total_usd ?? "",
        (x.vip === true || x.vip === "true") ? "YES" : "",
        (x.bring_a_friend === true || x.bring_a_friend === "true") ? "YES" : "",
        x.friend_full_name || "",
        x.friend_email || "",
        x.friend_whatsapp || "",
        submittedAt,
        daysSince,
        classifyChannel(x),
        x.ad_platform || x.first_ad_platform || "",
        (x.from_paid_ad === true || x.from_paid_ad === "true") ? "YES" : "",
        x.landing_page || "",
        x.first_referrer || "",
        x.last_touch_url || "",
        x.first_utm_source || x.utm_source || "",
        x.first_utm_medium || x.utm_medium || "",
        x.first_utm_campaign || x.utm_campaign || "",
        a.created || "",
        a.updated || "",
        p.id,
      ];
    });

    /* Sort by Klaviyo profile id ASC. Profile IDs are ULID-style (chronological)
       so this is "oldest-first" — but more importantly, the sort is STABLE
       across refreshes: new leads always append at the BOTTOM, never reorder
       existing rows. This lets the Google Sheet user type manual notes
       (Instagram handle, etc.) into columns NEXT to a row, and the notes
       stay correctly aligned with that row even after IMPORTDATA refreshes.
       For newest-first BROWSING, use a Sheets "Filter View" sorted by
       Submitted At descending — it changes display order without touching
       the underlying data, so manual notes still align. */
    rows.sort((a, b) => String(a[25] || "").localeCompare(String(b[25] || "")));

    const csv = [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="klaviyo-${listId}.csv"`,
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (e: any) {
    return new NextResponse(`Error: ${e?.message || String(e)}`, { status: 500 });
  }
}
