/**
 * Klaviyo API client.
 * Docs: https://developers.klaviyo.com/en/reference/api_overview
 *
 * Auth: Private API Key (NOT the public site ID).
 * Header: Authorization: Klaviyo-API-Key <key>
 * Header: revision: <date>
 *
 * NOTE: Klaviyo's API has rate limits. We're using simple fetch calls
 * — fine for a personal dashboard, but add caching if you'll hit it often.
 */

const BASE = "https://a.klaviyo.com/api";

import { CONFIG } from "./config";

function headers() {
  const key = process.env.KLAVIYO_PRIVATE_KEY;
  if (!key) throw new Error("KLAVIYO_PRIVATE_KEY env var is missing");
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: CONFIG.klaviyo.revision,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function get<T = any>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Klaviyo ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Count profiles in a given list (paginated). */
export async function countListMembers(listId: string): Promise<number> {
  let total = 0;
  let next: string | null = `/lists/${listId}/profiles/?page[size]=100`;
  while (next) {
    const data: any = await get(next);
    total += (data?.data?.length || 0) as number;
    next = data?.links?.next || null;
  }
  return total;
}

/** Get profiles in a list with their custom properties (paginated). */
export async function listProfiles(listId: string, max = 1000): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = `/lists/${listId}/profiles/?page[size]=100&additional-fields[profile]=predictive_analytics,subscriptions`;
  while (next && out.length < max) {
    const data: any = await get(next);
    out.push(...(data?.data || []));
    next = data?.links?.next || null;
  }
  return out;
}

/** Get profiles in a segment. */
export async function segmentProfiles(segmentId: string, max = 1000): Promise<any[]> {
  const out: any[] = [];
  let next: string | null = `/segments/${segmentId}/profiles/?page[size]=100`;
  while (next && out.length < max) {
    const data: any = await get(next);
    out.push(...(data?.data || []));
    next = data?.links?.next || null;
  }
  return out;
}

/**
 * Get events filtered by metric_id within a date range.
 * Useful for Placed Order, Started Checkout, etc.
 *
 * Klaviyo filter syntax: ?filter=and(equals(metric_id,"X"),greater-or-equal(datetime,YYYY-MM-DDT00:00:00))
 */
export async function eventsByMetric(
  metricId: string,
  sinceISO: string,
  untilISO: string,
  max = 5000
): Promise<any[]> {
  const filter = `and(equals(metric_id,"${metricId}"),greater-or-equal(datetime,${sinceISO}),less-or-equal(datetime,${untilISO}))`;
  const initial = `/events/?page[size]=100&filter=${encodeURIComponent(filter)}&include=profile`;
  const out: any[] = [];
  let next: string | null = initial;
  while (next && out.length < max) {
    const data: any = await get(next);
    out.push(...(data?.data || []));
    next = data?.links?.next || null;
  }
  return out;
}

/** List all metrics so you can find the ID of "Placed Order" / "Started Checkout" / etc. */
export async function listMetrics(): Promise<{ id: string; name: string }[]> {
  const data: any = await get(`/metrics/?page[size]=100`);
  return (data?.data || []).map((m: any) => ({
    id: m.id,
    name: m.attributes?.name,
  }));
}

/** List all lists so the dashboard can offer them as filters. */
export async function listAllLists(): Promise<{ id: string; name: string; created: string }[]> {
  const data: any = await get(`/lists/?page[size]=100`);
  return (data?.data || []).map((l: any) => ({
    id: l.id,
    name: l.attributes?.name,
    created: l.attributes?.created,
  }));
}
