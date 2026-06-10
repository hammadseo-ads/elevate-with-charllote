/**
 * Google Analytics 4 Data API client.
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1/rest
 *
 * Auth (priority order):
 *   1. OAuth 2.0 user credentials (PRIMARY — works around Google's April-2026
 *      bug that blocks new service accounts from being added to GA4 properties).
 *      Requires three env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 *      GOOGLE_OAUTH_REFRESH_TOKEN. The refresh token is obtained ONCE via
 *      https://developers.google.com/oauthplayground with scope
 *      https://www.googleapis.com/auth/analytics.readonly.
 *
 *   2. Service account JSON (FALLBACK — will work again once Google fixes the bug):
 *      a. GA4_SERVICE_ACCOUNT_FILE       — path to JSON key file (local dev)
 *      b. GA4_SERVICE_ACCOUNT_JSON_B64   — base64-encoded JSON (good for Vercel)
 *      c. GA4_SERVICE_ACCOUNT_JSON       — raw JSON string
 */

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { OAuth2Client } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config";

let clientCache: BetaAnalyticsDataClient | null = null;

/** Build an OAuth2Client from env vars, or null if any are missing. */
function buildOAuthClient(): OAuth2Client | null {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const oauth = new OAuth2Client({ clientId, clientSecret });
  oauth.setCredentials({ refresh_token: refreshToken });
  return oauth;
}

/** Load service-account credentials from any of the supported env vars. */
function loadServiceAccountCredentials(): any | null {
  const filePath = process.env.GA4_SERVICE_ACCOUNT_FILE;
  if (filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(abs)) throw new Error(`GA4_SERVICE_ACCOUNT_FILE missing: ${abs}`);
    return JSON.parse(fs.readFileSync(abs, "utf-8"));
  }
  const b64 = process.env.GA4_SERVICE_ACCOUNT_JSON_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const json = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);
  return null;
}

function getClient(): BetaAnalyticsDataClient {
  if (clientCache) return clientCache;

  // Priority 1: OAuth 2.0 (preferred — service-account add is broken in GA4 UI since April 2026)
  const oauth = buildOAuthClient();
  if (oauth) {
    clientCache = new BetaAnalyticsDataClient({ authClient: oauth as any });
    return clientCache;
  }

  // Priority 2: service-account fallback
  const credentials = loadServiceAccountCredentials();
  if (credentials) {
    clientCache = new BetaAnalyticsDataClient({ credentials });
    return clientCache;
  }

  throw new Error(
    "GA4 auth not configured. Provide either OAuth env vars " +
    "(GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN) " +
    "or a service-account file/JSON env var."
  );
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
