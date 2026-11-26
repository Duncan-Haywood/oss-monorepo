// /forgot-password — request a reset link (Better Auth POST /api/auth/request-password-reset). The email
// links to /reset-password?token=…. The answer never reveals whether an account exists.
import { useTurnstile } from "@client/components/auth/turnstile";
import { HrefLink } from "@client/components/layout/href-link";
import { Alert, Button, Field, Input } from "@client/components/ui";
import { authClient } from "@client/lib/auth-client";
import * as React from "react";
import { AuthCard } from "./auth-shared";

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("email") ?? ""),
  );
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const turnstile = useTurnstile("forgot-password");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email.");
      return;
    }
    setPending(true);
    try {
      const res = await authClient.requestPasswordReset({
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
      setSent(true);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
      turnstile.reset(); // tokens are single-use
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you sign in with and we'll send you a link to choose a new password."
      footer={
        <HrefLink href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </HrefLink>
      }
    >
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {email.trim()}, we've sent a reset link. It works once and
          expires in 1 hour.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {turnstile.widget}
          <Button type="submit" className="w-full" loading={pending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
