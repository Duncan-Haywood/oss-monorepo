// Inbox dialogs: the dismiss-reason picker (keys 1-6 pick a reason, Enter dismisses) and the
// keyboard shortcut help.
import { Button, Dialog, Kbd, Label, Textarea } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import {
  DISMISS_REASON_LABELS,
  DISMISS_REASONS,
  type DismissReason,
  MAX_DISMISS_NOTE_CHARS,
} from "@shared/match-triage";
import * as React from "react";
import { SHORTCUTS } from "./model";

/** Reasons that also lower the fit of later grants from the same funder (matching signal). */
const FUNDER_SIGNAL: ReadonlySet<DismissReason> = new Set(["wrong_focus", "too_small"]);

export function DismissDialog({
  open,
  subject,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** e.g. “Youth Build” or "3 grants". */
  subject: string;
  onClose: () => void;
  onConfirm: (input: { reason: DismissReason; note?: string }) => void;
}) {
  const [reason, setReason] = React.useState<DismissReason | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState(false);
  const firstRef = React.useRef<HTMLInputElement>(null);
  const radios = React.useRef(new Map<DismissReason, HTMLInputElement>());
  const ids = { form: React.useId(), note: React.useId(), error: React.useId() };

  React.useEffect(() => {
    if (!open) {
      setReason(null);
      setNote("");
      setError(false);
    }
  }, [open]);

  const submit = () => {
    if (!reason) {
      setError(true);
      firstRef.current?.focus();
      return;
    }
    onConfirm({ reason, note: note.trim() || undefined });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    const picked = Number.isInteger(n) ? DISMISS_REASONS[n - 1] : undefined;
    if (picked) {
      e.preventDefault();
      setReason(picked);
      setError(false);
      radios.current.get(picked)?.focus();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Dismiss ${subject}?`}
      description="Your reason helps rank future grants. Press 1–6 to pick one, Enter to dismiss."
      initialFocusRef={firstRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={ids.form} variant="danger">
            Dismiss
          </Button>
        </>
      }
    >
      <form
        id={ids.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={onKeyDown}
        className="space-y-4"
      >
        <fieldset aria-describedby={error ? ids.error : undefined}>
          <legend className="mb-2 text-sm font-medium text-neutral-900">
            Why are you dismissing it?
          </legend>
          <div className="space-y-1.5">
            {DISMISS_REASONS.map((r, i) => {
              const l = DISMISS_REASON_LABELS[r];
              return (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2",
                    reason === r
                      ? "border-brand-500 bg-brand-50"
                      : "border-neutral-200 hover:bg-neutral-50",
                  )}
                >
                  <input
                    ref={(el) => {
                      if (el) radios.current.set(r, el);
                      if (i === 0) firstRef.current = el;
                    }}
                    type="radio"
                    name="dismiss-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => {
                      setReason(r);
                      setError(false);
                    }}
                    aria-keyshortcuts={String(i + 1)}
                    className="mt-1 accent-brand-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">{l.label}</span>
                      <Kbd aria-hidden>{i + 1}</Kbd>
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {l.hint}
                      {FUNDER_SIGNAL.has(r) &&
                        " Future grants from this funder will rank a little lower."}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {error && (
            <p id={ids.error} role="alert" className="mt-2 text-sm text-danger-700">
              Pick a reason to dismiss.
            </p>
          )}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor={ids.note}>Note (optional)</Label>
          <Textarea
            id={ids.note}
            rows={2}
            maxLength={MAX_DISMISS_NOTE_CHARS}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </form>
    </Dialog>
  );
}

const KEY_LABEL: Record<string, string> = { ArrowDown: "↓", ArrowUp: "↑", Escape: "Esc" };

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts work anywhere on this page except while typing in a field."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <dl className="divide-y divide-neutral-100">
        {SHORTCUTS.map((s) => (
          <div key={s.action} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-neutral-700">{s.label}</dt>
            <dd className="flex gap-1">
              {s.keys.map((k, i) => (
                <React.Fragment key={k}>
                  {i > 0 && <span className="text-neutral-400">or</span>}
                  <Kbd>{KEY_LABEL[k] ?? k}</Kbd>
                </React.Fragment>
              ))}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-neutral-700">Pick a dismiss reason</dt>
          <dd>
            <Kbd>1</Kbd>–<Kbd>6</Kbd>
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}
