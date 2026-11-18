/**
 * Guided wardrobe conversation: turns what a person says or types ("a
 * unisex line for women and men around 30, hot summers, smart casual,
 * premium") into a wardrobe profile, and says what it still needs to ask.
 *
 * Deterministic keyword rules, no model, nothing leaves the browser. Every
 * field it sets is reported with the words that set it, so the person can
 * check and correct it. Unknown fields keep their previous value.
 *
 * Negated words ("nothing cheap", "not for men", "not office") are cut out
 * first (`negation.mjs`) and returned in `declined`. A declined value that is
 * the current answer is undone: a one-value field goes back to its default
 * (or stays, if the default is the declined value) and its question is asked
 * again; an occasion is taken off the list. "Skip", "not sure", "any" or "no
 * preference" in reply to a question keeps the current answer and moves on.
 */
import { defaultProfile } from "./wardrobe.mjs";
import { splitNegations } from "./negation.mjs";

const has = (t, words) => words.find(w => new RegExp(`(^|[^a-z])${w}s?([^a-z]|$)`).test(t));

const RULES = {
  fit: [["unisex", ["unisex", "gender[- ]neutral", "men and women", "women and men", "everyone", "all genders"]], ["womens", ["women", "womens", "woman", "ladies", "female", "her"]], ["mens", ["men", "mens", "man", "male", "guys", "his"]]],
  style: [["statement", ["statement", "art", "painting", "paintings", "sacred", "devotional", "religious", "bold"]], ["streetwear", ["streetwear", "street", "urban", "relaxed", "graphic", "skate"]], ["minimal", ["minimal", "minimalist", "monochrome", "quiet", "understated"]], ["classic", ["classic", "tailored", "smart", "timeless", "formal", "preppy"]]],
  climate: [["warm", ["hot", "warm", "mediterranean", "tropical", "sunny", "desert"]], ["cold", ["cold", "freezing", "nordic", "snow", "snowy", "arctic", "harsh winters"]], ["temperate", ["temperate", "mild", "oceanic", "moderate"]]],
  season: [["spring-summer", ["summer", "spring", "spring/summer", "ss"]], ["autumn-winter", ["winter", "autumn", "fall", "autumn/winter", "aw"]], ["all-year", ["all year", "all-year", "year round", "year-round", "every season"]]],
  tier: [["luxury", ["luxury", "high end", "high-end", "top quality", "designer"]], ["premium", ["premium", "mid", "mid-range", "good quality"]], ["essential", ["essential", "budget", "cheap", "basic", "affordable", "low cost", "low-cost"]]],
  source: [["partners", ["only partner", "partner brands only", "other brands only"]], ["in-house", ["only my own", "own designs only", "only our own", "in-house only"]]],
};
const OCC = { office: ["office", "work", "business", "smart"], active: ["hands-on", "outdoor", "active", "sport", "gym", "trade", "workwear"], casual: ["casual", "weekend", "everyday", "daily"], evening: ["evening", "dinner", "party", "night out", "going out", "date"] };

/** @returns {{ profile, heard: {field, value, from, kept?}[], declined: {field, value, from}[], asks: string[] }} */
export function listen(text, previous = defaultProfile(), memory = {}) {
  const raw = String(text || "").toLowerCase().replace(/’/g, "'");
  const neg = splitNegations(raw);
  const t = " " + neg.kept.replace(/[.,;!?]/g, " ") + " ";
  const profile = { ...previous };
  const heard = [];
  const declined = [];
  const set = (field, value, from) => { profile[field] = value; heard.push({ field, value, from }); };

  for (const [field, rules] of Object.entries(RULES)) {
    for (const [value, words] of rules) {
      const hit = has(t, words);
      if (hit) { set(field, value, hit); break; }
    }
  }
  // "women and men" must win over the single-gender rules above
  const both = has(t, ["men and women", "women and men", "unisex", "everyone"]);
  if (both && profile.fit !== "unisex") set("fit", "unisex", both);
  // "men ... women too" said apart is both as well.
  const w = has(t, ["women", "womens", "woman", "ladies"]), m = has(t, ["men", "mens", "man", "guys"]);
  if (!both && w && m && profile.fit !== "unisex") set("fit", "unisex", `${m} + ${w}`);

  const age = t.match(/(\d{2})\s*(?:-|to)\s*(\d{2})|around (\d{2})|aged? (\d{2})|(\d{2})\s*(?:years|yo|y\/o)|in (?:their|my) (\d)0s|(\d)0s/);
  if (age) {
    const n = age[1] ? (+age[1] + +age[2]) / 2 : +(age[3] || age[4] || age[5] || (age[6] || age[7]) * 10 + 4);
    set("ageBand", n < 25 ? "18-24" : n < 35 ? "25-34" : n < 45 ? "35-44" : "45+", age[0].trim());
  } else if (has(t, ["students", "teens", "teenagers", "gen z"])) set("ageBand", "18-24", "students");

  const occ = Object.entries(OCC).filter(([, ws]) => has(t, ws)).map(([k]) => k);
  if (occ.length) set("occasions", occ, occ.join("+"));

  const size = t.match(/(\d{1,2})\s*(?:pieces|items|garments)/);
  if (size && +size[1] >= 5 && +size[1] <= 30) set("size", +size[1], size[0].trim());

  // A bare reply to the question just asked ("30", "both") has no cue words
  // around it: read it as the answer to that question.
  const pending = memory.pending;
  if (pending === "ageBand" && !heard.some(h => h.field === "ageBand")) {
    const n = t.trim().match(/^(\d{2})$/);
    if (n) set("ageBand", +n[1] < 25 ? "18-24" : +n[1] < 35 ? "25-34" : +n[1] < 45 ? "35-44" : "45+", n[1]);
  }
  if (pending === "fit" && !heard.some(h => h.field === "fit")) {
    const w = t.trim();
    if (/^(both|all|anyone|either)$/.test(w)) set("fit", "unisex", w);
  }

  // "Skip", "not sure", "any": keep the current answer to the question asked.
  const skip = pending && !heard.some(h => h.field === pending) && raw.trim().match(/^(?:skip|pass|next|not sure|unsure|don'?t know|do not know|no idea|any|anything|whatever|doesn'?t matter|no preference|you choose|you decide|up to you)$/);
  if (skip) heard.push({ field: pending, value: profile[pending], from: skip[0], kept: true });

  // What was turned down: undo it if it is the current answer.
  const reopened = new Set();
  const DEFAULTS = defaultProfile();
  for (const { cue, words } of neg.negated) {
    const n = " " + words + " ";
    for (const [field, rules] of Object.entries(RULES)) {
      for (const [value, ws] of rules) {
        const hit = has(n, ws);
        if (!hit) continue;
        declined.push({ field, value, from: `${cue} ${words}` });
        if (profile[field] === value && !heard.some(h => h.field === field && !h.kept)) {
          if (DEFAULTS[field] !== value) profile[field] = DEFAULTS[field];
          reopened.add(field);
        }
        break;
      }
    }
    for (const o of Object.keys(OCC).filter(k => has(n, OCC[k]))) {
      declined.push({ field: "occasions", value: o, from: `${cue} ${words}` });
      profile.occasions = (profile.occasions || []).filter(x => x !== o);
    }
  }
  if (Array.isArray(profile.occasions) && !profile.occasions.length) {
    // Everything listed was turned down: fall back to what was not, and ask.
    const no = new Set(declined.filter(d => d.field === "occasions").map(d => d.value));
    const keep = DEFAULTS.occasions.filter(o => !no.has(o));
    profile.occasions = keep.length ? keep : [Object.keys(OCC).find(o => !no.has(o))];
    reopened.add("occasions");
  }

  // Questions already answered in earlier turns are not asked again.
  const answered = new Set([...(memory.answered || []), ...heard.map(h => h.field)]);
  for (const f of reopened) if (!heard.some(h => h.field === f && !h.kept)) answered.delete(f);
  if (answered.has("season") && !reopened.has("climate")) answered.add("climate");
  if (answered.has("climate") && !reopened.has("season")) answered.add("season");
  const QUESTIONS = [
    ["ageBand", "About how old are the people it is for?"],
    ["fit", "Is it for men, women, or everyone (unisex)?"],
    ["style", "How would you describe the style: classic, streetwear, minimal, or statement (art and motifs)?"],
    ["climate", "What is the climate and season it is for?"],
    ["occasions", "What do they dress for: office, hands-on work, casual days, evenings out?"],
    ["tier", "What quality tier: essential, premium or luxury?"],
  ].filter(([f]) => !answered.has(f));
  const asks = QUESTIONS.map(([, q]) => q);
  return { profile, heard, declined, asks, askFields: QUESTIONS.map(([f]) => f), answered: [...answered], pending: QUESTIONS.length ? QUESTIONS[0][0] : null };
}
