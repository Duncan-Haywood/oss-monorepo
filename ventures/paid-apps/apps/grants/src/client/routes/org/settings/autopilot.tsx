// OWNER: onboarding+settings agent — automation level + review-routing policy (PATCH /settings),
// "what the AI will do" timeline, locked safety rails and the live routing preview.
import {
  AutomationPreview,
  automationPreviewKey,
} from "@client/components/automation/automation-preview";
import { AutomationTimeline } from "@client/components/automation/automation-timeline";
import { AutopilotConsentDialog } from "@client/components/automation/consent-dialog";
import { AutomationLevelSelector } from "@client/components/automation/level-selector";
import {
  type AutomationLevel,
  type AutomationSettings,
  applyLevel,
  autoDraftForLevel,
  checkpointPatch,
  customizedOverrides,
  LEVEL_META,
  levelRank,
  levelSubmitsOnItsOwn,
  lockedOverrides,
  needsConsent,
  type OverrideKey,
  readAutomation,
  stagePlan,
} from "@client/components/automation/levels";
import { SafetyRailsList } from "@client/components/automation/safety-rails";
import { HelpTip } from "@client/components/guide/help-tip";
import { TakeTourButton } from "@client/components/guide/tour";
import { AUTOMATION_TOUR } from "@client/components/guide/tours";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Field,
  Input,
  toast,
} from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import type { OrgSettingsDto } from "@shared/api/types";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { MoneyInput, SwitchField, TagInput } from "./form-bits";
import { ReadOnlyNotice, SavedHint, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail, type SettingsPatch, useUpdateSettings } from "./use-org";

export function AutopilotSettingsPage() {
  return (
    <SettingsPage
      tab="autopilot"
      title="Autopilot & review"
      description="Choose how much Grant Autopilot does on its own, from fully manual to fully automatic."
      actions={<TakeTourButton tour={AUTOMATION_TOUR} />}
    >
      {({ orgId, org }) => <AutopilotForm orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

type PolicyForm = Pick<
  OrgSettingsDto,
  | "autoSubmitMaxCents"
  | "fullReviewAboveCents"
  | "minFitScoreForAuto"
  | "highLikelihoodThreshold"
  | "reviewFirstSubmissionPerFunder"
  | "maxAutoSubmissionsPerMonth"
  | "allowUnconfirmedFactsInDrafts"
  | "autoDraftTopN"
  | "notifyEmails"
> &
  AutomationSettings;

const pick = (s: OrgSettingsDto): PolicyForm => ({
  ...readAutomation(s),
  autoSubmitMaxCents: s.autoSubmitMaxCents,
  fullReviewAboveCents: s.fullReviewAboveCents,
  minFitScoreForAuto: s.minFitScoreForAuto,
  highLikelihoodThreshold: s.highLikelihoodThreshold,
  reviewFirstSubmissionPerFunder: s.reviewFirstSubmissionPerFunder,
  maxAutoSubmissionsPerMonth: s.maxAutoSubmissionsPerMonth,
  allowUnconfirmedFactsInDrafts: s.allowUnconfirmedFactsInDrafts,
  autoDraftTopN: s.autoDraftTopN,
  notifyEmails: s.notifyEmails ?? [],
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePolicy(f: PolicyForm): Partial<Record<keyof PolicyForm, string>> {
  const e: Partial<Record<keyof PolicyForm, string>> = {};
  if (f.autoSubmitMaxCents > f.fullReviewAboveCents) {
    e.autoSubmitMaxCents = "The auto-submit limit can't be higher than the full-review line.";
  }
  if (f.minFitScoreForAuto < 0 || f.minFitScoreForAuto > 100) {
    e.minFitScoreForAuto = "Enter a score between 0 and 100.";
  }
  if (f.highLikelihoodThreshold < 0 || f.highLikelihoodThreshold > 1) {
    e.highLikelihoodThreshold = "Enter a percentage between 0 and 100.";
  }
  if (f.maxAutoSubmissionsPerMonth < 0 || f.maxAutoSubmissionsPerMonth > 100)
    e.maxAutoSubmissionsPerMonth = "Enter 0 to 100.";
  if (f.autoDraftTopN < 0 || f.autoDraftTopN > 10) e.autoDraftTopN = "Enter 0 to 10.";
  if (f.twoPersonRuleAboveCents != null && f.twoPersonRuleAboveCents <= 0) {
    e.twoPersonRuleAboveCents = "Enter an amount above $0, or turn the rule off.";
  }
  const bad = f.notifyEmails.find((x) => !EMAIL_RE.test(x));
  if (bad) e.notifyEmails = `"${bad}" doesn't look like an email address.`;
  return e;
}

const toInt = (v: string, fallback: number) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/** The PATCH body: the form plus autopilotEnabled, which is what records (or revokes) consent. */
export function toPatch(f: PolicyForm) {
  return {
    ...f,
    ...checkpointPatch(f),
    autopilotEnabled: levelSubmitsOnItsOwn(f.automationLevel),
  };
}

const OVERRIDE_FIELDS: { key: OverrideKey; label: string; help: string }[] = [
  {
    key: "requireMatchApproval",
    label: "Approve matches before drafting",
    help: "The AI only drafts grants someone on your team has picked.",
  },
  {
    key: "requireFactConfirmation",
    label: "Confirm facts before drafts rely on them",
    help: "A person checks each new fact (like your budget or how many people you serve) once, before any draft uses it.",
  },
  {
    key: "requireDraftReview",
    label: "Review every draft in full",
    help: "A person reads every section of every draft. Turns off one-click approval.",
  },
  {
    key: "requireSubmissionApproval",
    label: "Approve every submission",
    help: "Nothing is sent until a person clicks approve, whatever the level.",
  },
  {
    key: "requireFollowupApproval",
    label: "Approve follow-ups",
    help: "Thank-you notes, report reminders and replies to funders wait for a person.",
  },
];

function PercentInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        className="pr-8"
        value={value}
        onChange={(e) => onChange(toInt(e.target.value, value))}
        disabled={disabled}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-neutral-500">
        %
      </span>
    </div>
  );
}

function AutopilotForm({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const canEdit = hasRole(org.role, "admin");
  const [form, setForm] = useState<PolicyForm>(() => pick(org.settings));
  const [saved, setSaved] = useState(false);
  const [pendingLevel, setPendingLevel] = useState<AutomationLevel | null>(null);
  const save = useUpdateSettings(orgId);
  const qc = useQueryClient();

  useEffect(() => {
    setForm(pick(org.settings));
  }, [org.settings]);

  const savedForm = pick(org.settings);
  const savedLevel = savedForm.automationLevel;

  const set = <K extends keyof PolicyForm>(k: K, v: PolicyForm[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const applyLevelToForm = (level: AutomationLevel) => {
    setSaved(false);
    setForm((f) => ({
      ...f,
      ...applyLevel(f, level),
      autoDraftTopN: autoDraftForLevel(level, f.autoDraftTopN),
    }));
  };
  const requestLevel = (level: AutomationLevel) => {
    if (!canEdit || level === form.automationLevel) return;
    // Raising into Supervised/Full beyond what's already saved needs consent first.
    if (needsConsent(savedLevel, level) && levelRank(level) > levelRank(form.automationLevel)) {
      setPendingLevel(level);
      return;
    }
    applyLevelToForm(level);
  };

  const errors = validatePolicy(form);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  const locked = lockedOverrides(form.automationLevel);
  const customized = customizedOverrides(form);
  const steps = stagePlan(form, {
    autoDraftTopN: form.autoDraftTopN,
    autoSubmitMaxCents: form.autoSubmitMaxCents,
    formatMoney: formatCents,
  });
  const levelLabel = LEVEL_META[form.automationLevel].label;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (hasErrors || !canEdit) return;
    const raised = needsConsent(savedLevel, form.automationLevel);
    const patch: SettingsPatch = toPatch(form);
    save.mutate(patch, {
      onSuccess: () => {
        setSaved(true);
        void qc.invalidateQueries({ queryKey: automationPreviewKey(orgId) });
        toast.success(
          `Automation set to ${levelLabel}`,
          raised
            ? "Your consent to automatic submissions was recorded."
            : levelSubmitsOnItsOwn(form.automationLevel)
              ? "Autopilot may submit applications that pass every rule."
              : "Nothing is submitted without a person approving it.",
        );
      },
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {!canEdit && <ReadOnlyNotice />}

      <Card data-tour="automation-levels">
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>How much should autopilot do?</CardTitle>
            <HelpTip term="automation_level" />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Pick a level. You can change it any time, and the safety rails below always apply.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          <AutomationLevelSelector
            value={form.automationLevel}
            onChange={requestLevel}
            disabled={!canEdit}
          />
          {customized.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
              <Badge tone="accent">Customized</Badge>
              {customized.length} stage setting{customized.length === 1 ? "" : "s"} differ from the{" "}
              {levelLabel} preset.
              {canEdit && (
                <Button
                  size="xs"
                  variant="link"
                  onClick={() => applyLevelToForm(form.automationLevel)}
                >
                  Reset to preset
                </Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-tour="automation-checkpoints">
          <CardHeader>
            <CardTitle>What the AI will do for you</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">At the {levelLabel} level.</p>
          </CardHeader>
          <CardBody>
            <AutomationTimeline steps={steps} />
          </CardBody>
        </Card>
        <Card data-tour="automation-safety-rails">
          <CardBody>
            <SafetyRailsList help={<HelpTip term="safety_rails" />} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How would these be routed?</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            Updates as you change the settings on this page, before you save.
          </p>
        </CardHeader>
        <CardBody>
          <AutomationPreview orgId={orgId} policy={toPatch(form)} dirty={dirty} />
        </CardBody>
      </Card>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-base font-semibold text-neutral-900">Advanced settings</p>
              <p className="text-sm text-neutral-500">
                Fine-tune each stage, dollar limits and percentages.
              </p>
            </div>
            <ChevronDown
              className="h-5 w-5 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="space-y-6 border-t border-neutral-100 px-5 py-5">
            <section className="space-y-4" aria-labelledby="stage-overrides">
              <h3 id="stage-overrides" className="text-sm font-semibold text-neutral-900">
                Stage by stage
              </h3>
              {OVERRIDE_FIELDS.map(({ key, label, help }) => (
                <SwitchField
                  key={key}
                  label={label}
                  description={locked[key] ?? help}
                  checked={form[key]}
                  onChange={(v) => set(key, v)}
                  disabled={!canEdit || locked[key] !== undefined}
                />
              ))}
              <SwitchField
                label="Two people must approve large asks"
                description="A second person on your team signs off before a big application goes out."
                checked={form.twoPersonRuleAboveCents != null}
                onChange={(v) => set("twoPersonRuleAboveCents", v ? 5_000_000 : null)}
                disabled={!canEdit}
              />
              {form.twoPersonRuleAboveCents != null && (
                <Field
                  label="Two approvers above"
                  htmlFor="twoPersonAbove"
                  error={errors.twoPersonRuleAboveCents}
                  hint={`Asks over ${formatCents(form.twoPersonRuleAboveCents)} need two different people to approve.`}
                  className="max-w-xs"
                >
                  <MoneyInput
                    id="twoPersonAbove"
                    cents={form.twoPersonRuleAboveCents}
                    onChange={(c) => set("twoPersonRuleAboveCents", c ?? 0)}
                    disabled={!canEdit}
                    step={5000}
                  />
                </Field>
              )}
            </section>

            <section className="space-y-4" aria-labelledby="limits">
              <h3 id="limits" className="text-sm font-semibold text-neutral-900">
                Limits
              </h3>
              <div className="grid gap-5 md:grid-cols-2">
                <Field
                  label="Auto-submit only up to"
                  htmlFor="autoSubmitMax"
                  error={errors.autoSubmitMaxCents}
                  hint={`At Supervised, asks of ${formatCents(form.autoSubmitMaxCents)} or less may go out on their own.`}
                >
                  <MoneyInput
                    id="autoSubmitMax"
                    cents={form.autoSubmitMaxCents}
                    onChange={(c) => set("autoSubmitMaxCents", c ?? 0)}
                    disabled={!canEdit}
                  />
                </Field>
                <Field
                  label="Full review above"
                  htmlFor="fullReviewAbove"
                  hint={`Anything over ${formatCents(form.fullReviewAboveCents)} is read section by section (unless you're on Full autopilot).`}
                >
                  <MoneyInput
                    id="fullReviewAbove"
                    cents={form.fullReviewAboveCents}
                    onChange={(c) => set("fullReviewAboveCents", c ?? 0)}
                    disabled={!canEdit}
                    step={5000}
                  />
                </Field>
                <Field
                  label="Minimum fit for automatic submission"
                  htmlFor="minFit"
                  error={errors.minFitScoreForAuto}
                  hint="How closely a grant must match your mission, programs and location (0–100%)."
                >
                  <PercentInput
                    id="minFit"
                    value={form.minFitScoreForAuto}
                    onChange={(v) => set("minFitScoreForAuto", v)}
                    disabled={!canEdit}
                  />
                </Field>
                <Field
                  label="“Good chance of winning” starts at"
                  htmlFor="highLikelihood"
                  error={errors.highLikelihoodThreshold}
                  hint="Grants you're likely to win deserve a careful read, so at Supervised they get full review."
                >
                  <PercentInput
                    id="highLikelihood"
                    value={Math.round(form.highLikelihoodThreshold * 100)}
                    onChange={(v) => set("highLikelihoodThreshold", v / 100)}
                    disabled={!canEdit}
                  />
                </Field>
                <Field
                  label="Most automatic submissions per month"
                  htmlFor="maxAuto"
                  error={errors.maxAutoSubmissionsPerMonth}
                  hint="A safety cap. After this many, the rest wait for a person."
                >
                  <Input
                    id="maxAuto"
                    type="number"
                    min={0}
                    value={form.maxAutoSubmissionsPerMonth}
                    onChange={(e) =>
                      set(
                        "maxAutoSubmissionsPerMonth",
                        toInt(e.target.value, form.maxAutoSubmissionsPerMonth),
                      )
                    }
                    disabled={!canEdit}
                  />
                </Field>
                <Field
                  label="Draft the top matches each day"
                  htmlFor="autoDraftTopN"
                  error={errors.autoDraftTopN}
                  hint="0 means only draft when someone clicks “Start application”."
                >
                  <Input
                    id="autoDraftTopN"
                    type="number"
                    min={0}
                    max={10}
                    value={form.autoDraftTopN}
                    onChange={(e) =>
                      set("autoDraftTopN", toInt(e.target.value, form.autoDraftTopN))
                    }
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              <SwitchField
                label="Always review the first application to a new funder"
                description="Recommended. First impressions matter, so a person checks before we introduce you."
                checked={form.reviewFirstSubmissionPerFunder}
                onChange={(v) => set("reviewFirstSubmissionPerFunder", v)}
                disabled={!canEdit}
              />
              <SwitchField
                label="Let drafts use facts nobody has confirmed yet"
                description="Facts we found in your documents but a person hasn't checked. Any sentence using one is always flagged for review, and never goes out automatically."
                checked={form.allowUnconfirmedFactsInDrafts}
                onChange={(v) => set("allowUnconfirmedFactsInDrafts", v)}
                disabled={!canEdit}
              />
            </section>

            <Field
              label="Who should we email about reviews and submissions?"
              htmlFor="notifyEmails"
              error={errors.notifyEmails}
              hint="Press Enter after each address."
            >
              <TagInput
                id="notifyEmails"
                value={form.notifyEmails}
                onChange={(v) => set("notifyEmails", v)}
                placeholder="grants@example.org"
                disabled={!canEdit}
              />
            </Field>
          </div>
        </details>
      </Card>

      {save.isError && <ErrorMessage error={save.error} />}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <SavedHint show={saved && !dirty} />
          <Button
            variant="secondary"
            disabled={!dirty || save.isPending}
            onClick={() => setForm(savedForm)}
          >
            Discard changes
          </Button>
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!dirty || hasErrors}
            data-tour="automation-save"
          >
            Save automation settings
          </Button>
        </div>
      )}

      <AutopilotConsentDialog
        open={pendingLevel !== null}
        level={pendingLevel ?? "supervised"}
        orgName={org.org.name}
        onClose={() => setPendingLevel(null)}
        onConfirm={() => {
          if (pendingLevel) applyLevelToForm(pendingLevel);
          setPendingLevel(null);
        }}
      />
    </form>
  );
}
