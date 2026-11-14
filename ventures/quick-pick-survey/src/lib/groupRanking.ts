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

import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";

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

/**
 * `answeredOnly`: the caller has already left out the rows nobody answered
 * about, so every row counts whatever its rd. A weighting scheme that
 * down-weights a person by scaling their rd needs it: without it a row scaled
 * past DEFAULT_RD reads as never answered and vanishes, and a cap below
 * DEFAULT_RD instead lets the never-answered rows (rating 1500, rd 350) in as
 * real ones. The sweeps did the latter until 2026-11-13, which made sparse long
 * lists look overconfident (docs/INFORMATION-GAIN-SELECTOR.md, "The sparse
 * long-list overclaim was the harness").
 */
export function groupRanking(items: ItemMeta[], rows: RatingRow[], rule: RangeRule = "overlap", { answeredOnly = false }: { answeredOnly?: boolean } = {}): RankedItem[] {
  const byItem = new Map<string, RatingRow[]>();
  for (const r of rows) {
    // A rating still at the default deviation was never answered about.
    if (!answeredOnly && r.rd >= DEFAULT_RD - 1e-9) continue;
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

/** One answered pick's time on screen (Trial.msToAnswer), null when it was not recorded. */
export type AnswerTime = { participantId: string; ms: number | null };
export type RespondentPace = {
  participantId: string;
  /** Answers with a usable time. */
  timed: number;
  medianMs: number | null;
  /** Their median time over the panel's median of medians; null when either is missing. */
  pace: number | null;
};

/** Timed answers a respondent needs before their pace is judged. */
export const PACE_MIN_TIMED = 10;
/** Times at or above this are a respondent who left the tab open, not a pick (the admin overview uses the same cut). */
export const PACE_MAX_MS = 120_000;
/**
 * "Fast": a median time per pick under half the panel's typical median. In the
 * answer-time sweep this flagged 0-4% of honest respondents (person-to-person
 * pace spread of 0.4 on the log scale), and dropping them cost a ranking at
 * most 0.005 Spearman where careless people were no faster than anyone else
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Answer times").
 */
export const FAST_PACE = 0.5;

const medianOf = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The q-quantile of v, linear between order statistics (q = 0.5 is the median). */
const quantileOf = (v: number[], q: number) => {
  const s = v.slice().sort((a, b) => a - b);
  const h = (s.length - 1) * q, lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
};

/**
 * Each respondent's typical time per pick, relative to the panel's. Relative,
 * not a fixed number of seconds: a list of short labels is quicker to answer
 * than a list of paragraphs, for everyone.
 */
export function respondentPace(times: AnswerTime[]): RespondentPace[] {
  const by = new Map<string, number[]>();
  for (const t of times) {
    const list = by.get(t.participantId) ?? by.set(t.participantId, []).get(t.participantId)!;
    if (t.ms !== null && Number.isFinite(t.ms) && t.ms > 0 && t.ms < PACE_MAX_MS) list.push(t.ms);
  }
  const rows = [...by].map(([participantId, ms]) => ({ participantId, timed: ms.length, medianMs: ms.length >= PACE_MIN_TIMED ? medianOf(ms) : null }));
  const judged = rows.filter((r) => r.medianMs !== null).map((r) => r.medianMs!);
  const panel = judged.length >= AGREEMENT_MIN_RESPONDENTS ? medianOf(judged) : null;
  return rows
    .map((r) => ({ ...r, pace: r.medianMs !== null && panel ? r.medianMs / panel : null }))
    .sort((a, b) => (a.pace ?? Infinity) - (b.pace ?? Infinity) || a.participantId.localeCompare(b.participantId));
}

/** The respondents whose pace is under FAST_PACE. */
export function fastAnswerers(paces: RespondentPace[]): Set<string> {
  return new Set(paces.filter((p) => p.pace !== null && p.pace < FAST_PACE).map((p) => p.participantId));
}

export type PaceSummary = {
  /** Respondents with a judged pace. */
  checked: number;
  /** Of those, how many answered under FAST_PACE of the panel's typical time. */
  fast: number;
  /** Respondents under LOW_AGREEMENT agreement, and how many of them were fast. */
  lowAgreement: number;
  lowAndFast: number;
  /** The panel's typical (median of medians) time per pick, in seconds, or null. */
  typicalSeconds: number | null;
  /** One plain paragraph for the survey owner, or "". */
  advice: string;
};

/**
 * A data-quality note from answer times, read beside respondentAgreement.
 * Agreement alone cannot tell people who pick by something other than the
 * question from a group with a genuinely different taste; pace can, when the
 * careless are also quick. In the answer-time sweep, a camp answering at a
 * normal pace was never told apart from the majority by pace (AUC 0.50-0.56),
 * while careless people answering at 0.6x or 0.4x the honest pace were (AUC
 * 0.83-0.98). It never changes the ranking; `?drop=fast` on the ranking route
 * shows the ranking without the fast answerers, for the owner to compare.
 */
export function paceSummary(paces: RespondentPace[], agreements: RespondentAgreement[]): PaceSummary {
  const judged = paces.filter((p) => p.pace !== null);
  const fast = fastAnswerers(paces);
  const low = agreements.filter((a) => a.rho !== null && a.rho < LOW_AGREEMENT);
  const lowAndFast = low.filter((a) => fast.has(a.participantId)).length;
  const typical = judged.length ? judged[0].medianMs! / judged[0].pace! : null;
  const typicalSeconds = typical === null ? null : Math.round(typical / 100) / 10;
  const base = { checked: judged.length, fast: fast.size, lowAgreement: low.length, lowAndFast, typicalSeconds };
  if (judged.length < AGREEMENT_MIN_RESPONDENTS || (fast.size === 0 && low.length === 0)) return { ...base, advice: "" };
  const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let advice: string;
  if (fast.size === 0) {
    advice =
      `None of the ${judged.length} timed respondents answered unusually fast (the typical pick took ${typicalSeconds} s). ` +
      `The ${s(low.length, "respondent whose order barely matches", "respondents whose order barely matches")} the rest answered at a normal pace, which looks more like a genuinely different taste than careless clicking. Answer times are a hint, not proof.`;
  } else {
    advice =
      `${s(fast.size, "respondent", "respondents")} of ${judged.length} answered in under half the typical time per pick (typical: ${typicalSeconds} s). ` +
      (low.length
        ? `Of the ${s(low.length, "respondent whose order barely matches", "respondents whose order barely matches")} the rest, ${lowAndFast} ${lowAndFast === 1 ? "was" : "were"} among them: fast and out of step is what careless clicking looks like; out of step at a normal pace looks more like a different taste. `
        : "") +
      "They are counted in this ranking; compare it with the ranking without them before acting. Answer times are a hint, not proof.";
  }
  return { ...base, advice };
}

/**
 * The ranking route's `drop` parameter: absent, "fast" (leave out fast
 * respondents), "fast-answers" (keep everyone, leave out their fast answers) or
 * "fast-blocks" (keep everyone, leave out what they answered after turning
 * quick partway through; fastBlockStarts).
 * Anything else is refused, not ignored.
 */
export function parseDrop(value: string | null): { ok: true; fast: boolean; fastAnswers: boolean; fastBlocks: boolean } | { ok: false } {
  const none = { ok: true as const, fast: false, fastAnswers: false, fastBlocks: false };
  if (value === null) return none;
  if (value === "fast") return { ...none, fast: true };
  if (value === "fast-answers") return { ...none, fastAnswers: true };
  if (value === "fast-blocks") return { ...none, fastBlocks: true };
  return { ok: false };
}

/** One answered trial, in the order it was answered. */
export type ReplayAnswer = { participantId: string; itemAId: string; itemBId: string; result: string; ms: number | null };

/**
 * The time under which one answer counts as fast: FAST_PACE times the panel's
 * typical (median of medians) time per pick, or null when the panel's pace
 * could not be judged (under AGREEMENT_MIN_RESPONDENTS timed respondents).
 */
export function fastAnswerCutMs(paces: RespondentPace[]): number | null {
  const judged = paces.find((p) => p.pace !== null && p.pace > 0);
  return judged ? (judged.medianMs! / judged.pace!) * FAST_PACE : null;
}

/**
 * Each respondent's ratings rebuilt from their answers, in order, leaving out
 * every answer under `cutMs` (answers with no usable time are kept). With
 * nothing left out it reproduces what the answer route stored, update for
 * update. An answer whose result is not A, B or EQUAL is refused.
 *
 * Why answers and not people: someone who picks carelessly on half their
 * answers keeps a near-normal median time, so the person-level `?drop=fast`
 * misses them, while their quick answers still fall under the cut. In the
 * answer-time sweep (docs/INFORMATION-GAIN-SELECTOR.md, "Half-time
 * carelessness and answer times") against half-time salience pickers this
 * recovered 55-75% of what leaving out exactly their careless answers would
 * when those answers took 0.4x the honest time (20-42% at 0.6x), where leaving
 * out fast people recovered 0-35%. It is a comparison, not the default: when
 * nobody is careless it costs 0.000-0.006 Spearman, and a camp with a genuine
 * second taste 0.002-0.019, the price of the honest answers it also drops.
 */
export function ratingsWithoutFastAnswers(answers: ReplayAnswer[], cutMs: number): { rows: ParticipantRatingRow[]; dropped: number; people: number } {
  return ratingsWithoutAnswers(answers, (a) => a.ms !== null && Number.isFinite(a.ms) && a.ms > 0 && a.ms < cutMs);
}

/**
 * Each respondent's ratings rebuilt from their answers, in order, leaving out
 * the answers `drop` names (`index` counts that respondent's own answers from
 * 0). With nothing left out it reproduces what the answer route stored.
 */
export function ratingsWithoutAnswers(answers: ReplayAnswer[], drop: (a: ReplayAnswer, index: number) => boolean): { rows: ParticipantRatingRow[]; dropped: number; people: number } {
  const states = new Map<string, Map<string, GlickoState>>();
  const seen = new Map<string, number>();
  const touched = new Set<string>();
  let dropped = 0;
  for (const a of answers) {
    if (a.result !== "A" && a.result !== "B" && a.result !== "EQUAL") throw new Error(`answer result must be A, B or EQUAL, got ${JSON.stringify(a.result)}`);
    const index = seen.get(a.participantId) ?? 0;
    seen.set(a.participantId, index + 1);
    if (drop(a, index)) {
      dropped++;
      touched.add(a.participantId);
      continue;
    }
    const mine = states.get(a.participantId) ?? states.set(a.participantId, new Map()).get(a.participantId)!;
    const before = { a: mine.get(a.itemAId) ?? DEFAULT_GLICKO_STATE, b: mine.get(a.itemBId) ?? DEFAULT_GLICKO_STATE };
    const after = applyComparison(before.a, before.b, a.result);
    mine.set(a.itemAId, after.a);
    mine.set(a.itemBId, after.b);
  }
  const rows: ParticipantRatingRow[] = [];
  for (const [participantId, mine] of states) for (const [itemId, st] of mine) rows.push({ participantId, itemId, rating: st.rating, rd: st.rd });
  return { rows, dropped, people: touched.size };
}

/** Each side of a fast block's split holds at least this many timed answers. */
export const FAST_BLOCK_MIN_SEG = 8;
/** The later side is at least this much faster, on the log scale (0.5: 40% quicker). */
export const FAST_BLOCK_MIN_LOG = 0.5;
/** And the split's t statistic is at least this (it is the best of many splits, so well above 2). */
export const FAST_BLOCK_T = 4;

/**
 * Which quantile of the panel's log times at each position fastBlockStarts
 * reads against. An upper quantile, not the median: when 40% of a panel turn
 * quick at the same point (0.6x pace), they drag the median down with them and
 * hide; the 0.75 quantile stays among the honest. In the answer-time sweep
 * (docs/INFORMATION-GAIN-SELECTOR.md, "A panel curve the careless cannot drag
 * down", 2026-11-13) it raised the share of the ceiling recovered in those
 * cells from 34-85% to 79-90%, and cost nothing measurable elsewhere (within
 * 0.0001 Spearman with nobody careless or against a camp). Only the curve's
 * shape over positions matters to a split, so a constant offset from reading
 * a higher quantile cancels.
 */
export const FAST_BLOCK_CURVE_Q = 0.75;

/**
 * Which quantile of the panel's log times fastBlockStarts reads in its second and later passes, which already leave
 * out the blocks the pass before found. Once those people are out they cannot drag the median down, and the median
 * is not lifted when the panel's spread grows over the session (people who speed up or slow down on their own), as
 * an upper quantile is. In the answer-time sweep with each person's own drift at 0.6 log, it cut the honest
 * respondents flagged from 7.5% to 4.8% with nobody careless and from 8.3% to 5.2% with a careless share, at the same
 * share of the ceiling (docs/INFORMATION-GAIN-SELECTOR.md, "A later-pass curve that drift cannot lift", 2026-11-13).
 */
export const FAST_BLOCK_LATER_Q = 0.5;

/**
 * A split's step, net of the person's own straight-line trend (stepNetOfTrend), must be at least this share of the
 * gap threshold; 0 turns the test off. The step-over-line test (FAST_BLOCK_TREND_F) asks whether a step fits better
 * than a line, which a steady speed-up with a small bump in it passes; this asks whether what is left on top of the
 * line is still a block. In the answer-time sweep with each person's own drift at 0.6 log it cut honest flags from
 * 5.4% to 2.0% with a careless share and from 4.9% to 1.6% without, at the same share of the ceiling (66% against
 * 65%); with no drift it kept 97% of the ceiling against 99% (docs/INFORMATION-GAIN-SELECTOR.md, "A step net of the
 * person's own trend", 2026-11-13).
 */
export const FAST_BLOCK_NET_SHARE = 1;

/**
 * Which quantile of the panel's slow-turn scores (autoWalkMin) a block's stepOverWalk must reach, once the panel's pace
 * is seen to wander (FAST_BLOCK_WALK_ENGAGE); 0 turns the test off. A pace that wanders as a random walk is a run of
 * small steps and can hold one as large as a bored person's, which no gap, line or net-step test removes. In the
 * answer-time sweep with each person's pace wandering N(0, 0.08) log per answer it cut honest flags from 17.1% to 3.4%
 * with a careless share and from 19.5% to 4.1% without, and the Spearman cost to a panel with nobody careless from
 * 0.0045 to 0.0018; where nobody wanders it kept 96% of the ceiling against 97%, and under straight-line drift it
 * changed nothing (docs/INFORMATION-GAIN-SELECTOR.md, "A step a wandering pace cannot make", 2026-11-14).
 */
export const FAST_BLOCK_WALK_Q = 0.9;
/** The lowest bar autoWalkMin may set (0: the panel's own slow turns decide). */
export const FAST_BLOCK_WALK_FLOOR = 0;
/**
 * The panel's walk-to-noise ratio (panelWalkRatio) below which no wander bar is set. Without it the bar cost 11 points of
 * the ceiling where nobody wanders, because a large group turning quick together moves the panel's curve and makes the
 * honest look like slow turners; the pooled ratio reads 0 for such a panel (same section).
 */
export const FAST_BLOCK_WALK_ENGAGE = 0.008;

/**
 * Once the wander bar is engaged (FAST_BLOCK_WALK_ENGAGE), a split that fails it still counts when the person's picks
 * from the split on agree with the rest of the panel at least this many standard errors less than their earlier picks
 * did (blockAgreementDrop); 0 turns the test off. Timing alone is weak under a wandering pace; a careless block also
 * changes what is picked, which a wandering pace does not. In the answer-time sweep with each person's pace wandering
 * N(0, 0.08) log per answer, 2.5 raised the share of the ceiling from 19% to 27% and the careless found from 0.18 to
 * 0.24, for honest flags of 3.9% against 3.4% (4.3% against 4.1% with nobody careless, Spearman cost 0.0019 against
 * 0.0018); at walk 0.04, 51% against 46%; where nobody wanders, no change (docs/INFORMATION-GAIN-SELECTOR.md, "A block's
 * picks as well as its times", 2026-11-14). 2.0 and 1.5 found more and flagged more honest people. Needs the answers'
 * items and results; answers given as times only skip it.
 */
export const FAST_BLOCK_AGREE_Z = 2.5;

/**
 * How much less a person's picks from answer `at` on agree with the panel than their picks before it did, in standard
 * errors (positive: the later picks agree less). `rating` holds the rest of the panel's pooled rating for each item
 * (leave the person out). Each decided answer whose two items both have a rating scores agree (1 if the pick is the
 * panel's higher-rated item) minus the chance of agreeing the panel's own gap implies, 1 / (1 + 10^(-|gap| / 400)), so
 * the harder, closer pairs an adaptive selector shows late in a session do not read as a drop; the two sides' mean
 * residuals are compared with the binomial variances of those chances. Ties (EQUAL) and pairs the panel rates level are
 * skipped. 0 when either side has fewer than FAST_BLOCK_MIN_SEG scored answers.
 */
export function blockAgreementDrop(answers: { itemAId: string; itemBId: string; result: string }[], at: number, rating: Map<string, number>): number {
  const side = [{ e: 0, v: 0, n: 0 }, { e: 0, v: 0, n: 0 }];
  answers.forEach((a, i) => {
    if (a.result !== "A" && a.result !== "B") return;
    const ra = rating.get(a.itemAId), rb = rating.get(a.itemBId);
    if (ra === undefined || rb === undefined || ra === rb) return;
    const gap = (a.result === "A" ? ra - rb : rb - ra);
    const p = 1 / (1 + Math.pow(10, -Math.abs(gap) / 400));
    const s = side[i < at ? 0 : 1];
    s.e += (gap > 0 ? 1 : 0) - p;
    s.v += p * (1 - p);
    s.n++;
  });
  const [b, l] = side;
  if (b.n < FAST_BLOCK_MIN_SEG || l.n < FAST_BLOCK_MIN_SEG) return 0;
  const se = Math.sqrt(b.v / (b.n * b.n) + l.v / (l.n * l.n));
  return se > 0 ? (b.e / b.n - l.e / l.n) / se : 0;
}

/**
 * Each respondent's rest-of-panel pooled rating per item (the pool of everyone else's replayed ratings for it, as
 * groupRanking pools them), for blockAgreementDrop. Built lazily per respondent.
 */
function leaveOneOutRatings(answers: ReplayAnswer[]): (participantId: string) => Map<string, number> {
  const rows = ratingsWithoutAnswers(answers, () => false).rows.filter((r) => r.rd < DEFAULT_RD - 1e-9);
  const byItem = new Map<string, ParticipantRatingRow[]>();
  for (const r of rows) (byItem.get(r.itemId) ?? byItem.set(r.itemId, []).get(r.itemId)!).push(r);
  const cache = new Map<string, Map<string, number>>();
  return (participantId) => {
    let m = cache.get(participantId);
    if (!m) {
      m = new Map();
      for (const [itemId, list] of byItem) {
        const others = list.filter((r) => r.participantId !== participantId);
        if (others.length) m.set(itemId, pool(others).rating);
      }
      cache.set(participantId, m);
    }
    return m;
  };
}

/** Passes over the panel's curve in fastBlockStarts (each leaves out the blocks the last found). */
export const FAST_BLOCK_PASSES = 3;

/**
 * The split of a sequence of log-time residuals with the largest t between the
 * earlier and later means (each side at least `minSeg` long): where it is, its
 * t, and the gap (earlier mean minus later mean, so positive when the later
 * side is faster). Null when the sequence is too short for two sides.
 */
export function bestFastSplit(x: number[], minSeg = FAST_BLOCK_MIN_SEG): { at: number; t: number; gap: number } | null {
  const n = x.length;
  if (n < 2 * minSeg) return null;
  const pre = [0], pre2 = [0];
  for (const v of x) { pre.push(pre[pre.length - 1] + v); pre2.push(pre2[pre2.length - 1] + v * v); }
  let best: { t: number; at: number; gap: number } | null = null;
  for (let k = minSeg; k <= n - minSeg; k++) {
    const m1 = pre[k] / k, m2 = (pre[n] - pre[k]) / (n - k);
    const ss = pre2[k] - k * m1 * m1 + (pre2[n] - pre2[k]) - (n - k) * m2 * m2;
    const t = (m1 - m2) / Math.sqrt(Math.max(ss / (n - 2), 1e-12) * (1 / k + 1 / (n - k)));
    if (!best || t > best.t) best = { t, at: k, gap: m1 - m2 };
  }
  return best;
}

/**
 * Where a sequence of log-time residuals turns faster: the single split with
 * the largest t between the earlier and later means (each side at least
 * `minSeg` long), returned when the later side is at least `minLog` faster
 * and t >= `tMin`; otherwise null.
 */
export function fastBlockSplit(x: number[], minSeg = FAST_BLOCK_MIN_SEG, minLog = FAST_BLOCK_MIN_LOG, tMin = FAST_BLOCK_T, trendF = 0, netShare = 0, walkMin = 0): number | null {
  const best = bestFastSplit(x, minSeg);
  if (!best || best.t < tMin || best.gap < minLog) return null;
  if (trendF > 0 && stepOverTrend(x, best.at) < trendF) return null;
  if (netShare > 0 && stepNetOfTrend(x, best.at) < netShare * minLog) return null;
  return walkMin > 0 && stepOverWalk(x, best.at) < walkMin ? null : best.at;
}

/**
 * A per-survey bar for stepOverWalk, from the panel's own slow turns: each respondent's best slow split (the split
 * search on the negated residuals) scored by stepOverWalk, and the `q` quantile of those scores, at least `floor`.
 * Nobody careless turns slow partway through, so these show how strong a step honest wandering makes in this survey:
 * a panel whose pace holds still sets a low bar, one whose pace wanders sets a high one. With `engage` above 0 the bar
 * is 0 (no test) unless the panel's walk ratio (panelWalkRatio) reaches it, so a panel whose pace does not wander
 * keeps every block. Null when fewer than
 * AGREEMENT_MIN_RESPONDENTS sequences are long enough.
 */
export function autoWalkMin(residuals: number[][], q: number, floor = 0, engage = 0): number | null {
  if (engage > 0 && residuals.length >= AGREEMENT_MIN_RESPONDENTS && panelWalkRatio(residuals) < engage) return 0;
  const scores = residuals.map((x) => x.map((v) => -v)).map((neg) => ({ neg, b: bestFastSplit(neg) })).filter((r) => r.b !== null).map((r) => stepOverWalk(r.neg, r.b!.at));
  if (scores.length < AGREEMENT_MIN_RESPONDENTS) return null;
  return Math.max(floor, quantileOf(scores, q));
}

/**
 * The size of a step at `at` once the person's own straight-line trend is fitted alongside it: least squares of the
 * sequence on a constant, the position and a step from `at` on, returning the step's coefficient with its sign flipped
 * (earlier minus later, so positive when the later side is faster, as bestFastSplit's gap). stepOverTrend asks whether
 * a step fits better than a line; this asks how big a step is left on top of the line. Someone who speeds up steadily
 * leaves a step near zero whatever the line's slope; a bored respondent who also drifts keeps their whole step.
 * Zero when the three columns are collinear (a split at either end).
 */
export function stepNetOfTrend(x: number[], at: number): number {
  const n = x.length;
  if (at <= 0 || at >= n) return 0;
  // Centre the position and the step, then solve the 2x2 normal equations for their coefficients.
  const tBar = (n - 1) / 2, sBar = (n - at) / n, yBar = x.reduce((a, b) => a + b, 0) / n;
  let tt = 0, ss = 0, ts = 0, ty = 0, sy = 0;
  x.forEach((v, i) => {
    const t = i - tBar, s = (i >= at ? 1 : 0) - sBar, y = v - yBar;
    tt += t * t; ss += s * s; ts += t * s; ty += t * y; sy += s * y;
  });
  const det = tt * ss - ts * ts;
  if (!(det > 1e-9 * tt * ss)) return 0;
  return -(tt * sy - ts * ty) / det;
}

/**
 * The walk-to-noise variance ratios stepOverWalk profiles over: 0 (no wander), then geometric from 0.001 to about 1.
 * The sweep's walk 0.08 against 0.35 log noise is a ratio of 0.052.
 */
export const WALK_RATIOS = [0, ...Array.from({ length: 16 }, (_, i) => 0.001 * Math.pow(10, (3 * i) / 15))];

/**
 * The best Gaussian log likelihood (variance concentrated out, constants dropped) of a sequence under a local-level
 * model, a level that wanders as a random walk with innovation variance `ratio` times the noise variance, plus fixed
 * effects for the columns of `cols`, at that `ratio`. Conditioned on the first value (the level's diffuse start), so
 * it reads n - 1 innovations. The fixed effects are fitted by generalised least squares on the filtered innovations
 * (each column runs through the same Kalman filter as the data, whose gains depend only on the ratio), which is exact.
 */
function walkLogLik(x: number[], cols: number[][], ratio: number): number {
  const n = x.length, k = cols.length;
  const series = [x, ...cols];
  const a = series.map((s) => s[0]);
  let p = 1 + ratio;
  const v: number[][] = series.map(() => []);
  const f: number[] = [];
  for (let t = 1; t < n; t++) {
    const F = p + 1, K = p / F;
    f.push(F);
    for (let j = 0; j <= k; j++) { const e = series[j][t] - a[j]; v[j].push(e); a[j] += K * e; }
    p = p * (1 - K) + ratio;
  }
  const m = n - 1;
  // Weighted least squares of the data's innovations on the columns' innovations (weights 1/F), by normal equations.
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0)), xty = new Array<number>(k).fill(0);
  let yy = 0, logDet = 0;
  for (let t = 0; t < m; t++) {
    const w = 1 / f[t];
    logDet += Math.log(f[t]);
    yy += w * v[0][t] * v[0][t];
    for (let i = 0; i < k; i++) { xty[i] += w * v[i + 1][t] * v[0][t]; for (let j = 0; j < k; j++) xtx[i][j] += w * v[i + 1][t] * v[j + 1][t]; }
  }
  const beta = solveSmall(xtx, xty);
  let sse = yy;
  for (let i = 0; i < k; i++) sse -= beta[i] * xty[i];
  return -0.5 * logDet - (m / 2) * Math.log(Math.max(sse / m, 1e-12));
}

/** Solves a small symmetric system by Gaussian elimination with partial pivoting; a singular column gets 0. */
function solveSmall(A: number[][], b: number[]): number[] {
  const k = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < k; r++) if (r !== c) { const g = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= g * M[c][j]; }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[k] / r[i]));
}

/**
 * How much a panel's pace wanders: the walk-to-noise variance ratio (from WALK_RATIOS) that best fits every sequence at
 * once, each as a random walk with its own straight-line trend and no step (summed log likelihoods). One sequence of 60
 * answers rarely tells a 0.05 ratio from 0 (its own best is 0 more often than not); twenty together do. Zero for a panel
 * whose people hold still or move along lines. Sequences under 6 long are skipped.
 */
export function panelWalkRatio(seqs: number[][]): number {
  const use = seqs.filter((x) => x.length >= 6);
  if (!use.length) return 0;
  let best = -Infinity, at = 0;
  for (const r of WALK_RATIOS) {
    const ll = use.reduce((a, x) => a + walkLogLik(x, [x.map((_, i) => i)], r), 0);
    if (ll > best + 1e-9) { best = ll; at = r; }
  }
  return at;
}

/**
 * Whether a step at `at` is still worth having once the person's pace is allowed to wander: twice the gain in log
 * likelihood from adding the step to a model whose level is a random walk with a straight-line trend, each model at its
 * own best walk ratio (WALK_RATIOS, 0 included, so a person who does not wander is read as a step on a line). A pace
 * that wanders is a run of small steps, and a 40-60-answer walk can hold one as large as a bored person's; the walk
 * model absorbs that step, so the gain stays small. A bored respondent's pace holds still on either side of one step,
 * which the walk can only take as one improbably large move, so the gain is large. Zero for a split at either end.
 */
export function stepOverWalk(x: number[], at: number): number {
  const n = x.length;
  if (at <= 0 || at >= n || n < 6) return 0;
  const trend = x.map((_, i) => i), step = x.map((_, i) => (i >= at ? 1 : 0));
  let best0 = -Infinity, best1 = -Infinity;
  for (const r of WALK_RATIOS) {
    best0 = Math.max(best0, walkLogLik(x, [trend], r));
    best1 = Math.max(best1, walkLogLik(x, [trend, step], r));
  }
  return Math.max(0, 2 * (best1 - best0));
}

/**
 * stepNetOfTrend's t statistic: the step's coefficient over its standard error in the same three-column fit
 * (residual variance on n - 3 degrees of freedom). Positive when the later side is faster. Zero for a split at
 * either end or a sequence of three or fewer.
 */
export function stepNetOfTrendT(x: number[], at: number): number {
  const n = x.length;
  if (at <= 0 || at >= n || n <= 3) return 0;
  const tBar = (n - 1) / 2, sBar = (n - at) / n, yBar = x.reduce((a, b) => a + b, 0) / n;
  let tt = 0, ss = 0, ts = 0, ty = 0, sy = 0, yy = 0;
  x.forEach((v, i) => {
    const t = i - tBar, s = (i >= at ? 1 : 0) - sBar, y = v - yBar;
    tt += t * t; ss += s * s; ts += t * s; ty += t * y; sy += s * y; yy += y * y;
  });
  const det = tt * ss - ts * ts;
  if (!(det > 1e-9 * tt * ss)) return 0;
  const bT = (ss * ty - ts * sy) / det, bS = (tt * sy - ts * ty) / det;
  const sse = Math.max(yy - bT * ty - bS * sy, 0);
  const se = Math.sqrt(Math.max(sse / (n - 3), 1e-12) * (tt / det));
  return -bS / se;
}

/**
 * How much better a step at `at` fits a sequence than a straight line does: the drop in the sum of squared
 * residuals from the line to the step, over the step's residual variance (an F-like ratio; negative when the
 * line fits better). A bored respondent's block is a step; someone who speeds up steadily all session is a
 * line, and a split search alone takes a steep enough line for a block.
 */
export function stepOverTrend(x: number[], at: number): number {
  const n = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const tBar = (n - 1) / 2;
  let sxy = 0, sxx = 0, ss = 0;
  x.forEach((v, i) => { sxy += (i - tBar) * (v - mean); sxx += (i - tBar) ** 2; ss += (v - mean) ** 2; });
  const sseLine = ss - (sxx > 0 ? (sxy * sxy) / sxx : 0);
  const m1 = x.slice(0, at).reduce((a, b) => a + b, 0) / at, m2 = x.slice(at).reduce((a, b) => a + b, 0) / (n - at);
  const sseStep = x.reduce((a, v, i) => a + (v - (i < at ? m1 : m2)) ** 2, 0);
  return (sseLine - sseStep) / Math.max(sseStep / Math.max(1, n - 3), 1e-12);
}

/**
 * The lowest per-survey gap threshold autoFastBlockMinLog may pick (on the log scale; 0.4 is 33% quicker). A floor of
 * 0.3 found as many blocks but flagged up to 3.3% of honest respondents when 40% of a panel were careless; 0.4 kept
 * that to 0.6% (docs/INFORMATION-GAIN-SELECTOR.md, "A threshold from the panel's own slow turns", 2026-11-13).
 */
export const FAST_BLOCK_AUTO_FLOOR = 0.4;
/** Which quantile of the panel's mirrored (slow-turn) gaps FAST_BLOCK_AUTO reads. */
export const FAST_BLOCK_AUTO_Q = 0.9;
/** The highest per-survey gap threshold autoFastBlockMinLog may pick. */
export const FAST_BLOCK_AUTO_CAP = FAST_BLOCK_MIN_LOG;
/**
 * A split also has to fit as a step at least this much better than a straight line (stepOverTrend), so that
 * someone who speeds up steadily all session is not taken for a bored respondent. In the answer-time sweep, with
 * each person's own speed-up or slow-down drawn at 0.6 log over the session, the split alone flagged 26% of honest
 * respondents; with this test, 6-9% (same section).
 */
export const FAST_BLOCK_TREND_F = 1;

/**
 * A per-survey gap threshold for fastBlockSplit, from the panel's own residual
 * spread. Nobody careless turns slow partway through, so each respondent's
 * best *slow* turn (the same split search on the negated residuals) shows how
 * big a turn honest noise alone makes in this survey. The threshold is the
 * `q` quantile of those mirrored gaps, kept between `floor` and
 * FAST_BLOCK_MIN_LOG: a quiet panel lets the detector see a 0.6x block whose
 * gap sits near 0.5, and a noisy one (people who change pace on their own)
 * keeps the fixed 0.5. Null when fewer than AGREEMENT_MIN_RESPONDENTS
 * sequences are long enough.
 */
export function autoFastBlockMinLog(residuals: number[][], q = FAST_BLOCK_AUTO_Q, floor = FAST_BLOCK_AUTO_FLOOR, cap = FAST_BLOCK_AUTO_CAP): number | null {
  const gaps = residuals.map((x) => bestFastSplit(x.map((v) => -v))).filter((b) => b !== null).map((b) => Math.max(0, b!.gap));
  if (gaps.length < AGREEMENT_MIN_RESPONDENTS) return null;
  return Math.min(cap, Math.max(floor, quantileOf(gaps, q)));
}

/**
 * Respondents who turned quick partway through, and the answer (counting their
 * own answers from 0, in order) from which they did: a bored or tired person
 * who answers properly at first and then clicks through.
 *
 * Each timed answer is read against the panel's time at the same point in the
 * session (the FAST_BLOCK_CURVE_Q quantile of everyone's log time there,
 * smoothed by a running median over five positions), not against the
 * person's own start: everyone's first pairs are slow while they read the
 * instructions, and everyone speeds up as they learn the screen, and a split
 * against their own start takes either for a block. In the answer-time sweep
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Carelessness that starts mid-session")
 * a person-relative split cost a ranking up to 0.30 Spearman (0.40 against a
 * camp with a second taste) when everyone's first ten answers took twice as
 * long. Read against the panel it cost at most 0.0004 in every cell, flagged
 * at most 0.2% of honest respondents, and, for people who turned careless
 * halfway at 0.4x the honest time, recovered 87-105% of what leaving out
 * exactly their careless answers would (the per-answer cut: 0-93%). At 0.6x
 * it recovers 91-102% of the ceiling when a quarter of the panel has a block
 * (salience pattern) and 79-90% when 40% turn quick at the same point (the
 * median curve: 34-85%). It sees
 * nothing of carelessness spread through a session (`?drop=fast-answers` is
 * for that) or of careless answers that are no faster. A comparison, not
 * the default, until real answer times are in (flagship item c).
 *
 * Since 2026-11-13 (later) two more defaults (docs/INFORMATION-GAIN-SELECTOR.md,
 * "A threshold from the panel's own slow turns"): the gap a split needs is set
 * per survey (`minLog` "auto", autoFastBlockMinLog, between 0.4 and 0.5), and a
 * split must fit as a step at least FAST_BLOCK_TREND_F better than a straight
 * line. Where nobody changes pace on their own, the hard case (40% turning
 * quick at 0.6x) went from 86% to 99% of the ceiling for the salience pattern
 * and from 64% to 95% for random clicking; where everyone's own pace drifts
 * by 0.6 log over the session, honest flags fell from 26% to 9%.
 *
 * Since 2026-11-13 (last), the second and later passes read the median
 * (`laterQ`, FAST_BLOCK_LATER_Q) of the people the pass before did not flag,
 * not the upper quantile, which spread growing over the session lifts: with
 * each person's own pace drifting 0.6 log, honest flags fell by about a third.
 *
 * Since 2026-11-13 (latest), a split must also leave a step of at least the gap
 * threshold once the person's own straight-line trend is fitted alongside it
 * (`netShare`, FAST_BLOCK_NET_SHARE, stepNetOfTrend): under 0.6 log personal
 * drift honest flags fell from about 5% to about 2%. A pace that wanders as a
 * random walk can still hold a step of its own and is flagged more often.
 *
 * Since 2026-11-14, when the panel's pace is seen to wander (panelWalkRatio at least FAST_BLOCK_WALK_ENGAGE), a split
 * must also be a step a wandering pace would not make: its stepOverWalk score must reach the FAST_BLOCK_WALK_Q quantile
 * of the panel's own slow turns' scores (`walkQ`, autoWalkMin). Under a 0.08-log-per-answer walk honest flags fell from
 * 17% to 3.4%; where nobody wanders the test is not engaged.
 *
 * Since 2026-11-14 (later), when the answers carry their items and results (the ranking route passes them), a split
 * that fails the wander bar still counts when the person's picks from it on agree with the rest of the panel at least
 * `agreeZ` (FAST_BLOCK_AGREE_Z) standard errors less than before it (blockAgreementDrop; `agreeMode` "only" drops the
 * wander bar for the pick test, which was measured and found weaker). Under a 0.08 walk the careless found rose from
 * 0.18 to 0.24 for honest flags of 3.9% against 3.4%.
 *
 * Needs AGREEMENT_MIN_RESPONDENTS respondents with timed answers; otherwise
 * returns an empty map. Untimed answers are skipped in the reading and never
 * start a block.
 */
export function fastBlockStarts(answers: (AnswerTime & Partial<Omit<ReplayAnswer, "participantId" | "ms">>)[], curveQ = FAST_BLOCK_CURVE_Q, minLog: number | "auto" = "auto", trendF = FAST_BLOCK_TREND_F, laterQ = FAST_BLOCK_LATER_Q, netShare = FAST_BLOCK_NET_SHARE, walkQ = FAST_BLOCK_WALK_Q, walkFloor = FAST_BLOCK_WALK_FLOOR, walkEngage = FAST_BLOCK_WALK_ENGAGE, agreeZ = FAST_BLOCK_AGREE_Z, agreeMode: "or" | "only" = "or"): Map<string, number> {
  if (!(walkQ >= 0 && walkQ <= 1)) throw new Error(`walkQ must be between 0 and 1, got ${walkQ}`);
  if (!(agreeZ >= 0)) throw new Error(`agreeZ must be 0 or more, got ${agreeZ}`);
  if (agreeMode !== "or" && agreeMode !== "only") throw new Error(`agreeMode must be "or" or "only", got ${JSON.stringify(agreeMode)}`);
  // The pick test needs every answer's items and result; a list of times alone skips it.
  const withPicks = agreeZ > 0 && answers.length > 0 && answers.every((a) => typeof a.itemAId === "string" && typeof a.itemBId === "string" && typeof a.result === "string");
  const replayable = withPicks ? (answers as ReplayAnswer[]) : [];
  const ownAnswers = new Map<string, ReplayAnswer[]>();
  for (const a of replayable) (ownAnswers.get(a.participantId) ?? ownAnswers.set(a.participantId, []).get(a.participantId)!).push(a);
  const looRatings = withPicks ? leaveOneOutRatings(replayable) : null;
  if (!(netShare >= 0)) throw new Error(`netShare must be 0 or more, got ${netShare}`);
  if (!(curveQ > 0 && curveQ < 1)) throw new Error(`curveQ must be between 0 and 1, got ${curveQ}`);
  if (!(laterQ > 0 && laterQ < 1)) throw new Error(`laterQ must be between 0 and 1, got ${laterQ}`);
  if (minLog !== "auto" && !(minLog > 0)) throw new Error(`minLog must be a positive number or "auto", got ${minLog}`);
  const by = new Map<string, { index: number; ms: number }[]>();
  const seen = new Map<string, number>();
  for (const a of answers) {
    const index = seen.get(a.participantId) ?? 0;
    seen.set(a.participantId, index + 1);
    const list = by.get(a.participantId) ?? by.set(a.participantId, []).get(a.participantId)!;
    if (a.ms !== null && Number.isFinite(a.ms) && a.ms > 0 && a.ms < PACE_MAX_MS) list.push({ index, ms: a.ms });
  }
  const out = new Map<string, number>();
  const people = [...by].filter(([, l]) => l.length >= 2 * FAST_BLOCK_MIN_SEG);
  if (people.length < AGREEMENT_MIN_RESPONDENTS) return out;
  const longest = Math.max(...people.map(([, l]) => l.length));
  // Up to FAST_BLOCK_PASSES passes: each rebuilds the panel's curve without the blocks the last one found, so
  // a large share turning quick at about the same point cannot drag the curve down and hide themselves.
  const splits = new Map<string, number>();
  for (let pass = 0; pass < FAST_BLOCK_PASSES; pass++) {
    const atPos: number[] = [];
    for (let i = 0; i < longest; i++) {
      const v = people.filter(([id, l]) => l.length > i && i < (splits.get(id) ?? Infinity)).map(([, l]) => Math.log(l[i].ms));
      atPos.push(v.length ? quantileOf(v, pass === 0 ? curveQ : laterQ) : NaN);
    }
    const curve = atPos.map((_, i) => medianOf(atPos.slice(Math.max(0, i - 2), i + 3).filter(Number.isFinite)));
    const residuals = people.map(([, list]) => list.map((x, i) => Math.log(x.ms) - curve[i]));
    const gapMin = minLog === "auto" ? (autoFastBlockMinLog(residuals) ?? FAST_BLOCK_MIN_LOG) : minLog;
    const walkMin = walkQ > 0 ? (autoWalkMin(residuals, walkQ, walkFloor, walkEngage) ?? 0) : 0;
    const next = new Map<string, number>();
    people.forEach(([participantId, list], j) => {
      if (!looRatings || walkMin <= 0) {
        const split = fastBlockSplit(residuals[j], FAST_BLOCK_MIN_SEG, gapMin, FAST_BLOCK_T, trendF, netShare, walkMin);
        if (split !== null) next.set(participantId, split);
        return;
      }
      // Wander engaged and picks available: the timing candidate, then the walk bar or the pick test.
      const split = fastBlockSplit(residuals[j], FAST_BLOCK_MIN_SEG, gapMin, FAST_BLOCK_T, trendF, netShare, 0);
      if (split === null) return;
      const walkOk = agreeMode === "or" && stepOverWalk(residuals[j], split) >= walkMin;
      if (walkOk || blockAgreementDrop(ownAnswers.get(participantId) ?? [], list[split].index, looRatings(participantId)) >= agreeZ) next.set(participantId, split);
    });
    const same = next.size === splits.size && [...next].every(([id, k]) => splits.get(id) === k);
    splits.clear();
    for (const [id, k] of next) splits.set(id, k);
    if (same) break;
  }
  for (const [participantId, list] of people) if (splits.has(participantId)) out.set(participantId, list[splits.get(participantId)!].index);
  return out;
}
