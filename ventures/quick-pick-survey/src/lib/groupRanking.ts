/**
 * A survey's ranking across all of its respondents, with honest uncertainty.
 *
 * Each respondent's Glicko-2 state gives a rating and a deviation (their own
 * standard error) per item. This combines them per item with a random-effects
 * meta-analysis (DerSimonian-Laird): respondents genuinely differ, so the
 * interval has to reflect that spread as well as each person's own error, or a
 * large panel of confident-but-disagreeing people would look falsely precise.
 *
 * Items are then given a rank *range*: the best rank they could hold (nothing
 * beats them unless it is clearly above) and the worst. Two items whose
 * intervals overlap share a range instead of being ordered by noise.
 */

export const DEFAULT_RD = 350;

export type RatingRow = { itemId: string; rating: number; rd: number };
export type ItemMeta = { id: string; label: string; category?: string | null };

export type RankedItem = {
  itemId: string;
  label: string;
  category: string | null;
  /** Respondents who answered at least once about this item. */
  respondents: number;
  rating: number;
  se: number;
  low: number;
  high: number;
  /** Between-respondent standard deviation (tau), 0 if they agree. */
  spread: number;
  rank: number;
  bestRank: number;
  worstRank: number;
  /** True when the range holds more than one rank. */
  tied: boolean;
};

const Z95 = 1.96;

export function pool(rows: { rating: number; rd: number }[]): { rating: number; se: number; tau: number } {
  const k = rows.length;
  if (k === 0) return { rating: 1500, se: DEFAULT_RD, tau: 0 };
  const v = rows.map((r) => Math.max(r.rd, 1) ** 2);
  const w = v.map((x) => 1 / x);
  const sw = w.reduce((a, b) => a + b, 0);
  const fixed = rows.reduce((a, r, i) => a + w[i] * r.rating, 0) / sw;
  let tau2 = 0;
  if (k > 1) {
    const q = rows.reduce((a, r, i) => a + w[i] * (r.rating - fixed) ** 2, 0);
    const c = sw - w.reduce((a, x) => a + x * x, 0) / sw;
    tau2 = c > 0 ? Math.max(0, (q - (k - 1)) / c) : 0;
  }
  const w2 = v.map((x) => 1 / (x + tau2));
  const sw2 = w2.reduce((a, b) => a + b, 0);
  const rating = rows.reduce((a, r, i) => a + w2[i] * r.rating, 0) / sw2;
  return { rating, se: Math.sqrt(1 / sw2), tau: Math.sqrt(tau2) };
}

export function groupRanking(items: ItemMeta[], rows: RatingRow[]): RankedItem[] {
  const byItem = new Map<string, RatingRow[]>();
  for (const r of rows) {
    // A rating still at the default deviation was never answered about.
    if (r.rd >= DEFAULT_RD - 1e-9) continue;
    const list = byItem.get(r.itemId);
    if (list) list.push(r);
    else byItem.set(r.itemId, [r]);
  }
  const est = items.map((it) => {
    const rs = byItem.get(it.id) ?? [];
    const p = pool(rs);
    return {
      itemId: it.id,
      label: it.label,
      category: it.category ?? null,
      respondents: rs.length,
      rating: p.rating,
      se: p.se,
      low: p.rating - Z95 * p.se,
      high: p.rating + Z95 * p.se,
      spread: p.tau,
    };
  });
  est.sort((a, b) => b.rating - a.rating || a.label.localeCompare(b.label));
  return est.map((e, i) => {
    const above = est.filter((o) => o !== e && o.low > e.high).length;
    const below = est.filter((o) => o !== e && o.high < e.low).length;
    const bestRank = 1 + above;
    const worstRank = est.length - below;
    return { ...e, rank: i + 1, bestRank, worstRank, tied: worstRank > bestRank };
  });
}

const FORMULA_LEAD = /^[=+\-@\t\r]/;
function cell(v: string | number): string {
  let s = typeof v === "number" ? String(Math.round(v * 10) / 10) : v;
  if (typeof v === "string" && FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rankingCsv(ranked: RankedItem[]): string {
  const head = ["rank", "item", "category", "rating", "ci_low", "ci_high", "best_rank", "worst_rank", "respondents", "disagreement_sd"];
  const lines = [head.join(",")];
  for (const r of ranked) {
    lines.push(
      [r.rank, r.label, r.category ?? "", r.rating, r.low, r.high, r.bestRank, r.worstRank, r.respondents, r.spread]
        .map((v) => cell(v))
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Options rated by fewer respondents than this are too thin to place. */
export const THIN_RESPONDENTS = 3;

export type Coverage = {
  options: number;
  /** Options rated by fewer than THIN_RESPONDENTS respondents (labels, thinnest first). */
  thin: string[];
  /** Median number of respondents per option. */
  median: number;
  /** "ok" when every option has enough raters, "thin" when some do not, "empty" with no answers. */
  status: "ok" | "thin" | "empty";
  /** One plain sentence for the admin, or "" when there is nothing to say. */
  advice: string;
};

/**
 * How well the respondents cover the list. Each respondent answers a limited
 * number of pairs, so a long list spreads them thin: this names the options
 * that too few people rated and says whether to wait, or shorten the list.
 * `answersPerRespondent` (median answered pairs per participant) sharpens the
 * suggested length when the caller has it.
 */
export function coverage(ranked: RankedItem[], participants: number, answersPerRespondent?: number): Coverage {
  const n = ranked.length;
  const counts = ranked.map((r) => r.respondents).sort((a, b) => a - b);
  const median = n === 0 ? 0 : n % 2 ? counts[(n - 1) / 2] : (counts[n / 2 - 1] + counts[n / 2]) / 2;
  if (n === 0 || counts[n - 1] === 0) {
    return { options: n, thin: [], median: 0, status: "empty", advice: "" };
  }
  const thin = ranked
    .filter((r) => r.respondents < THIN_RESPONDENTS)
    .sort((a, b) => a.respondents - b.respondents || a.label.localeCompare(b.label))
    .map((r) => r.label);
  if (thin.length === 0) {
    return { options: n, thin, median, status: "ok", advice: "" };
  }
  // A respondent sees only part of a long list; the median says how far they reach.
  const reach = participants > 0 ? Math.min(1, median / participants) : 0;
  // With the measured answers per respondent: each answer shows two options, so
  // the crowd supplies about participants * 2 * answers appearances, and a
  // list is only as long as that can give every option THIN_RESPONDENTS raters.
  const measured = answersPerRespondent && answersPerRespondent > 0 && participants > 0
    ? Math.floor((participants * 2 * answersPerRespondent) / THIN_RESPONDENTS)
    : null;
  const keep = Math.max(2, measured !== null ? Math.min(n - 1, measured) : Math.floor(n * Math.max(reach, 0.1)));
  const advice =
    reach < 0.5 && n > 12
      ? `${thin.length} of ${n} options were rated by fewer than ${THIN_RESPONDENTS} people, and a typical option reached only ${Math.round(reach * 100)}% of respondents. Wait for more respondents, or shorten the list to about ${keep} options${measured !== null ? ` (people answered a median of ${answersPerRespondent} pairs each)` : ""}.`
      : `${thin.length} of ${n} options were rated by fewer than ${THIN_RESPONDENTS} people, so their places are guesses. Wait for more respondents.`;
  return { options: n, thin, median, status: "thin", advice };
}
