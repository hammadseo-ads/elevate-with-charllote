"use client";

import { useEffect, useState } from "react";

type Range = "daily" | "weekly" | "monthly" | "total";

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("weekly");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?range=${range}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);

  const f = data?.funnel || {};
  const t = data?.tiers  || {};

  return (
    <main className="min-h-screen max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-navy">Elevate Tracking Dashboard</h1>
        <p className="text-muted mt-1 text-sm">
          Visitors (GA4) → Quiz → Checkout → Purchases (Klaviyo).
        </p>
      </header>

      {/* Range tabs */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        {(["daily", "weekly", "monthly", "total"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
              range === r ? "bg-navy text-white" : "bg-white text-ink border border-gray-200 hover:bg-mint"
            }`}
          >
            {r === "daily" ? "Today" : r === "weekly" ? "Last 7 days" : r === "monthly" ? "Last 30 days" : "All time"}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          className="ml-auto px-4 py-2 rounded-full text-sm font-semibold bg-teal text-white hover:opacity-90 disabled:opacity-50">
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* FUNNEL */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">Acquisition Funnel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <FunnelStep label="Visitors"           value={f.visitors}        helper="GA4 (range-filtered)" />
          <FunnelStep label="Quiz Submitters"    value={f.quiz_submitters} helper="Klaviyo (all-time)" />
          <FunnelStep label="Quiz Finished"      value={f.quiz_finished}   helper="Klaviyo (all-time)" />
          <FunnelStep label="Checkout Filled"    value={f.checkout_filled} helper="Klaviyo (all-time)" />
          <FunnelStep label="Purchases"          value={f.buyers}          helper="Klaviyo (all-time)" highlight />
          <FunnelStep label="Revenue"            value={f.revenue}         prefix="$" helper="Tier sum (all-time)" highlight />
        </div>
        <p className="text-xs text-muted mt-2">
          Note: Klaviyo list counts are cumulative — they don't shrink when you switch to "Today / Weekly". Only GA4 and Typeform respect the range.
        </p>
      </section>

      {/* TIER BREAKDOWN */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wider text-muted font-bold mb-3">Buyers by Tier</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi label="$269 Basic"    value={t.tier269}     accent="bg-mint" />
          <Kpi label="$419 VIP"      value={t.tier419}     accent="bg-mint" />
          <Kpi label="$468 +Friend"  value={t.tier468}     accent="bg-mint" />
          <Kpi label="$618 VIP+Fr."  value={t.tier618}     accent="bg-mint" />
          <Kpi label="$199 Downsell" value={t.downsell199} accent="bg-cream" />
          <Kpi label="$495 Late"     value={t.late}        accent="bg-cream" />
          <Kpi label="Friend Refs"   value={t.friend}      accent="bg-cream" />
        </div>
      </section>

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
    </main>
  );
}

function FunnelStep({ label, value, helper, prefix, highlight }: any) {
  const display = value === undefined || value === null
    ? "—"
    : `${prefix || ""}${Number(value).toLocaleString()}`;
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "bg-navy text-white border-navy" : "bg-white border-gray-200"}`}>
      <div className={`text-[11px] uppercase tracking-wider font-bold ${highlight ? "text-white/70" : "text-muted"}`}>{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${highlight ? "text-white" : "text-navy"}`}>{display}</div>
      {helper && <div className={`text-[10px] mt-1 ${highlight ? "text-white/60" : "text-muted"}`}>{helper}</div>}
    </div>
  );
}

function Kpi({ label, value, prefix, helper, accent }: any) {
  const display = value === undefined || value === null
    ? "—"
    : (typeof value === "number" ? `${prefix || ""}${value.toLocaleString()}` : `${prefix || ""}${value}`);
  return (
    <div className={`rounded-2xl border border-gray-200 p-3 ${accent || "bg-white"}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{label}</div>
      <div className="text-xl font-extrabold text-navy mt-1">{display}</div>
      {helper && <div className="text-[10px] text-muted mt-1">{helper}</div>}
    </div>
  );
}
