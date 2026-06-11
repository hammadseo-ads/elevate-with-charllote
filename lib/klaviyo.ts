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

/** Count profiles in a segment (paginated). Used as a fallback when /lists/ returns 404. */
export async function countSegmentMembers(segmentId: string): Promise<number> {
  let total = 0;
  let next: string | null = `/segments/${segmentId}/profiles/?page[size]=100`;
  while (next) {
    const data: any = await get(next);
    total += (data?.data?.length || 0) as number;
    next = data?.links?.next || null;
  }
  return total;
}

/** Smart count: try list first, fall back to segment if the list 404s. */
export async function countMembers(id: string): Promise<number> {
  try {
    return await countListMembers(id);
  } catch (e: any) {
    if (typeof e?.message === "string" && e.message.includes("404")) {
      return await countSegmentMembers(id);
    }
    throw e;
  }
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

/** Smart fetch: try list first, fall back to segment if the list 404s. */
export async function getMembers(id: string, max = 500): Promise<any[]> {
  try {
    return await listProfiles(id, max);
  } catch (e: any) {
    if (typeof e?.message === "string" && e.message.includes("404")) {
      return await segmentProfiles(id, max);
    }
    throw e;
  }
}

/**
 * Get all events for a profile (Received Email, Started Checkout, Placed Order, etc).
 * Returns events sorted most-recent-first + a map of metric_id -> metric_name
 * so the UI can show human-readable event names.
 */
export async function getProfileEvents(
  profileId: string,
  max = 100
): Promise<{ events: any[]; metrics: Record<string, string> }> {
  const filter = `equals(profile_id,"${profileId}")`;
  const url = `/events/?filter=${encodeURIComponent(filter)}&include=metric&sort=-datetime&page[size]=100`;
  const data: any = await get(url);

  const events: any[] = (data?.data || []).slice(0, max);

  /* Build metric_id -> metric_name lookup from the included array */
  const metrics: Record<string, string> = {};
  const included = data?.included || [];
  included.forEach((item: any) => {
    if (item.type === "metric") {
      metrics[item.id] = item.attributes?.name || "Unknown event";
    }
  });

  return { events, metrics };
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

export type EmailEngagementStage = {
  day: number;
  count: number;
  profiles: { id: string; email: string; name: string }[];
};

/**
 * Auto-compute email-sequence engagement from raw events. No segments needed.
 *
 * Algorithm:
 *   1. Pull all profile IDs in `sourceListId` (so we know who to include)
 *   2. Resolve the metric id for `metricName` (e.g. "Opened Email")
 *   3. Pull all events for that metric in the last `lookbackDays`
 *   4. For each event whose profile is in our list, regex-match the Subject
 *      against `subjectPattern` to extract the day number
 *   5. Track the FURTHEST day each profile reached
 *   6. Bucket each profile into exactly one stage (their furthest day)
 *
 * Returns one stage per day from 1..maxDay. Profiles who haven't opened any
 * matching email don't appear in any stage.
 */
export async function getEmailEngagement(opts: {
  sourceListId: string;
  metricName: string;
  subjectPattern: string;        // compiled to RegExp here
  maxDay: number;                // typically 7
  lookbackDays?: number;
}): Promise<{
  stages: EmailEngagementStage[];
  totalListProfiles: number;
  totalMatched: number;
}> {
  const { sourceListId, metricName, subjectPattern, maxDay, lookbackDays = 30 } = opts;

  /* 1. Profiles in source list — needed both to filter events and to display names. */
  const listProfiles = await getMembers(sourceListId, 2000);
  const profileMap = new Map<string, { email: string; name: string }>();
  listProfiles.forEach((p: any) => {
    const a = p?.attributes || {};
    profileMap.set(p.id, {
      email: a.email || "",
      name:  [a.first_name, a.last_name].filter(Boolean).join(" ") || "",
    });
  });

  /* 2. Resolve metric id by name. */
  const metrics = await listMetrics();
  const metric = metrics.find((m) => m.name === metricName);
  if (!metric) {
    throw new Error(`Klaviyo metric "${metricName}" not found. Check CONFIG.klaviyo.emailSequence.metricName.`);
  }

  /* 3. Pull all events for the metric within the lookback window. */
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  const until = new Date().toISOString();
  const events = await eventsByMetric(metric.id, since, until, 20000);

  /* 4. Match subjects, track furthest day per profile. */
  const re = new RegExp(subjectPattern, "i");
  const furthestByProfile = new Map<string, number>();

  events.forEach((e: any) => {
    const profileId = e?.relationships?.profile?.data?.id;
    if (!profileId || !profileMap.has(profileId)) return;
    const subject =
      e?.attributes?.event_properties?.Subject ||
      e?.attributes?.event_properties?.subject ||
      e?.attributes?.event_properties?.["$message_name"] ||
      "";
    const m = subject.match(re);
    if (!m) return;
    const day = parseInt(m[1], 10);
    if (!Number.isInteger(day) || day < 1 || day > maxDay) return;
    const current = furthestByProfile.get(profileId) || 0;
    if (day > current) furthestByProfile.set(profileId, day);
  });

  /* 5. Bucket by furthest day. */
  const stages: EmailEngagementStage[] = [];
  for (let day = 1; day <= maxDay; day++) {
    const profiles: EmailEngagementStage["profiles"] = [];
    furthestByProfile.forEach((furthest, profileId) => {
      if (furthest === day) {
        const p = profileMap.get(profileId)!;
        profiles.push({ id: profileId, email: p.email, name: p.name });
      }
    });
    stages.push({ day, count: profiles.length, profiles });
  }

  return {
    stages,
    totalListProfiles: profileMap.size,
    totalMatched: furthestByProfile.size,
  };
}
