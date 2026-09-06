import { useState, type FormEvent } from "react";
import { createSession, getDemoPasscode, verifyPasscode } from "../auth/demoAuth";

export function LoginGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [role, setRole] = useState<"operator" | "owner">("owner");
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [verifying, setVerifying] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    verifyPasscode(passcode).then((valid) => {
      setVerifying(false);
      if (!valid) {
        setError("Invalid demo passcode. Contact your pilot lead for access.");
        return;
      }
      createSession(role);
      onAuthenticated();
    });
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <p className="login-eyebrow">Retail Pilot Intel</p>
        <h1>Store portal</h1>
        <p className="login-lead">
          Sales demo for micro-format retail: conversion, SKU margin, and experiment
          loops on illustrative Milano boutique data — privacy-first, edge-aggregated.
          Session stays in this browser only.
        </p>
        <ul className="login-value-points">
          <li>
            <strong>Profit per visitor</strong> — door + POS join, not footfall alone
          </li>
          <li>
            <strong>€18k–€48k</strong> indicative annual upside at pilot assumptions
          </li>
          <li>
            <strong>4–8 week</strong> payback on conversion + inventory actions
          </li>
          <li>
            <strong>Presenter guide</strong> — talking points on every page
          </li>
          <li>
            <strong>GDPR-first</strong> — no cloud video, aggregates only
          </li>
        </ul>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Demo passcode</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
            />
          </label>

          <fieldset className="role-fieldset">
            <legend>View as</legend>
            <label>
              <input
                type="radio"
                name="role"
                checked={role === "operator"}
                onChange={() => setRole("operator")}
              />
              Operator (daily ops)
            </label>
            <label>
              <input
                type="radio"
                name="role"
                checked={role === "owner"}
                onChange={() => setRole("owner")}
              />
              Owner (revenue & ROI story)
            </label>
          </fieldset>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={verifying}>
            {verifying ? "Verifying…" : "Enter portal"}
          </button>
        </form>

        {import.meta.env.DEV && (
          <p className="login-foot">
            <button
              type="button"
              className="link-btn"
              onClick={() => setShowHint((v) => !v)}
            >
              {showHint ? "Hide" : "Show"} demo hint
            </button>
            {showHint ? (
              <span className="demo-hint">
                {" "}
                Passcode for this build: <code>{getDemoPasscode()}</code>
              </span>
            ) : null}
          </p>
        )}

        <ul className="login-trust">
          <li>Edge-first · aggregates only</li>
          <li>Illustrative metrics · not live POS</li>
          <li>Session expires after 8 hours</li>
          <li>
            Free to use ·{" "}
            <a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">
              support optional
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
