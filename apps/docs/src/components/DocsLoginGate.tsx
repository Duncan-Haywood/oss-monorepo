import { useState, type FormEvent } from "react";
import {
  createDocsSession,
  getDocsPasscode,
  verifyDocsPasscode,
} from "../auth/docsAuth";

export function DocsLoginGate({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!verifyDocsPasscode(passcode)) {
      setError("Invalid passcode. Contact your pilot lead for access.");
      return;
    }
    createDocsSession();
    onAuthenticated();
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <p className="login-eyebrow">Retail Pilot Intel</p>
        <h1>Pilot documentation</h1>
        <p className="login-lead">
          Private business, ROI, and architecture docs for the Italy leather
          boutique pilot. Session stays in this browser only.
        </p>
        <ul className="login-value-points">
          <li>
            <strong>ROI & build order</strong> — what to ship first for profit
          </li>
          <li>
            <strong>Business plan</strong> — pricing, GTM, and payback
          </li>
          <li>
            <strong>Privacy-first</strong> — GDPR constraints and edge design
          </li>
        </ul>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Access passcode</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
            />
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary">
            View documentation
          </button>
        </form>

        <p className="login-foot">
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowHint((v) => !v)}
          >
            {showHint ? "Hide" : "Show"} access hint
          </button>
          {showHint ? (
            <span className="demo-hint">
              {" "}
              Passcode for this build: <code>{getDocsPasscode()}</code>
            </span>
          ) : null}
        </p>

        <ul className="login-trust">
          <li>Private pilot content — not public legal advice</li>
          <li>Client-side gate — pair with host-level protection in production</li>
          <li>Session expires after 8 hours</li>
        </ul>
      </div>
    </div>
  );
}
