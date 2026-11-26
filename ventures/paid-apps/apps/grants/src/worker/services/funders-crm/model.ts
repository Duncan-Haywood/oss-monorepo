// Pure funder-relationship logic: stage derivation from pipeline signals and the timeline merge.
// No I/O here, so both are unit-testable and deterministic.
import type {
  FunderStage,
  FunderTimeline,
  FunderTimelineItem,
  FunderTimelineKind,
} from "@shared/api/funders";
import type { ApplicationStatus, MatchStatus } from "@shared/enums";

/** Applications that ended without a decision from the funder: they say nothing about the stage. */
const NO_SIGNAL_STATUSES: readonly ApplicationStatus[] = ["withdrawn", "failed"];

/** What the rest of the app knows about one funder, for one org. */
export interface StageSignals {
  applicationStatuses: ApplicationStatus[];
  awards: number;
  matchStatuses: MatchStatus[];
  /** org_prospects.status, when the relation is linked to a foundation prospect. */
  prospectStatus: string | null;
}

export const emptySignals = (): StageSignals => ({
  applicationStatuses: [],
  awards: 0,
  matchStatuses: [],
  prospectStatus: null,
});

/**
 * The stage implied by the signals, or null when nothing implies one (keep what is there).
 * Order of precedence: any award -> funded; any live application -> applied; only declined
 * applications -> declined; shortlisted / researched -> cultivating.
 */
export function deriveStage(s: StageSignals): FunderStage | null {
  const apps = s.applicationStatuses.filter((st) => !NO_SIGNAL_STATUSES.includes(st));
  if (s.awards > 0 || apps.includes("awarded")) return "funded";
  if (apps.some((st) => st !== "declined")) return "applied";
  if (apps.length > 0) return "declined";
  if (s.prospectStatus === "applied") return "applied";
  if (s.prospectStatus === "declined") return "declined";
  if (
    s.matchStatuses.some((m) => m === "shortlisted" || m === "drafting" || m === "applied") ||
    s.prospectStatus === "researching" ||
    s.prospectStatus === "contacted"
  ) {
    return "cultivating";
  }
  return null;
}

/** Tie-break for events at the same instant (e.g. an outcome recorded with its award). */
const KIND_ORDER: Record<FunderTimelineKind, number> = {
  outcome: 0,
  award: 1,
  report: 2,
  application: 3,
  interaction: 4,
  watch_event: 5,
  prospect: 6,
  next_step: 7,
};

function compareAsc(a: FunderTimelineItem, b: FunderTimelineItem): number {
  const d = Date.parse(a.at) - Date.parse(b.at);
  if (d !== 0) return d;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id);
}

/**
 * Merges timeline items from every source: items dated after `now` are "upcoming" (soonest
 * first), the rest are "past" (newest first). Duplicate ids keep the first occurrence; items
 * with an unparseable date are dropped.
 */
export function mergeTimeline(groups: FunderTimelineItem[][], now: Date): FunderTimeline {
  const seen = new Set<string>();
  const all: FunderTimelineItem[] = [];
  for (const g of groups) {
    for (const item of g) {
      if (seen.has(item.id) || Number.isNaN(Date.parse(item.at))) continue;
      seen.add(item.id);
      all.push(item);
    }
  }
  const t = now.getTime();
  const upcoming = all.filter((i) => Date.parse(i.at) > t).sort(compareAsc);
  const past = all.filter((i) => Date.parse(i.at) <= t).sort((a, b) => compareAsc(b, a));
  return { upcoming, past };
}

/** "85-0123456" / "850123456" -> "850123456"; null when not 9 digits. */
export function normalizeEin(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
}

export function cleanTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 20);
}
