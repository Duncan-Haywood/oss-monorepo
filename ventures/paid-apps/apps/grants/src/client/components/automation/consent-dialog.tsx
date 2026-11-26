// Confirmation + consent before raising the automation level to Supervised or Full autopilot.
// Agreeing here doesn't call the API itself: the parent saves the level with autopilotEnabled=true,
// and the server records the "autopilot_submission" consent row in the same update (the existing
// settings-consent flow in worker/services/orgs/service.ts).

import { GUARANTEE_DAYS } from "@client/components/marketing/plan-copy";
import { Button, Checkbox, Dialog } from "@client/components/ui";
import { useEffect, useId, useState } from "react";
import { type AutomationLevel, LEVEL_META } from "./levels";

/** The exact wording the admin agrees to (also handy for tests and the audit trail). */
export function consentText(orgName: string, level: AutomationLevel): string {
  const scope =
    level === "full"
      ? "submit any grant application that passes every safety rail"
      : "submit small, low-risk grant applications within the limits we set";
  return `On behalf of ${orgName}, I allow Grant Autopilot to ${scope} without a person approving each one. Every package is saved exactly as sent and we are emailed each time. We can lower the level at any time, and our ${GUARANTEE_DAYS}-day money-back guarantee still applies.`;
}

export function AutopilotConsentDialog({
  open,
  level,
  orgName,
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean;
  level: AutomationLevel;
  orgName: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const checkId = useId();
  useEffect(() => {
    if (!open) setAgreed(false);
  }, [open]);
  const label = LEVEL_META[level].label;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!loading}
      title={`Turn on ${label} for ${orgName}?`}
      description={
        level === "full"
          ? "Autopilot will submit every application that passes the safety rails, without waiting for anyone."
          : "Autopilot will submit small, low-risk applications on its own. Everything else still waits for you."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Keep current level
          </Button>
          <Button onClick={onConfirm} disabled={!agreed} loading={loading}>
            Agree and turn on {label}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-neutral-600">
          <li>
            The safety rails stay on: only confirmed facts, verified funder emails, no blockers.
          </li>
          <li>You're emailed every time something is submitted, with the exact package sent.</li>
          <li>Your monthly cap and dollar limits still apply. You can lower the level any time.</li>
          <li>
            You're still covered by our {GUARANTEE_DAYS}-day money-back guarantee if it isn't right
            for you.
          </li>
        </ul>
        <div className="flex items-start gap-2.5 rounded-md bg-neutral-50 p-3">
          <Checkbox
            id={checkId}
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor={checkId} className="text-sm text-neutral-800">
            {consentText(orgName, level)}
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          Your consent is recorded with your name and the time when the new level is saved.
        </p>
      </div>
    </Dialog>
  );
}
