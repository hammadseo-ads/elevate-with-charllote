/**
 * GET /api/klaviyo/profiles?listId=XXX&max=500
 * Returns the raw profile records from a Klaviyo list, with all custom properties.
 * Used as a debug/inspection endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import * as klaviyo from "@/lib/klaviyo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const listId = req.nextUrl.searchParams.get("listId");
  const max = Number(req.nextUrl.searchParams.get("max") || 200);
  if (!listId) {
    return NextResponse.json({ error: "Missing listId param" }, { status: 400 });
  }
  try {
    const profiles = await klaviyo.listProfiles(listId, max);
    return NextResponse.json({ count: profiles.length, profiles });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
