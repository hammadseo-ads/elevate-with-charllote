/**
 * POST /api/dashboard/refresh
 *
 * Invalidates the server-side dashboard cache so the next GET /api/dashboard
 * call re-fetches live from Klaviyo + Typeform + GA4. Called by the
 * dashboard's Refresh button.
 *
 * Returns immediately — the actual recompute happens on the next GET call.
 * The frontend follows this POST with parallel GETs for each (range, page)
 * combo, repopulating the cache so subsequent users get fresh data instantly.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { DASHBOARD_CACHE_TAG } from "../route";

export const dynamic = "force-dynamic";

export async function POST() {
  revalidateTag(DASHBOARD_CACHE_TAG);
  return NextResponse.json({ ok: true, invalidatedTag: DASHBOARD_CACHE_TAG, at: new Date().toISOString() });
}
