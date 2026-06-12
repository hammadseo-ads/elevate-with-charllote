/**
 * Export EVERY Klaviyo list as its own CSV under ./klaviyo-export/lists/.
 *
 * Usage:   node scripts/export-all-lists.js
 * Output:  klaviyo-export/lists/list_<id>_<safe-name>.csv  (one per list)
 *          klaviyo-export/_index.csv                       (summary of all lists)
 *
 * Columns per file: email, first_name, last_name, phone_number,
 *   program, vip, bring_a_friend, total_usd,
 *   first_utm_source, first_utm_medium, first_utm_campaign,
 *   utm_source, utm_medium, utm_campaign,
 *   landing_page, source,
 *   friend_full_name, friend_email, friend_whatsapp,
 *   submitted_at, created, updated, klaviyo_profile_id
 *
 * Reads KLAVIYO_PRIVATE_KEY from ../.env.local. No external deps.
 * Sequential per list to stay under Klaviyo's 75 req/sec read limit.
 */

const fs   = require("node:fs");
const path = require("node:path");

const ENV_FILE = path.join(__dirname, "..", ".env.local");
const OUT_DIR  = path.join(__dirname, "..", "klaviyo-export", "lists");
const INDEX_FILE = path.join(__dirname, "..", "klaviyo-export", "_index.csv");
const KLAVIYO_REVISION = "2024-07-15";

/* ---------- env loader (no dotenv dep) ---------- */
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

const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const safe = (s) =>
  String(s || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

async function api(url, apiKey) {
  const res = await fetch(url, {
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
  return res.json();
}

async function listAllLists(apiKey) {
  const out = [];
  /* /lists/ caps page[size] at 10 (most other Klaviyo endpoints allow 100). */
  let next = "https://a.klaviyo.com/api/lists/?page[size]=10";
  while (next) {
    const data = await api(next, apiKey);
    for (const l of data?.data || []) {
      out.push({
        id:      l.id,
        name:    l.attributes?.name || "",
        created: l.attributes?.created || "",
        updated: l.attributes?.updated || "",
      });
    }
    next = data?.links?.next || null;
  }
  return out;
}

async function fetchListProfiles(listId, apiKey) {
  const out = [];
  let next = `https://a.klaviyo.com/api/lists/${listId}/profiles/?page[size]=100`;
  while (next) {
    const data = await api(next, apiKey);
    out.push(...(data?.data || []));
    next = data?.links?.next || null;
  }
  return out;
}

function profilesToCsv(profiles, listMeta) {
  const headers = [
    "email", "first_name", "last_name", "phone_number",
    "program", "vip", "bring_a_friend", "total_usd",
    "first_utm_source", "first_utm_medium", "first_utm_campaign",
    "utm_source", "utm_medium", "utm_campaign",
    "landing_page", "source",
    "friend_full_name", "friend_email", "friend_whatsapp",
    "submitted_at", "created", "updated", "klaviyo_profile_id",
  ];
  const lines = [
    `# Klaviyo list: ${listMeta.name} (id ${listMeta.id}) — ${profiles.length} profiles — exported ${new Date().toISOString()}`,
    headers.join(","),
  ];
  for (const p of profiles) {
    const a = p?.attributes || {};
    const props = a.properties || {};
    lines.push([
      a.email || "",
      a.first_name || "",
      a.last_name || "",
      a.phone_number || "",
      props.program ?? "",
      props.vip ?? "",
      props.bring_a_friend ?? "",
      props.total_usd ?? "",
      props.first_utm_source ?? "",
      props.first_utm_medium ?? "",
      props.first_utm_campaign ?? "",
      props.utm_source ?? "",
      props.utm_medium ?? "",
      props.utm_campaign ?? "",
      props.landing_page ?? "",
      props.source ?? "",
      props.friend_full_name ?? "",
      props.friend_email ?? "",
      props.friend_whatsapp ?? "",
      props.submitted_at ?? "",
      a.created || "",
      a.updated || "",
      p.id,
    ].map(csv).join(","));
  }
  return lines.join("\n") + "\n";
}

(async () => {
  const env = loadEnv();
  const apiKey = env.KLAVIYO_PRIVATE_KEY;
  if (!apiKey) throw new Error("KLAVIYO_PRIVATE_KEY missing in .env.local");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Fetching all lists…");
  const lists = await listAllLists(apiKey);
  console.log(`Found ${lists.length} lists. Exporting…\n`);

  const indexRows = [
    "klaviyo_list_id,list_name,profile_count,filename,created,updated",
  ];

  let totalProfiles = 0;
  for (let i = 0; i < lists.length; i++) {
    const l = lists[i];
    const filename = `list_${l.id}_${safe(l.name)}.csv`;
    const filepath = path.join(OUT_DIR, filename);
    process.stdout.write(`[${i + 1}/${lists.length}] ${l.name} (${l.id})… `);
    try {
      const profiles = await fetchListProfiles(l.id, apiKey);
      fs.writeFileSync(filepath, profilesToCsv(profiles, l), "utf8");
      console.log(`${profiles.length} profiles → ${filename}`);
      indexRows.push([l.id, l.name, profiles.length, filename, l.created, l.updated].map(csv).join(","));
      totalProfiles += profiles.length;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
      indexRows.push([l.id, l.name, "ERROR: " + e.message, filename, l.created, l.updated].map(csv).join(","));
    }
  }

  fs.writeFileSync(INDEX_FILE, indexRows.join("\n") + "\n", "utf8");

  console.log("");
  console.log(`Done. ${lists.length} lists, ${totalProfiles} total profile rows.`);
  console.log(`Folder: ${path.dirname(OUT_DIR)}`);
  console.log(`Index : ${INDEX_FILE}`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
