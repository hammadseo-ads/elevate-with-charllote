/**
 * Google Analytics 4 Data API client.
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1/rest
 *
 * Auth: service account with "Viewer" role on the GA4 property.
 *
 * Supports TWO ways to provide credentials:
 *   1. GA4_SERVICE_ACCOUNT_FILE  = path to the downloaded JSON key file (easiest local)
 *   2. GA4_SERVICE_ACCOUNT_JSON  = JSON content as a single-line string (best for Vercel)
 *
 * The file path is checked first. Use the env-string approach for production deploys.
 */

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";

let clientCache: BetaAnalyticsDataClient | null = null;

function loadCredentials() {
  // Priority 1: file path (local dev only — file is .gitignored)
  const filePath = process.env.GA4_SERVICE_ACCOUNT_FILE;
  if (filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(abs)) throw new Error(`GA4_SERVICE_ACCOUNT_FILE missing: ${abs}`);
    return JSON.parse(fs.readFileSync(abs, "utf-8"));
  }
  // Priority 2: base64-encoded JSON (best for Vercel — paste a single string with no newlines)
  const b64 = process.env.GA4_SERVICE_ACCOUNT_JSON_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  // Priority 3: raw JSON string in env
  const json = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);
  throw new Error("Provide one of GA4_SERVICE_ACCOUNT_FILE / _B64 / _JSON in env");
}

function getClient(): BetaAnalyticsDataClient {
  if (clientCache) return clientCache;
  const credentials = loadCredentials();
  clientCache = new BetaAnalyticsDataClient({ credentials });
  return clientCache;
}

function propertyPath(): string {
  return `properties/${CONFIG.ga4.propertyId}`;
}

/** Run a custom GA4 report. */
export async function runReport(body: {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics?: { name: string }[];
  limit?: number;
}) {
  const client = getClient();
  const [res] = await client.runReport({
    property: propertyPath(),
    ...body,
  });
  return res;
}

/** Total sessions + users in the given date range. */
export async function totalsByRange(startDate: string, endDate: string) {
  const res = await runReport({
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
  });
  const row = res.rows?.[0];
  return {
    sessions:   Number(row?.metricValues?.[0]?.value || 0),
    users:      Number(row?.metricValues?.[1]?.value || 0),
    pageViews:  Number(row?.metricValues?.[2]?.value || 0),
  };
}

/** Sessions broken down by traffic source (utm_source/medium/campaign). */
export async function sessionsBySource(startDate: string, endDate: string) {
  const res = await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    limit: 100,
  });

  return (res.rows || []).map((r) => ({
    source:   r.dimensionValues?.[0]?.value || "(unknown)",
    medium:   r.dimensionValues?.[1]?.value || "(unknown)",
    campaign: r.dimensionValues?.[2]?.value || "(none)",
    sessions: Number(r.metricValues?.[0]?.value || 0),
    users:    Number(r.metricValues?.[1]?.value || 0),
  }));
}

/** Daily session count for a date range (for charts). */
export async function sessionsByDay(startDate: string, endDate: string) {
  const res = await runReport({
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }],
    limit: 365,
  });
  return (res.rows || [])
    .map((r) => ({
      date:     r.dimensionValues?.[0]?.value || "",
      sessions: Number(r.metricValues?.[0]?.value || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
