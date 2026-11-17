// How long each answer took, so real people can settle the one thing the
// best-worst simulations could not: whether a screen of four costs more time
// than the two picks it replaces (docs/RANK-PAGE.md "Answer times").
// Pure and DOM-free; answer-time.test.mjs runs it under node --test.
import { isSetAnswer } from "./best-worst.mjs";

/** Times are whole tenths of a second; one over ten minutes is not an answer time (the tab was left open), so it is not kept. */
export const TIME_CAP_DS = 6000;
/** A person's pace counts in a team read only with at least this many timed answers of that kind. */
export const MIN_TIMED = 3;

/**
 * Tenths of a second from when a question was shown to its answer, or null
 * when it cannot be trusted: the page was hidden at some point (another tab,
 * a locked phone), the clock went backwards, or it ran past TIME_CAP_DS.
 */
export function answerTime(shownAt, answeredAt, hiddenMeanwhile = false) {
  if (hiddenMeanwhile || !Number.isFinite(shownAt) || !Number.isFinite(answeredAt)) return null;
  const ds = Math.round((answeredAt - shownAt) / 100);
  return ds < 0 || ds > TIME_CAP_DS ? null : ds;
}

/** One time in a result code: base 36 tenths, "-" for none. */
export function timeToken(t) {
  return Number.isInteger(t) && t >= 0 && t <= TIME_CAP_DS ? t.toString(36) : "-";
}

/**
 * The code's "t" field read back against its answers, or { error }. Rejected,
 * not guessed at: a list of the wrong length would pin each time on the
 * wrong answer, and a pair's time read as a screen's is the comparison this
 * field exists for.
 */
export function parseTimes(field, count) {
  if (typeof field !== "string") return { error: true };
  const parts = field.split(",");
  if (parts.length !== count) return { error: true };
  const times = [];
  for (const p of parts) {
    if (p === "-") { times.push(null); continue; }
    if (!/^[0-9a-z]{1,3}$/.test(p)) return { error: true };
    const t = parseInt(p, 36);
    if (t > TIME_CAP_DS) return { error: true };
    times.push(t);
  }
  return { times };
}

/** Times kept only when they line up one-to-one with the answers and at least one is known; otherwise none are sent. */
export function alignedTimes(answers, times) {
  return Array.isArray(times) && times.length === answers.length && times.some((t) => Number.isInteger(t)) ? times : null;
}

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * One person's pace by kind of answer: { pairs, screens }, each
 * { timed, median } with the median in seconds (null with no timed answers).
 * Ties count as pairs: a tie is an answer to a pair.
 */
export function pace(answers, times) {
  const out = { pairs: [], screens: [] };
  (alignedTimes(answers, times) ?? []).forEach((t, i) => { if (Number.isInteger(t)) out[isSetAnswer(answers[i]) ? "screens" : "pairs"].push(t / 10); });
  return Object.fromEntries(Object.entries(out).map(([k, xs]) => [k, { timed: xs.length, median: median(xs) }]));
}

/**
 * A team's pace by kind: for each kind, the people with at least MIN_TIMED
 * timed answers of it, and the median of their own medians in seconds. A
 * median of medians, so one slow person with many answers does not set it.
 */
export function teamPace(people) {
  const out = {};
  for (const kind of ["pairs", "screens"]) {
    const meds = people.map((p) => pace(p.answers, p.times)[kind]).filter((x) => x.timed >= MIN_TIMED).map((x) => x.median);
    out[kind] = { people: meds.length, median: median(meds) };
  }
  return out;
}

/**
 * Time to the stop for a list, pairs against screens: the real median
 * seconds per answer times the simulated typical number of answers to the
 * stop (the counts come from the caller's measured tables). null for a kind
 * with no timed people. `screenRatio` is seconds per screen over seconds per
 * pair: a screen replaces about pairCount / screenCount pairs, so screens win
 * on time when the ratio is below that.
 */
export function timeToStop(team, pairCount, screenCount) {
  const p = team.pairs.median, s = team.screens.median;
  return {
    pairs: p === null ? null : p * pairCount,
    screens: s === null ? null : s * screenCount,
    screenRatio: p && s !== null ? s / p : null,
    breakEven: pairCount / screenCount,
  };
}
