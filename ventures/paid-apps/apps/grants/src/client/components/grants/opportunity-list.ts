// Client-side ordering/filtering for the opportunities list.
import type { OpportunityWithMatch } from "./queries";

/** Highest expected value first; unscored last; ties broken by soonest deadline. */
export function sortByExpectedValue(items: OpportunityWithMatch[]): OpportunityWithMatch[] {
  const closeTs = (o: OpportunityWithMatch) =>
    o.closeDate ? new Date(o.closeDate).getTime() : Number.POSITIVE_INFINITY;
  return [...items].sort((a, b) => {
    const ev = (b.match?.expectedValueCents ?? -1) - (a.match?.expectedValueCents ?? -1);
    if (ev !== 0) return ev;
    const fit = (b.match?.fitScore ?? -1) - (a.match?.fitScore ?? -1);
    if (fit !== 0) return fit;
    return closeTs(a) - closeTs(b);
  });
}

export function applyClientFilters(
  items: OpportunityWithMatch[],
  { minFit, showDismissed }: { minFit: number; showDismissed: boolean },
) {
  return items.filter((o) => {
    if (!showDismissed && o.match?.status === "dismissed") return false;
    if (minFit > 0 && (o.match?.fitScore ?? 0) < minFit) return false;
    return true;
  });
}
