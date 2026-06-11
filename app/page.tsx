"use client";

import { useEffect, useState } from "react";

type Range = "daily" | "weekly" | "monthly" | "total";

type DrillDown = { listId: string; label: string } | null;
type LandingPage = { path: string; label: string };

/** localStorage key for the in-browser cache. Bump suffix to invalidate. */
const CACHE_KEY = "ewp-dashboard-cache-v1";
const cacheId = (range: string, page: string) => `${range}::${page}`;

type CacheEntry = { fetchedAt: number; payload: any };
type Cache = Record<string, CacheEntry>;

function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function writeCache(c: Cache) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("weekly");
  const [page, setPage] = useState<string>("all");     // "all" or a specific pagePath
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<Cache>({});       // hydrated from localStorage on mount
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  /* Drill-down modal state */
  const [drill, setDrill] = useState<DrillDown>(null);
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  /* Event-timeline sub-modal state */
  const [eventProfile, setEventProfile] = useState<{ id: string; email: string } | null>(null);
  const [events, setEvents] = useState<any[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [eventsLoading, setEventsLoading] = useState(false);

  /** One network call for a (range, page) combo. */
  async function fetchOne(rangeArg: string, pageArg: string): Promise<any> {
    const url = `/api/dashboard?range=${rangeArg}&page=${encodeURIComponent(pageArg)}`;
    const res = await fetch(url, { cache: "no-store" });
    return res.json();
  }

  /**
   * Render the right data for the current (range, page).
   * - Cache HIT  → instant, no network call.
   * - Cache MISS → fetch just that one combo, store it.
   * Used on range/page button clicks.
   */
  async function loadFromCacheOrFetch() {
    const key = cacheId(range, page);
    const hit = cache[key];
    if (hit) {
      setData(hit.payload);
      setLastFetched(hit.fetchedAt);
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchOne(range, page);
      const next = { ...cache, [key]: { fetchedAt: Date.now(), payload } };
      setCache(next);
      writeCache(next);
      setData(payload);
      setLastFetched(Date.now());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  /**
   * Full reload for the CURRENT range: fetch "all" + every configured landing
   * page in parallel, overwrite cache for those keys. Fired by the Refresh
   * button. Uses landingPages from whichever payload we already have (cache
   * or live) so we know what pages exist without hardcoding them.
   */
  async function refreshAll() {
    setLoading(true);
    try {
      /* Make sure we have the landingPages list first. */
      let landing: LandingPage[] = data?.landingPages || [];
      if (!landing.length) {
        const first = await fetchOne(range, "all");
        landing = first.landingPages || [];
        const next = { ...cache, [cacheId(range, "all")]: { fetchedAt: Date.now(), payload: first } };
        setCache(next); writeCache(next);
      }
      /* Now fetch "all" + each page in parallel for the current range. */
      const pageOptions = ["all", ...landing.map((p) => p.path)];
      const payloads = await Promise.all(pageOptions.map((p) => fetchOne(range, p)));
      const now = Date.now();
      const next = { ...cache };
      pageOptions.forEach((p, i) => {
        next[cacheId(range, p)] = { fetchedAt: now, payload: payloads[i] };
      });
      setCache(next);
      writeCache(next);
      /* Re-render the currently selected combo from the fresh cache. */
      const current = next[cacheId(range, page)];
      if (current) {
        setData(current.payload);
        setLastFetched(current.fetchedAt);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  /* Hydrate cache from localStorage on first mount. */
  useEffect(() => {
    const stored = readCache();
    setCache(stored);
    /* If we already have current combo cached, render instantly. */
    const hit = stored[cacheId(range, page)];
    if (hit) { setData(hit.payload); setLastFetched(hit.fetchedAt); }
    else     { loadFromCacheOrFetch(); }     /* first-time visitor → fetch */
    /* eslint-disable-next-line */
  }, []);

  /* On range/page change: cache hit = instant, miss = fetch. */
  useEffect(() => {
    /* Skip the very first run (handled by the mount effect above). */
    if (Object.keys(cache).length === 0) return;
    loadFromCacheOrFetch();
    /* eslint-disable-next-line */
  }, [range, page]);

  /* Load profiles when a drill-down is requested. */
  useEffect(() => {
    if (!drill) { setProfiles(null); return; }
    setDrillLoading(true);
    fetch(`/api/klaviyo/profiles?listId=${drill.listId}&max=500`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProfiles(j.profiles || []))
      .catch(() => setProfiles([]))
      .finally(() => setDrillLoading(false));
  }, [drill]);

  /* ESC closes whichever modal is open (events sub-modal first, then drill-down). */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (eventProfile) { setEventProfile(null); return; }
      if (drill)        { setDrill(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eventProfile, drill]);

  /* Load events when a profile is selected for the timeline. */
  useEffect(() => {
    if (!eventProfile) { setEvents(null); setMetrics({}); return; }
    setEventsLoading(true);
    fetch(`/api/klaviyo/events?profileId=${eventProfile.id}&max=100`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setEvents(j.events || []); setMetrics(j.metrics || {}); })
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [eventProfile]);

  const f  = data?.funnel  || {};
  const t  = data?.tiers   || {};
  const ids = data?.listIds || {};

  return (
    <main className="min-h-screen max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-navy">Elevate Tracking Dashboard</h1>
        <p className="text-muted mt-1 text-sm">
          Visitors (GA4) → Quiz → Checkout → Purchases (Klaviyo). Click any Klaviyo card to see the actual list members.
        </p>
      </header>

      {/* Range tabs */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {(["daily", "weekly", "monthly", "total"] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              range === r ? "bg-navy text-white" : "bg-white text-ink border border-gray-200 hover:bg-mint"
            }`}>
            {r === "daily" ? "Today" : r === "weekly" ? "Last 7 days" : r === "monthly" ? "Last 30 days" : "All time"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {lastFetched && (
            <span className="text-[11px] text-muted font-mono">
              Cached {Math.floor((Date.now() - lastFetched) / 60000)}m ago
            </span>
          )}
          <button onClick={refreshAll} disabled={loading}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-teal text-white hover:opacity-90 disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Landing-page picker — filters the GA4 Visitors KPI + Traffic Source table */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <span className="text-xs uppercase tracking-wider text-muted font-bold mr-1">GA4 page:</span>
        <button onClick={() => setPage("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            page === "all" ? "bg-teal text-white" : "bg-white text-ink border border-gray-200 hover:bg-mint"
          }`}>
          Both pages
        </button>
        {((data?.landingPages || []) as LandingPage[]).map((lp) => (
          <button key={lp.path} onClick={() => setPage(lp.path)}
            title={lp.path}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              page === lp.path ? "bg-teal text-white" : "bg-white text-ink border border-gray-200 hover:bg-mint"
            }`}>
            {lp.label}
          </button>
        ))}
        {page !== "all" && (
          <span className="text-[11px] text-muted font-mono ml-1">{page}</span>
        )}
      </div>

      {/* FUNNEL */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">Acquisition Funnel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <FunnelStep label="Visitors"        value={f.visitors}        helper="GA4 (range-filtered)" />
          <FunnelStep label="Quiz Submitters" value={f.quiz_submitters} helper="Click to view"
            onClick={() => setDrill({ listId: ids.quiz_submitters, label: "Quiz Submitters" })} />
          <FunnelStep label="Quiz Finished"   value={f.quiz_finished}   helper="Click to view"
            onClick={() => setDrill({ listId: ids.quiz_finished, label: "Quiz Finished" })} />
          <FunnelStep label="Checkout Filled" value={f.checkout_filled} helper="Click to view"
            onClick={() => setDrill({ listId: ids.checkout_filled, label: "Checkout Filled" })} />
          <FunnelStep label="Abandoned Cart"  value={f.abandoned_cart}  helper="Click to view"
            onClick={() => setDrill({ listId: ids.abandoned_cart, label: "Abandoned Cart" })} />
          <FunnelStep label="Purchases"       value={f.buyers}          helper="Click to view" highlight
            onClick={() => setDrill({ listId: ids.buyers, label: "Purchases (All Buyers)" })} />
          <FunnelStep label="Revenue"         value={f.revenue}         prefix="$" helper="Tier sum" highlight />
        </div>
        <p className="text-xs text-muted mt-2">
          Klaviyo list counts are cumulative (all-time). Only GA4 and Typeform respect the date range.
        </p>
      </section>

      {/* TIER BREAKDOWN */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">Buyers by Tier</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi label="$269 Basic"    value={t.tier269}     accent="bg-mint"
            onClick={() => ids.tier269 && setDrill({ listId: ids.tier269, label: "$269 Basic Buyers" })} />
          <Kpi label="$419 VIP"      value={t.tier419}     accent="bg-mint"
            onClick={() => ids.tier419 && setDrill({ listId: ids.tier419, label: "$419 VIP Buyers" })} />
          <Kpi label="$468 +Friend"  value={t.tier468}     accent="bg-mint"
            onClick={() => ids.tier468 && setDrill({ listId: ids.tier468, label: "$468 +Friend Buyers" })} />
          <Kpi label="$618 VIP+Fr."  value={t.tier618}     accent="bg-mint"
            onClick={() => ids.tier618 && setDrill({ listId: ids.tier618, label: "$618 VIP+Friend Buyers" })} />
          <Kpi label="$199 Downsell" value={t.downsell199} accent="bg-cream"
            onClick={() => ids.downsell && setDrill({ listId: ids.downsell, label: "$199 Downsell Buyers" })} />
          <Kpi label="$495 Late"     value={t.late}        accent="bg-cream"
            onClick={() => ids.late && setDrill({ listId: ids.late, label: "$495 Late Buyers" })} />
          <Kpi label="Friend Refs"   value={t.friend}      accent="bg-cream"
            onClick={() => ids.friend && setDrill({ listId: ids.friend, label: "Friend Referrals" })} />
        </div>
      </section>

      {/* EMAIL SEQUENCE ENGAGEMENT — 7-day welcome flow opens */}
      {data?.emailSequence && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">
            {data.emailSequence.label}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {(data.emailSequence.stages || []).map((s: any) => (
              <FunnelStep
                key={s.day}
                label={s.label}
                value={s.configured ? s.count : null}
                helper={s.configured ? (s.segmentId ? "Click to view" : "") : "Not configured"}
                onClick={s.configured && s.segmentId
                  ? () => setDrill({ listId: s.segmentId, label: s.label })
                  : undefined}
              />
            ))}
          </div>
          {(data.emailSequence.stages || []).every((s: any) => !s.configured) && (
            <p className="text-xs text-muted mt-2">
              Add Klaviyo segment IDs to <code>CONFIG.klaviyo.emailSequence.stages</code> to populate this section.
            </p>
          )}
        </section>
      )}

      {/* TYPEFORM + GA4 totals */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">Range-filtered totals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Sessions"     value={data?.ga4?.totals?.sessions}  />
          <Kpi label="Visitors"     value={data?.ga4?.totals?.users}     />
          <Kpi label="Pageviews"    value={data?.ga4?.totals?.pageViews} />
          <Kpi label="Typeform"     value={data?.typeform?.responses}    helper="Submissions" />
        </div>
      </section>

      {/* Traffic source */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">Traffic by source (GA4)</h2>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-mint">
              <tr className="text-left text-muted">
                <th className="p-3">Source</th>
                <th className="p-3">Medium</th>
                <th className="p-3">Campaign</th>
                <th className="p-3 text-right">Sessions</th>
                <th className="p-3 text-right">Users</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ga4?.bySource || []).map((r: any, i: number) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-semibold">{r.source}</td>
                  <td className="p-3">{r.medium}</td>
                  <td className="p-3">{r.campaign}</td>
                  <td className="p-3 text-right">{r.sessions.toLocaleString()}</td>
                  <td className="p-3 text-right">{r.users.toLocaleString()}</td>
                </tr>
              ))}
              {(!data?.ga4 || (data.ga4.bySource || []).length === 0) && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted">
                    {data?.errors?.ga4 ? <span className="text-red-600">GA4 error: {data.errors.ga4}</span> : "No data."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Errors */}
      {data?.errors && Object.keys(data.errors).length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm mb-8">
          <h3 className="font-bold text-red-700 mb-2">Some APIs returned errors:</h3>
          <ul className="list-disc pl-5 space-y-1 text-red-700 font-mono text-xs">
            {Object.entries(data.errors).map(([k, v]: any) => (
              <li key={k}><b>{k}:</b> {String(v)}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 text-xs text-muted text-center">
        Range: <span className="font-mono">{data?.label || "—"}</span>
      </footer>

      {/* DRILL-DOWN MODAL */}
      {drill && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setDrill(null); }}>
          <div className="bg-white rounded-2xl max-w-5xl w-full my-8 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-navy text-white">
              <div>
                <h3 className="text-lg font-extrabold">{drill.label}</h3>
                <p className="text-xs text-white/70 mt-0.5">
                  List ID: <code className="font-mono">{drill.listId}</code>
                  {profiles && ` · ${profiles.length} profiles shown (max 500)`}
                </p>
              </div>
              <button onClick={() => setDrill(null)}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-xl">×</button>
            </div>

            <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
              {drillLoading ? (
                <div className="p-10 text-center text-muted">Loading profiles…</div>
              ) : profiles && profiles.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-mint sticky top-0">
                    <tr className="text-left text-muted">
                      <th className="p-3">Email</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Campaign</th>
                      <th className="p-3">Program</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3">Created</th>
                      <th className="p-3 text-right">Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p: any, i: number) => {
                      const a = p?.attributes || {};
                      const props = a?.properties || {};
                      return (
                        <tr key={p.id || i} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-3 font-mono text-xs">{a.email || "—"}</td>
                          <td className="p-3">{[a.first_name, a.last_name].filter(Boolean).join(" ") || "—"}</td>
                          <td className="p-3 text-xs">{props.first_utm_source || props.utm_source || "—"}</td>
                          <td className="p-3 text-xs">{props.first_utm_campaign || props.utm_campaign || "—"}</td>
                          <td className="p-3 text-xs">{props.program || "—"}</td>
                          <td className="p-3 text-right font-semibold">{props.total_usd ? `$${props.total_usd}` : "—"}</td>
                          <td className="p-3 text-xs">{a.created ? new Date(a.created).toLocaleDateString() : "—"}</td>
                          <td className="p-3 text-right">
                            <button onClick={() => setEventProfile({ id: p.id, email: a.email || "—" })}
                              className="px-3 py-1 rounded-full bg-navy text-white text-xs font-semibold hover:opacity-90">
                              View →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-10 text-center text-muted">No profiles in this list.</div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-muted flex items-center justify-between">
              <span>Click outside or press ESC to close</span>
              {profiles && profiles.length > 0 && (
                <button onClick={() => exportCsv(drill.label, profiles)}
                  className="px-3 py-1.5 rounded-full bg-teal text-white text-xs font-semibold hover:opacity-90">
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EVENT TIMELINE SUB-MODAL */}
      {eventProfile && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setEventProfile(null); }}>
          <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-teal text-white">
              <div>
                <h3 className="text-lg font-extrabold">Activity Timeline</h3>
                <p className="text-xs text-white/80 mt-0.5 font-mono">{eventProfile.email}</p>
              </div>
              <button onClick={() => setEventProfile(null)}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-xl">×</button>
            </div>

            <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
              {eventsLoading ? (
                <div className="p-10 text-center text-muted">Loading events…</div>
              ) : events && events.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {events.map((ev: any) => {
                    const a = ev?.attributes || {};
                    const metricId = ev?.relationships?.metric?.data?.id;
                    const metricName = (metricId && metrics[metricId]) || "Unknown event";
                    const dt = a.datetime ? new Date(a.datetime) : null;
                    const props = a.event_properties || {};
                    const subject = props["Subject"] || props["subject"] || props["$message_name"] || "";
                    const value = a.value || props.value;

                    return (
                      <li key={ev.id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-navy text-sm">{metricName}</div>
                            {subject && (
                              <div className="text-xs text-muted mt-0.5 truncate">{subject}</div>
                            )}
                            {value && (
                              <div className="text-xs text-teal mt-0.5 font-semibold">${value}</div>
                            )}
                          </div>
                          <div className="text-xs text-muted whitespace-nowrap text-right">
                            {dt ? (
                              <>
                                <div>{dt.toLocaleDateString()}</div>
                                <div>{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              </>
                            ) : "—"}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-10 text-center text-muted">No events recorded for this profile.</div>
              )}
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-muted text-center">
              {events && `Showing ${events.length} most recent events`}
              {!events && !eventsLoading && "—"}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* CSV export helper. */
function exportCsv(label: string, profiles: any[]) {
  const rows = [
    ["email", "first_name", "last_name", "utm_source", "utm_campaign", "program", "vip", "bring_a_friend", "total_usd", "created"],
    ...profiles.map((p: any) => {
      const a = p?.attributes || {};
      const props = a?.properties || {};
      return [
        a.email || "",
        a.first_name || "",
        a.last_name || "",
        props.first_utm_source || props.utm_source || "",
        props.first_utm_campaign || props.utm_campaign || "",
        props.program || "",
        props.vip ?? "",
        props.bring_a_friend ?? "",
        props.total_usd ?? "",
        a.created || "",
      ];
    }),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function FunnelStep({ label, value, helper, prefix, highlight, onClick }: any) {
  const display = value == null ? "—" : `${prefix || ""}${Number(value).toLocaleString()}`;
  const base = `rounded-2xl border p-4 transition ${highlight ? "bg-navy text-white border-navy" : "bg-white border-gray-200"}`;
  const clickable = onClick ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : "";
  return (
    <div className={`${base} ${clickable}`} onClick={onClick}>
      <div className={`text-[11px] uppercase tracking-wider font-bold ${highlight ? "text-white/70" : "text-muted"}`}>{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${highlight ? "text-white" : "text-navy"}`}>{display}</div>
      {helper && <div className={`text-[10px] mt-1 ${highlight ? "text-white/60" : "text-muted"}`}>{helper}</div>}
    </div>
  );
}

function Kpi({ label, value, prefix, helper, accent, onClick }: any) {
  const display = value == null
    ? "—"
    : (typeof value === "number" ? `${prefix || ""}${value.toLocaleString()}` : `${prefix || ""}${value}`);
  const base = `rounded-2xl border border-gray-200 p-3 ${accent || "bg-white"}`;
  const clickable = onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition" : "";
  return (
    <div className={`${base} ${clickable}`} onClick={onClick}>
      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className="text-xl font-extrabold text-navy mt-1">{display}</div>
      {helper && <div className="text-[10px] text-muted mt-1">{helper}</div>}
    </div>
  );
}
