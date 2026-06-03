import { BarChart } from "../components/BarChart";
import { InsightList } from "../components/InsightList";
import { KpiCard } from "../components/KpiCard";
import { PortalShell } from "../components/PortalShell";
import { readSession } from "../auth/demoAuth";
import {
  funnelStages,
  hourlyFootfall,
  insights,
  pilotValue,
  todayKpis,
  weekTrend,
} from "../data/demoStore";
import { Link } from "react-router-dom";

export function OverviewPage() {
  const k = todayKpis;
  const isOwner = readSession()?.role === "owner";

  return (
    <PortalShell
      title="Today at a glance"
      subtitle="What a store owner would see after door CV and POS are joined on the edge — illustrative pilot week."
    >
      {isOwner ? (
        <section className="value-banner">
          <div>
            <p className="value-eyebrow">Business impact · pilot week 6</p>
            <p className="value-banner-text">{pilotValue.headline}</p>
          </div>
          <Link to="/value" className="btn-primary btn-compact">
            View ROI story →
          </Link>
        </section>
      ) : null}
      <section className="kpi-grid">
        <KpiCard
          label="Door entries"
          value={k.entries}
          delta={`${k.vsLastWeek.entries} vs last week`}
        />
        <KpiCard
          label="Conversion"
          value={k.conversionPct}
          suffix="%"
          delta={`+${k.vsLastWeek.conversion} pts`}
        />
        <KpiCard
          label="Revenue"
          value={`€${k.revenueEur.toLocaleString("it-IT")}`}
          delta={`+${k.vsLastWeek.revenue}%`}
        />
        <KpiCard
          label="Avg basket"
          value={`€${k.avgBasketEur}`}
          hint={`${k.purchases} purchases today`}
        />
        <KpiCard label="Engaged visits" value={k.engaged} suffix={`${k.engagementPct}%`} />
        <KpiCard label="Bounces" value={k.bounces} suffix={`${k.bouncePct}%`} />
      </section>

      <div className="split-panels">
        <section className="panel">
          <h2>Hourly footfall & closes</h2>
          <p className="panel-desc">Door entries vs POS purchases — Europe/Rome buckets.</p>
          <BarChart
            items={hourlyFootfall}
            labelKey="hour"
            valueKey="entries"
            secondaryKey="purchases"
          />
        </section>

        <section className="panel">
          <h2>7-day trend</h2>
          <p className="panel-desc">Entries (bars) with same-day revenue overlay.</p>
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
