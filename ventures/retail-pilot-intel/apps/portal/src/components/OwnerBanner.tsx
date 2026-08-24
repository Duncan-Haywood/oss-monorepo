import { Link, useLocation } from "react-router-dom";
import { pilotImpactSummary } from "../data/demoStore";
import { recordEngagementEvent } from "../lib/engagement-log";

export function OwnerBanner() {
  const impact = pilotImpactSummary;
  const { pathname } = useLocation();

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
      <Link
        to="/value"
        className="btn-owner-cta"
        onClick={() =>
          recordEngagementEvent({
            name: "owner_value_cta_click",
            path: pathname,
            createdAt: new Date().toISOString(),
          })
        }
      >
        Business value →
      </Link>
    </aside>
  );
}
