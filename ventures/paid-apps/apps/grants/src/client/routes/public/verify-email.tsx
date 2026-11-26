// /verify-email?token=… — the link in the verification email. Calls Better Auth's
// GET /api/auth/verify-email?token= (no callbackURL → JSON); on success Better Auth also signs the
// user in (autoSignInAfterVerification), so we refresh /api/me and offer to continue.
import { useTurnstile } from "@client/components/auth/turnstile";
import { HrefLink } from "@client/components/layout/href-link";
import { Alert, Button, buttonClass, Field, Input, Spinner } from "@client/components/ui";
import { authClient } from "@client/lib/auth-client";
import { refreshMe } from "@client/lib/session";
import * as React from "react";
import { AuthCard, afterAuthTarget } from "./auth-shared";

type State =
  | { kind: "verifying" }
  | { kind: "verified"; href: string }
  | { kind: "error"; message: string };

const readToken = () =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("token") ?? "");

function verifyErrorMessage(code: string | undefined): string {
  if (code === "TOKEN_EXPIRED") return "This link has expired. Request a new one below.";
  if (code === "USER_NOT_FOUND") return "We couldn't find an account for this link.";
  return "This link isn't valid. It may have been copied incompletely — request a new one below.";
}

export function VerifyEmailPage() {
  const token = React.useMemo(readToken, []);
  const [state, setState] = React.useState<State>(() =>
    token ? { kind: "verifying" } : { kind: "error", message: "This link is missing its token." },
  );
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!token || started.current) return; // StrictMode runs effects twice; verify once.
    started.current = true;
    void (async () => {
      try {
        const res = await authClient.verifyEmail({ query: { token } });
        if (res?.error) {
          setState({ kind: "error", message: verifyErrorMessage(res.error.code) });
          return;
        }
        const me = await refreshMe().catch(() => null);
        setState({ kind: "verified", href: me ? afterAuthTarget(me, null).href : "/login" });
      } catch {
        setState({
          kind: "error",
          message: "We couldn't reach the server. Check your connection and reload this page.",
        });
      }
    })();
  }, [token]);

  if (state.kind === "verifying") {
    return (
      <AuthCard title="Confirming your email">
        <Spinner label="Confirming" />
      </AuthCard>
    );
  }
  if (state.kind === "verified") {
    return (
      <AuthCard title="Email confirmed" description="Thanks — your email address is verified.">
        <HrefLink href={state.href} className={buttonClass({ className: "w-full" })}>
          Continue
        </HrefLink>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="We couldn't confirm your email"
      footer={
        <HrefLink href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </HrefLink>
      }
    >
      <div className="mb-4">
        <Alert tone="danger">{state.message}</Alert>
      </div>
      <ResendVerificationForm />
    </AuthCard>
  );
}

/** Ask for a fresh verification link. The server answers the same whether or not the email exists. */
export function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = React.useState(initialEmail);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const turnstile = useTurnstile("resend-verification");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email.");
      return;
    }
    setPending(true);
    try {
      const res = await authClient.sendVerificationEmail({
        email: email.trim(),
        ...(await turnstile.authOptions()),
      });
      if (res?.error) {
        setError(
          res.error.status === 429
            ? "Too many requests. Please wait a few minutes and try again."
            : (res.error.message ?? "Something went wrong. Please try again."),
        );
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
      turnstile.reset();
    }
  };

  if (done) {
    return (
      <Alert tone="success">
        If that address has an unverified account, a new link is on its way. Check your inbox (and
        spam folder).
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" htmlFor="resend-email">
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {turnstile.widget}
      <Button type="submit" variant="secondary" className="w-full" loading={pending}>
        Send a new link
      </Button>
    </form>
  );
}

/** Inline "Resend email" for the sign-in page's "email not verified" error. */
export function ResendVerificationButton({ email }: { email: string }) {
  const [state, setState] = React.useState<"idle" | "pending" | "sent" | "failed">("idle");
  const turnstile = useTurnstile("resend-verification");
  if (state === "sent")
    return <span className="text-sm font-medium">Sent — check your inbox.</span>;
  const button = (
    <Button
      size="sm"
      variant="secondary"
      loading={state === "pending"}
      onClick={async () => {
        setState("pending");
        try {
          const res = await authClient.sendVerificationEmail({
            email: email.trim(),
            ...(await turnstile.authOptions()),
          });
          setState(res?.error ? "failed" : "sent");
        } catch {
          setState("failed");
        } finally {
          turnstile.reset();
        }
      }}
    >
      {state === "failed" ? "Try again" : "Resend email"}
    </Button>
  );
  if (!turnstile.widget) return button;
  return (
    <span className="inline-flex flex-col gap-2">
      {button}
      {turnstile.widget}
    </span>
  );
}
