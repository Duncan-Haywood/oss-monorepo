import { useState, type FormEvent } from "react";
import {
  createSession,
  getDocsPasscode,
  verifyPasscode,
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
    if (!verifyPasscode(passcode)) {
      setError("Invalid passcode. Contact your pilot lead for access.");
      return;
    }
    createSession();
    onAuthenticated();
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <p className="login-eyebrow">Retail Pilot Intel</p>
        <h1>Private documentation</h1>
        <p className="login-lead">
          Internal product, GTM, and commercial collateral for the Italy leather
          boutique pilot. Passcode required; session stays in this browser only.
        </p>
        <ul className="login-value-points">
          <li>
            <strong>TSX-first</strong> — ROI, business plan, GTM, architecture
          </li>
          <li>
            <strong>HTML archive</strong> — built from repo reports at compile time
          </li>
          <li>
            <strong>noindex</strong> — not indexed; pair with Vercel deployment protection
          </li>
        </ul>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Documentation passcode</span>
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
            Enter documentation
          </button>
        </form>

        <p className="login-foot">
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowHint((v) => !v)}
          >
            {showHint ? "Hide" : "Show"} hint
          </button>
          {showHint ? (
            <span className="demo-hint">
              {" "}
              Passcode for this build: <code>{getDocsPasscode()}</code>
            </span>
          ) : null}
        </p>

        <ul className="login-trust">
          <li>Client-side gate for stakeholder sharing</li>
          <li>Enable Vercel Deployment Protection for production</li>
          <li>Session expires after 8 hours</li>
        </ul>
      </div>
    </div>
  );
}
