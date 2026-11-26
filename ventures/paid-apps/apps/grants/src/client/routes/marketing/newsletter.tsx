// /newsletter/confirm?token=… and /unsubscribe?token=… — the pages the newsletter and team
// notification emails link to. Each asks for one click instead of acting on page load, so link
// scanners in mail filters can't confirm or unsubscribe on someone's behalf. The List-Unsubscribe
// header's one-click POST goes straight to the API and needs no page (RFC 8058).
import { HrefLink } from "@client/components/layout/href-link";
import { Alert, Button, buttonClass } from "@client/components/ui";
import { api } from "@client/lib/api";
import {
  type NewsletterActionResponse,
  NOTIFICATION_UNSUBSCRIBE_PREFIX,
  unsubscribeApiPath,
} from "@shared/newsletter";
import * as React from "react";
import { AuthCard } from "../public/auth-shared";

const readToken = () =>
  typeof window === "undefined"
    ? ""
    : (new URLSearchParams(window.location.search).get("token") ?? "").trim();

/** Page title + noindex while mounted (these pages carry personal tokens). */
function usePrivatePage(title: string) {
  React.useEffect(() => {
    const prevTitle = document.title;
    document.title = `${title} · Grant Autopilot`;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, [title]);
}

type Phase =
  | { kind: "ready" }
  | { kind: "working" }
  | { kind: "result"; status: NewsletterActionResponse["status"] }
  | { kind: "error" };

function useAction(path: string) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "ready" });
  const run = React.useCallback(async () => {
    setPhase({ kind: "working" });
    try {
      const res = await api<NewsletterActionResponse>(path, { method: "POST" });
      setPhase({ kind: "result", status: res.status });
    } catch {
      setPhase({ kind: "error" });
    }
  }, [path]);
  return { phase, run };
}

const backToGuides = (
  <HrefLink href="/resources" className="font-medium text-brand-700 hover:underline">
    Browse the grant guides
  </HrefLink>
);

const networkError = (
  <Alert tone="danger">We couldn't reach the server. Check your connection and try again.</Alert>
);

export function NewsletterConfirmPage() {
  usePrivatePage("Confirm your subscription");
  const token = React.useMemo(readToken, []);
  const { phase, run } = useAction(`/api/newsletter/confirm?token=${encodeURIComponent(token)}`);

  if (!token) {
    return (
      <AuthCard title="This link is incomplete" footer={backToGuides}>
        <Alert tone="danger">
          The confirmation link is missing its code. Open the link from the email again, or copy the
          whole address into your browser.
        </Alert>
      </AuthCard>
    );
  }
  if (phase.kind === "result" && phase.status === "confirmed") {
    return (
      <AuthCard
        title="You're subscribed"
        description="Thanks for confirming your email address."
        footer={backToGuides}
      >
        <p className="text-sm text-neutral-700">
          You'll get a short welcome series over the next two weeks, then an email when we publish a
          new guide. Every email has a link to unsubscribe.
        </p>
      </AuthCard>
    );
  }
  if (phase.kind === "result") {
    return (
      <AuthCard title="We couldn't confirm this link" footer={backToGuides}>
        <Alert tone="warning">
          {phase.status === "expired"
            ? "This confirmation link has expired. Sign up again from any guide page and we'll send a new one."
            : "This link isn't valid or has already been used. If you're not sure you're subscribed, sign up again from any guide page."}
        </Alert>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Confirm your subscription"
      description="One click to start getting grant guides by email."
      footer={backToGuides}
    >
      {phase.kind === "error" && <div className="mb-4">{networkError}</div>}
      <Button className="w-full" onClick={run} disabled={phase.kind === "working"}>
        {phase.kind === "working" ? "Confirming…" : "Confirm my subscription"}
      </Button>
    </AuthCard>
  );
}

export function UnsubscribePage() {
  usePrivatePage("Unsubscribe");
  const token = React.useMemo(readToken, []);
  const team = token.startsWith(NOTIFICATION_UNSUBSCRIBE_PREFIX);
  const { phase, run } = useAction(
    `${unsubscribeApiPath(token)}?token=${encodeURIComponent(token)}`,
  );
  const what = team ? "these team notification emails" : "grant guide emails";

  if (!token) {
    return (
      <AuthCard title="This link is incomplete" footer={backToGuides}>
        <Alert tone="danger">
          The unsubscribe link is missing its code. Open the link from the email again, or use the
          unsubscribe option in your email app.
        </Alert>
      </AuthCard>
    );
  }
  if (phase.kind === "result" && phase.status === "unsubscribed") {
    return (
      <AuthCard title="You're unsubscribed" footer={backToGuides}>
        <p className="text-sm text-neutral-700">
          {team
            ? "You won't get this kind of team notification at this address any more. If you're a member of the organization, you can turn it back on in your notification settings after signing in."
            : "You won't get any more grant guide emails from us. If you change your mind, you can sign up again from any guide page."}
        </p>
        {team && (
          <HrefLink
            href="/login"
            className={buttonClass({ variant: "secondary", className: "mt-5 w-full" })}
          >
            Sign in
          </HrefLink>
        )}
      </AuthCard>
    );
  }
  if (phase.kind === "result") {
    return (
      <AuthCard title="We couldn't use this link" footer={backToGuides}>
        <Alert tone="warning">
          This unsubscribe link isn't valid. It may have been copied incompletely. Try the link from
          the email again, or use the unsubscribe option in your email app.
        </Alert>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Unsubscribe"
      description={`Stop getting ${what} at this address.`}
      footer={backToGuides}
    >
      {phase.kind === "error" && <div className="mb-4">{networkError}</div>}
      <Button className="w-full" onClick={run} disabled={phase.kind === "working"}>
        {phase.kind === "working" ? "Unsubscribing…" : "Unsubscribe"}
      </Button>
    </AuthCard>
  );
}
