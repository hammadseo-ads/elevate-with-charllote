/**
 * POST /api/dashboard/refresh[?section=ga4|funnel|emailReceived|emailOpened]
 *
 * Invalidates the server-side cache. Without ?section it wipes EVERYTHING
 * (every section). With ?section it wipes only that section so a refresh
 * of one slow part doesn't blow away other sections that are still warm.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { DASHBOARD_TAGS } from "../route";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const section = req.nextUrl.searchParams.get("section") || "";
  const tag = (DASHBOARD_TAGS as Record<string, string>)[section] || DASHBOARD_TAGS.all;
  revalidateTag(tag);
  return NextResponse.json({
    ok: true,
    invalidatedTag: tag,
    section: section || "ALL",
    at: new Date().toISOString(),
  });
}
