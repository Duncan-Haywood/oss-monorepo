// Onboarding step 5: pick an automation level (compact selector, defaults to Prepared) and, for
// levels that submit on their own, the dollar limits. PATCH /settings. Raising to Supervised/Full
// asks for consent first; saving with autopilotEnabled=true records it.
import { AutopilotConsentDialog } from "@client/components/automation/consent-dialog";
import { AutomationLevelSelector } from "@client/components/automation/level-selector";
import {
  type AutomationLevel,
  applyLevel,
  autoDraftForLevel,
  checkpointPatch,
  DEFAULT_AUTOMATION_LEVEL,
  isAutomationLevel,
  levelSubmitsOnItsOwn,
  needsConsent,
  readAutomation,
} from "@client/components/automation/levels";
import { Alert, Button, ErrorMessage, Field, Spinner } from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { MoneyInput, SwitchField } from "@client/routes/org/settings/form-bits";
import { type SettingsPatch, useOrg, useUpdateSettings } from "@client/routes/org/settings/use-org";
import { useEffect, useState } from "react";

export function AutopilotStep({
  orgId,
  onFinish,
  onBack,
  finishing,
}: {
  orgId: string;
  onFinish: () => void;
  onBack: () => void;
  finishing?: boolean;
}) {
  const org = useOrg(orgId);
  const save = useUpdateSettings(orgId);
  const [level, setLevel] = useState<AutomationLevel>(DEFAULT_AUTOMATION_LEVEL);
  const [pendingLevel, setPendingLevel] = useState<AutomationLevel | null>(null);
  const [autoMax, setAutoMax] = useState<number>(1_000_000);
  const [fullAbove, setFullAbove] = useState<number>(10_000_000);
  const [firstFunder, setFirstFunder] = useState(true);

  useEffect(() => {
    const s = org.data?.settings;
    if (!s) return;
    // Only an explicitly saved level wins; new orgs start at the recommended Prepared level.
    if (isAutomationLevel(s.automationLevel)) setLevel(s.automationLevel);
    setAutoMax(s.autoSubmitMaxCents);
    setFullAbove(s.fullReviewAboveCents);
    setFirstFunder(s.reviewFirstSubmissionPerFunder);
  }, [org.data?.settings]);

  const pickLevel = (next: AutomationLevel) => {
    if (next === level) return;
    if (needsConsent(level, next)) setPendingLevel(next);
    else setLevel(next);
  };

  const autoSubmits = levelSubmitsOnItsOwn(level);
  const invalid = autoMax > fullAbove;
  const onSave = () => {
    if (invalid) return;
    const current = readAutomation(org.data?.settings);
    const patch: SettingsPatch = {
      automationLevel: level,
      ...checkpointPatch(applyLevel(current, level)),
      autopilotEnabled: autoSubmits,
      autoDraftTopN: autoDraftForLevel(level, org.data?.settings.autoDraftTopN ?? 3),
      autoSubmitMaxCents: autoMax,
      fullReviewAboveCents: fullAbove,
      reviewFirstSubmissionPerFunder: firstFunder,
    };
    save.mutate(patch, { onSuccess: onFinish });
  };

  if (org.isPending) return <Spinner label="Loading your settings" />;
  const orgName = org.data?.org.name ?? "your organization";

  return (
    <div className="space-y-6">
      <p className="text-neutral-700">
        How much should Grant Autopilot do on its own? Every draft is checked, sentence by sentence,
        against your own documents whichever level you choose.
      </p>

      <AutomationLevelSelector value={level} onChange={pickLevel} compact />

      {autoSubmits && (
        <div className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5">
          <Alert tone="warning">
            {level === "full"
              ? "Every application that passes the safety rails may be submitted without a click."
              : `Grants of ${formatCents(autoMax)} or less that pass every check may be submitted without a click.`}{" "}
            You'll be emailed each time.
          </Alert>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Auto-submit only up to"
              htmlFor="ob-auto-max"
              error={invalid ? "Must be at or below the full-review line." : undefined}
              hint="Small, low-risk asks up to this amount can go out on their own."
            >
              <MoneyInput id="ob-auto-max" cents={autoMax} onChange={(c) => setAutoMax(c ?? 0)} />
            </Field>
            <Field
              label="Read every section above"
              htmlFor="ob-full-above"
              hint="Larger asks get a full, section-by-section review."
            >
              <MoneyInput
                id="ob-full-above"
                cents={fullAbove}
                step={5000}
                onChange={(c) => setFullAbove(c ?? 0)}
              />
            </Field>
          </div>
          <SwitchField
            label="Always review the first application to a new funder"
            description="Recommended — first impressions matter."
            checked={firstFunder}
            onChange={setFirstFunder}
          />
        </div>
      )}
      <p className="text-sm text-neutral-500">
        You can change the level, and fine-tune each stage, any time in Settings → Autopilot &amp;
        review.
      </p>

      {(save.isError || org.isError) && <ErrorMessage error={save.error ?? org.error} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={save.isPending}>
          Back
        </Button>
        <Button size="lg" onClick={onSave} loading={save.isPending || finishing} disabled={invalid}>
          Finish setup
        </Button>
      </div>

      <AutopilotConsentDialog
        open={pendingLevel !== null}
        level={pendingLevel ?? "supervised"}
        orgName={orgName}
        onClose={() => setPendingLevel(null)}
        onConfirm={() => {
          if (pendingLevel) setLevel(pendingLevel);
          setPendingLevel(null);
        }}
      />
    </div>
  );
}
