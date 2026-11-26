// Account pages reached from email links or the sign-in form:
// /forgot-password, /reset-password?token=, /verify-email?token=.
// Each calls Better Auth's endpoints under /api/auth (services/auth/auth.ts on the worker).
// Ported from apps/payapps (src/client/pages/account.tsx) onto this app's UI kit.
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, Card, Field, Input } from "../components/ui";
import { ApiError, api, queryClient } from "../lib/api";

export const MIN_PASSWORD_LENGTH = 10;

const readToken = () =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("token") ?? "");

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto mt-16 flex max-w-md flex-col gap-4 px-4">
      <h1 className="text-center text-2xl font-semibold text-stone-900">Job Shop Quote</h1>
      {children}
    </main>
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
  <Link to="/sign-in" className="text-sm text-sky-800 underline">
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
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <Field label="Email">
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="secondary" type="submit" disabled={state === "pending"}>
        Send a new confirmation link
      </Button>
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
    <Centered>
      <Card title="Reset your password">
        {state === "sent" ? (
          <Alert tone="ok">
            If {email.trim()} has an account, we've sent a link to choose a new password. It works
            once and expires in 1 hour.
          </Alert>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <p className="text-sm text-stone-600">
              Enter your account's email and we'll send a link to choose a new password.
            </p>
            <Field label="Email">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" disabled={state === "pending"}>
              Send reset link
            </Button>
          </form>
        )}
      </Card>
      <p className="text-center">
        <BackToSignIn />
      </p>
    </Centered>
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
      <Centered>
        <Card title="Reset link incomplete">
          <Alert tone="error">This link is missing its token. Request a new one.</Alert>
          <p className="mt-3">
            <Link to="/forgot-password" className="text-sm text-sky-800 underline">
              Request a new link
            </Link>
          </p>
        </Card>
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <Card title="Password changed">
          <Alert tone="ok">Your password is changed and you're signed out everywhere.</Alert>
          <p className="mt-3">
            <Link to="/sign-in" className="text-sm text-sky-800 underline">
              Sign in
            </Link>
          </p>
        </Card>
      </Centered>
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
    <Centered>
      <Card title="Choose a new password">
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
            <Input
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Repeat the new password">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" disabled={pending}>
            Change password
          </Button>
        </form>
      </Card>
      <p className="text-center">
        <Link to="/forgot-password" className="text-sm text-sky-800 underline">
          Request a new link
        </Link>
      </p>
    </Centered>
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
  const [token] = useState(readToken);
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
        await queryClient.invalidateQueries({ queryKey: ["me"] });
        setState({ kind: "verified" });
      } catch (e) {
        setState({ kind: "error", message: verifyErrorMessage(e) });
      }
    })();
  }, [token]);

  if (state.kind === "verifying") {
    return (
      <Centered>
        <Card title="Confirming your email">
          <p className="text-sm">Confirming…</p>
        </Card>
      </Centered>
    );
  }
  if (state.kind === "verified") {
    return (
      <Centered>
        <Card title="Email confirmed">
          <Alert tone="ok">
            Thanks, your email address is confirmed and you're signed in. If you were invited to a
            shop, open the invitation link again to join it.
          </Alert>
          <p className="mt-3">
            <Link to="/" className="text-sm text-sky-800 underline">
              Continue
            </Link>
          </p>
        </Card>
      </Centered>
    );
  }
  return (
    <Centered>
      <Card title="We couldn't confirm your email">
        <div className="flex flex-col gap-3">
          <Alert tone="error">{state.message}</Alert>
          <ResendVerification />
        </div>
      </Card>
      <p className="text-center">
        <BackToSignIn />
      </p>
    </Centered>
  );
}
