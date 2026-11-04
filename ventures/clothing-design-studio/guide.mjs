/**
 * Guided wardrobe conversation: turns what a person says or types ("a
 * unisex line for women and men around 30, hot summers, smart casual,
 * premium") into a wardrobe profile, and says what it still needs to ask.
 *
 * Deterministic keyword rules, no model, nothing leaves the browser. Every
 * field it sets is reported with the words that set it, so the person can
 * check and correct it. Unknown fields keep their previous value.
 */
import { defaultProfile } from "./wardrobe.mjs";

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

/** @returns {{ profile, heard: {field, value, from}[], asks: string[] }} */
export function listen(text, previous = defaultProfile()) {
  const t = " " + String(text || "").toLowerCase().replace(/[.,;!?]/g, " ") + " ";
  const profile = { ...previous };
  const heard = [];
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

  const age = t.match(/(\d{2})\s*(?:-|to)\s*(\d{2})|around (\d{2})|aged? (\d{2})|(\d{2})\s*(?:years|yo|y\/o)|in (?:their|my) (\d)0s|(\d)0s/);
  if (age) {
    const n = age[1] ? (+age[1] + +age[2]) / 2 : +(age[3] || age[4] || age[5] || (age[6] || age[7]) * 10 + 4);
    set("ageBand", n < 25 ? "18-24" : n < 35 ? "25-34" : n < 45 ? "35-44" : "45+", age[0].trim());
  } else if (has(t, ["students", "teens", "teenagers", "gen z"])) set("ageBand", "18-24", "students");

  const occ = Object.entries(OCC).filter(([, ws]) => has(t, ws)).map(([k]) => k);
  if (occ.length) set("occasions", occ, occ.join("+"));

  const size = t.match(/(\d{1,2})\s*(?:pieces|items|garments)/);
  if (size && +size[1] >= 5 && +size[1] <= 30) set("size", +size[1], size[0].trim());

  const asks = [];
  const said = new Set(heard.map(h => h.field));
  if (!said.has("ageBand")) asks.push("About how old are the people it is for?");
  if (!said.has("fit")) asks.push("Is it for men, women, or everyone (unisex)?");
  if (!said.has("style")) asks.push("How would you describe the style: classic, streetwear, minimal, or statement (art and motifs)?");
  if (!said.has("climate") && !said.has("season")) asks.push("What is the climate and season it is for?");
  if (!said.has("occasions")) asks.push("What do they dress for: office, hands-on work, casual days, evenings out?");
  if (!said.has("tier")) asks.push("What quality tier: essential, premium or luxury?");
  return { profile, heard, asks };
}
