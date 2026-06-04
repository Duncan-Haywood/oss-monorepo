import { useState, type FormEvent } from "react";
import { createSession, getDocsPasscode, verifyPasscode } from "../auth/docsAuth";

export function DocsLoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
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
          Internal product, ROI, and viability docs. Session stays in this browser
          only. Pair with Vercel Deployment Protection on your custom domain for
          server-side access control in production.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Docs passcode</span>
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
            Enter docs
          </button>
        </form>

        <p className="login-foot">
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowHint((v) => !v)}
          >
            {showHint ? "Hide" : "Show"} local hint
          </button>
          {showHint ? (
            <span className="demo-hint">
              {" "}
              Default passcode: <code>{getDocsPasscode()}</code>
            </span>
          ) : null}
        </p>

        <ul className="login-trust">
          <li>TSX pages + HTML reports built in CI</li>
          <li>Not a substitute for SSO in production</li>
          <li>Session expires after 12 hours</li>
        </ul>
      </div>
    </div>
  );
}
