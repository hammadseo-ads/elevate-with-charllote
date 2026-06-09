/**
 * GET /api/klaviyo/events?profileId=XXX&max=100
 * Returns a profile's event history (Received Email, Started Checkout, Placed Order, etc.)
 * with metric names resolved so the UI can render a readable timeline.
 */

import { NextRequest, NextResponse } from "next/server";
import * as klaviyo from "@/lib/klaviyo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  const max = Number(req.nextUrl.searchParams.get("max") || 100);
  if (!profileId) {
    return NextResponse.json({ error: "Missing profileId param" }, { status: 400 });
  }
  try {
    const { events, metrics } = await klaviyo.getProfileEvents(profileId, max);
    return NextResponse.json({ count: events.length, events, metrics });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
