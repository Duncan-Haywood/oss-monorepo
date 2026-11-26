// Shared pieces for the sign-in / sign-up / invite pages.

import { Button, Input } from "@client/components/ui";
import { authClient } from "@client/lib/auth-client";
import { appPath } from "@client/lib/base-path";
import type { Me } from "@client/lib/session";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center bg-gradient-to-b from-brand-50/70 to-neutral-50 px-4 py-12 sm:py-16">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-neutral-500">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-neutral-600">{footer}</div>}
      </div>
    </div>
  );
}

export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-neutral-400 hover:text-neutral-700"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

/** "Continue with Google". Reports a friendly error if Google sign-in isn't configured. */
export function GoogleButton({
  callbackPath,
  onError,
}: {
  callbackPath: string;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          const res = await authClient.signIn.social({
            provider: "google",
            // Better Auth redirects to these as given: browser paths, so with the base path.
            callbackURL: appPath(callbackPath),
            errorCallbackURL: appPath("/login?error=oauth"),
          });
          if (res?.error) {
            onError(
              res.error.status === 404 || /provider/i.test(res.error.message ?? "")
                ? "Google sign-in isn't available yet. Please use your email and password."
                : (res.error.message ?? "Google sign-in failed. Please try again."),
            );
            setPending(false);
          }
          // On success the browser is redirected to Google.
        } catch {
          onError("Google sign-in isn't available right now. Please use your email and password.");
          setPending(false);
        }
      }}
    >
      {!pending && <GoogleIcon />}
      Continue with Google
    </Button>
  );
}

type AuthError = { status?: number; code?: string; message?: string } | null | undefined;

export function friendlyAuthError(err: AuthError, mode: "signin" | "signup"): string {
  const code = err?.code ?? "";
  if (err?.status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (code.includes("EMAIL_NOT_VERIFIED"))
    return "Please verify your email address first — check your inbox for a link.";
  if (mode === "signup" && (code.includes("ALREADY_EXISTS") || err?.status === 422))
    return "An account with this email already exists. Try signing in instead.";
  if (mode === "signup" && code.includes("PASSWORD_TOO_SHORT"))
    return "Please choose a password with at least 10 characters.";
  if (mode === "signin" && (err?.status === 401 || code.includes("INVALID")))
    return "That email and password don't match our records.";
  return err?.message || "Something went wrong. Please try again.";
}

/** Where to go after authenticating: a validated `next`, else the first org, else onboarding. */
export function afterAuthTarget(me: Me | null, next: string | null): { href: string } {
  if (next) return { href: next };
  const first = me?.memberships[0];
  if (first) return { href: `/orgs/${encodeURIComponent(first.orgId)}` };
  return { href: "/onboarding" };
}
