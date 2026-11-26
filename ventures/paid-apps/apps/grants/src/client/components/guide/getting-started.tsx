// Getting-started checklist, computed from real org data (GET /guide): each step shows done / not
// done, why it matters, an estimated time and a deep link. Shown on the dashboard until complete or
// hidden; then it collapses into <GuideProgressPill> for the top bar. "Hidden" is the only stored
// state (per user + org, localStorage); progress itself always comes from the data.
import { cn } from "@client/lib/cn";
import { useMe } from "@client/lib/session";
import type { GuideDto, GuideStepDto } from "@shared/guide";
import { CheckCircle2, ChevronRight, Circle, Clock, ListChecks, Sparkles } from "lucide-react";
import * as React from "react";
import { HrefLink } from "../layout/href-link";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Skeleton,
} from "../ui";
import { useGuide } from "./queries";
import { guideKeys, useGuidePref } from "./storage";

export const stepHref = (orgId: string, step: Pick<GuideStepDto, "path">) =>
  `/orgs/${encodeURIComponent(orgId)}${step.path}`;

/** Whether the full checklist is hidden for this user in this org. */
export function useChecklistDismissed(orgId: string) {
  const me = useMe();
  const userId = me.data?.user.id;
  return useGuidePref(userId && orgId ? guideKeys.checklistDismissed(userId, orgId) : null);
}

/** Dashboard card. Renders nothing once every step is done or the user hid it. */
export function GettingStartedChecklist({
  orgId,
  className,
}: {
  orgId: string;
  className?: string;
}) {
  const guide = useGuide(orgId);
  const [dismissed, setDismissed] = useChecklistDismissed(orgId);
  if (guide.isPending) {
    return (
      <Card className={className} aria-busy="true">
        <CardBody className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardBody>
      </Card>
    );
  }
  if (guide.isError || !guide.data || guide.data.complete || dismissed) return null;
  return (
    <ChecklistCard
      orgId={orgId}
      guide={guide.data}
      onHide={() => setDismissed("1")}
      className={className}
    />
  );
}

export function ChecklistCard({
  orgId,
  guide,
  onHide,
  className,
}: {
  orgId: string;
  guide: GuideDto;
  onHide?: () => void;
  className?: string;
}) {
  const titleId = React.useId();
  const remainingMinutes = guide.steps.filter((s) => !s.done).reduce((m, s) => m + s.minutes, 0);
  return (
    <Card className={className}>
      <section aria-labelledby={titleId}>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>
              <span id={titleId}>Get to your first grounded draft</span>
            </CardTitle>
            <CardDescription>
              {guide.doneCount} of {guide.total} steps done
              {remainingMinutes > 0 && <> · about {remainingMinutes} minutes to go</>}. Ticks update
              by themselves as you work.
            </CardDescription>
          </div>
          {onHide && (
            <Button variant="ghost" size="sm" onClick={onHide}>
              Hide checklist
            </Button>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          <Progress
            value={guide.doneCount}
            max={guide.total}
            label={`Getting started: ${guide.doneCount} of ${guide.total} done`}
            size="sm"
          />
          <ol className="space-y-2">
            {guide.steps.map((step, i) => (
              <ChecklistStep
                key={step.key}
                orgId={orgId}
                step={step}
                number={i + 1}
                isNext={step.key === guide.nextStep}
              />
            ))}
          </ol>
        </CardBody>
      </section>
    </Card>
  );
}

function ChecklistStep({
  orgId,
  step,
  number,
  isNext,
}: {
  orgId: string;
  step: GuideStepDto;
  number: number;
  isNext: boolean;
}) {
  const Icon = step.done ? CheckCircle2 : Circle;
  return (
    <li
      aria-current={isNext ? "step" : undefined}
      data-step={step.key}
      className={cn(
        "flex gap-3 rounded-lg p-3",
        isNext ? "bg-brand-50 ring-1 ring-inset ring-brand-200" : step.done && "bg-subtle",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          step.done || isNext ? "text-brand-600" : "text-subtle",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium text-strong", step.done && "line-through")}>
          <span className="sr-only">
            Step {number}, {step.done ? "done" : "not done yet"}:{" "}
          </span>
          {step.title}
        </p>
        {!step.done && <CardDescription className="mt-0.5">{step.why}</CardDescription>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {!step.done && (
            <Badge tone="neutral">
              <Clock className="h-3 w-3" aria-hidden />
              About {step.minutes} min
            </Badge>
          )}
          {step.progress && !step.done && (
            <Badge tone="brand">
              {step.progress.current}/{step.progress.target}
            </Badge>
          )}
          {step.detail && <span className="text-muted">{step.detail}</span>}
        </div>
      </div>
      <HrefLink
        href={stepHref(orgId, step)}
        aria-label={`${step.done ? "Open" : step.cta}: ${step.title}`}
        className={buttonClass({
          variant: isNext ? "primary" : step.done ? "ghost" : "secondary",
          size: "sm",
          className: "self-center",
        })}
      >
        {step.done ? "Open" : step.cta}
        <ChevronRight aria-hidden />
      </HrefLink>
    </li>
  );
}

/**
 * Small top-bar pill: "Getting started 4/9" once the checklist is hidden (click to bring it back on
 * the dashboard), or "All set up" when complete (links to the help center). Hidden while the full
 * checklist is showing.
 */
export function GuideProgressPill({ orgId, className }: { orgId: string; className?: string }) {
  const guide = useGuide(orgId);
  const [dismissed, setDismissed] = useChecklistDismissed(orgId);
  const g = guide.data;
  if (!g || (!g.complete && !dismissed)) return null;
  const base = `/orgs/${encodeURIComponent(orgId)}`;
  if (g.complete) {
    return (
      <HrefLink
        href={`${base}/help`}
        className={buttonClass({ variant: "ghost", size: "xs", className })}
        aria-label="Setup complete. Open the help center"
      >
        <Sparkles aria-hidden />
        All set up
      </HrefLink>
    );
  }
  return (
    <HrefLink
      href={base}
      onClick={() => setDismissed(null)}
      className={buttonClass({
        variant: "secondary",
        size: "xs",
        className: cn("rounded-full", className),
      })}
      aria-label={`Getting started: ${g.doneCount} of ${g.total} steps done. Show the checklist`}
    >
      <ListChecks aria-hidden />
      Getting started
      <span className="tabular-nums">
        {g.doneCount}/{g.total}
      </span>
    </HrefLink>
  );
}

/**
 * For empty states: "Next step: <title>" with its deep link, from the live guide. Renders nothing
 * when the guide is complete, still loading, or when the next step is the page you're on (`except`).
 */
export function GuideNextStep({
  orgId,
  except,
  className,
}: {
  orgId: string;
  except?: GuideStepDto["key"] | readonly GuideStepDto["key"][];
  className?: string;
}) {
  const guide = useGuide(orgId);
  const g = guide.data;
  if (!g || g.complete) return null;
  const skip = new Set(except === undefined ? [] : Array.isArray(except) ? except : [except]);
  const next = g.steps.find((s) => !s.done && !skip.has(s.key));
  if (!next) return null;
  return (
    <p className={cn("text-sm", className)}>
      <span className="text-muted">Next step in your setup: </span>
      <HrefLink
        href={stepHref(orgId, next)}
        className={buttonClass({ variant: "link", size: "sm" })}
      >
        {next.title} (about {next.minutes} min)
      </HrefLink>
    </p>
  );
}
