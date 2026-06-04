import { useState, type FormEvent } from "react";
import {
  createSession,
  getDocsPasscode,
  verifyPasscode,
} from "../auth/docsAuth";

export function DocsGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!verifyPasscode(passcode)) {
      setError("Invalid passcode. Ask your pilot lead for access.");
      return;
    }
    createSession();
    onAuthenticated();
  }

  return (
    <div className="docs-gate">
      <div className="docs-gate-panel">
        <p className="docs-gate-eyebrow">Retail Pilot Intel</p>
        <h1>Pilot documentation</h1>
        <p className="docs-gate-lead">
          Private product docs: ROI priorities, business plan, architecture, and
          GDPR notes. Session stays in this browser only.
        </p>

        <form onSubmit={handleSubmit} className="docs-gate-form">
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
            <p className="docs-gate-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="docs-gate-submit">
            Open documentation
          </button>
        </form>

        <p className="docs-gate-foot">
          <button
            type="button"
            className="docs-gate-link"
            onClick={() => setShowHint((v) => !v)}
          >
            {showHint ? "Hide" : "Show"} build hint
          </button>
          {showHint ? (
            <span className="docs-gate-hint">
              {" "}
              Passcode for this build: <code>{getDocsPasscode()}</code>
            </span>
          ) : null}
        </p>

        <ul className="docs-gate-trust">
          <li>Not indexed for search — share URL only with pilot team</li>
          <li>Pair with host-level protection (Vercel password) in production</li>
          <li>Session expires after 12 hours</li>
        </ul>
      </div>
    </div>
  );
}
