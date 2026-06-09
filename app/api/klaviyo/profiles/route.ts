/**
 * GET /api/klaviyo/profiles?listId=XXX&max=500
 * Returns profile records from a Klaviyo list OR segment.
 * Tries list first, automatically falls back to segment if the list 404s.
 */

import { NextRequest, NextResponse } from "next/server";
import * as klaviyo from "@/lib/klaviyo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const listId = req.nextUrl.searchParams.get("listId");
  const max = Number(req.nextUrl.searchParams.get("max") || 500);
  if (!listId) {
    return NextResponse.json({ error: "Missing listId param" }, { status: 400 });
  }
  try {
    const profiles = await klaviyo.getMembers(listId, max);
    return NextResponse.json({ count: profiles.length, profiles });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
