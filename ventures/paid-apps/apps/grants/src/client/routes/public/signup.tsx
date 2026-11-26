// OWNER: shell agent — account creation. Terms / Privacy / Data Use acceptance is required.
import { useTurnstile } from "@client/components/auth/turnstile";
import { HrefLink, loginHref } from "@client/components/layout/href-link";
import { Alert, Button, Checkbox, Divider, Field, Input } from "@client/components/ui";
import { authClient, readNextParam } from "@client/lib/auth-client";
import { refreshMe } from "@client/lib/session";
import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { AuthCard, friendlyAuthError, GoogleButton, PasswordInput } from "./auth-shared";
import { ResendVerificationButton } from "./verify-email";

export const MIN_PASSWORD_LENGTH = 10;

type Errors = Partial<Record<"name" | "email" | "password" | "terms", string>>;

export function SignupPage() {
  const navigate = useNavigate();
  const next = React.useMemo(() => readNextParam(), []);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  /** Set when sign-up returned no session (email verification is on): the address we emailed. */
  const [checkInbox, setCheckInbox] = React.useState<string | null>(null);
  const turnstile = useTurnstile("signup");

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Please enter a valid email.";
    if (password.length < MIN_PASSWORD_LENGTH)
      e.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (!agreed) e.terms = "You need to agree to the Terms, Privacy Policy and Data Use Policy.";
    return e;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    try {
      const res = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        ...(await turnstile.authOptions()),
      });
      if (res?.error) {
        setFormError(friendlyAuthError(res.error, "signup"));
        return;
      }
      // No session token = email verification is required: the user must click the emailed link
      // first (Better Auth signs them in then), so there is nowhere to navigate to yet.
      if (!res?.data?.token) {
        setCheckInbox(email.trim());
        return;
      }
      await refreshMe().catch(() => null);
      await navigate({ href: next ?? "/onboarding" });
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
      turnstile.reset(); // tokens are single-use
    }
  };

  if (checkInbox) {
    return (
      <AuthCard
        title="Check your inbox"
        description="One more step: confirm your email address to finish creating your account."
        footer={
          <>
            Already confirmed?{" "}
            <HrefLink
              href={loginHref(next ?? undefined)}
              className="font-medium text-brand-700 hover:underline"
            >
              Sign in
            </HrefLink>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-neutral-700">
            We sent a confirmation link to{" "}
            <strong className="break-all font-medium text-neutral-900">{checkInbox}</strong>. Open
            it to continue. If it hasn't arrived in a few minutes, check your spam folder or send it
            again.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ResendVerificationButton email={checkInbox} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCheckInbox(null);
                setPassword("");
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start finding and drafting grants grounded in your own records."
      footer={
        <>
          Already have an account?{" "}
          <HrefLink
            href={loginHref(next ?? undefined)}
            className="font-medium text-brand-700 hover:underline"
          >
            Sign in
          </HrefLink>
        </>
      }
    >
      {formError && (
        <div className="mb-4">
          <Alert tone="danger">{formError}</Alert>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Your name" htmlFor="signup-name" error={errors.name}>
          <Input
            id="signup-name"
            autoComplete="name"
            value={name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "signup-name-error" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Work email" htmlFor="signup-email" error={errors.email}>
          <Input
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "signup-email-error" : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="signup-password"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "signup-password-error" : "signup-password-hint"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="signup-terms"
              className="mt-0.5"
              checked={agreed}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? "signup-terms-error" : undefined}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <label htmlFor="signup-terms" className="text-sm leading-relaxed text-neutral-700">
              I agree to the{" "}
              <Link
                to="/legal/$doc"
                params={{ doc: "terms" }}
                target="_blank"
                className="font-medium text-brand-700 underline"
              >
                Terms
              </Link>
              ,{" "}
              <Link
                to="/legal/$doc"
                params={{ doc: "privacy" }}
                target="_blank"
                className="font-medium text-brand-700 underline"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                to="/legal/$doc"
                params={{ doc: "data-use" }}
                target="_blank"
                className="font-medium text-brand-700 underline"
              >
                Data Use Policy
              </Link>
              .
            </label>
          </div>
          {errors.terms && (
            <p id="signup-terms-error" role="alert" className="mt-1.5 text-sm text-danger-700">
              {errors.terms}
            </p>
          )}
        </div>
        {turnstile.widget}
        <Button type="submit" className="w-full" loading={pending}>
          Create account
        </Button>
      </form>
      <Divider label="or" className="my-5" />
      <GoogleButton
        callbackPath={next ? loginHref(next) : "/onboarding"}
        onError={(m) => setFormError(m)}
      />
      <p className="mt-3 text-center text-xs text-neutral-500">
        By continuing with Google you also agree to the policies above.
      </p>
    </AuthCard>
  );
}
