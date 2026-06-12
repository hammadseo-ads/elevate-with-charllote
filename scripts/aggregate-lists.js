/**
 * Aggregate every per-list CSV under klaviyo-export/lists/ into combined files.
 *
 * Usage:  node scripts/aggregate-lists.js
 * Reads:  ./klaviyo-export/lists/*.csv  (produced by export-all-lists.js)
 * Writes: ./klaviyo-export/all-people-combined.csv
 *         ./klaviyo-export/all-people-except-quiz.csv
 *
 * - Deduplicates by email (case-insensitive); profiles without email keyed by id.
 * - Records every list each person belongs to: list_count, in_list_ids, in_list_names.
 * - Merges custom properties across appearances (last non-empty wins).
 * - The "except-quiz" file drops anyone in either quiz list:
 *     QVkNKH (Quiz: What's Holding Your Body Back — OLD)
 *     X2ib44 (Reset Quiz Submitters — NEW)
 *
 * No external deps. No Klaviyo API calls (uses the local CSVs from the previous
 * export step). Re-run export-all-lists.js first if you want fresher data.
 */

const fs   = require("node:fs");
const path = require("node:path");

const LISTS_DIR       = path.join(__dirname, "..", "klaviyo-export", "lists");
const OUT_ALL         = path.join(__dirname, "..", "klaviyo-export", "all-people-combined.csv");
const OUT_EXCEPT_QUIZ = path.join(__dirname, "..", "klaviyo-export", "all-people-except-quiz.csv");

/* Quiz list IDs to exclude from the "except-quiz" output. */
const QUIZ_LIST_IDS = new Set(["QVkNKH", "X2ib44"]);

/* ---------- minimal CSV row parser (handles quoted commas + "" escapes) ---- */
function parseRow(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === ',') { out.push(field); field = ""; }
      else if (c === '"') inQuotes = true;
      else field += c;
    }
  }
  out.push(field);
  return out;
}

function readListCsv(filepath) {
  const raw = fs.readFileSync(filepath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l !== "");
  /* First non-blank line is the "# Klaviyo list: <name> (id <id>) — ..." comment.
     Second is headers. The rest are data rows. */
  const commentMatch = lines[0]?.match(/^#\s*Klaviyo list:\s*(.+?)\s*\(id\s+([^\s)]+)\)/);
  const listName = commentMatch?.[1] || "(unknown)";
  const listId   = commentMatch?.[2] || null;
  const headers = parseRow(lines[1] || "");
  const rows = lines.slice(2).map(parseRow);
  return { listId, listName, headers, rows };
}

const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

(async () => {
  if (!fs.existsSync(LISTS_DIR)) {
    throw new Error(
      `Folder not found: ${LISTS_DIR}\n` +
      `Run 'node scripts/export-all-lists.js' first to populate it.`
    );
  }

  const files = fs.readdirSync(LISTS_DIR)
    .filter((f) => f.endsWith(".csv"))
    .sort();
  console.log(`Reading ${files.length} list CSVs from ${LISTS_DIR}\n`);

  /** key (email-lowercased OR `__no_email::<id>`) -> merged profile */
  const byKey = new Map();

  /* Properties we want to merge from each row. */
  const PROP_COLS = [
    "program", "vip", "bring_a_friend", "total_usd",
    "first_utm_source", "first_utm_medium", "first_utm_campaign",
    "utm_source", "utm_medium", "utm_campaign",
    "landing_page", "source",
    "friend_full_name", "friend_email", "friend_whatsapp",
    "submitted_at",
  ];

  for (const file of files) {
    const filepath = path.join(LISTS_DIR, file);
    const { listId, listName, headers, rows } = readListCsv(filepath);
    if (rows.length === 0) continue;

    const col = Object.fromEntries(headers.map((h, i) => [h, i]));

    for (const row of rows) {
      const emailRaw = row[col.email] || "";
      const id       = row[col.klaviyo_profile_id] || "";
      const key      = emailRaw ? emailRaw.toLowerCase() : `__no_email::${id}`;

      if (!byKey.has(key)) {
        byKey.set(key, {
          email:        emailRaw,
          first_name:   row[col.first_name] || "",
          last_name:    row[col.last_name] || "",
          phone_number: row[col.phone_number] || "",
          in_list_ids:   new Set(),
          in_list_names: new Set(),
          props:        {},
          created:      row[col.created] || "",
          updated:      row[col.updated] || "",
          profile_id:   id,
        });
      }
      const e = byKey.get(key);

      if (listId)   e.in_list_ids.add(listId);
      if (listName) e.in_list_names.add(listName);

      /* Last non-empty value wins per property. */
      for (const p of PROP_COLS) {
        const v = row[col[p]];
        if (v) e.props[p] = v;
      }

      /* Backfill identity fields if missing. */
      if (!e.first_name)   e.first_name   = row[col.first_name]   || "";
      if (!e.last_name)    e.last_name    = row[col.last_name]    || "";
      if (!e.phone_number) e.phone_number = row[col.phone_number] || "";

      /* earliest created, latest updated */
      const c = row[col.created];
      const u = row[col.updated];
      if (c && (!e.created || c < e.created)) e.created = c;
      if (u && (!e.updated || u > e.updated)) e.updated = u;
    }
  }

  console.log(`Aggregated ${byKey.size} unique profiles across ${files.length} lists\n`);

  /* ---------- write output files ---------- */
  const headers = [
    "email", "first_name", "last_name", "phone_number",
    "list_count", "in_list_ids", "in_list_names",
    ...PROP_COLS,
    "earliest_created", "latest_updated", "klaviyo_profile_id",
  ];

  function toRow(e) {
    return [
      e.email, e.first_name, e.last_name, e.phone_number,
      e.in_list_ids.size,
      [...e.in_list_ids].sort().join("; "),
      [...e.in_list_names].sort().join("; "),
      ...PROP_COLS.map((p) => e.props[p] ?? ""),
      e.created, e.updated, e.profile_id,
    ].map(csv).join(",");
  }

  /* Sort by earliest created ascending (oldest first). */
  const all = [...byKey.values()].sort((a, b) =>
    (a.created || "").localeCompare(b.created || "")
  );

  const allLines = [headers.join(","), ...all.map(toRow)];
  fs.writeFileSync(OUT_ALL, allLines.join("\n") + "\n", "utf8");

  /* Exclude anyone in either quiz list. */
  const exceptQuiz = all.filter((e) => {
    for (const quizId of QUIZ_LIST_IDS) if (e.in_list_ids.has(quizId)) return false;
    return true;
  });

  const exceptLines = [headers.join(","), ...exceptQuiz.map(toRow)];
  fs.writeFileSync(OUT_EXCEPT_QUIZ, exceptLines.join("\n") + "\n", "utf8");

  console.log(`Combined (all):       ${all.length.toLocaleString().padStart(7)} profiles`);
  console.log(`  → ${OUT_ALL}`);
  console.log("");
  console.log(`Except quiz lists:    ${exceptQuiz.length.toLocaleString().padStart(7)} profiles`);
  console.log(`  (excluded ${(all.length - exceptQuiz.length).toLocaleString()} quiz submitters from QVkNKH + X2ib44)`);
  console.log(`  → ${OUT_EXCEPT_QUIZ}`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
