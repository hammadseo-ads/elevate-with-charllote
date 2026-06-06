/**
 * Typeform Responses API client.
 * Docs: https://www.typeform.com/developers/responses/
 *
 * Auth: personal access token (read-only scope is enough).
 * Endpoint: https://api.typeform.com/forms/{form_id}/responses
 */

import { CONFIG } from "./config";

const BASE = "https://api.typeform.com";

function headers() {
  const token = process.env.TYPEFORM_TOKEN;
  if (!token) throw new Error("TYPEFORM_TOKEN env var is missing");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Fetch all responses to a form, optionally within a date range. */
export async function getResponses(
  formId: string,
  opts: { since?: string; until?: string; pageSize?: number; max?: number } = {}
): Promise<any[]> {
  const formIdToUse = formId || CONFIG.typeform.formId;
  if (!formIdToUse) throw new Error("Typeform form id is missing from config");

  const pageSize = opts.pageSize || 1000;
  const max = opts.max || 5000;
  const out: any[] = [];

  let before: string | undefined; // pagination cursor
  do {
    const qs = new URLSearchParams({
      page_size: String(pageSize),
    });
    if (opts.since) qs.set("since", opts.since);
    if (opts.until) qs.set("until", opts.until);
    if (before) qs.set("before", before);

    const url = `${BASE}/forms/${formIdToUse}/responses?${qs}`;
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Typeform ${res.status}: ${body.slice(0, 300)}`);
    }
    const data: any = await res.json();
    const items = data?.items || [];
    out.push(...items);

    if (items.length < pageSize) break; // last page
    before = items[items.length - 1].token;
  } while (out.length < max);

  return out;
}

/** Count responses for the configured form in a date range. */
export async function countResponses(opts: { since?: string; until?: string } = {}): Promise<number> {
  const formId = CONFIG.typeform.formId;
  if (!formId) throw new Error("Typeform form id is missing from config");

  // The /responses endpoint returns a "page_count" + "total_items" header in the JSON body
  const qs = new URLSearchParams({ page_size: "1" });
  if (opts.since) qs.set("since", opts.since);
  if (opts.until) qs.set("until", opts.until);

  const url = `${BASE}/forms/${formId}/responses?${qs}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Typeform ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data?.total_items || 0;
}
