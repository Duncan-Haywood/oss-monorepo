// OWNER: shell agent — email/password + Google sign-in.
import { useTurnstile } from "@client/components/auth/turnstile";
import { HrefLink, loginHref } from "@client/components/layout/href-link";
import { Alert, Button, Divider, Field, Input } from "@client/components/ui";
import { authClient, readNextParam } from "@client/lib/auth-client";
import { refreshMe, useMe } from "@client/lib/session";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  AuthCard,
  afterAuthTarget,
  friendlyAuthError,
  GoogleButton,
  PasswordInput,
} from "./auth-shared";
import { ResendVerificationButton } from "./verify-email";

export function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const next = React.useMemo(() => readNextParam(), []);
  const oauthError = React.useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("error"),
    [],
  );
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    oauthError ? "Google sign-in didn't complete. Please try again or use your email." : null,
  );
  const [pending, setPending] = React.useState(false);
  const [unverified, setUnverified] = React.useState(false);
  const turnstile = useTurnstile("login");

  // Already signed in (e.g. returning from Google): continue into the app.
  React.useEffect(() => {
    if (me.data) void navigate({ ...afterAuthTarget(me.data, next), replace: true });
  }, [me.data, next, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setPending(true);
    try {
      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
        ...(await turnstile.authOptions()),
      });
      if (res?.error) {
        setUnverified(res.error.code === "EMAIL_NOT_VERIFIED");
        setError(friendlyAuthError(res.error, "signin"));
        return;
      }
      const fresh = await refreshMe();
      await navigate({ ...afterAuthTarget(fresh, next), replace: true });
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
      turnstile.reset(); // tokens are single-use
    }
  };

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to manage your grant pipeline."
      footer={
        <>
          New to Grant Autopilot?{" "}
          <HrefLink
            href={loginHref(next ?? undefined, "/signup")}
            className="font-medium text-brand-700 hover:underline"
          >
            Create an account
          </HrefLink>
        </>
      }
    >
      {error && (
        <div className="mb-4">
          <Alert
            tone="danger"
            action={unverified ? <ResendVerificationButton email={email} /> : undefined}
          >
            {error}
          </Alert>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="-mt-2 text-right">
          <HrefLink
            href="/forgot-password"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Forgot password?
          </HrefLink>
        </div>
        {turnstile.widget}
        <Button type="submit" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>
      <Divider label="or" className="my-5" />
      <GoogleButton callbackPath={loginHref(next ?? undefined)} onError={setError} />
    </AuthCard>
  );
}
