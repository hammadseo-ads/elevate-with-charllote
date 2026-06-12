/**
 * Extract every profile from two Klaviyo lists and combine into one CSV.
 *
 * Usage:  node scripts/extract-emails.js
 * Output: ./klaviyo-export.csv  (relative to the tracking-dashboard folder)
 *
 * Lists are configured below. For each profile we record:
 *   - email, first/last name, phone, created date
 *   - which list(s) they appear in (tag columns)
 *   - custom properties: program, vip, friend, total, UTM source/campaign,
 *     landing_page, friend's contact info
 *
 * Deduplicates by email (or by id when email missing). A profile in BOTH lists
 * has YES in both `in_<list>` columns.
 *
 * Reads KLAVIYO_PRIVATE_KEY from ../.env.local — no external deps.
 */

const fs   = require("node:fs");
const path = require("node:path");

const ENV_FILE = path.join(__dirname, "..", ".env.local");
const OUT_FILE = path.join(__dirname, "..", "klaviyo-export.csv");

const LISTS = [
  { id: "VNX8Tp", tagCol: "in_list_VNX8Tp" },
  { id: "X2ib44", tagCol: "in_list_X2ib44_quiz_submitters" },
];

const KLAVIYO_REVISION = "2024-07-15";

/* ---------- Tiny .env.local parser (no dotenv dep) ---------------- */
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`Missing ${ENV_FILE}`);
  const env = {};
  for (const raw of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").trim();
  }
  return env;
}

/* ---------- Fetch ALL profiles from a Klaviyo collection (paginated) -----
 * Tries /lists/ first, falls back to /segments/ on 404 — Klaviyo IDs alone
 * don't tell you which kind of collection they are. */
async function fetchPaginated(url, apiKey) {
  const out = [];
  let next = url;
  while (next) {
    const res = await fetch(next, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Klaviyo ${res.status}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    out.push(...(data?.data || []));
    next = data?.links?.next || null;
  }
  return out;
}

async function listAllProfiles(collectionId, apiKey) {
  const listUrl    = `https://a.klaviyo.com/api/lists/${collectionId}/profiles/?page[size]=100`;
  const segmentUrl = `https://a.klaviyo.com/api/segments/${collectionId}/profiles/?page[size]=100`;
  try {
    return await fetchPaginated(listUrl, apiKey);
  } catch (e) {
    if (e.status === 404) {
      console.log(`  (${collectionId} is a segment, not a list — falling back)`);
      return await fetchPaginated(segmentUrl, apiKey);
    }
    throw e;
  }
}

/* ---------- CSV escape ---------- */
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

(async () => {
  const env = loadEnv();
  const apiKey = env.KLAVIYO_PRIVATE_KEY;
  if (!apiKey) throw new Error("KLAVIYO_PRIVATE_KEY missing in .env.local");

  console.log("Fetching both lists…");
  const fetched = await Promise.all(
    LISTS.map(async (l) => {
      const profiles = await listAllProfiles(l.id, apiKey);
      console.log(`  list ${l.id}: ${profiles.length} profiles`);
      return { ...l, profiles };
    })
  );

  /* Merge by email (fallback to id if email missing). */
  const byKey = new Map();
  for (const { id: listId, tagCol, profiles } of fetched) {
    for (const p of profiles) {
      const a = p?.attributes || {};
      const key = (a.email || `__no_email::${p.id}`).toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, {
          id:           p.id,
          email:        a.email || "",
          first_name:   a.first_name || "",
          last_name:    a.last_name || "",
          phone_number: a.phone_number || "",
          created:      a.created || "",
          updated:      a.updated || "",
          props:        { ...(a.properties || {}) },
          tags:         new Set(),
        });
      }
      const entry = byKey.get(key);
      entry.tags.add(tagCol);
      /* Merge properties: newer wins on key collisions. */
      Object.assign(entry.props, a.properties || {});
    }
  }

  /* Build CSV. Tag columns come first after identity columns. */
  const tagCols = LISTS.map((l) => l.tagCol);
  const headers = [
    "email", "first_name", "last_name", "phone_number",
    ...tagCols,
    "in_both_lists",
    "program", "vip", "bring_a_friend", "total_usd",
    "first_utm_source", "first_utm_medium", "first_utm_campaign",
    "utm_source", "utm_medium", "utm_campaign",
    "landing_page", "source",
    "friend_full_name", "friend_email", "friend_whatsapp",
    "submitted_at",
    "created", "updated", "klaviyo_profile_id",
  ];

  const rows = [...byKey.values()].sort((a, b) =>
    (a.created || "").localeCompare(b.created || "")
  );

  const lines = [headers.join(",")];
  for (const r of rows) {
    const p = r.props;
    const inAll = tagCols.every((c) => r.tags.has(c));
    lines.push([
      r.email, r.first_name, r.last_name, r.phone_number,
      ...tagCols.map((c) => (r.tags.has(c) ? "YES" : "")),
      inAll ? "YES" : "",
      p.program ?? "", p.vip ?? "", p.bring_a_friend ?? "", p.total_usd ?? "",
      p.first_utm_source ?? "", p.first_utm_medium ?? "", p.first_utm_campaign ?? "",
      p.utm_source ?? "", p.utm_medium ?? "", p.utm_campaign ?? "",
      p.landing_page ?? "", p.source ?? "",
      p.friend_full_name ?? "", p.friend_email ?? "", p.friend_whatsapp ?? "",
      p.submitted_at ?? "",
      r.created, r.updated, r.id,
    ].map(csv).join(","));
  }

  fs.writeFileSync(OUT_FILE, lines.join("\n") + "\n", "utf8");

  /* Tag stats */
  let onlyA = 0, onlyB = 0, both = 0;
  for (const r of rows) {
    const inA = r.tags.has(tagCols[0]);
    const inB = r.tags.has(tagCols[1]);
    if (inA && inB) both++; else if (inA) onlyA++; else onlyB++;
  }
  console.log("");
  console.log(`Wrote ${rows.length} unique profiles to:`);
  console.log(`  ${OUT_FILE}`);
  console.log("");
  console.log("Overlap:");
  console.log(`  only in list ${LISTS[0].id}: ${onlyA}`);
  console.log(`  only in list ${LISTS[1].id}: ${onlyB}`);
  console.log(`  in BOTH lists:                ${both}`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
