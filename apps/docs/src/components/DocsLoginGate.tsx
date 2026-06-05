import { useState, type FormEvent } from "react";
import {
  createDocsSession,
  getDocsPasscodeForDevHint,
  verifyDocsPasscode,
} from "../auth/docsAuth";

export function DocsLoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const showDevHint = import.meta.env.DEV;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    verifyDocsPasscode(passcode).then((valid) => {
      setVerifying(false);
      if (!valid) {
        setError("Invalid passcode. Ask your pilot lead for access.");
        return;
      }
      createDocsSession();
      onAuthenticated();
    });
  }

  return (
    <div className="docs-login-screen">
      <div className="docs-login-panel">
        <p className="docs-login-eyebrow">Retail Pilot Intel</p>
        <h1>Pilot documentation</h1>
        <p className="docs-login-lead">
          Private product docs: ROI priorities, business plan, architecture, and
          commercial viability reports (TSX). Session stays in this browser only.
        </p>

        <form onSubmit={handleSubmit} className="docs-login-form">
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
            <p className="docs-login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="docs-btn-primary" disabled={verifying}>
            {verifying ? "Verifying…" : "View documentation"}
          </button>
        </form>

        <p className="docs-login-foot">
          {showDevHint ? (
            <>
              Local dev passcode: <code>{getDocsPasscodeForDevHint()}</code> (or{" "}
              <code>VITE_DOCS_PASSCODE</code>)
            </>
          ) : (
            "Contact your pilot lead if you need access."
          )}
        </p>

        <ul className="docs-login-trust">
          <li>Not indexed — share link + passcode with stakeholders only</li>
          <li>Pair with Vercel Deployment Protection or GitHub Pages private repo</li>
          <li>Session expires after 12 hours</li>
        </ul>
      </div>
    </div>
  );
}
