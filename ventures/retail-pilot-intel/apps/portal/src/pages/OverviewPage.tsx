import { readSession } from "../auth/demoAuth";
import { BarChart } from "../components/BarChart";
import { DataSourceBadge } from "../components/DataSourceBadge";
import { InsightList } from "../components/InsightList";
import { KpiCard } from "../components/KpiCard";
import { OwnerBanner } from "../components/OwnerBanner";
import { PortalShell } from "../components/PortalShell";
import { funnelStages, hourlyFootfall, insights, weekTrend } from "../data/demoStore";
import { usePilotKpis } from "../lib/usePilotKpis";

function formatEuro(value: number): string {
  return `€${Number(value.toFixed(2)).toLocaleString("it-IT")}`;
}

export function OverviewPage() {
  const { view, loading } = usePilotKpis();
  const k = view.kpis;
  const isOwner = readSession()?.role === "owner";
  const liveHeadline = view.source === "live";

  return (
    <PortalShell
      title="Today at a glance"
      subtitle={
        liveHeadline
          ? "Door counts and POS closes joined from this store's SQLite — charts below stay illustrative until hourly rollups land."
          : "What a store owner would see after door CV and POS are joined on the edge — illustrative pilot week."
      }
      dataSource={view.source}
    >
      {isOwner ? <OwnerBanner /> : null}

      <DataSourceBadge source={view.source} message={view.message} />

      {loading ? (
        <p className="kpi-loading" role="status">
          Loading store KPIs…
        </p>
      ) : null}

      <section className="kpi-grid">
        <KpiCard label="Door entries" value={k.entries} delta={k.vsLastWeek?.entries} />
        <KpiCard
          label="Conversion"
          value={k.conversionPct}
          suffix="%"
          delta={k.vsLastWeek?.conversion}
        />
        <KpiCard
          label="Revenue"
          value={formatEuro(k.revenueEur)}
          delta={k.vsLastWeek?.revenue}
        />
        <KpiCard
          label="Avg basket"
          value={formatEuro(k.avgBasketEur)}
          hint={`${k.purchases} purchases${liveHeadline && view.date ? ` on ${view.date}` : " today"}`}
        />
        {k.engaged !== null && k.engagementPct !== null ? (
          <KpiCard label="Engaged visits" value={k.engaged} suffix={`${k.engagementPct}%`} />
        ) : null}
        <KpiCard
          label="Bounces"
          value={k.bounces}
          suffix={k.bouncePct ? `${k.bouncePct}%` : undefined}
        />
      </section>

      <div className="split-panels">
        <section className="panel">
          <h2>Hourly footfall & closes</h2>
          <p className="panel-desc">
            Door entries vs POS purchases — Europe/Rome buckets
            {liveHeadline ? " (illustrative hourly series until rollups land)" : ""}.
          </p>
          <BarChart
            items={hourlyFootfall}
            labelKey="hour"
            valueKey="entries"
            secondaryKey="purchases"
          />
        </section>

        <section className="panel">
          <h2>7-day trend</h2>
          <p className="panel-desc">
            Entries (bars) with same-day revenue overlay
            {liveHeadline ? " (illustrative week until daily history is served)" : ""}.
          </p>
          <BarChart
            items={weekTrend.map((d) => ({
              day: d.day,
              entries: d.entries,
              revenue: Math.round(d.revenue / 100),
            }))}
            labelKey="day"
            valueKey="entries"
            secondaryKey="revenue"
          />
        </section>
      </div>

      <section className="panel">
        <h2>Funnel snapshot</h2>
        <div className="funnel-strip">
          {funnelStages.map((s, i) => (
            <div key={s.stage} className="funnel-step">
              <span className="funnel-count">{s.count}</span>
              <span className="funnel-name">{s.stage}</span>
              {i > 0 ? (
                <span className="funnel-pct">{s.pct}% of prior</span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Actionable insights</h2>
        <p className="panel-desc">
          Ranked recommendations the analytics layer would surface — not generic dashboards.
        </p>
        <InsightList items={insights} />
      </section>
    </PortalShell>
  );
}
