// Step 5: automation level. A manual → full selector showing who does what at each stage. Each level
// stands for real settings (Settings → Autopilot & review, routes/org/settings/autopilot.tsx), and the
// routing preview uses the same client mirror of services/review/policy.ts the settings page uses.
import { Badge } from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { TIER_TONE } from "@client/routes/org/settings/autopilot-explainer";
import { TIER_LABELS } from "@client/routes/org/settings/routing-preview";
import { Bot, ShieldCheck, UserRound, Users } from "lucide-react";
import * as React from "react";
import { DEMO_ORG } from "../data";
import {
  AUTOMATION_LEVELS,
  type AutomationLevelId,
  type DraftState,
  type FactStatuses,
  levelById,
  routeDemoMatches,
  STAGES,
  type Who,
} from "../model";

const WHO: Record<Who, { label: string; tone: "brand" | "neutral" | "accent"; icon: typeof Bot }> =
  {
    autopilot: { label: "Grant Autopilot", tone: "brand", icon: Bot },
    team: { label: "Your team", tone: "neutral", icon: UserRound },
    both: { label: "Shared", tone: "accent", icon: Users },
  };

export const SAFETY_RAILS = [
  "Drafts may only state facts from your fact base. Anything else is flagged, never sent.",
  "Nothing goes out automatically unless every gate passes: small ask, strong fit, every sentence verified, no blockers and only confirmed facts.",
  "Grants you have a good chance of winning, and large asks, always get a full human review.",
  "A draft a person edited is never auto-submitted. A person approves it explicitly.",
  "A monthly cap on automatic submissions, an email each time, and every package saved exactly as sent.",
] as const;

const onOff = (v: boolean) => (v ? "On" : "Off");

export function AutomationStep({
  level: levelId,
  onLevelChange,
  draft,
  statuses,
}: {
  level: AutomationLevelId;
  onLevelChange: (level: AutomationLevelId) => void;
  draft: DraftState;
  statuses: FactStatuses;
}) {
  const name = React.useId();
  const level = levelById(levelId);
  const p = level.policy;
  const routes = routeDemoMatches(level, draft, statuses);
  const index = AUTOMATION_LEVELS.findIndex((l) => l.id === level.id);

  const settings: [string, string][] = [
    ["Allow automatic submissions", onOff(p.autopilotEnabled)],
    ["Auto-submit only up to", formatCents(p.autoSubmitMaxCents)],
    ["Full review above", formatCents(p.fullReviewAboveCents)],
    ["Minimum fit score for autopilot", String(p.minFitScoreForAuto)],
    ["“Good chance of winning” starts at", `${Math.round(p.highLikelihoodThreshold * 100)}%`],
    [
      "Always review the first application to a new funder",
      onOff(p.reviewFirstSubmissionPerFunder),
    ],
    ["Most automatic submissions per month", String(p.maxAutoSubmissionsPerMonth)],
    ["Start drafts for the top matches each day", String(p.autoDraftTopN)],
  ];

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-neutral-600">
        You decide how much Grant Autopilot does on its own. Autopilot is off by default, and the
        safety rails stay on at every level.
      </p>

      <fieldset>
        <legend className="text-sm font-semibold text-neutral-900">Automation level</legend>
        <div aria-hidden className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <span>Manual</span>
          <span className="relative h-1.5 flex-1 rounded-full bg-neutral-200">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand-500 transition-all"
              style={{ width: `${(index / (AUTOMATION_LEVELS.length - 1)) * 100}%` }}
            />
          </span>
          <span>Full</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AUTOMATION_LEVELS.map((l, i) => {
            const checked = l.id === level.id;
            return (
              <label
                key={l.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border bg-white p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  checked
                    ? "border-brand-500 ring-1 ring-brand-500"
                    : "border-neutral-200 hover:border-brand-300",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={l.id}
                  checked={checked}
                  onChange={() => onLevelChange(l.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-neutral-500">Level {i + 1}</span>
                  <span className="block font-medium text-neutral-900">{l.label}</span>
                  <span className="mt-1 block text-sm text-neutral-600">{l.summary}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="demo-who-title">
          <h3 id="demo-who-title" className="font-semibold text-neutral-900">
            Who does what: {level.label}
          </h3>
          <ol className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white shadow-card">
            {STAGES.map((s, i) => {
              const stage = level.stages[s.id];
              const who = WHO[stage.who];
              const Icon = who.icon;
              return (
                <li
                  key={s.id}
                  data-stage={s.id}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[11rem_8.5rem_minmax(0,1fr)] sm:items-start"
                >
                  <span className="text-sm font-medium text-neutral-900">
                    {i + 1}. {s.label}
                  </span>
                  <span>
                    <Badge tone={who.tone} className="gap-1">
                      <Icon className="h-3 w-3" aria-hidden />
                      {who.label}
                    </Badge>
                  </span>
                  <span className="text-sm text-neutral-600">{stage.text}</span>
                </li>
              );
            })}
          </ol>

          <h3 className="mt-6 font-semibold text-neutral-900">
            How {DEMO_ORG.shortName}'s matches would be routed
          </h3>
          <ul className="mt-3 space-y-2">
            {routes.map(({ opportunity: o, route }) => (
              <li
                key={o.id}
                data-opportunity={o.id}
                data-tier={route.tier}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-900">
                    {o.title}{" "}
                    <span className="font-normal text-neutral-500">
                      · asks {formatCents(o.askCents)}
                    </span>
                  </p>
                  <Badge tone={TIER_TONE[route.tier]}>{TIER_LABELS[route.tier]}</Badge>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-neutral-500">
                  {route.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            The Rural Trades draft uses its live state from step 4: open blockers keep it in full
            review.
          </p>
        </section>

        <div className="space-y-4">
          <section
            aria-labelledby="demo-settings-title"
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
          >
            <h3 id="demo-settings-title" className="font-semibold text-neutral-900">
              The settings behind this level
            </h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              {settings.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-neutral-600">{label}</dt>
                  <dd className="shrink-0 font-semibold tabular-nums text-neutral-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              In the app you set each of these yourself under Settings → Autopilot &amp; review.
            </p>
          </section>
          <section
            aria-labelledby="demo-rails-title"
            className="rounded-xl border border-success-200 bg-success-50/60 p-5"
          >
            <h3
              id="demo-rails-title"
              className="flex items-center gap-2 font-semibold text-success-900"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden /> Safety rails at every level
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-success-950">
              {SAFETY_RAILS.map((r) => (
                <li key={r} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success-600"
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
