// @ts-check
// Fictional characters with a Big Five personality profile.
//
// Every character here is made up: a seeded name, a role, five trait scores
// (0-100) and a profile read off those scores. Nothing is looked up, fetched or
// inferred about a real person, and checkFictional() refuses the inputs that
// would point at one (profile links, @handles, emails, phone numbers).
// The descriptions are tendencies from the trait bands, not predictions: the
// same scores can belong to very different people.

/** @typedef {{ openness: number, conscientiousness: number, extraversion: number, agreeableness: number, neuroticism: number }} Traits */
/** @typedef {{ id: string, name: string, role: string, age: number, traits: Traits, note?: string }} Persona */

export const TRAITS = /** @type {const} */ (["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"]);

export const TRAIT_LABELS = {
  openness: "Openness",
  conscientiousness: "Conscientiousness",
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  neuroticism: "Neuroticism",
};

// Small seeded PRNG (mulberry32) so a seed always gives the same cast and run.
/** @param {string | number} seed */
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Invented first and last names, combined at random. Any match with a real
// person is a coincidence of common names, which is why the page says so.
const FIRST = ["Ava", "Bram", "Cleo", "Dario", "Esme", "Femi", "Greta", "Hugo", "Ines", "Jory", "Kaia", "Linus", "Mira", "Nico", "Odette", "Pax", "Quinn", "Rosa", "Sami", "Tova", "Ulric", "Vera", "Wren", "Xavi", "Yara", "Zeke"];
const LAST = ["Ashgrove", "Brightwater", "Calloway", "Duskmere", "Elderby", "Fernhollow", "Glassford", "Harrowgate", "Ivybridge", "Juniper", "Kestrel", "Larkspur", "Merriweather", "Northcott", "Oakhaven", "Pemberly", "Quillfeather", "Rookwood", "Silverdale", "Thistlewood", "Underhill", "Vantablack", "Westerly", "Yarrow"];
const ROLES = ["product manager", "sales lead", "engineer", "designer", "operations manager", "finance analyst", "founder", "recruiter", "teacher", "nurse", "chef", "consultant"];

const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(100, Math.round(n)));

/** Roughly bell-shaped score around 50, so most random characters are not extremes. */
function score(/** @type {() => number} */ r) {
  return clamp(((r() + r() + r()) / 3) * 100);
}

/**
 * @param {{ seed?: string | number, name?: string, role?: string, traits?: Partial<Traits>, note?: string }} [opts]
 * @returns {Persona}
 */
export function makePersona(opts = {}) {
  const seed = opts.seed ?? Math.random().toString(36).slice(2);
  const r = rng(seed);
  const name = opts.name?.trim() || `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
  const role = opts.role?.trim() || ROLES[Math.floor(r() * ROLES.length)];
  const age = 22 + Math.floor(r() * 40);
  /** @type {Traits} */
  const traits = { openness: 0, conscientiousness: 0, extraversion: 0, agreeableness: 0, neuroticism: 0 };
  for (const t of TRAITS) traits[t] = clamp(opts.traits?.[t] ?? score(r));
  const p = { id: `p-${String(seed).replace(/[^\w-]/g, "").slice(0, 24) || "x"}`, name, role, age, traits };
  return opts.note ? { ...p, note: opts.note } : p;
}

/** @param {string | number} seed @param {number} n */
export function makeCast(seed, n) {
  const used = new Set();
  /** @type {Persona[]} */
  const cast = [];
  for (let i = 0; cast.length < n && i < n * 20; i++) {
    const p = makePersona({ seed: `${seed}-${i}` });
    if (used.has(p.name.split(" ")[0])) continue;
    used.add(p.name.split(" ")[0]);
    cast.push(p);
  }
  return cast;
}

/** @param {number} v */
export function band(v) {
  return v >= 67 ? "high" : v <= 33 ? "low" : "mid";
}

// What each band tends to look like in conversation. Phrased as tendencies.
const READS = {
  openness: {
    high: "Reaches for new ideas and reframes the problem; can find the safe option dull.",
    mid: "Open to a new idea once it has a reason behind it.",
    low: "Prefers what has worked before and wants proof before trying something new.",
  },
  conscientiousness: {
    high: "Wants a plan, dates and owners; notices loose ends and missed details.",
    mid: "Organised enough, flexible when the plan changes.",
    low: "Improvises, moves on before details are settled, dislikes process for its own sake.",
  },
  extraversion: {
    high: "Speaks first and often, thinks out loud, fills silences.",
    mid: "Joins in readily but does not need the floor.",
    low: "Speaks less and later; says more in writing or one to one.",
  },
  agreeableness: {
    high: "Looks for common ground, softens bad news, concedes to keep the peace.",
    mid: "Cooperative, but will push back on what matters to them.",
    low: "Blunt, sceptical of others' motives, comfortable holding a hard line.",
  },
  neuroticism: {
    high: "Feels pressure quickly; tension shows and can escalate under stress.",
    mid: "Steady most of the time, rattled by real setbacks.",
    low: "Calm under pressure; hard to provoke.",
  },
};

/**
 * Conflict style on the Thomas-Kilmann grid, read from two axes the Big Five
 * approximate: assertiveness (extraversion, low agreeableness) and
 * cooperativeness (agreeableness). A heuristic mapping, not a validated one.
 * @param {Traits} t
 */
export function conflictStyle(t) {
  const assert = 0.6 * t.extraversion + 0.4 * (100 - t.agreeableness);
  const coop = 0.75 * t.agreeableness + 0.25 * t.openness;
  if (Math.abs(assert - 50) < 9 && Math.abs(coop - 50) < 9) return { style: "compromising", assert: Math.round(assert), coop: Math.round(coop), why: "middling on both axes: splits the difference" };
  if (assert >= 50 && coop >= 50) return { style: "collaborating", assert: Math.round(assert), coop: Math.round(coop), why: "pushes for an outcome and wants it to work for everyone" };
  if (assert >= 50) return { style: "competing", assert: Math.round(assert), coop: Math.round(coop), why: "pushes for their own outcome" };
  if (coop >= 50) return { style: "accommodating", assert: Math.round(assert), coop: Math.round(coop), why: "gives way to keep the relationship" };
  return { style: "avoiding", assert: Math.round(assert), coop: Math.round(coop), why: "steps back from the disagreement" };
}

/** @param {Persona} p */
export function profile(p) {
  const t = p.traits;
  const reads = TRAITS.map((k) => ({ trait: k, score: t[k], band: band(t[k]), text: READS[k][band(t[k])] }));
  const conflict = conflictStyle(t);
  /** @type {string[]} */
  const tips = [];
  if (t.conscientiousness >= 67) tips.push("Bring specifics: numbers, dates, who does what.");
  if (t.conscientiousness <= 33) tips.push("Lead with the big picture; send details afterwards.");
  if (t.extraversion <= 33) tips.push("Ask them directly, and give them time or a written follow-up.");
  if (t.extraversion >= 67) tips.push("Let them talk it through, then summarise what was decided.");
  if (t.agreeableness <= 33) tips.push("Expect pushback; argue from evidence, not from feelings.");
  if (t.agreeableness >= 67) tips.push("Check that a quick yes is a real yes; they may not say no.");
  if (t.neuroticism >= 67) tips.push("Lower the stakes: say what is not at risk before what is.");
  if (t.openness >= 67) tips.push("Frame a change as an experiment worth trying.");
  if (t.openness <= 33) tips.push("Show where it has worked before.");
  if (!tips.length) tips.push("Middling on every trait: few strong levers either way.");
  /** @type {string[]} */
  const stressors = [];
  if (t.neuroticism >= 60) stressors.push("uncertainty and open-ended deadlines");
  if (t.conscientiousness >= 60) stressors.push("sloppy work and missed commitments");
  if (t.agreeableness >= 60) stressors.push("open conflict");
  if (t.agreeableness <= 40) stressors.push("being told what to do without reasons");
  if (t.extraversion >= 60) stressors.push("being left out of the conversation");
  if (t.extraversion <= 40) stressors.push("being put on the spot");
  if (t.openness >= 60) stressors.push("routine and 'we have always done it this way'");
  if (t.openness <= 40) stressors.push("change for its own sake");
  return { reads, conflict, tips, stressors };
}

// Trait-descriptive adjectives (after the Big Five adjective-marker tradition,
// written fresh here) so a sentence like "an anxious, blunt planner" sets
// traits without a model. Each word nudges one trait up (+) or down (-).
/** @type {Record<string, [keyof Traits, number]>} */
const LEXICON = {};
const add = (/** @type {keyof Traits} */ t, /** @type {number} */ dir, /** @type {string} */ words) => {
  for (const w of words.split(/\s+/)) LEXICON[w] = [t, dir];
};
add("openness", 1, "creative curious imaginative inventive artistic original unconventional adventurous visionary philosophical experimental innovative");
add("openness", -1, "traditional conventional conservative practical cautious routine set-in-their-ways old-fashioned literal");
add("conscientiousness", 1, "organised organized disciplined careful thorough punctual reliable meticulous methodical diligent planner perfectionist detail-oriented efficient");
add("conscientiousness", -1, "disorganised disorganized messy careless sloppy spontaneous impulsive procrastinator scatterbrained late chaotic forgetful");
add("extraversion", 1, "outgoing talkative sociable energetic loud bold chatty gregarious enthusiastic charismatic assertive extrovert extroverted lively");
add("extraversion", -1, "quiet shy reserved introverted introvert withdrawn solitary private reticent soft-spoken");
add("agreeableness", 1, "kind warm friendly cooperative trusting generous gentle empathetic helpful polite patient diplomatic accommodating easygoing considerate");
add("agreeableness", -1, "blunt stubborn critical rude cold competitive harsh suspicious argumentative cynical demanding abrasive tough hard-nosed ruthless");
add("neuroticism", 1, "anxious nervous moody insecure worried tense irritable volatile emotional stressed jumpy touchy defensive hot-headed");
add("neuroticism", -1, "calm relaxed stable composed unflappable steady secure even-tempered resilient laid-back");

/**
 * Set trait scores from words in a free-text description. Each matched word
 * moves its trait 22 points from 50 (more for "very"/"extremely", less for
 * "a bit"/"slightly"); traits no word mentions stay at the base value.
 * @param {string} text
 * @param {Partial<Traits>} [base]
 */
export function traitsFromText(text, base = {}) {
  const words = String(text).toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/).filter(Boolean);
  /** @type {Record<string, number>} */
  const delta = {};
  /** @type {{ word: string, trait: keyof Traits, dir: number }[]} */
  const matched = [];
  words.forEach((w, i) => {
    const hit = LEXICON[w];
    if (!hit) return;
    const prev = words[i - 1] || "";
    const neg = prev === "not" || prev === "never" || words[i - 2] === "not";
    const mult = /^(very|extremely|really|super|deeply|highly)$/.test(prev) ? 1.5 : /^(bit|slightly|somewhat|fairly)$/.test(prev) ? 0.5 : 1;
    const dir = (neg ? -hit[1] : hit[1]) * mult;
    delta[hit[0]] = (delta[hit[0]] || 0) + dir;
    matched.push({ word: w, trait: hit[0], dir: Math.sign(dir) });
  });
  /** @type {Traits} */
  const traits = { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 };
  for (const t of TRAITS) traits[t] = delta[t] != null ? clamp(50 + 22 * Math.max(-2, Math.min(2, delta[t]))) : clamp(base[t] ?? 50);
  return { traits, matched };
}

const REAL_PERSON_SIGNS = [
  { re: /\b(?:https?:\/\/|www\.)\S+/i, why: "a web link" },
  { re: /\b(?:linkedin|instagram|facebook|tiktok|twitter|x\.com|threads\.net|snapchat|reddit)\b/i, why: "a social-media profile" },
  { re: /(?:^|\s)@[A-Za-z0-9_.]{2,}/, why: "an @handle" },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, why: "an email address" },
  { re: /\+?\d[\d\s().-]{8,}\d/, why: "a phone number" },
];

/**
 * The simulator is for invented characters. Refuse inputs that point at a
 * real person's accounts or contact details. Names and prose cannot be
 * checked against reality, so the page also asks the user to invent them.
 * @param {string} text
 * @returns {{ ok: true } | { ok: false, why: string }}
 */
export function checkFictional(text) {
  for (const s of REAL_PERSON_SIGNS) if (s.re.test(String(text))) return { ok: false, why: `This looks like ${s.why}. The simulator only builds invented characters, so it does not take profile links, handles or contact details. Describe the character in your own words instead.` };
  return { ok: true };
}
