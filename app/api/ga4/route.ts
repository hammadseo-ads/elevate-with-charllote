/**
 * GET /api/ga4 — quick GA4 connectivity test.
 * /api/ga4?startDate=30daysAgo&endDate=today
 */

import { NextRequest, NextResponse } from "next/server";
import * as ga4 from "@/lib/ga4";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const startDate = req.nextUrl.searchParams.get("startDate") || "30daysAgo";
  const endDate   = req.nextUrl.searchParams.get("endDate")   || "today";
  try {
    const [totals, bySource] = await Promise.all([
      ga4.totalsByRange(startDate, endDate),
      ga4.sessionsBySource(startDate, endDate),
    ]);
    return NextResponse.json({ totals, bySource });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
