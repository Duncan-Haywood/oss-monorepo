// OWNER: onboarding+settings agent — /onboarding wizard (resumable via ?step=N&orgId=…).
import { Button, buttonClass, Card, ErrorMessage, Spinner } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { refreshMe, useMe } from "@client/lib/session";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { AutopilotStep } from "./autopilot-step";
import { DocumentsStep } from "./documents-step";
import { InterviewStep } from "./interview-step";
import { OrganizationStep } from "./organization-step";
import { ProjectsStep } from "./projects-step";

export const STEPS = [
  {
    title: "Your organization",
    short: "Organization",
    intro: "A few basics so we can find grants you're eligible for.",
  },
  {
    title: "Your documents",
    short: "Documents",
    intro: "Upload what you already have. Everything we write is grounded in these.",
  },
  {
    title: "A short interview",
    short: "Interview",
    intro: "Tell your story in your own words — by typing or speaking.",
  },
  {
    title: "Projects you have in mind",
    short: "Projects",
    intro: "What would you do with more funding?",
  },
  {
    title: "How much review you want",
    short: "Review",
    intro: "You decide what gets a person's eyes before it's sent. Start cautious.",
  },
] as const;

/** Parse ?step= into 1..5; steps after 1 require an orgId. */
export function resolveStep(rawStep: unknown, orgId: string | undefined): number {
  const n = typeof rawStep === "number" ? rawStep : Number.parseInt(String(rawStep ?? ""), 10);
  const step = Number.isFinite(n) ? Math.min(STEPS.length, Math.max(1, Math.trunc(n))) : 1;
  return orgId ? Math.max(step, 1) : 1;
}

export function Stepper({
  current,
  canVisit,
  onVisit,
}: {
  current: number;
  canVisit: (step: number) => boolean;
  onVisit: (step: number) => void;
}) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          const clickable = !active && canVisit(n);
          const content = (
            <>
              <span className="sr-only">
                Step {n}: {s.title}
                {done ? " (done)" : active ? " (current)" : ""}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                  done && "border-brand-600 bg-brand-600 text-white",
                  active && "border-brand-600 bg-white text-brand-700",
                  !done && !active && "border-neutral-300 bg-white text-neutral-500",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : n}
              </span>
              <span
                aria-hidden
                className={cn(
                  "hidden text-sm font-medium md:inline",
                  active ? "text-neutral-900" : "text-neutral-500",
                )}
              >
                {s.short}
              </span>
            </>
          );
          return (
            <li key={s.short} className="flex flex-1 items-center gap-2 sm:gap-3 last:flex-none">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onVisit(n)}
                  className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {content}
                </button>
              ) : (
                <span
                  className="flex items-center gap-2"
                  aria-current={active ? "step" : undefined}
                >
                  {content}
                </span>
              )}
              {n < STEPS.length && (
                <span
                  aria-hidden
                  className={cn("h-0.5 flex-1 rounded", done ? "bg-brand-600" : "bg-neutral-200")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function OnboardingPage() {
  const search = useSearch({ strict: false }) as { step?: unknown; orgId?: unknown };
  const navigate = useNavigate();
  const orgId = typeof search.orgId === "string" && search.orgId ? search.orgId : undefined;
  const step = resolveStep(search.step, orgId);
  const [finishing, setFinishing] = useState(false);

  const me = useMe();

  const go = (nextStep: number, nextOrgId = orgId) =>
    navigate({
      to: "/onboarding",
      search: { step: nextStep, ...(nextOrgId ? { orgId: nextOrgId } : {}) },
    });

  const finish = async () => {
    if (!orgId) return;
    setFinishing(true);
    // Best effort: mark onboarding complete so the dashboard stops nudging.
    await api(orgApi(orgId, "/profile"), {
      method: "PATCH",
      body: { onboardingCompleted: true },
    }).catch(() => undefined);
    await navigate({ to: "/orgs/$orgId", params: { orgId } });
  };

  if (me.isPending) return <Spinner label="Getting things ready" />;
  if (me.isError) return <ErrorMessage error={me.error} />;
  if (me.data === null) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Create your account first</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Setting up your organization takes about 10 minutes. Start by creating an account or
          signing in.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/signup" className={buttonClass()}>
            Create account
          </Link>
          <Link to="/login" className={buttonClass({ variant: "secondary" })}>
            Sign in
          </Link>
        </div>
      </Card>
    );
  }

  const meta = STEPS[step - 1] ?? STEPS[0];
  const firstName = me.data.user.name?.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2 text-center">
        <p className="text-sm font-medium text-brand-700">
          Step {step} of {STEPS.length}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          {step === 1 && firstName ? `Welcome, ${firstName}. ` : ""}
          {meta.title}
        </h1>
        <p className="text-neutral-600">{meta.intro}</p>
      </header>

      <Stepper current={step} canVisit={(n) => Boolean(orgId) && n > 1} onVisit={(n) => go(n)} />

      <Card className="p-6 sm:p-8">
        {step === 1 && !orgId && (
          <OrganizationStep
            onCreated={async (id) => {
              // The app shell reads memberships from /api/me; refresh so the new org is known.
              await refreshMe().catch(() => undefined);
              await go(2, id);
            }}
          />
        )}
        {step === 1 && orgId && (
          <div className="space-y-4 text-center">
            <p className="text-neutral-700">Your organization is set up.</p>
            <p className="text-sm text-neutral-500">
              You can change these details any time in Settings.
            </p>
            <Button onClick={() => go(2)}>Continue</Button>
          </div>
        )}
        {step === 2 && orgId && (
          <DocumentsStep orgId={orgId} onNext={() => go(3)} onBack={() => go(1)} />
        )}
        {step === 3 && orgId && (
          <InterviewStep orgId={orgId} onNext={() => go(4)} onBack={() => go(2)} />
        )}
        {step === 4 && orgId && (
          <ProjectsStep orgId={orgId} onNext={() => go(5)} onBack={() => go(3)} />
        )}
        {step === 5 && orgId && (
          <AutopilotStep
            orgId={orgId}
            onFinish={finish}
            onBack={() => go(4)}
            finishing={finishing}
          />
        )}
      </Card>

      {orgId && step < STEPS.length && (
        <p className="text-center text-sm text-neutral-500">
          Need a break? Everything you've entered so far is saved.{" "}
          <Link to="/orgs/$orgId" params={{ orgId }} className="text-brand-700 underline">
            Go to your dashboard
          </Link>
        </p>
      )}
    </div>
  );
}
