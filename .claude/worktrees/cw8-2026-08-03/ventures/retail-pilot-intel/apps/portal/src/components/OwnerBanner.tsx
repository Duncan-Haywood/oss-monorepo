import { Link } from "react-router-dom";
import { pilotImpactSummary } from "../data/demoStore";

export function OwnerBanner() {
  const impact = pilotImpactSummary;

  return (
    <aside className="owner-banner" aria-label="Owner summary">
      <div>
        <p className="owner-banner-eyebrow">Owner view · illustrative pilot</p>
        <p className="owner-banner-title">{impact.headline}</p>
        <p className="owner-banner-sub">
          Conversion +{impact.conversionLiftPts} pts · revenue +{impact.weeklyRevenueDeltaPct}%
          vs last week
        </p>
      </div>
      <Link to="/value" className="btn-owner-cta">
        Business value →
      </Link>
    </aside>
  );
}
