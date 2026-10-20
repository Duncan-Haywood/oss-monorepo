// @ts-check
// How fictional characters are likely to get on, read from trait gaps.
// Each note names the traits behind it, so a user can see why and disagree.
// These are hand-set heuristics, not a fitted model.
import { band, conflictStyle } from "./persona.mjs";

/** @typedef {import("./persona.mjs").Persona} Persona */

/** @param {Persona} a @param {Persona} b */
export function pair(a, b) {
  const A = a.traits, B = b.traits;
  const first = (/** @type {Persona} */ p) => p.name.split(" ")[0];
  /** @type {{ kind: "friction" | "rapport", weight: number, text: string }[]} */
  const notes = [];
  const gap = (/** @type {keyof Persona["traits"]} */ k) => Math.abs(A[k] - B[k]);
  if (A.agreeableness <= 40 && B.agreeableness <= 40) notes.push({ kind: "friction", weight: 3, text: "Both are low on agreeableness: expect two hard lines and little giving way." });
  if (A.agreeableness >= 65 && B.agreeableness >= 65) notes.push({ kind: "rapport", weight: 2, text: "Both are high on agreeableness: easy rapport, but hard truths may go unsaid." });
  if (gap("agreeableness") >= 40) {
    const [hard, soft] = A.agreeableness < B.agreeableness ? [a, b] : [b, a];
    notes.push({ kind: "friction", weight: 2, text: `${first(hard)} is far blunter than ${first(soft)}; ${first(soft)} may concede more than they meant to.` });
  }
  if (gap("extraversion") >= 40) {
    const [loud, quiet] = A.extraversion > B.extraversion ? [a, b] : [b, a];
    notes.push({ kind: "friction", weight: 1, text: `${first(loud)} will take most of the airtime; ${first(quiet)}'s view may surface late or not at all.` });
  }
  if (gap("conscientiousness") >= 40) {
    const [plan, loose] = A.conscientiousness > B.conscientiousness ? [a, b] : [b, a];
    notes.push({ kind: "friction", weight: 2, text: `${first(plan)} wants a plan and dates; ${first(loose)} wants to keep it loose. Pace and detail are the likely sore point.` });
  }
  if (gap("openness") >= 40) {
    const [novel, steady] = A.openness > B.openness ? [a, b] : [b, a];
    notes.push({ kind: "friction", weight: 1, text: `${first(novel)} will push new ideas that ${first(steady)} wants proven first.` });
  }
  if (A.neuroticism >= 65 && B.neuroticism >= 65) notes.push({ kind: "friction", weight: 3, text: "Both feel pressure quickly: a small disagreement can escalate." });
  else if (A.neuroticism >= 65 || B.neuroticism >= 65) {
    const tense = A.neuroticism >= 65 ? a : b;
    const other = tense === a ? b : a;
    if (other.traits.neuroticism <= 35) notes.push({ kind: "rapport", weight: 1, text: `${first(other)}'s calm can steady ${first(tense)} when things get tense.` });
    else notes.push({ kind: "friction", weight: 1, text: `${first(tense)} feels pressure quickly; tension is likely to show first there.` });
  }
  if (A.conscientiousness >= 65 && B.conscientiousness >= 65) notes.push({ kind: "rapport", weight: 1, text: "Both like a plan: agreements between them tend to come with owners and dates." });
  if (A.openness >= 65 && B.openness >= 65) notes.push({ kind: "rapport", weight: 1, text: "Both are open to new ideas: good at finding a third option." });
  const friction = notes.filter((n) => n.kind === "friction").reduce((s, n) => s + n.weight, 0);
  const rapport = notes.filter((n) => n.kind === "rapport").reduce((s, n) => s + n.weight, 0);
  const verdict = friction - rapport >= 4 ? "high friction" : friction - rapport >= 2 ? "some friction" : rapport > friction ? "easy" : "workable";
  return { a: a.id, b: b.id, friction, rapport, verdict, notes, styles: [conflictStyle(A).style, conflictStyle(B).style] };
}

/** Expected share of speaking turns, weighted towards extraversion. */
/** @param {Persona[]} cast */
export function airtime(cast) {
  const w = cast.map((p) => 0.35 + (p.traits.extraversion / 100) ** 1.5 * 1.6);
  const sum = w.reduce((s, x) => s + x, 0) || 1;
  return cast.map((p, i) => ({ id: p.id, name: p.name, share: w[i] / sum }));
}

/** @param {Persona[]} cast */
export function group(cast) {
  const pairs = [];
  for (let i = 0; i < cast.length; i++) for (let j = i + 1; j < cast.length; j++) pairs.push(pair(cast[i], cast[j]));
  const air = airtime(cast).sort((x, y) => y.share - x.share);
  const hardest = pairs.slice().sort((x, y) => (y.friction - y.rapport) - (x.friction - x.rapport))[0] || null;
  const lowA = cast.filter((p) => band(p.traits.agreeableness) === "low").length;
  const highN = cast.filter((p) => band(p.traits.neuroticism) === "high").length;
  const highC = cast.filter((p) => band(p.traits.conscientiousness) === "high").length;
  /** @type {string[]} */
  const notes = [];
  if (air.length > 2 && air[0].share > 1.6 / air.length) notes.push(`${air[0].name.split(" ")[0]} is likely to dominate the conversation (about ${Math.round(air[0].share * 100)}% of turns).`);
  if (air.length > 1) notes.push(`${air[air.length - 1].name.split(" ")[0]} is likely to speak least; ask them directly.`);
  if (lowA >= 2) notes.push(`${lowA} low-agreeableness characters: agreement will take longer.`);
  if (highN >= 2) notes.push(`${highN} characters feel pressure quickly: watch for escalation.`);
  if (!highC && cast.length > 1) notes.push("Nobody is high on conscientiousness: a decision may end without owners or dates.");
  return { pairs, airtime: air, hardest, notes };
}
