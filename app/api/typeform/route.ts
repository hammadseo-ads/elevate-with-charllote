/**
 * GET /api/typeform — debug endpoint to fetch Typeform responses.
 * /api/typeform?since=2024-01-01&until=2024-12-31
 */

import { NextRequest, NextResponse } from "next/server";
import * as typeform from "@/lib/typeform";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since") || undefined;
  const until = req.nextUrl.searchParams.get("until") || undefined;
  try {
    const responses = await typeform.getResponses(process.env.TYPEFORM_FORM_ID || "", {
      since, until, max: 500,
    });
    return NextResponse.json({ count: responses.length, responses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
