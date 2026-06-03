import { PortalShell } from "../components/PortalShell";
import { experiments } from "../data/demoStore";

export function ExperimentsPage() {
  return (
    <PortalShell
      title="In-store experiments"
      subtitle="Simple A/B tests tracked against baseline metrics — the weekly insight loop."
    >
      <div className="experiment-grid">
        {experiments.map((exp) => (
          <article key={exp.id} className={`experiment-card status-${exp.status}`}>
            <header>
              <span className={`status-pill ${exp.status}`}>{exp.status}</span>
              <h3>{exp.title}</h3>
            </header>
            <p className="hypothesis">{exp.hypothesis}</p>
            <dl className="exp-metrics">
              <div>
                <dt>Primary metric</dt>
                <dd>{exp.metric}</dd>
              </div>
              <div>
                <dt>Baseline → current</dt>
                <dd>
                  {exp.baseline} → {exp.current}
                </dd>
              </div>
              <div>
                <dt>Timeline</dt>
                <dd>{exp.started}</dd>
              </div>
              <div>
                <dt>Readout</dt>
                <dd>{exp.confidence}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <section className="panel callout">
        <h2>Sales narrative</h2>
        <p>
          Pilots are sold on outcomes, not cameras. This view shows how Retail Pilot Intel closes
          the loop: measure → hypothesize → run a lightweight test → promote winners to standard
          practice.
        </p>
      </section>
    </PortalShell>
  );
}
