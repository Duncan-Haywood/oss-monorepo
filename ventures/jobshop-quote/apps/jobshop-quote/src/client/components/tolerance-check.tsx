// The tightest tolerance read from a part's tolerance text and what to check before pricing it
// (shared/tolerance.ts). Shown on the RFQ review under the Tolerances field and on the quote line
// beside the operations, where the cycle times are set. It reads only: no price changes.
import { toleranceNote } from "@shared/tolerance";
import { Badge } from "./ui";

const TOLERANCE_TONE = {
  standard: "stone",
  close: "sky",
  tight: "amber",
  precision: "red",
} as const;

export function ToleranceCheck({ text, prefix }: { text: string; prefix?: string }) {
  const note = toleranceNote(text);
  if (!note || note.band === "standard") return null;
  return (
    <p className="text-xs text-stone-600" data-testid="tolerance-check">
      <Badge tone={TOLERANCE_TONE[note.band]}>{note.label}</Badge> {prefix}
      {note.detail} {note.advice}
    </p>
  );
}
