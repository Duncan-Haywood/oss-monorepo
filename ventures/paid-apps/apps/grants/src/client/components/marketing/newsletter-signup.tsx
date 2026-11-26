// "Get new grant guides by email": the newsletter signup form shown on /resources and at the end of
// each guide. Double opt-in: the API always answers with the same message and emails a confirmation
// link (docs/EMAIL_MARKETING.md). The consent wording is versioned in @shared/newsletter.
import { Alert, Button, Input, Label } from "@client/components/ui";
import { ApiError, api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import {
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_CONSENT_VERSION,
  type NewsletterSubscribeRequest,
  type NewsletterSubscribeResponse,
} from "@shared/newsletter";
import { Mail } from "lucide-react";
import * as React from "react";
import { PolicyLink } from "./site-link";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string; field?: boolean };

function errorMessage(e: unknown): { message: string; field?: boolean } {
  if (e instanceof ApiError) {
    if (e.status === 429) return { message: e.message };
    if (e.code === "validation_error") {
      return {
        message: "Enter a valid email address, like you@yourorganization.org.",
        field: true,
      };
    }
  }
  return { message: "We couldn't sign you up just now. Please try again in a minute." };
}

export function NewsletterSignup({
  source,
  headingId,
  className,
}: {
  /** Path of the page the form is on, recorded with the consent. */
  source: string;
  headingId: string;
  className?: string;
}) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const honeypot = React.useRef<HTMLInputElement>(null);
  const inputId = `${headingId}-email`;
  const errorId = `${inputId}-error`;
  const consentId = `${headingId}-consent`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    const body: NewsletterSubscribeRequest = {
      email: email.trim(),
      source,
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      website: honeypot.current?.value ?? "",
    };
    try {
      const res = await api<NewsletterSubscribeResponse>("/api/newsletter/subscribe", {
        method: "POST",
        body: { ...body },
      });
      setState({ kind: "done", message: res.message });
    } catch (err) {
      setState({ kind: "error", ...errorMessage(err) });
    }
  }

  const fieldError = state.kind === "error" && state.field;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white p-6 shadow-card sm:p-8",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 hidden rounded-lg bg-brand-50 p-2 text-brand-700 sm:inline-flex">
          <Mail className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-xl font-semibold tracking-tight text-neutral-900">
            Get new grant guides by email
          </h2>
          <p className="mt-2 max-w-2xl text-neutral-700">
            Plain-language guides for small teams, from registration to reporting after the award.
          </p>

          {state.kind === "done" ? (
            <div className="mt-5" aria-live="polite">
              <Alert tone="success">{state.message}</Alert>
            </div>
          ) : (
            <form className="mt-5" onSubmit={onSubmit} noValidate>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={inputId}>Email address</Label>
                  <Input
                    id={inputId}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={fieldError || undefined}
                    aria-describedby={fieldError ? `${consentId} ${errorId}` : consentId}
                    placeholder="you@yourorganization.org"
                  />
                </div>
                <Button type="submit" disabled={state.kind === "sending" || !email.trim()}>
                  {state.kind === "sending" ? "Signing up…" : "Subscribe"}
                </Button>
              </div>
              {/* Honeypot for bots: off-screen, not focusable, ignored by assistive tech. */}
              <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input
                    ref={honeypot}
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </label>
              </div>
              <p id={consentId} className="mt-3 text-sm text-neutral-600">
                {NEWSLETTER_CONSENT_TEXT} See our{" "}
                <PolicyLink doc="privacy">Privacy Policy</PolicyLink>.
              </p>
              <div aria-live="polite" className="mt-3 empty:hidden">
                {state.kind === "error" && (
                  <p id={errorId} className="text-sm text-danger-700" role="alert">
                    {state.message}
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
