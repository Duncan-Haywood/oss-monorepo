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

/**
 * How a rank range decides that one option is clearly above another.
 * "overlap" (the default): their 95% intervals do not overlap. That is a much
 * stricter test than 95%: two equal-width intervals stop overlapping only when
 * the gap is 2.77 standard errors of the difference (p about 0.006).
 * "difference": the gap itself is beyond 1.96 standard errors of the
 * difference, a plain 95% two-sided test per pair. Measured against both on
 * real panels in docs/REAL-RANKINGS.md.
 */
export type RangeRule = "overlap" | "difference";
export const RANGE_RULES: readonly RangeRule[] = ["overlap", "difference"];

export function clearlyAbove(a: { rating: number; se: number; low: number; high: number }, b: { rating: number; se: number; low: number; high: number }, rule: RangeRule): boolean {
  if (rule === "overlap") return a.low > b.high;
  return a.rating - b.rating > Z95 * Math.sqrt(a.se * a.se + b.se * b.se);
}

export function groupRanking(items: ItemMeta[], rows: RatingRow[], rule: RangeRule = "overlap"): RankedItem[] {
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
    const above = est.filter((o) => o !== e && clearlyAbove(o, e, rule)).length;
    const below = est.filter((o) => o !== e && clearlyAbove(e, o, rule)).length;
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

/** A respondent's rating rows, tagged with who gave them (participantItemRating). */
export type ParticipantRatingRow = RatingRow & { participantId: string };

export type RespondentAgreement = {
  participantId: string;
  /** Options this person answered about. */
  options: number;
  /** Spearman correlation of their ratings with everyone else's pooled ratings on the same options; null under AGREEMENT_MIN_OPTIONS. */
  rho: number | null;
};

/** Options a person must have answered about before their agreement means anything. */
export const AGREEMENT_MIN_OPTIONS = 5;
/**
 * Below this leave-one-out agreement a respondent's answers do not follow the
 * rest of the panel: careless clicking (always the first slot, one favourite,
 * a trait unrelated to the question) or a genuine outlier. In the careless-pattern
 * sweep 0-4% of honest respondents fell under it on 15 to 30 options
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Careless patterns that are not random").
 */
export const LOW_AGREEMENT = 0.2;

/** Spearman with average ranks for ties (ratings left at the default tie often). */
export function rankCorrelation(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    for (let k = 0; k < order.length; ) {
      let j = k;
      while (j + 1 < order.length && order[j + 1][0] === order[k][0]) j++;
      for (let t = k; t <= j; t++) r[order[t][1]] = (k + j) / 2;
      k = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/**
 * How well each respondent agrees with the rest of the panel: the rank
 * correlation of their ratings with the pool of everyone else's (leave one
 * out), over the options they answered about. Options nobody else rated are
 * skipped. A person whose answers follow something other than the question
 * scores near zero or below.
 */
export function respondentAgreement(rows: ParticipantRatingRow[]): RespondentAgreement[] {
  const answered = rows.filter((r) => r.rd < DEFAULT_RD - 1e-9);
  const byItem = new Map<string, ParticipantRatingRow[]>();
  const byPerson = new Map<string, ParticipantRatingRow[]>();
  for (const r of answered) {
    (byItem.get(r.itemId) ?? byItem.set(r.itemId, []).get(r.itemId)!).push(r);
    (byPerson.get(r.participantId) ?? byPerson.set(r.participantId, []).get(r.participantId)!).push(r);
  }
  const out: RespondentAgreement[] = [];
  for (const [participantId, mine] of byPerson) {
    const own: number[] = [], others: number[] = [];
    for (const r of mine) {
      const rest = byItem.get(r.itemId)!.filter((o) => o.participantId !== participantId);
      if (rest.length === 0) continue;
      own.push(r.rating);
      others.push(pool(rest).rating);
    }
    out.push({ participantId, options: own.length, rho: own.length >= AGREEMENT_MIN_OPTIONS ? rankCorrelation(own, others) : null });
  }
  return out.sort((a, b) => (a.rho ?? Infinity) - (b.rho ?? Infinity) || a.participantId.localeCompare(b.participantId));
}

export type AgreementSummary = {
  /** Respondents with enough answered options to score. */
  checked: number;
  /** Of those, how many fell under LOW_AGREEMENT. */
  low: number;
  /** One plain paragraph for the survey owner, or "" when there is nothing to say. */
  advice: string;
};

/** Respondents scored before the check says anything: leave-one-out needs a panel to compare against. */
export const AGREEMENT_MIN_RESPONDENTS = 5;

/**
 * A data-quality note from respondentAgreement. It never changes the ranking:
 * in the careless-pattern sweep, weighting people by their agreement recovered
 * much of what careless clickers cost (up to +0.08 Spearman) but quieted a
 * genuine minority taste by 0.01 to 0.04, and the score cannot tell the two
 * apart (docs/INFORMATION-GAIN-SELECTOR.md). So the owner is told, and decides.
 */
export function agreementSummary(agreements: RespondentAgreement[]): AgreementSummary {
  const scored = agreements.filter((a) => a.rho !== null);
  const low = scored.filter((a) => a.rho! < LOW_AGREEMENT).length;
  if (scored.length < AGREEMENT_MIN_RESPONDENTS || low === 0) return { checked: scored.length, low, advice: "" };
  const split = low / scored.length >= 0.3;
  const advice =
    `${low} of ${scored.length} respondents ranked the options in an order that barely matches everyone else's (rank agreement under ${LOW_AGREEMENT}). ` +
    (split
      ? "That many usually means the panel is split into groups with different tastes, or a block of careless answers; compare the groups before acting on one overall order. "
      : "That is what careless clicking looks like (always the first option, or picking by something other than the question), but a person with a genuinely different taste looks the same. ") +
    "The ranking counts every respondent equally.";
  return { checked: scored.length, low, advice };
}

/** A respondent's decided answers by slot: `first` picked the option shown first (result "A"), `second` the other. */
export type SlotCounts = { participantId: string; first: number; second: number };

/**
 * Respondents whose answers follow the screen, not the options: from
 * SLOT_CLICK_MIN_DECIDED decided answers, a first-slot share at or beyond
 * SLOT_CLICK_SHARE either way (the rule the selector already uses).
 * Slots are shuffled per pair, so their picks say nothing about the options;
 * the ranking leaves them out. In the careless-pattern sweep this caught every
 * slot clicker, flagged 0.3-0.7% of honest respondents (60 answers each; by chance 4.3% at 30, 0.01% at 100), never flagged a group
 * with a different taste, and recovered what the clickers cost the pool (up to
 * +0.078 Spearman on 8-person panels; docs/INFORMATION-GAIN-SELECTOR.md).
 */
// pairing.ts's FIRST_OPTION_MIN_DECIDED and FIRST_OPTION_FALLBACK_SHARE, copied so this module keeps no imports
// (scripts/build-sample-report.mjs runs it under Node's type stripping); groupRanking.test.ts fails if they drift.
export const SLOT_CLICK_MIN_DECIDED = 30;
export const SLOT_CLICK_SHARE = 0.7;

export function slotClickers(counts: SlotCounts[]): Set<string> {
  const out = new Set<string>();
  for (const c of counts) {
    const decided = c.first + c.second;
    const share = decided > 0 ? c.first / decided : 0.5;
    if (decided >= SLOT_CLICK_MIN_DECIDED && (share >= SLOT_CLICK_SHARE || share <= 1 - SLOT_CLICK_SHARE)) out.add(c.participantId);
  }
  return out;
}

/** One plain sentence for the owner when slot clickers were left out, or "". */
export function slotClickerAdvice(left: number, participants: number): string {
  if (left === 0) return "";
  return `${left} of ${participants} respondents picked the same position on screen (top or bottom) at least ${Math.round(SLOT_CLICK_SHARE * 100)}% of the time over ${SLOT_CLICK_MIN_DECIDED} or more answers. Positions are shuffled, so those picks say nothing about the options, and they are left out of this ranking.`;
}
