import { PortalShell } from "../components/PortalShell";
import { privacyPosture } from "../data/demoStore";

export function TrustPage() {
  return (
    <PortalShell
      title="Privacy & trust"
      subtitle="Technical posture for Italy/EU micro-retail pilots — illustrative controls for stakeholder review."
    >
      <div className="trust-grid">
        {privacyPosture.map((item) => (
          <div key={item.label} className="trust-card">
            <span className="trust-label">{item.label}</span>
            <p>{item.value}</p>
          </div>
        ))}
      </div>

      <section className="panel">
        <h2>Demo security model</h2>
        <ul className="trust-list">
          <li>
            <strong>Passcode gate</strong> — client-side session for sales demos; production
            would use store SSO or hardware-bound tokens on the LAN.
          </li>
          <li>
            <strong>No backend in this build</strong> — static bundle only; zero egress of
            shopper imagery.
          </li>
          <li>
            <strong>Role preview</strong> — operator vs owner views share data today; production
            can scope financials to owner role.
          </li>
          <li>
            <strong>Legal</strong> — engage Italian counsel for DPIA and in-store signage before
            live capture.
          </li>
        </ul>
      </section>
    </PortalShell>
  );
}
