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
        <h1>Pilot documentation</h1>
        <p className="login-lead">
          Private business plan, ROI matrix, architecture, and GDPR notes for
          the Italy leather boutique pilot. Session stays in this browser only.
        </p>

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
            {showHint ? "Hide" : "Show"} local dev hint
          </button>
          {showHint ? (
            <span className="demo-hint">
              {" "}
              Passcode for this build: <code>{getDocsPasscode()}</code>
            </span>
          ) : null}
        </p>

        <ul className="login-trust">
          <li>Not indexed for search</li>
          <li>Not legal advice — counsel for GDPR</li>
          <li>Session expires after 12 hours</li>
        </ul>
      </div>
    </div>
  );
}
