// Verifier flags for the current version: blockers (red) first, then warnings (amber), then info.
// Each flag links to its section/claim and can be resolved; missing-info flags can be answered in
// a gap-fill interview.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { Badge, Button, Field, Textarea, toast } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { FlagDto } from "@shared/api/types";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, MessagesSquare } from "lucide-react";
import * as React from "react";
import { FLAG_KIND_LABEL, openFlagCounts, sortFlags } from "./model";
import { useGapFillInterview, useResolveFlag } from "./queries";

/** Scroll to a section/claim anchor and move focus there (keyboard users land on the content). */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.scrollIntoView?.({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
  el.classList.add("ring-2", "ring-warning-300");
  setTimeout(() => el.classList.remove("ring-2", "ring-warning-300"), 2000);
}

/** Warnings/notes shown before "Show N more" (blockers are never hidden). */
const COLLAPSED_NON_BLOCKERS = 3;

const SEVERITY_STYLE = {
  blocker: {
    box: "border-danger-200 bg-danger-50/70",
    icon: AlertOctagon,
    iconClass: "text-danger-600",
    badge: "danger" as const,
    label: "Blocker",
  },
  warning: {
    box: "border-warning-200 bg-warning-50/70",
    icon: AlertTriangle,
    iconClass: "text-warning-600",
    badge: "warning" as const,
    label: "Warning",
  },
  info: {
    box: "border-neutral-200 bg-neutral-50",
    icon: Info,
    iconClass: "text-info-600",
    badge: "info" as const,
    label: "Note",
  },
};

export function FlagsPanel({
  flags,
  sectionTitles,
  orgId,
  applicationId,
  canResolve,
}: {
  flags: FlagDto[];
  sectionTitles: Map<string, string>;
  orgId: string;
  applicationId: string;
  canResolve: boolean;
}) {
  const sorted = sortFlags(flags);
  const open = sorted.filter((f) => f.status === "open");
  const closed = sorted.filter((f) => f.status !== "open");
  const counts = openFlagCounts(flags);
  const [showAll, setShowAll] = React.useState(false);
  // Blockers are always shown; long tails of warnings/notes collapse so the draft stays in view.
  const limit = counts.blockers + COLLAPSED_NON_BLOCKERS;
  const visible = showAll ? open : open.slice(0, limit);
  const hidden = open.length - visible.length;

  return (
    <section
      aria-labelledby="flags-heading"
      data-tour="app-flags"
      className="rounded-xl border border-neutral-200 bg-white shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
        <h2 id="flags-heading" className="text-base font-semibold tracking-tight text-neutral-900">
          Flags
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={counts.blockers > 0 ? "danger" : "neutral"}>
            {counts.blockers} blocker{counts.blockers === 1 ? "" : "s"}
          </Badge>
          <Badge tone={counts.warnings > 0 ? "warning" : "neutral"}>
            {counts.warnings} warning{counts.warnings === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        {open.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success-800">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> No open flags. Every claim checked out
            or was resolved.
          </p>
        ) : (
          <ul className="space-y-3" id="open-flags-list">
            {visible.map((f) => (
              <FlagItem
                key={f.id}
                flag={f}
                sectionTitle={f.sectionKey ? sectionTitles.get(f.sectionKey) : undefined}
                orgId={orgId}
                applicationId={applicationId}
                canResolve={canResolve}
              />
            ))}
          </ul>
        )}
        {(hidden > 0 || (showAll && open.length > limit)) && (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showAll}
            aria-controls="open-flags-list"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show fewer flags" : `Show ${hidden} more flag${hidden === 1 ? "" : "s"}`}
          </Button>
        )}
        {closed.length > 0 && (
          <details className="group rounded-lg border border-neutral-200 px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none font-medium text-neutral-700">
              Resolved ({closed.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {closed.map((f) => (
                <li key={f.id} className="text-neutral-600">
                  <span className="font-medium text-neutral-800">{FLAG_KIND_LABEL[f.kind]}:</span>{" "}
                  {f.message}
                  {f.resolution && (
                    <span className="block text-xs text-neutral-500">
                      Resolution: {f.resolution}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function FlagItem({
  flag,
  sectionTitle,
  orgId,
  applicationId,
  canResolve,
}: {
  flag: FlagDto;
  sectionTitle?: string;
  orgId: string;
  applicationId: string;
  canResolve: boolean;
}) {
  const style = SEVERITY_STYLE[flag.severity];
  const Icon = style.icon;
  const [resolving, setResolving] = React.useState(false);
  const [resolution, setResolution] = React.useState("");
  const resolve = useResolveFlag(orgId, applicationId);
  const interview = useGapFillInterview(orgId);
  const inputId = React.useId();
  const anchor = flag.claimId
    ? `claim-${flag.claimId}`
    : flag.sectionKey
      ? `section-${flag.sectionKey}`
      : null;

  return (
    <li
      className={cn("rounded-lg border p-3 text-sm", style.box)}
      data-severity={flag.severity}
      data-flag-id={flag.id}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={style.badge}>{style.label}</Badge>
            <span className="text-xs font-medium text-neutral-600">
              {FLAG_KIND_LABEL[flag.kind]}
            </span>
          </div>
          <p className="text-neutral-900">{flag.message}</p>
          {flag.suggestedQuestion && (
            <p className="text-xs text-neutral-600">
              <span className="font-medium">Question for your team: </span>
              {flag.suggestedQuestion}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            {anchor && (
              <a
                href={`#${anchor}`}
                onClick={(e) => {
                  e.preventDefault();
                  jumpTo(anchor);
                }}
                className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                {sectionTitle ? `Go to “${sectionTitle}”` : "Go to section"}
              </a>
            )}
            {canResolve && !resolving && (
              <Button size="xs" variant="secondary" onClick={() => setResolving(true)}>
                Resolve
              </Button>
            )}
            {canResolve && flag.kind === "missing_info" && (
              <Button
                size="xs"
                variant="outline"
                loading={interview.isPending}
                onClick={() => interview.mutate(applicationId)}
              >
                <MessagesSquare aria-hidden /> Answer in an interview
              </Button>
            )}
          </div>
          <ApiErrorAlert error={interview.error} title="Couldn't start the interview" />
          {resolving && (
            <form
              className="space-y-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                const text = resolution.trim();
                if (!text) return;
                resolve.mutate(
                  { flagId: flag.id, resolution: text },
                  {
                    onSuccess: () => {
                      toast.success("Flag resolved");
                      setResolving(false);
                      setResolution("");
                    },
                  },
                );
              }}
            >
              <Field label="How was this resolved?" htmlFor={inputId}>
                <Textarea
                  id={inputId}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  required
                  maxLength={5000}
                  placeholder="e.g. Checked against the 2025 annual report — the number is correct."
                  className="min-h-16 bg-white"
                />
              </Field>
              <ApiErrorAlert error={resolve.error} title="Couldn't resolve the flag" />
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  loading={resolve.isPending}
                  disabled={!resolution.trim()}
                >
                  Save resolution
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setResolving(false);
                    resolve.reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}
