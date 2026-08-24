import { useLocation } from "react-router-dom";
import { getEngagementSummary, TOUR_PATHS } from "../lib/engagement-log";

const SECTION_LABELS: Record<(typeof TOUR_PATHS)[number], string> = {
  "/value": "Business value",
  "/": "Overview",
  "/funnel": "Funnel",
  "/products": "Products",
  "/experiments": "Experiments",
  "/trust": "Privacy & trust",
};

/**
 * Live "tour progress" readout for whoever is presenting: at a glance, has
 * this walkthrough actually covered every section before the call ends?
 * Reads the anonymous, session-only, in-tab engagement log (see
 * lib/engagement-log.ts) — nothing here is sent to a server or stored
 * beyond this browser tab.
 */
export function EngagementSummary() {
  // useLocation subscribes this component to route changes so it re-reads
  // the log (which lives in module state, not React state) on every page
  // view recorded by EngagementTracker.
  useLocation();
  const summary = getEngagementSummary();

  return (
    <div className="engagement-summary" aria-label="Demo tour progress">
      <p className="sidebar-tip">
        Tour progress: <strong>{summary.sectionsVisited}/{summary.sectionsTotal}</strong> sections
        viewed this session
      </p>
      <ul className="engagement-summary-list">
        {TOUR_PATHS.map((path) => (
          <li key={path} className={summary.visitedPaths.includes(path) ? "seen" : "unseen"}>
            <span aria-hidden="true">{summary.visitedPaths.includes(path) ? "✓" : "·"}</span>{" "}
            {SECTION_LABELS[path]}
          </li>
        ))}
      </ul>
      <p className="muted engagement-summary-disclaimer">
        This session only — stays in your browser tab, never sent to a server, resets on reload.
      </p>
    </div>
  );
}
