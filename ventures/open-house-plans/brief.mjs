// @ts-check
// The design brief: what a person or an agent asks for. Every field is
// optional; normalizeBrief fills defaults, clamps ranges and reports what it
// changed, so an agent can send a partial brief and read back what was used.

import { STYLES, STYLE_NAMES } from "./styles.mjs";

export const DEFAULT_AREA = [420, 650, 950, 1350, 1750, 2150]; // by bedrooms, conditioned sq ft
export const DEFAULT_BATHS = [1, 1, 1, 2, 2.5, 3];
export const BATHS = [1, 1.5, 2, 2.5, 3, 3.5];

export const DEFAULTS = {
  name: "",
  beds: 3,
  baths: null, // null = DEFAULT_BATHS[beds]
  area: null, // target conditioned floor area, sq ft; null = DEFAULT_AREA[beds]
  style: "farmhouse",
  priority: "balanced", // budget | balanced | beauty
  garage: 0, // 0, 1 or 2 cars, attached
  porch: "auto", // auto (the style decides) | true | false
  foundation: "slab", // slab | crawl
  frame: "advanced", // advanced (2x6 @ 24 in) | conventional (2x4 @ 16 in)
  accessible: false, // wider doors and hall, a turning circle in one bath, no-step entry
  split: "auto", // primary suite apart from the other bedrooms: auto | true | false
  maxWidth: null, // ft, the house and garage along the street
  maxDepth: null, // ft, the house plus porch front to back
  lot: null, // { width, depth, front, side, rear } in ft; sets maxWidth and maxDepth
  snow: 30, // roof snow load, psf on plan
  wind: 115, // basic wind speed, mph
  finish: "standard", // basic | standard | premium
  region: 1.0, // cost multiplier against the US average
  ceiling: null, // ft; null = the style's
  variant: 0, // 0 = best design; 1, 2, ... = the runners-up
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Fill defaults and clamp. Returns { brief, notes } where notes lists every change made. */
export function normalizeBrief(input = {}) {
  const notes = [];
  const b = { ...DEFAULTS };
  for (const [k, v] of Object.entries(input || {})) {
    if (k === "text") continue;
    if (!(k in DEFAULTS)) { notes.push(`ignored unknown field "${k}"`); continue; }
    if (v !== undefined) b[k] = v;
  }
  const num = (k, lo, hi, int = false) => {
    if (b[k] === null) return;
    let v = Number(b[k]);
    if (!Number.isFinite(v)) { notes.push(`${k}: "${b[k]}" is not a number, used ${DEFAULTS[k]}`); b[k] = DEFAULTS[k]; return; }
    if (int) v = Math.round(v);
    const c = clamp(v, lo, hi);
    if (c !== v) notes.push(`${k}: ${v} is outside ${lo} to ${hi}, used ${c}`);
    b[k] = c;
  };
  num("beds", 0, 5, true);
  if (b.baths === null) b.baths = DEFAULT_BATHS[b.beds];
  num("baths", 1, 3.5);
  const rb = Math.round(b.baths * 2) / 2;
  if (rb !== b.baths) notes.push(`baths: rounded ${b.baths} to ${rb}`);
  b.baths = rb;
  if (b.beds === 0 && b.baths > 1) { notes.push(`baths: a studio has one bath, used 1`); b.baths = 1; }
  if (b.beds <= 1 && b.baths > 1.5) { notes.push(`baths: ${b.baths} is more than a ${b.beds}-bedroom plan holds, used 1.5`); b.baths = 1.5; }
  if (b.beds === 2 && b.baths > 2.5) { notes.push(`baths: used 2.5 for two bedrooms`); b.baths = 2.5; }
  if (b.area === null) b.area = DEFAULT_AREA[b.beds];
  num("area", 300, 3200);
  const minArea = [300, 480, 700, 950, 1250, 1550][b.beds] + (b.baths - 1) * 40;
  if (b.area < minArea) { notes.push(`area: ${b.area} sq ft is too small for ${b.beds} bedrooms and ${b.baths} baths, used ${minArea}`); b.area = minArea; }
  if (!STYLE_NAMES.includes(b.style)) { notes.push(`style: "${b.style}" is not one of ${STYLE_NAMES.join(", ")}; used farmhouse`); b.style = "farmhouse"; }
  /** @type {[string, string[]][]} */
  const choices = [["priority", ["budget", "balanced", "beauty"]], ["foundation", ["slab", "crawl"]], ["frame", ["advanced", "conventional"]], ["finish", ["basic", "standard", "premium"]]];
  for (const [k, opts] of choices) {
    if (!opts.includes(b[k])) { notes.push(`${k}: "${b[k]}" is not one of ${opts.join(", ")}; used ${DEFAULTS[k]}`); b[k] = DEFAULTS[k]; }
  }
  num("garage", 0, 2, true);
  for (const k of ["porch", "split"]) {
    if (b[k] === "true") b[k] = true;
    if (b[k] === "false") b[k] = false;
    if (![true, false, "auto"].includes(b[k])) { notes.push(`${k}: used "auto"`); b[k] = "auto"; }
  }
  b.accessible = String(b.accessible) === "true";
  num("snow", 0, 100);
  num("wind", 85, 180);
  num("region", 0.5, 2.5);
  if (b.ceiling !== null) num("ceiling", 8, 10);
  num("variant", 0, 20, true);
  if (b.lot) {
    const { width, depth, front = 25, side = 5, rear = 20 } = b.lot;
    if (Number(width) > 0) {
      const w = Number(width) - 2 * Number(side);
      b.maxWidth = b.maxWidth === null ? w : Math.min(b.maxWidth, w);
      notes.push(`lot: ${width} ft wide less ${side} ft side setbacks leaves ${w} ft`);
    }
    if (Number(depth) > 0) {
      const d = Number(depth) - Number(front) - Number(rear);
      b.maxDepth = b.maxDepth === null ? d : Math.min(b.maxDepth, d);
      notes.push(`lot: ${depth} ft deep less ${front} ft front and ${rear} ft rear setbacks leaves ${d} ft`);
    }
  }
  if (b.maxWidth !== null) num("maxWidth", 16, 200);
  if (b.maxDepth !== null) num("maxDepth", 16, 200);
  b.name = String(b.name || "").slice(0, 80);
  return { brief: b, notes };
}

/** @type {{ style: [RegExp, string][] }} */
const WORDS = {
  style: [
    [/farm ?house/, "farmhouse"], [/craftsman|bungalow/, "craftsman"], [/modern|contemporary|shed roof/, "modern"],
    [/ranch|rambler/, "ranch"], [/cottage|storybook|tudor/, "cottage"], [/minimal|simple|budget|cheap|affordable|starter/, "minimal"],
  ],
};

/**
 * Read a plain-English request into a brief, e.g. "3 bed 2 bath craftsman,
 * about 1400 sq ft, two-car garage, 50 ft lot". Deterministic keyword rules,
 * no model: an agent with a language model should write the JSON brief itself.
 * Returns { brief, matched } where matched lists what each phrase set.
 */
export function parseBrief(text) {
  const t = ` ${String(text || "").toLowerCase().replace(/[–—]/g, "-")} `;
  const out = {};
  const matched = [];
  const set = (k, v, why) => { out[k] = v; matched.push(`${why} -> ${k}: ${JSON.stringify(v)}`); };
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, single: 1, double: 2 };
  const n = (s) => (s in words ? words[s] : Number(s));
  let m;
  if ((m = t.match(/(\d|one|two|three|four|five)[ -]?(?:bed(?:room)?s?|br|bd)\b/))) set("beds", n(m[1]), m[0].trim());
  else if (/\bstudio\b/.test(t)) set("beds", 0, "studio");
  if ((m = t.match(/(\d(?:\.5)?|one|two|three)[ -]?(?:full )?(?:bath(?:room)?s?|ba)\b/))) set("baths", n(m[1]), m[0].trim());
  if ((m = t.match(/(\d[\d,]{2,5})\s*(?:sq\.? ?ft|sf|square ?feet|square ?foot|ft2|sqft)/))) set("area", Number(m[1].replace(/,/g, "")), m[0].trim());
  for (const [re, style] of WORDS.style) if (re.test(t)) { set("style", style, t.match(re)[0]); break; }
  if ((m = t.match(/(\d|one|two|single|double)[ -]?(?:car|bay) garage/))) set("garage", Math.min(2, n(m[1])), m[0].trim());
  else if (/no garage/.test(t)) set("garage", 0, "no garage");
  else if (/garage/.test(t)) set("garage", 2, "garage");
  if (/budget|cheap|afford|low[- ]cost|cost[- ]effective|inexpensive|starter/.test(t)) set("priority", "budget", "cost words");
  else if (/beautiful|gorgeous|stunning|charming|elegant|curb appeal/.test(t)) set("priority", "beauty", "beauty words");
  if (/luxur|premium|high[- ]end/.test(t)) set("finish", "premium", "luxury words");
  else if (/basic finish|builder grade/.test(t)) set("finish", "basic", "basic finish");
  if (/accessib|wheelchair|aging in place|universal design|\bada\b|no[- ]step/.test(t)) set("accessible", true, "accessibility words");
  if (/crawl ?space|raised floor/.test(t)) set("foundation", "crawl", "crawlspace");
  else if (/\bslab\b/.test(t)) set("foundation", "slab", "slab");
  if (/no porch/.test(t)) set("porch", false, "no porch");
  else if (/porch/.test(t)) set("porch", true, "porch");
  if (/split[- ]bed|split plan|primary suite apart|master apart/.test(t)) set("split", true, "split bedrooms");
  if ((m = t.match(/(\d{2,3})\s*(?:ft|foot|feet|')?\s*(?:x|by)\s*(\d{2,3})\s*(?:ft|foot|feet|')?\s*lot/))) set("lot", { width: Number(m[1]), depth: Number(m[2]) }, m[0].trim());
  else if ((m = t.match(/(\d{2,3})[ -]?(?:ft|foot|feet|')[ -]?(?:wide )?lot/))) set("lot", { width: Number(m[1]) }, m[0].trim());
  if ((m = t.match(/(\d{2,3})\s*psf snow/))) set("snow", Number(m[1]), m[0].trim());
  else if (/heavy snow|snowy|mountain/.test(t)) set("snow", 50, "heavy snow");
  if (/\badu\b|backyard cottage|granny flat|in-law/.test(t) && out.beds === undefined) set("beds", 1, "ADU");
  if (/advanced framing|\bove\b/.test(t)) set("frame", "advanced", "advanced framing");
  else if (/2x4/.test(t)) set("frame", "conventional", "2x4");
  if ((m = t.match(/(9|10)[ -]?(?:ft|foot|')\s*ceilings?/))) set("ceiling", Number(m[1]), m[0].trim());
  return { brief: out, matched };
}

export function styleOf(brief) {
  return STYLES[brief.style];
}
