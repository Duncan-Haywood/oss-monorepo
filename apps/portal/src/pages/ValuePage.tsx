import { BeforeAfterGrid } from "../components/BeforeAfterGrid";
import { KpiCard } from "../components/KpiCard";
import { PortalShell } from "../components/PortalShell";
import { pilotValue } from "../data/demoStore";

export function ValuePage() {
  const v = pilotValue;

  return (
    <PortalShell
      title="Business value"
      subtitle="What the Italy leather pilot proves to prospects — illustrative outcomes tied to € decisions, not sensor counts."
    >
      <section className="value-hero panel">
        <p className="value-eyebrow">Pilot month 1 · Atelier Linea</p>
        <h2 className="value-headline">{v.headline}</h2>
        <p className="value-subline">{v.subline}</p>
        <div className="value-hero-kpis">
          <KpiCard
            label="Est. payback"
            value={v.subscription.pilotPaybackWeeks}
            suffix=" weeks"
            hint="At pilot subscription tier"
          />
          <KpiCard
            label="Monthly subscription"
            value={v.subscription.monthlyEur}
            hint="After setup fee"
          />
          <KpiCard
            label="Setup (one-time)"
            value={v.subscription.setupFeeEur}
          />
        </div>
      </section>

      <section className="panel">
        <h2>Before vs after (6-week pilot)</h2>
        <p className="panel-desc">
          Baseline from pre-join footfall + Z-report estimates; week 6 from joined
          door CV and POS.
        </p>
        <BeforeAfterGrid metrics={v.beforeAfter} />
      </section>

      <section className="panel">
        <h2>Weekly wins — what the owner acted on</h2>
        <ul className="win-list">
          {v.weeklyWins.map((win) => (
            <li key={win.title} className="win-card">
              <div>
                <h3>{win.title}</h3>
                <p>{win.detail}</p>
              </div>
              <span className="win-impact">{win.impactEur}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Initiative ROI (aligned with product roadmap)</h2>
        <p className="panel-desc">
          Same ranking as documentation — build what moves profit first.
        </p>
        <div className="table-wrap">
          <table className="sku-table roi-table">
            <thead>
              <tr>
                <th>Initiative</th>
                <th>Build</th>
                <th>Annual upside</th>
                <th>Payback</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {v.roiHighlights.map((row) => (
                <tr key={row.initiative}>
                  <td>{row.initiative}</td>
                  <td>{row.buildEur}</td>
                  <td>{row.annualUpside}</td>
                  <td>{row.payback}</td>
                  <td>
                    <span className={`status-pill ${row.status}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel callout">
        <h2>Sales narrative</h2>
        <p>
          Enterprise retail analytics are priced for chains with IT teams. Generic
          people-counters give entries without margin context. Retail Pilot Intel
          sells a <strong>store-local join layer</strong> — door + POS + lightweight
          experiments — so an owner-operated boutique sees weekly € actions within
          days, under GDPR, without cloud video.
        </p>
      </section>
    </PortalShell>
  );
}
