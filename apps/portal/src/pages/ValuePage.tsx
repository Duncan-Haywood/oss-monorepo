import { KpiCard } from "../components/KpiCard";
import { PortalShell } from "../components/PortalShell";
import { businessValue } from "../data/demoStore";

export function ValuePage() {
  const s = businessValue.summary;

  return (
    <PortalShell
      title="Business value"
      subtitle="Indicative pilot economics for Atelier Linea — replace with owner actuals during onboarding."
    >
      <section className="value-hero panel">
        <h2>{businessValue.headline}</h2>
        <p>{businessValue.subhead}</p>
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Indicative annual upside"
          value={s.indicativeUpside}
          hint="Conversion + SKU recovery + upsell"
        />
        <KpiCard label="Payback" value={s.paybackWeeks} suffix=" weeks" />
        <KpiCard label="Subscription" value={s.subscription} hint="Per store, post-pilot" />
        <KpiCard label="Pilot install" value={s.pilotInstall} hint="One-time hardware + setup" />
      </section>

      <section className="panel">
        <h2>Pilot store economics</h2>
        <p className="panel-desc">Planning assumptions for a ~10 m² urban leather boutique.</p>
        <div className="economics-grid">
          {businessValue.pilotEconomics.map((row) => (
            <div key={row.label} className="economics-card">
              <span className="economics-label">{row.label}</span>
              <strong className="economics-value">{row.value}</strong>
              <span className="economics-note">{row.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Outcome levers (this pilot)</h2>
        <p className="panel-desc">
          Three capabilities that change revenue, margin, or cash — the ROI story for sales.
        </p>
        <div className="outcome-grid">
          {businessValue.outcomes.map((o) => (
            <article key={o.id} className="outcome-card">
              <span className="phase-pill">{o.phase}</span>
              <h3>{o.title}</h3>
              <p className="outcome-metric">{o.metric}</p>
              <p className="outcome-detail">{o.detail}</p>
              <p className="outcome-annual">
                Indicative upside: <strong>{o.annualEur}/year</strong>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel callout">
        <h2>Why retailers buy</h2>
        <ul className="proof-list">
          {businessValue.proofPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
    </PortalShell>
  );
}
