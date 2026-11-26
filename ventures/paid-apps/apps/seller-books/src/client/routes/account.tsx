// Account pages reached from email links or the sign-in form:
// /forgot-password, /reset-password?token=, /verify-email?token=.
// Each calls Better Auth's endpoints under /api/auth (services/auth/auth.ts on the worker).
// Ported from apps/payapps (src/client/pages/account.tsx).
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { LegalFooter } from "./legal";

export const MIN_PASSWORD_LENGTH = 10;

const readToken = () =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("token") ?? "");

/**
 * Where to go after the emailed confirmation link: the page that sent the user to sign up (an
 * invitation link, say), saved in this browser before sign-up. Same-origin paths only.
 */
const NEXT_KEY = "seller-books.after-verify";

export function rememberNext(next: string | null) {
  try {
    if (next?.startsWith("/") && !next.startsWith("//")) sessionStorage.setItem(NEXT_KEY, next);
    else sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Storage blocked: the user lands on their shops instead.
  }
}

function takeNext(): string {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    if (next?.startsWith("/") && !next.startsWith("//")) return next;
  } catch {
    // ignore
  }
  return "/orgs";
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <p className="mb-6 text-lg font-semibold text-brand-700">Seller Books</p>
      <div className="card space-y-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
      <LegalFooter />
    </div>
  );
}

function Alert({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={tone === "error" ? "text-sm text-red-700" : "text-sm text-emerald-800"}
    >
      {children}
    </p>
  );
}

const BackToSignIn = () => (
  <Link to="/login" className="text-sm text-stone-600 underline">
    Back to sign in
  </Link>
);

const tooMany = (e: unknown) => e instanceof ApiError && e.status === 429;
const offline = "We couldn't reach the server. Check your connection and try again.";

/** Ask for a fresh verification link. The server answers the same whether or not the email exists. */
export function ResendVerification({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "sent") {
    return (
      <Alert tone="ok">
        If that address has an unconfirmed account, a new link is on its way. Check your inbox and
        spam folder.
      </Alert>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("pending");
    try {
      await api("/api/auth/send-verification-email", {
        method: "POST",
        body: { email: email.trim() },
      });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(tooMany(err) ? "Too many requests. Wait a few minutes and try again." : offline);
    }
  };
  return (
    <form className="space-y-2" onSubmit={submit}>
      <input
        className="input"
        type="email"
        placeholder="Email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {error && <Alert tone="error">{error}</Alert>}
      <button className="btn-secondary w-full" type="submit" disabled={state === "pending"}>
        Send a new confirmation link
      </button>
    </form>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("pending");
    try {
      await api("/api/auth/request-password-reset", {
        method: "POST",
        body: { email: email.trim() },
      });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(tooMany(err) ? "Too many requests. Wait a few minutes and try again." : offline);
    }
  };
  return (
    <Card title="Reset your password">
      {state === "sent" ? (
        <Alert tone="ok">
          If {email.trim()} has an account, we've sent a link to choose a new password. It works
          once and expires in 1 hour.
        </Alert>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <p className="text-sm text-stone-600">
            Enter your account's email and we'll send a link to choose a new password.
          </p>
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <Alert tone="error">{error}</Alert>}
          <button
            className="btn w-full justify-center"
            type="submit"
            disabled={state === "pending"}
          >
            Send reset link
          </button>
        </form>
      )}
      <BackToSignIn />
    </Card>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(readToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Card title="Reset link incomplete">
        <Alert tone="error">This link is missing its token. Request a new one.</Alert>
        <Link to="/forgot-password" className="btn w-full justify-center">
          Request a new link
        </Link>
      </Card>
    );
  }
  if (done) {
    return (
      <Card title="Password changed">
        <Alert tone="ok">Your password is changed and you're signed out everywhere.</Alert>
        <Link to="/login" className="btn w-full justify-center">
          Sign in
        </Link>
      </Card>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setPending(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: { newPassword: password, token },
      });
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(
        code.includes("INVALID_TOKEN")
          ? "This reset link has expired or was already used. Request a new one."
          : tooMany(err)
            ? "Too many attempts. Wait a minute and try again."
            : err instanceof ApiError
              ? err.message
              : offline,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Card title="Choose a new password">
      <form className="space-y-3" onSubmit={submit}>
        <input
          className="input"
          type="password"
          placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Repeat the new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error && <Alert tone="error">{error}</Alert>}
        <button className="btn w-full justify-center" type="submit" disabled={pending}>
          Change password
        </button>
      </form>
      <Link to="/forgot-password" className="text-sm text-stone-600 underline">
        Request a new link
      </Link>
    </Card>
  );
}

type VerifyState =
  | { kind: "verifying" }
  | { kind: "verified" }
  | { kind: "error"; message: string };

function verifyErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return offline;
  if (e.code === "TOKEN_EXPIRED") return "This link has expired. Request a new one below.";
  if (e.code === "USER_NOT_FOUND") return "We couldn't find an account for this link.";
  return "This link isn't valid. It may have been copied incompletely: request a new one below.";
}

export function VerifyEmailPage() {
  const qc = useQueryClient();
  const [token] = useState(readToken);
  const [next] = useState(takeNext);
  const [state, setState] = useState<VerifyState>(() =>
    token ? { kind: "verifying" } : { kind: "error", message: "This link is missing its token." },
  );
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return; // StrictMode runs effects twice; verify once.
    started.current = true;
    void (async () => {
      try {
        // No callbackURL, so Better Auth answers JSON and signs the user in.
        await api(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        await qc.invalidateQueries({ queryKey: ["me"] });
        setState({ kind: "verified" });
      } catch (e) {
        setState({ kind: "error", message: verifyErrorMessage(e) });
      }
    })();
  }, [token, qc]);

  if (state.kind === "verifying") return <Card title="Confirming your email">Confirming…</Card>;
  if (state.kind === "verified") {
    return (
      <Card title="Email confirmed">
        <Alert tone="ok">Thanks, your email address is confirmed and you're signed in.</Alert>
        <a href={next} className="btn w-full justify-center">
          Continue
        </a>
      </Card>
    );
  }
  return (
    <Card title="We couldn't confirm your email">
      <Alert tone="error">{state.message}</Alert>
      <ResendVerification />
      <BackToSignIn />
    </Card>
  );
}
