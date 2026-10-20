// @ts-check
// Seeded simulator for conversations between fictional characters.
//
// The engine is rules, not a language model: each turn it picks who speaks
// (weighted towards extraversion and whoever was just asked) and what they do
// (propose, object, concede, ask, hold, walk away...) from their trait scores
// and the state of the conversation, then writes the line from templates.
// Same seed, same cast, same transcript. Running it many times with different
// seeds gives a spread of outcomes rather than one story. The weights are
// hand-set to follow well-known tendencies; they are not fitted to data, and
// the output is a rehearsal aid, not a forecast of what real people would do.
import { rng } from "./persona.mjs";

/** @typedef {import("./persona.mjs").Persona} Persona */
/** @typedef {{ id: string, label: string, tags: string[] }} Option */
/**
 * @typedef {{
 *   id: string, kind: "negotiate", title: string, blurb: string, roles: [string, string],
 *   unit: string, step: number, seller: { target: number, floor: number }, buyer: { target: number, ceiling: number },
 *   item: string,
 * } | {
 *   id: string, kind: "decide", title: string, blurb: string, min: number, max: number,
 *   question: string, options: Option[],
 * }} Scenario
 */
/** @typedef {{ turn: number, speaker: string, move: string, text: string, offer?: number, option?: string, to?: string, tension: number }} Turn */

/** @type {Scenario[]} */
export const SCENARIOS = [
  {
    id: "salary", kind: "negotiate", title: "Salary negotiation",
    blurb: "A candidate (first character) and a hiring manager (second) settle a base salary.",
    roles: ["candidate", "hiring manager"], unit: "$", step: 1000, item: "the base salary",
    seller: { target: 125000, floor: 102000 }, buyer: { target: 98000, ceiling: 118000 },
  },
  {
    id: "freelance-rate", kind: "negotiate", title: "Freelance rate negotiation",
    blurb: "A freelancer (first character) and a client (second) agree an hourly rate.",
    roles: ["freelancer", "client"], unit: "$", step: 5, item: "the hourly rate",
    seller: { target: 130, floor: 85 }, buyer: { target: 75, ceiling: 110 },
  },
  {
    id: "used-car", kind: "negotiate", title: "Buying a used car",
    blurb: "A seller (first character) and a buyer (second) haggle over a car.",
    roles: ["seller", "buyer"], unit: "$", step: 100, item: "the price",
    seller: { target: 14500, floor: 11800 }, buyer: { target: 10500, ceiling: 13200 },
  },
  {
    id: "team-deadline", kind: "decide", title: "Team meeting: the deadline is slipping",
    blurb: "A team decides what to do about a launch that will not be ready on Friday.",
    min: 2, max: 6, question: "what to do about Friday's launch",
    options: [
      { id: "ship", label: "ship on Friday anyway and fix forward", tags: ["bold", "loose"] },
      { id: "slip", label: "move the launch back a week", tags: ["safe", "structured"] },
      { id: "cut", label: "cut scope and ship the core on Friday", tags: ["novel", "structured"] },
    ],
  },
  {
    id: "offsite", kind: "decide", title: "Planning the team offsite",
    blurb: "Colleagues pick where to hold a two-day offsite.",
    min: 2, max: 6, question: "where to hold the offsite",
    options: [
      { id: "hotel", label: "book a conference hotel in the city", tags: ["safe", "structured"] },
      { id: "cabin", label: "rent a cabin in the mountains", tags: ["novel", "bold"] },
      { id: "office", label: "stay in our own office and save the money", tags: ["safe", "loose"] },
    ],
  },
  {
    id: "chores", kind: "decide", title: "Housemates split the chores",
    blurb: "Housemates argue about keeping the shared flat clean.",
    min: 2, max: 6, question: "how to split the cleaning",
    options: [
      { id: "rota", label: "put a weekly rota on the fridge", tags: ["structured", "safe"] },
      { id: "cleaner", label: "pay a cleaner and split the cost", tags: ["novel", "loose"] },
      { id: "own-mess", label: "have everyone clean up their own mess", tags: ["loose", "bold"] },
    ],
  },
];

export const scenarioById = (/** @type {string} */ id) => SCENARIOS.find((s) => s.id === id) || null;

const first = (/** @type {Persona} */ p) => p.name.split(" ")[0];
const pick = (/** @type {() => number} */ r, /** @type {string[]} */ xs) => xs[Math.floor(r() * xs.length)];
const t01 = (/** @type {number} */ v) => v / 100;

/** @param {number} n @param {string} unit @param {number} step */
export function money(n, unit, step) {
  const v = Math.round(n / step) * step;
  return unit + v.toLocaleString("en-US");
}

// Tone added around a line, from the speaker's traits. Seeded, so stable.
/** @param {Persona} p @param {() => number} r @param {number} tension @param {string} line @param {"push" | "give" | "neutral"} kind */
function voice(p, r, tension, line, kind) {
  const t = p.traits;
  let pre = "";
  if (kind === "push" && t.agreeableness >= 65 && r() < 0.7) pre = pick(r, ["I hear you, but ", "I really do see your side. Still, ", "Sorry to push on this, but "]);
  else if (kind === "push" && t.agreeableness <= 35 && r() < 0.6) pre = pick(r, ["No. ", "Let's be straight. ", "That doesn't work for me. "]);
  else if (kind === "give" && t.agreeableness >= 65 && r() < 0.5) pre = pick(r, ["Okay, fair point. ", "That's reasonable. ", "Happy to meet you there. "]);
  if (t.neuroticism >= 65 && tension > 0.45 && r() < 0.4) pre = pick(r, ["Honestly, this is stressing me out. ", "I'm getting frustrated here. ", "Can we not go round in circles? "]) + pre;
  let out = pre && /,\s$/.test(pre) ? pre + line.charAt(0).toLowerCase() + line.slice(1) : pre + line;
  if (t.extraversion >= 75 && kind !== "neutral" && r() < 0.35) out = out.replace(/\.$/, "!");
  return out;
}

// ---------------------------------------------------------------- negotiate

/** @param {Extract<Scenario, { kind: "negotiate" }>} sc @param {Persona[]} cast @param {{ seed?: string | number, maxTurns?: number }} [opts] */
function negotiate(sc, cast, opts = {}) {
  const r = rng(`${opts.seed ?? 1}|${sc.id}|${cast.map((p) => p.id).join(",")}`);
  const [seller, buyer] = cast;
  const jitter = () => 1 + (r() - 0.5) * 0.08;
  const S = { p: seller, target: sc.seller.target * jitter(), limit: sc.seller.floor * jitter(), offer: 0, opened: 0, conceded: 0 };
  const B = { p: buyer, target: sc.buyer.target * jitter(), limit: sc.buyer.ceiling * jitter(), offer: 0, opened: 0, conceded: 0 };
  // Opening anchor: bolder for extraverted, disagreeable characters.
  const anchor = (/** @type {Persona} */ p) => 0.02 + 0.1 * (0.6 * t01(p.traits.extraversion) + 0.4 * (1 - t01(p.traits.agreeableness))) + r() * 0.03;
  S.offer = S.opened = S.target * (1 + anchor(seller));
  B.offer = B.opened = B.target * (1 - anchor(buyer));
  const maxTurns = opts.maxTurns ?? 24;
  /** @type {Turn[]} */
  const turns = [];
  let tension = 0.15;
  /** @type {{ result: "deal" | "walked away" | "no deal", price?: number, by?: string }} */
  let end = { result: "no deal" };
  const fmt = (/** @type {number} */ n) => money(n, sc.unit, sc.step);
  /** @param {Persona} p @param {string} move @param {string} text @param {number} [offer] */
  const say = (p, move, text, offer) =>
    turns.push({ turn: turns.length + 1, speaker: p.id, move, text, ...(offer != null ? { offer: Math.round(offer / sc.step) * sc.step } : {}), tension: Math.round(tension * 100) / 100 });

  say(seller, "open", voice(seller, r, tension, pick(r, [`I'm looking for ${fmt(S.offer)} for ${sc.item}.`, `Based on what I bring, ${fmt(S.offer)} is the right number.`, `My number is ${fmt(S.offer)}.`]), "push"), S.offer);
  say(buyer, "open", voice(buyer, r, tension, pick(r, [`We were thinking more like ${fmt(B.offer)}.`, `I can start at ${fmt(B.offer)}.`, `${fmt(B.offer)} is where I'd begin.`]), "push"), B.offer);

  let me = S, them = B;
  for (let i = 2; i < maxTurns; i++) {
    const p = me.p, t = p.traits;
    const isSeller = me === S;
    const theirs = them.offer;
    const acceptable = isSeller ? theirs >= me.limit : theirs <= me.limit;
    const gap = Math.abs(S.offer - B.offer) / ((S.offer + B.offer) / 2);
    // Accept when the other offer is within limits and the gap is small, or
    // when an agreeable character is close enough and tired of haggling.
    if (acceptable && (gap < 0.025 || (r() < t01(t.agreeableness) * 0.35 && gap < 0.08) || i > maxTurns - 4)) {
      say(p, "accept", voice(p, r, tension, pick(r, [`Deal. ${fmt(theirs)} it is.`, `Alright, ${fmt(theirs)} works.`, `Let's shake on ${fmt(theirs)}.`]), "give"), theirs);
      end = { result: "deal", price: theirs, by: p.id };
      break;
    }
    // Walk away: more likely when the other side is outside limits, under
    // tension, for anxious or disagreeable characters.
    const walkP = !acceptable && i > 5 ? 0.01 + 0.06 * t01(t.neuroticism) + 0.04 * (1 - t01(t.agreeableness)) + 0.12 * Math.max(0, tension - 0.5) : 0;
    if (r() < walkP) {
      say(p, "walk away", voice(p, r, tension, pick(r, ["I don't think we're going to get there. Let's leave it.", "This isn't working. I'm going to walk away.", "We're too far apart. Thanks for your time."]), "push"));
      end = { result: "walked away", by: p.id };
      break;
    }
    const roll = r();
    if (roll < 0.06 + 0.12 * t01(t.openness) * t01(t.agreeableness) + 0.05) {
      say(p, "ask", voice(p, r, tension, pick(r, ["What's driving your number?", "Help me understand what matters most to you here.", "Is there flexibility anywhere else, if not on the number?", "What would make this work for you?"]), "neutral"));
      tension = Math.max(0, tension - 0.06);
    } else {
      // Concession size: bigger for agreeable, anxious characters; smaller for
      // conscientious planners who stick to their prepared number.
      const f = 0.05 + 0.22 * t01(t.agreeableness) + 0.08 * t01(t.neuroticism) - 0.06 * t01(t.conscientiousness) + (r() - 0.5) * 0.06;
      const holdP = 0.08 + 0.3 * (1 - t01(t.agreeableness)) * (1 - gap * 3);
      let next = me.offer + (theirs - me.offer) * Math.max(0.02, f);
      next = isSeller ? Math.max(next, me.limit) : Math.min(next, me.limit);
      const atLimit = Math.abs(next - me.offer) < sc.step;
      if (atLimit || r() < holdP) {
        say(p, "hold", voice(p, r, tension, atLimit ? pick(r, [`${fmt(me.offer)} is as far as I can go.`, `I can't move from ${fmt(me.offer)}.`]) : pick(r, [`I'm staying at ${fmt(me.offer)}.`, `${fmt(me.offer)} is fair, and I'm sticking with it.`, `I need you to come ${isSeller ? "up" : "down"} to ${fmt(me.offer)}.`]), "push"), me.offer);
        tension = Math.min(1, tension + 0.08 + 0.08 * t01(them.p.traits.neuroticism));
      } else {
        me.conceded += Math.abs(next - me.offer);
        me.offer = next;
        say(p, "concede", voice(p, r, tension, pick(r, [`I could do ${fmt(next)}.`, `Let me meet you partway: ${fmt(next)}.`, `${fmt(next)}, and that's a real move.`]), "give"), next);
        tension = Math.max(0, tension - 0.03);
        if (isSeller ? S.offer <= B.offer : B.offer >= S.offer) {
          const price = (S.offer + B.offer) / 2;
          say(them.p, "accept", voice(them.p, r, tension, `Done. ${fmt(price)}.`, "give"), price);
          end = { result: "deal", price, by: them.p.id };
          break;
        }
      }
    }
    [me, them] = [them, me];
  }
  const sat = (/** @type {typeof S} */ side, /** @type {boolean} */ isSeller) => {
    if (end.result !== "deal" || end.price == null) return 0;
    const span = isSeller ? side.target - side.limit : side.limit - side.target;
    const got = isSeller ? end.price - side.limit : side.limit - end.price;
    return Math.max(0, Math.min(1, span > 0 ? got / span : 0.5));
  };
  const totalGap = S.opened - B.opened || 1;
  return {
    scenario: sc.id, kind: sc.kind, turns,
    outcome: {
      ...end,
      price: end.price != null ? Math.round(end.price / sc.step) * sc.step : undefined,
      label: end.result === "deal" ? `Deal at ${fmt(/** @type {number} */ (end.price))}` : end.result === "walked away" ? `${first(end.by === seller.id ? seller : buyer)} walked away` : "No deal: ran out of time",
      satisfaction: { [seller.id]: sat(S, true), [buyer.id]: sat(B, false) },
      conceded: { [seller.id]: S.conceded / totalGap, [buyer.id]: B.conceded / totalGap },
      limits: { [seller.id]: Math.round(S.limit / sc.step) * sc.step, [buyer.id]: Math.round(B.limit / sc.step) * sc.step },
    },
  };
}

// ------------------------------------------------------------------- decide

/** @param {Persona} p @param {Option} o @param {() => number} r */
function liking(p, o, r) {
  const t = p.traits;
  let v = r() * 0.5;
  for (const tag of o.tags) {
    if (tag === "novel") v += 0.5 * (t01(t.openness) - 0.5);
    if (tag === "safe") v += 0.5 * (0.5 - t01(t.openness)) + 0.25 * (t01(t.neuroticism) - 0.5);
    if (tag === "structured") v += 0.5 * (t01(t.conscientiousness) - 0.5);
    if (tag === "loose") v += 0.5 * (0.5 - t01(t.conscientiousness));
    if (tag === "bold") v += 0.3 * (t01(t.extraversion) - 0.5) + 0.25 * (0.5 - t01(t.neuroticism));
  }
  return v;
}

/** @param {Extract<Scenario, { kind: "decide" }>} sc @param {Persona[]} cast @param {{ seed?: string | number, maxTurns?: number }} [opts] */
function decide(sc, cast, opts = {}) {
  const r = rng(`${opts.seed ?? 1}|${sc.id}|${cast.map((p) => p.id).join(",")}`);
  const maxTurns = opts.maxTurns ?? 30;
  const prefs = new Map(cast.map((p) => [p.id, sc.options.map((o) => ({ id: o.id, v: liking(p, o, r) })).sort((a, b) => b.v - a.v)]));
  const favourite = new Map(cast.map((p) => [p.id, /** @type {{ id: string, v: number }[]} */ (prefs.get(p.id))[0].id]));
  const stance = new Map(favourite);
  // Support only counts once someone has said where they stand.
  /** @type {Set<string>} */
  const declared = new Set();
  const label = (/** @type {string} */ id) => /** @type {Option} */ (sc.options.find((o) => o.id === id)).label;
  /** @type {Turn[]} */
  const turns = [];
  let tension = 0.1;
  /** @type {string | null} */
  let proposal = null;
  /** @type {string | null} */
  let addressed = null;
  let last = "";
  const spoken = new Map(cast.map((p) => [p.id, 0]));
  /** @type {{ result: "decided" | "postponed" | "no decision", option?: string }} */
  let end = { result: "no decision" };
  const say = (/** @type {Persona} */ p, /** @type {string} */ move, /** @type {string} */ text, /** @type {{ option?: string, to?: string }} */ extra = {}) => {
    if (extra.option && move !== "summarise") declared.add(p.id);
    turns.push({ turn: turns.length + 1, speaker: p.id, move, text, ...extra, tension: Math.round(tension * 100) / 100 });
    spoken.set(p.id, /** @type {number} */ (spoken.get(p.id)) + 1);
    last = p.id;
  };
  const support = (/** @type {string} */ id) => cast.filter((p) => declared.has(p.id) && stance.get(p.id) === id).length;
  const conviction = (/** @type {Persona} */ p) => {
    const pr = /** @type {{ id: string, v: number }[]} */ (prefs.get(p.id));
    const mine = pr.find((x) => x.id === stance.get(p.id));
    const other = pr.find((x) => x.id === proposal);
    return Math.max(0, ((mine?.v ?? 0) - (other?.v ?? 0))) * (0.6 + 0.8 * (1 - t01(p.traits.agreeableness)));
  };

  for (let i = 0; i < maxTurns; i++) {
    // Who speaks: whoever was asked, else weighted by extraversion, less
    // likely to be the last speaker.
    /** @type {Persona} */
    let p;
    const asked = addressed ? cast.find((c) => c.id === addressed) : undefined;
    const wasAsked = Boolean(asked);
    if (asked) p = asked;
    else {
      const w = cast.map((c) => (c.id === last ? 0.15 : 1) * (0.25 + (t01(c.traits.extraversion)) ** 1.5 * 1.6));
      let x = r() * w.reduce((s, v) => s + v, 0);
      p = cast[cast.length - 1];
      for (let k = 0; k < cast.length; k++) { x -= w[k]; if (x <= 0) { p = cast[k]; break; } }
    }
    addressed = null;
    const t = p.traits;
    const mine = /** @type {string} */ (stance.get(p.id));
    const lead = sc.options.map((o) => o.id).sort((a, b) => support(b) - support(a))[0];

    if (!proposal) {
      proposal = mine;
      say(p, "propose", voice(p, r, tension, pick(r, [`I think we should ${label(mine)}.`, `Here's my take: ${label(mine)}.`, `My vote is to ${label(mine)}.`]), "push"), { option: mine });
      continue;
    }
    // High neuroticism under tension: venting raises the temperature.
    if (!wasAsked && tension > 0.5 && r() < 0.35 * t01(t.neuroticism)) {
      say(p, "vent", pick(r, ["We keep going round in circles and nobody is listening.", "Honestly, this is exactly why these meetings drag on.", "I'm getting really frustrated with this."]));
      tension = Math.min(1.2, tension + 0.12);
    } else if (!wasAsked && r() < 0.12 * t01(t.extraversion) * (1 - t01(t.conscientiousness)) + (tension > 0.5 ? 0.05 : 0)) {
      say(p, "digress", pick(r, ["Side note, did anyone else see the new coffee machine?", "Okay, quick joke to lower the temperature. No? Fine.", "This reminds me of last year's launch, what a mess that was."]));
      tension = Math.max(0, tension - 0.07);
    } else if (!wasAsked && r() < 0.25 * t01(t.agreeableness) * t01(t.openness) + 0.04) {
      // Ask the quietest person what they think.
      const quiet = cast.filter((c) => c.id !== p.id).sort((a, b) => /** @type {number} */ (spoken.get(a.id)) - /** @type {number} */ (spoken.get(b.id)))[0];
      if (quiet) {
        say(p, "ask", voice(p, r, tension, pick(r, [`${first(quiet)}, we haven't heard from you. What do you think?`, `${first(quiet)}, where do you land on this?`]), "neutral"), { to: quiet.id });
        addressed = quiet.id;
        tension = Math.max(0, tension - 0.04);
      }
    } else if (!wasAsked && support(lead) >= Math.ceil(cast.length * 0.6) && cast.every((c) => /** @type {number} */ (spoken.get(c.id)) > 0 || c.id === p.id) && r() < 0.25 + 0.6 * t01(t.conscientiousness) + (declared.size === cast.length ? 0.3 : 0)) {
      say(p, "summarise", voice(p, r, tension, pick(r, [`Let me sum up: most of us want to ${label(lead)}. Are we agreed?`, `So it sounds like we ${label(lead)}. Can we lock that in?`]), "neutral"), { option: lead });
      end = { result: "decided", option: lead };
      break;
    } else if (mine === proposal && declared.has(p.id)) {
      // Already on record: bring in someone who is not, or argue the case.
      const silent = cast.find((c) => c.id !== p.id && !declared.has(c.id));
      if (silent) {
        say(p, "ask", voice(p, r, tension, pick(r, [`${first(silent)}, are you okay with that?`, `${first(silent)}, what's your view?`]), "neutral"), { to: silent.id });
        addressed = silent.id;
      } else {
        say(p, "argue", voice(p, r, tension, pick(r, [`I still think this is the right call.`, `Nothing I've heard changes my mind on this.`, `We seem aligned. Let's not overthink it.`]), "push"), { option: mine });
        tension = Math.min(1.2, tension + 0.03 * (1 - t01(t.agreeableness)));
      }
    } else if (mine === proposal) {
      say(p, "support", voice(p, r, tension, pick(r, [`I agree, let's ${label(mine)}.`, `Same here: ${label(mine)}.`, `+1 to that.`]), "give"), { option: mine });
      tension = Math.max(0, tension - 0.02);
    } else if (r() < Math.min(0.9, conviction(p) * 1.4 + 0.15 * (1 - t01(t.agreeableness)))) {
      const counter = r() < 0.3 + 0.4 * t01(t.extraversion);
      if (counter) {
        proposal = mine;
        say(p, "counter", voice(p, r, tension, pick(r, [`I'd rather we ${label(mine)}.`, `What about we ${label(mine)} instead?`, `No, we should ${label(mine)}.`]), "push"), { option: mine });
      } else {
        say(p, "object", voice(p, r, tension, pick(r, [`I'm not comfortable with "${label(/** @type {string} */ (proposal))}".`, "I don't think that's the right call.", "That plan worries me."]), "push"), { option: mine });
      }
      tension = Math.min(1.2, tension + 0.05 + 0.08 * (1 - t01(t.agreeableness)) + 0.05 * t01(t.neuroticism));
    } else {
      stance.set(p.id, proposal);
      say(p, "concede", voice(p, r, tension, pick(r, [`Fine, I can live with that: ${label(proposal)}.`, `Okay, I'll go along with that.`, `Not my first choice, but I won't block it.`]), "give"), { option: proposal });
      tension = Math.max(0, tension - 0.05);
    }
    if (tension >= 1) {
      say(p, "postpone", "Let's stop here and pick this up another day.");
      end = { result: "postponed" };
      break;
    }
  }
  const option = end.option;
  const satisfaction = Object.fromEntries(cast.map((p) => {
    if (!option) return [p.id, 0];
    const pr = /** @type {{ id: string, v: number }[]} */ (prefs.get(p.id));
    const rank = pr.findIndex((x) => x.id === option);
    return [p.id, rank === 0 ? 1 : rank === 1 ? 0.5 : 0];
  }));
  return {
    scenario: sc.id, kind: sc.kind, turns,
    outcome: {
      ...end,
      label: end.result === "decided" ? `Decided: ${label(/** @type {string} */ (option))}` : end.result === "postponed" ? "Broke down: postponed" : "No decision: ran out of time",
      satisfaction,
      favourite: Object.fromEntries(favourite),
      spoken: Object.fromEntries(spoken),
    },
  };
}

/**
 * @param {Scenario} sc
 * @param {Persona[]} cast
 * @param {{ seed?: string | number, maxTurns?: number }} [opts]
 */
export function simulate(sc, cast, opts = {}) {
  if (sc.kind === "negotiate") {
    if (cast.length < 2) throw new Error(`${sc.title} needs two characters.`);
    return negotiate(sc, cast.slice(0, 2), opts);
  }
  if (cast.length < sc.min || cast.length > sc.max) throw new Error(`${sc.title} needs ${sc.min} to ${sc.max} characters.`);
  return decide(sc, cast, opts);
}

/**
 * Run the same cast many times with different seeds and summarise the spread.
 * @param {Scenario} sc @param {Persona[]} cast @param {{ runs?: number, seed?: string | number }} [opts]
 */
export function runMany(sc, cast, opts = {}) {
  if (sc.kind === "negotiate") cast = cast.slice(0, 2);
  const runs = Math.max(1, Math.min(2000, opts.runs ?? 200));
  /** @type {Record<string, number>} */
  const outcomes = {};
  const sat = Object.fromEntries(cast.map((p) => [p.id, 0]));
  const talk = Object.fromEntries(cast.map((p) => [p.id, 0]));
  /** @type {number[]} */
  const prices = [];
  let turnSum = 0, talkSum = 0;
  for (let i = 0; i < runs; i++) {
    const s = simulate(sc, cast, { seed: `${opts.seed ?? "many"}-${i}` });
    const key = s.outcome.result === "decided" ? `decided: ${s.outcome.option}` : s.outcome.result;
    outcomes[key] = (outcomes[key] || 0) + 1;
    for (const p of cast) sat[p.id] += /** @type {Record<string, number>} */ (s.outcome.satisfaction)[p.id] || 0;
    for (const t of s.turns) { talk[t.speaker] += 1; talkSum += 1; }
    if ("price" in s.outcome && typeof s.outcome.price === "number") prices.push(s.outcome.price);
    turnSum += s.turns.length;
  }
  prices.sort((a, b) => a - b);
  const q = (/** @type {number} */ f) => prices.length ? prices[Math.min(prices.length - 1, Math.floor(f * prices.length))] : null;
  return {
    runs,
    outcomes: Object.entries(outcomes).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ outcome: k, count: n, share: n / runs })),
    meanTurns: turnSum / runs,
    price: prices.length ? { p10: q(0.1), median: q(0.5), p90: q(0.9) } : null,
    perPerson: cast.map((p) => ({ id: p.id, name: p.name, satisfaction: sat[p.id] / runs, airtime: talkSum ? talk[p.id] / talkSum : 0 })),
  };
}

/** Plain-text transcript, for copying or the CLI. @param {ReturnType<typeof simulate>} s @param {Persona[]} cast */
export function transcriptText(s, cast) {
  const name = (/** @type {string} */ id) => cast.find((p) => p.id === id)?.name ?? id;
  return s.turns.map((t) => `${name(t.speaker)}: ${t.text}`).join("\n") + `\n\n[${s.outcome.label}]`;
}
