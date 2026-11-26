// /reset-password?token=… — the link in the reset email. Calls Better Auth POST /api/auth/reset-password.
// The token is single-use and expires after 1 hour; a reset signs the user out everywhere.
import { HrefLink } from "@client/components/layout/href-link";
import { Alert, Button, buttonClass, Field } from "@client/components/ui";
import { authClient } from "@client/lib/auth-client";
import * as React from "react";
import { AuthCard, PasswordInput } from "./auth-shared";
import { MIN_PASSWORD_LENGTH } from "./signup";

const readToken = () =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("token") ?? "");

export function ResetPasswordPage() {
  const token = React.useMemo(readToken, []);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD_LENGTH)
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (confirm !== password) next.confirm = "The passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res?.error) {
        const code = res.error.code ?? "";
        setFormError(
          code.includes("INVALID_TOKEN")
            ? "This reset link has expired or was already used. Request a new one."
            : code.includes("PASSWORD_TOO_SHORT")
              ? `Please choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`
              : res.error.status === 429
                ? "Too many attempts. Please wait a minute and try again."
                : (res.error.message ?? "Something went wrong. Please try again."),
        );
        return;
      }
      setDone(true);
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title="Reset link incomplete">
        <Alert tone="danger">
          This link is missing its token. Open the link from your email again, or request a new one.
        </Alert>
        <HrefLink href="/forgot-password" className={buttonClass({ className: "mt-4 w-full" })}>
          Request a new link
        </HrefLink>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard
        title="Password updated"
        description="Your password was changed and you've been signed out on every device."
      >
        <HrefLink href="/login" className={buttonClass({ className: "w-full" })}>
          Sign in with your new password
        </HrefLink>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Choose a new password"
      footer={
        <HrefLink href="/forgot-password" className="font-medium text-brand-700 hover:underline">
          Request a new link
        </HrefLink>
      }
    >
      {formError && (
        <div className="mb-4">
          <Alert tone="danger">{formError}</Alert>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="New password"
          htmlFor="reset-password"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "reset-password-error" : "reset-password-hint"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-confirm" error={errors.confirm}>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={errors.confirm ? true : undefined}
            aria-describedby={errors.confirm ? "reset-confirm-error" : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" loading={pending}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
