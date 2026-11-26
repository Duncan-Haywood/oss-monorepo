// Pure helpers for the funder relationship UI (stage tones, board grouping, next-step urgency).
import type { Tone } from "@client/components/ui";
import {
  FUNDER_STAGES,
  type FunderRelationSummaryDto,
  type FunderStage,
} from "@shared/api/funders";

export const STAGE_TONE: Record<FunderStage, Tone> = {
  prospect: "neutral",
  cultivating: "info",
  applied: "brand",
  funded: "success",
  declined: "danger",
  dormant: "warning",
};

export const STAGE_HINT: Record<FunderStage, string> = {
  prospect: "Might fund you; not yet in touch",
  cultivating: "Building the relationship",
  applied: "An application is with them",
  funded: "They have funded you",
  declined: "Said no this time",
  dormant: "Paused for now",
};

export function groupByStage(
  items: readonly FunderRelationSummaryDto[],
): Record<FunderStage, FunderRelationSummaryDto[]> {
  const out = Object.fromEntries(FUNDER_STAGES.map((s) => [s, []])) as unknown as Record<
    FunderStage,
    FunderRelationSummaryDto[]
  >;
  for (const item of items) out[item.stage].push(item);
  for (const s of FUNDER_STAGES) {
    out[s].sort(
      (a, b) =>
        (a.nextStepAt ? Date.parse(a.nextStepAt) : Number.POSITIVE_INFINITY) -
          (b.nextStepAt ? Date.parse(b.nextStepAt) : Number.POSITIVE_INFINITY) ||
        a.displayName.localeCompare(b.displayName),
    );
  }
  return out;
}

export type NextStepUrgency = "none" | "overdue" | "soon" | "later";

export function nextStepUrgency(at: string | null, now: Date = new Date()): NextStepUrgency {
  if (!at) return "none";
  const ms = Date.parse(at) - now.getTime();
  if (ms < 0) return "overdue";
  return ms <= 7 * 86_400_000 ? "soon" : "later";
}

/** `<input type="datetime-local">` value for an ISO date (local time), and back. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
