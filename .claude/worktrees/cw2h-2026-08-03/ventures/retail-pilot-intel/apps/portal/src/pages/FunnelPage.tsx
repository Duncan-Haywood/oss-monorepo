import { PortalShell } from "../components/PortalShell";
import { funnelStages, todayKpis } from "../data/demoStore";

export function FunnelPage() {
  const max = funnelStages[0]?.count ?? 1;

  return (
    <PortalShell
      title="Store funnel"
      subtitle="Aggregate door and zone signals joined to POS — no individual shopper profiles."
    >
      <div className="funnel-viz">
        {funnelStages.map((stage, index) => {
          const width = Math.max(12, Math.round((stage.count / max) * 100));
          return (
            <div key={stage.stage} className="funnel-bar-row">
              <div className="funnel-bar-label">
                <strong>{stage.stage}</strong>
                <span>
                  {stage.count.toLocaleString("it-IT")}
                  {index > 0 ? ` · ${stage.pct}%` : ""}
                </span>
              </div>
              <div className="funnel-bar-track">
                <div className="funnel-bar-fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <section className="panel metrics-definitions">
        <h2>Derived rates (today)</h2>
        <dl className="metric-dl">
          <div>
            <dt>Conversion</dt>
            <dd>
              {todayKpis.purchases} ÷ {todayKpis.entries} ={" "}
              <strong>{todayKpis.conversionPct}%</strong>
            </dd>
          </div>
          <div>
            <dt>Engagement rate</dt>
            <dd>
              {todayKpis.engaged} ÷ {todayKpis.entries} ={" "}
              <strong>{todayKpis.engagementPct}%</strong>
            </dd>
          </div>
          <div>
            <dt>Bounce rate</dt>
            <dd>
              {todayKpis.bounces} ÷ {todayKpis.entries} ={" "}
              <strong>{todayKpis.bouncePct}%</strong>
            </dd>
          </div>
        </dl>
        <p className="panel-desc muted">
          Production builds bucket at 5m / 1h / 1d and align POS timestamps to Europe/Rome.
        </p>
      </section>
    </PortalShell>
  );
}
