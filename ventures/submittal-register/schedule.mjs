// @ts-check
// Submittal schedule: when each submittal has to go in, worked back from the
// project schedule. Reads a Primavera P6 .xer export (or a CSV of activities),
// finds the first activity that installs each spec section's work, reads the
// review period from Division 01, and subtracts review time (times the number
// of review cycles allowed for) and any fabrication lead time from that
// activity's start. No dependencies; runs in the browser and in Node.

// ------------------------------------------------------------ activities

/**
 * @typedef {{ code: string, name: string, wbs: string, start: string, finish: string, milestone: boolean, done: boolean }} Activity
 * Dates are YYYY-MM-DD strings (calendar dates; times dropped).
 */

const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "").trim()); return m ? `${m[1]}-${m[2]}-${m[3]}` : ""; };

/**
 * Activities from a P6 XER export: the TASK table, WBS names from PROJWBS.
 * Start is the actual start if the activity has started, else the remaining
 * early start (restart_date), else the early start, else the planned start.
 * @param {string} text
 * @returns {{ activities: Activity[], dataDate: string, project: string }}
 */
export function readXer(text) {
  /** @type {Record<string, Record<string,string>[]>} */
  const tables = {};
  let table = "", fields = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("%T\t")) { table = raw.slice(3).trim(); tables[table] = tables[table] || []; fields = []; }
    else if (raw.startsWith("%F\t")) fields = raw.slice(3).split("\t");
    else if (raw.startsWith("%R\t") && table) {
      const v = raw.slice(3).split("\t"), row = {};
      fields.forEach((f, i) => { row[f] = v[i] ?? ""; });
      tables[table].push(row);
    }
  }
  const wbsName = new Map((tables.PROJWBS || []).map((w) => [w.wbs_id, w.wbs_name || ""]));
  const proj = (tables.PROJECT || [])[0] || {};
  const activities = (tables.TASK || []).map((t) => {
    const done = t.status_code === "TK_Complete";
    const started = done || t.status_code === "TK_Active";
    const start = day(started && t.act_start_date ? t.act_start_date : "") || day(t.restart_date) || day(t.early_start_date) || day(t.target_start_date);
    const finish = day(done ? t.act_end_date : "") || day(t.reend_date) || day(t.early_end_date) || day(t.target_end_date);
    const milestone = /Mile/.test(t.task_type || "");
    // A finish milestone carries only finish dates; its date is that finish.
    return { code: t.task_code || "", name: t.task_name || "", wbs: wbsName.get(t.wbs_id) || "", start: start || (milestone ? finish : ""), finish, milestone, done };
  }).filter((a) => a.start);
  return { activities, dataDate: day(proj.last_recalc_date || proj.next_data_date || ""), project: proj.proj_short_name || "" };
}

/** Split one CSV line (quotes, doubled quotes). */
function csvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}

/** A date written as YYYY-MM-DD, M/D/YYYY or D-Mon-YY(YY) to YYYY-MM-DD; "" if unreadable. */
export function parseDate(s) {
  s = String(s || "").trim().replace(/\s+\d{1,2}:\d{2}.*$/, "").replace(/\s*A$/, "");
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s))) return iso(year(+m[3]), +m[1], +m[2]);
  const MON = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
  if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ,]+(\d{2,4})$/.exec(s))) { const mo = MON.indexOf(m[2].toLowerCase()) + 1; if (mo) return iso(year(+m[3]), mo, +m[1]); }
  return "";
}
const year = (y) => (y < 100 ? 2000 + y : y);
const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "");

/**
 * Activities from a CSV (a P6 or Microsoft Project export to Excel saved as
 * CSV, or a hand list). Needs a name column and a start column; an ID, WBS
 * and finish column are used when present.
 * @param {string} text
 * @returns {{ activities: Activity[], dataDate: string, project: string }}
 */
export function readActivityCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { activities: [], dataDate: "", project: "" };
  const head = csvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (...re) => head.findIndex((h) => re.some((r) => r.test(h)));
  const iName = col(/^(activity |task )?name$/, /description/, /^activity$/, /^task$/);
  const iStart = col(/^(early |planned |baseline |)start( date)?$/, /start/);
  const iCode = col(/^(activity |task )?id$/, /code/, /^unique id$/);
  const iWbs = col(/wbs/, /^outline/);
  const iFin = col(/^(early |planned |)finish( date)?$/, /finish|end/);
  if (iName < 0 || iStart < 0) throw new Error("The schedule CSV needs an activity name column and a start column.");
  const activities = [];
  for (const l of lines.slice(1)) {
    const v = csvLine(l);
    const start = parseDate(v[iStart]);
    if (!start || !(v[iName] || "").trim()) continue;
    activities.push({ code: iCode >= 0 ? (v[iCode] || "").trim() : "", name: v[iName].trim(), wbs: iWbs >= 0 ? (v[iWbs] || "").trim() : "", start, finish: iFin >= 0 ? parseDate(v[iFin]) : "", milestone: false, done: false });
  }
  return { activities, dataDate: "", project: "" };
}

/** XER if it looks like one, else CSV. */
export function readSchedule(text) {
  return /^ERMHDR/.test(text.replace(/^﻿/, "")) || /^%T\t/m.test(text) ? readXer(text) : readActivityCsv(text);
}

// ------------------------------------------------------------ matching

/**
 * Words that name the work of a MasterFormat section in activity names, keyed
 * by the section number's first four digits (level 3, "0714"), with the
 * level-2 group ("0710") and the division ("07") as fallbacks. Written for this tool from the MasterFormat titles and the trade
 * names schedulers use; measured in eval/schedule-match-2026-11-22.md.
 */
export const WORK_TERMS = {
  "0310": ["formwork", "shuttering", "shutters", "forms"],
  "0320": ["rebar", "reinforcement", "reinforcing", "steel bars"],
  "0330": ["pile cap", "pile caps", "lift core", "lift pit", "elevator pit", "lift shaft", "concrete", "pour", "cast", "slab", "footing", "footings", "foundation", "foundations", "sog", "raft", "columns", "beams", "walls"],
  "0335": ["concrete finish", "floor finish", "power float", "screed"],
  "0341": ["precast", "hollow core", "hollowcore"],
  "0352": ["foam concrete", "lightweight concrete", "lightweight fill"],
  "0354": ["screed", "underlayment", "self-leveling", "self leveling"],
  "0420": ["masonry", "block", "blockwork", "blocks", "cmu", "brick", "brickwork"],
  "0440": ["stone", "stonework", "cladding stone"],
  "0512": ["structural steel", "steel structure", "steel erection", "steel frame", "steelwork", "steel works"],
  "0521": ["joist", "joists"],
  "0531": ["metal deck", "steel deck", "decking"],
  "0540": ["light gauge", "cold-formed", "cold formed", "metal framing"],
  "0550": ["metal works", "metalwork", "metal fabrications", "misc metal", "miscellaneous metal", "embeds", "bracket"],
  "0551": ["stair", "stairs", "metal stairs"],
  "0552": ["handrail", "handrails", "railing", "railings", "balustrade"],
  "0610": ["carpentry", "blocking", "wood framing", "framing", "sheathing"],
  "0617": ["trusses", "truss", "glulam"],
  "0640": ["millwork", "joinery", "casework", "woodwork", "cabinets", "vanity", "vanities"],
  "0710": ["waterproofing", "water proofing", "waterproof", "damp proofing", "dampproofing", "tanking"],
  "0721": ["insulation", "thermal insulation"],
  "0727": ["air barrier", "vapor barrier", "vapour barrier"],
  "0740": ["cladding", "metal panels", "wall panels", "facade", "acp"],
  "0750": ["roofing", "roof membrane", "roof insulation", "roof waterproofing"],
  "0754": ["roofing", "roof membrane", "tpo", "epdm"],
  "0760": ["flashing", "flashings", "sheet metal", "gutters"],
  "0771": ["roof hatch", "roof accessories"],
  "0784": ["firestop", "firestopping", "fire stopping", "fire sealant"],
  "0792": ["sealant", "sealants", "caulking", "joint sealant"],
  "0811": ["doors", "door", "frames", "door frames", "hollow metal"],
  "0814": ["doors", "door", "wood doors"],
  "0831": ["access panels", "access doors"],
  "0833": ["rolling shutter", "roller shutter", "overhead door", "coiling door"],
  "0841": ["storefront", "entrances", "glazing", "aluminum works", "aluminium works"],
  "0844": ["curtain wall", "curtainwall", "glazing", "facade", "glass facade"],
  "0851": ["windows", "window"],
  "0871": ["door hardware", "ironmongery", "hardware"],
  "0880": ["glazing", "glass", "mirrors"],
  "0891": ["louvers", "louvres"],
  "0921": ["gypsum", "drywall", "gypsum board", "partitions", "partition"],
  "0922": ["metal studs", "studs", "metal framing", "ceiling framing"],
  "0923": ["plaster", "plastering", "render"],
  "0924": ["plaster", "plastering", "render", "stucco"],
  "0929": ["gypsum", "drywall", "gypsum board", "partitions", "partition"],
  "0930": ["tile", "tiles", "tiling", "ceramic", "porcelain"],
  "0951": ["ceiling", "ceilings", "false ceiling", "acoustic ceiling", "suspended ceiling"],
  "0954": ["ceiling", "ceilings", "specialty ceiling"],
  "0960": ["flooring", "floor finishes", "floors"],
  "0962": ["flooring", "wood flooring", "parquet"],
  "0965": ["vinyl", "resilient", "flooring", "rubber flooring", "lvt", "vct"],
  "0966": ["terrazzo"],
  "0967": ["epoxy flooring", "epoxy floor", "resinous", "floor coating"],
  "0968": ["carpet", "carpeting"],
  "0972": ["wall covering", "wallcovering", "wallpaper"],
  "0977": ["wall panels", "frp"],
  "0990": ["paint", "painting", "putty", "primer", "coating", "coatings"],
  "0991": ["paint", "painting", "putty", "primer", "coating"],
  "0996": ["coating", "coatings", "high performance coatings"],
  "1011": ["whiteboards", "markerboards", "visual display"],
  "1014": ["signage", "signs", "wayfinding"],
  "1021": ["toilet partitions", "toilet compartments", "cubicles", "cubicle"],
  "1026": ["wall protection", "corner guards", "wall guards", "crash rails"],
  "1028": ["toilet accessories", "washroom accessories", "bath accessories"],
  "1044": ["extinguisher", "extinguishers", "fire extinguisher"],
  "1051": ["lockers"],
  "1056": ["shelving", "storage"],
  "1221": ["blinds"],
  "1224": ["window shades", "shades", "roller blinds"],
  "1235": ["casework", "kitchen cabinets", "lab casework"],
  "1101": ["window washing", "window cleaning", "bmu", "gondola"],
  "1420": ["elevator", "elevators", "lift", "lifts"],
  "1430": ["escalator", "escalators"],
  "2110": ["fire suppression", "fire fighting", "firefighting", "fire protection"],
  "2111": ["fire water", "fire main", "fire pump"],
  "2112": ["standpipe", "standpipes", "fire hose"],
  "2113": ["sprinkler", "sprinklers", "fire fighting", "firefighting"],
  "2130": ["fire pump", "fire pumps"],
  "2207": ["plumbing insulation", "pipe insulation"],
  "2211": ["water supply", "domestic water", "water piping", "plumbing", "water pipe", "water pipes"],
  "2213": ["drainage", "sanitary", "soil", "waste", "sewer", "drain"],
  "2214": ["storm drainage", "rainwater", "roof drains", "storm"],
  "2233": ["water heaters", "water heater"],
  "2240": ["plumbing fixtures", "sanitary ware", "sanitaryware", "fixtures", "wc"],
  "2242": ["plumbing fixtures", "sanitary ware", "sanitaryware", "fixtures"],
  "2305": ["hvac", "mechanical"],
  "2307": ["duct insulation", "pipe insulation", "insulation"],
  "2309": ["bms", "hvac controls", "building management", "ddc", "temperature controls", "building automation"],
  "2321": ["chw", "chilled water", "hot water piping", "hydronic", "hvac piping"],
  "2331": ["duct", "ducts", "ductwork", "duct work"],
  "2333": ["dampers", "duct accessories", "fire dampers"],
  "2334": ["fans", "exhaust fans", "fan"],
  "2337": ["grilles", "diffusers", "registers"],
  "2364": ["chiller", "chillers"],
  "2365": ["cooling tower", "cooling towers"],
  "2373": ["ahu", "ahus", "air handling", "air handlers"],
  "2381": ["split units", "package units", "rooftop units", "rtu", "vrf"],
  "2382": ["fcu", "fan coil", "fan coils", "unit heaters"],
  "2605": ["cable", "cables", "cabling", "wiring", "conduit", "conduits", "electrical"],
  "2609": ["lighting control", "lighting controls"],
  "2622": ["transformers", "transformer"],
  "2624": ["panelboard", "panelboards", "electrical panel", "distribution board", "switchboard", "switch board", "db", "smdb", "mdb", "switchgear"],
  "2627": ["wiring devices", "sockets", "switches", "outlets", "receptacles"],
  "2632": ["generator", "generators", "genset"],
  "2636": ["ats", "transfer switch"],
  "2641": ["lightning protection", "lighting protection"],
  "2651": ["lighting", "light fixtures", "luminaires", "light fittings", "ceiling rose"],
  "2656": ["exterior lighting", "street lighting", "site lighting"],
  "2710": ["data", "structured cabling", "telecom", "voice and data", "low current"],
  "2741": ["audio visual", "av", "audio-visual"],
  "2751": ["public address", "pa system"],
  "2813": ["access control"],
  "2823": ["cctv", "video surveillance"],
  "2831": ["fire alarm", "fire alarms", "fire detection"],
  "3110": ["clearing", "grubbing", "site clearance"],
  "3120": ["earthwork", "earthworks", "excavation", "backfill", "back filling", "backfilling", "fill", "embankment", "grading"],
  "3123": ["excavation", "backfill", "fill", "trench", "trenching"],
  "3125": ["erosion", "silt fence"],
  "3131": ["termite", "anti-termite", "soil treatment"],
  "3150": ["shoring", "excavation support", "sheet piles"],
  "3162": ["piles", "piling", "driven piles"],
  "3163": ["piles", "piling", "bored piles", "caissons"],
  "3211": ["subbase", "base course", "aggregate base"],
  "3212": ["asphalt", "paving", "bituminous", "wearing course"],
  "3213": ["concrete paving", "rigid pavement", "pavement"],
  "3216": ["curbs", "kerbs", "curb", "kerb", "sidewalk", "sidewalks"],
  "3217": ["road markings", "pavement markings", "markings", "striping"],
  "3231": ["fence", "fencing", "gates"],
  "3232": ["retaining wall", "retaining walls", "mse wall"],
  "3284": ["irrigation"],
  "3290": ["landscaping", "landscape", "planting", "softscape"],
  "3292": ["turf", "grass", "seeding", "sodding"],
  "3311": ["water main", "water distribution", "water line"],
  "3331": ["sewer", "sanitary sewer", "manholes"],
  "3341": ["storm drainage", "storm sewer", "culvert", "culverts"],
  "3371": ["power lines", "ductbank", "electrical utilities", "duct bank"],
};

/** Words that make an activity a paperwork or procurement step, not the work itself. */
const NOT_WORK = /\b(submit\w*|submission|approv\w*|review\w*|procure\w*|purchas\w*|order\w*|tender\w*|award\w*|shop drawings?|design\w*|mock[- ]?ups?|samples?|ncr|rfi|permit\w*|inspection request|handover|hand over|snag\w*|punch\w*|testing and commissioning|t&c|investigation\w*|survey\w*|scaf+old\w*|de-?shutter\w*|vo\d*|pco\d*|variation\w*|change order|changes to|additional works?|rationali[sz]\w*|e\.?i\.? ?no)\b/i;
const STOP = new Set("and or of for the to in on at with by a an system systems general work works installation installations equipment materials material miscellaneous common basic requirements results section products product specialty specialties assemblies assembly units unit type types".split(" "));

const norm = (s) => " " + String(s || "").toLowerCase().replace(/\bpre[- ]cast\b/g, "precast").replace(/[_/\\,;:()\[\]"'.+-]+/g, " ").replace(/\s+/g, " ").trim() + " ";
const sing = (w) => (w.length < 4 ? w : w.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/([^sui])s$/, "$1"));
/** Normalised and plural-folded, padded with spaces, so a phrase test is one includes().
 * Text in parentheses is dropped: schedules put the location there ("Sprinkler
 * pipe (Locker RM)"), and a room name is not the work. */
const fold = (s) => " " + norm(String(s || "").replace(/\([^)]*\)?/g, " ")).trim().split(" ").map(sing).join(" ") + " ";
/** Folded activity names, computed once per activity. */
const FOLDED = new WeakMap();
const folded = (act) => {
  let f = FOLDED.get(act);
  if (!f) FOLDED.set(act, (f = { name: fold(act.name), wbs: fold(act.wbs) }));
  return f;
};
/** Does the folded text contain this phrase (also folded) as whole words? */
const has = (folded, phrase) => phrase.length > 2 && folded.includes(phrase);

/** The spec section number in the shapes schedulers write it: "09 91 23", "099123", "09-91-23", "09.91.23". */
function sectionPattern(num) {
  const d = num.replace(/\D/g, "").slice(0, 6);
  if (d.length < 6) return null;
  return new RegExp(`(^|[^0-9])${d.slice(0, 2)}[ .-]?${d.slice(2, 4)}[ .-]?${d.slice(4, 6)}([^0-9]|$)`);
}

/** Work words for a section: its four-digit and two-digit keys, then the title's own words. */
export function termsFor(number, title) {
  const d = String(number).replace(/\D/g, "");
  // The level-3 key ("0714"), then its level-2 group ("0710", MasterFormat's
  // 07 10 00 covers 07 11 to 07 19), then the division ("07").
  const key = [d.slice(0, 4), d.slice(0, 3) + "0", d.slice(0, 2)].find((k) => WORK_TERMS[k]) || "";
  const listed = key ? WORK_TERMS[key] : [];
  const uniq = (a) => [...new Set(a.map(fold))];
  const L = uniq(listed);
  const own = uniq(norm(title).trim().split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w))).filter((w) => !L.includes(w));
  return { key, listed: L, own };
}

/**
 * Score one activity for one section. Section number in the activity's ID or
 * name: 100. Otherwise 3 per listed work phrase it contains (multi-word
 * phrases 4) and 1 per title word, counted on the activity name (WBS name
 * words count half).
 */
export function scoreActivity(act, pat, terms) {
  if (pat && (pat.test(act.code) || pat.test(act.name))) return { score: 100, basis: "spec number" };
  const { name, wbs } = folded(act);
  let score = 0; const hits = [];
  for (const t of terms.listed) {
    const w = t.trim().includes(" ") ? 4 : 3;
    if (has(name, t)) { score += w; hits.push(t.trim()); } else if (has(wbs, t)) { score += w / 2; hits.push(t.trim() + " (WBS)"); }
  }
  for (const t of terms.own) if (has(name, t)) { score += 1; hits.push(t.trim()); }
  return { score, basis: hits.join(", ") };
}

/** Score from the listed work phrases alone, on the activity name. */
function listedScore(act, terms) {
  const { name } = folded(act);
  let n = 0;
  for (const t of terms.listed) if (has(name, t)) n += t.trim().includes(" ") ? 4 : 3;
  return n;
}

const KEY_TERMS = Object.entries(WORK_TERMS).map(([k, list]) => [k, [...new Set(list.map(fold))]]);
/** The WORK_TERMS key whose listed phrases an activity name scores highest on. */
function tradeOf(act) {
  const { name } = folded(act);
  let best = null;
  for (const [k, list] of KEY_TERMS) {
    let n = 0;
    for (const t of list) if (has(name, t)) n += t.trim().includes(" ") ? 4 : 3;
    if (n && (!best || n > best.score)) best = { key: k, score: n };
  }
  return best;
}

/**
 * The activity each section's submittals are needed for: among activities
 * that do the work (not milestones, not submit/approve/procure steps), those
 * scoring at least 3 and within the best score's band (the top score minus
 * 1), and of those the earliest start, since the first install is what a
 * late submittal holds up.
 * @param {{number: string, title: string}[]} sections
 * @param {Activity[]} activities
 */
export function matchSections(sections, activities, pins = {}) {
  const byCode = new Map(activities.map((a) => [a.code, a]));
  const work = activities.filter((a) => !a.milestone && !NOT_WORK.test(a.name));
  const trade = new Map(work.map((a) => [a, tradeOf(a)]));
  /** @type {Map<string, {activity: Activity, basis: string, score: number, candidates: number} | null>} */
  const out = new Map();
  for (const s of sections) {
    const pinned = pinFor(pins, s.number);
    if (pinned && byCode.has(pinned)) { out.set(s.number, { activity: byCode.get(pinned), basis: "pinned by you", score: 1000, candidates: 1 }); continue; }
    const pat = sectionPattern(s.number);
    const terms = termsFor(s.number, s.title);
    let best = 0; const scored = [];
    for (const a of work) {
      const r = scoreActivity(a, pat, terms);
      // An activity that reads more like another division's work ("Chilled
      // water pit concrete" for a piping section) is that division's.
      const t = trade.get(a);
      if (r.score < 100 && t && t.key !== terms.key && t.score > listedScore(a, terms)) continue;
      if (r.score >= 3) { scored.push({ a, ...r }); if (r.score > best) best = r.score; }
    }
    const band = scored.filter((x) => x.score >= Math.max(3, best - 1));
    if (!band.length) { out.set(s.number, null); continue; }
    band.sort((x, y) => (x.a.start < y.a.start ? -1 : x.a.start > y.a.start ? 1 : y.score - x.score));
    out.set(s.number, { activity: band[0].a, basis: band[0].basis, score: band[0].score, candidates: band.length });
  }
  return out;
}

/**
 * Pins from "09 68 00=A1230, 08 71=A2040": a section (or a prefix of one) to
 * the activity ID whose start it is needed by. The longest prefix wins.
 * @param {string} s
 * @returns {Record<string, string>}
 */
export function parsePins(s) {
  const out = {};
  for (const part of String(s || "").split(/[,;\n]+/)) {
    const m = /^\s*([\d .]+?)\s*[=:]\s*(\S.*?)\s*$/.exec(part);
    if (m) out[m[1].replace(/\D/g, "")] = m[2];
  }
  return out;
}
function pinFor(pins, number) {
  const d = number.replace(/\D/g, "");
  let best = "";
  for (const p of Object.keys(pins)) if (d.startsWith(p) && p.length > best.length) best = p;
  return best ? pins[best] : "";
}

// ------------------------------------------------------------ Division 01 review period

const WORDNUM = { five: 5, seven: 7, ten: 10, fourteen: 14, fifteen: 15, twenty: 20, "twenty-one": 21, thirty: 30, "forty-five": 45, sixty: 60 };

/**
 * The review period the book's Division 01 sets: the first sentence in a
 * section 01 3x xx (submittal procedures) that pairs "review" with "N days",
 * else the first such sentence anywhere in Division 01.
 * @param {{text: string, page: number}[]} lines all lines of the book
 * @returns {{ days: number, working: boolean, text: string, page: number } | null}
 */
export function readReviewPeriod(lines) {
  const found = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    const sec = /^\s*SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})/i.exec(t);
    if (sec) section = sec[1] + sec[2];
    if (!/^01/.test(section)) continue;
    const s = (t + " " + (lines[i + 1]?.text || "")).replace(/\s+/g, " ");
    if (!/review/i.test(s)) continue;
    const m = /(?:allow|within|of|least|minimum of|period of)\s+(?:\[\s*)?(\d{1,3}|[a-z]+(?:-[a-z]+)?)(?:\s*\])?(?:\s*\[[^\]]*\])*\s*(?:\(\d+\)\s*)?(working|business|calendar)?\s*days?\b/i.exec(s);
    if (!m) continue;
    const n = /^\d+$/.test(m[1]) ? +m[1] : WORDNUM[m[1].toLowerCase()];
    if (!n || n > 90) continue;
    if (!/review/i.test(s.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120))) continue;
    found.push({ days: n, working: /working|business/i.test(m[2] || ""), text: s.trim().slice(0, 200), page: lines[i].page, pref: /^013/.test(section) ? 0 : 1 });
  }
  found.sort((a, b) => a.pref - b.pref);
  const f = found[0];
  return f ? { days: f.days, working: f.working, text: f.text, page: f.page } : null;
}

// ------------------------------------------------------------ dates

const toUtc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
/** Date minus n days; working days skip Saturdays and Sundays (no holidays). */
export function minusDays(d, n, working = false) {
  let ms = toUtc(d);
  if (!working) return fromUtc(ms - n * 864e5);
  while (n > 0) { ms -= 864e5; const w = new Date(ms).getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return fromUtc(ms);
}

/**
 * Lead times per section prefix from "05 12=56, 08 71 00=70, 26=90" (days).
 * The longest matching prefix wins.
 */
export function parseLeadTimes(s) {
  /** @type {[string, number][]} */
  const out = [];
  for (const part of String(s || "").split(/[,;\n]+/)) {
    const m = /^\s*([\d .]+?)\s*[=:]\s*(\d+)\s*$/.exec(part);
    if (m) out.push([m[1].replace(/\D/g, ""), +m[2]]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
}
const leadFor = (leads, number) => { const d = number.replace(/\D/g, ""); const hit = leads.find(([p]) => d.startsWith(p)); return hit ? hit[1] : 0; };

/**
 * Put dates on a register.
 * Action and informational submittals: Submit By = the matched activity's
 * start - lead time - review days x cycles. Closeout submittals (O&M,
 * warranties, as-builts, extra stock): due before the schedule's last finish,
 * less one review period.
 * @param {{items: any[], sections: {number: string, title: string}[], lines?: any[]}} register
 * @param {{activities: Activity[], dataDate?: string}} schedule
 * @param {{ reviewDays?: number, working?: boolean, cycles?: number, leadTimes?: string, pins?: string, review?: ReturnType<typeof readReviewPeriod> }} [opts]
 */
export function scheduleRegister(register, schedule, opts = {}) {
  const review = opts.review === undefined ? null : opts.review;
  const reviewDays = opts.reviewDays ?? review?.days ?? 14;
  const working = opts.working ?? review?.working ?? false;
  const cycles = Math.max(1, opts.cycles ?? 2);
  const leads = parseLeadTimes(opts.leadTimes);
  const sections = register.sections.filter((s) => register.items.some((i) => i.section === s.number));
  const matches = matchSections(sections, schedule.activities, parsePins(opts.pins));
  const lastFinish = schedule.activities.reduce((m, a) => (a.finish > m ? a.finish : m), "");
  const dataDate = schedule.dataDate || "";
  let dated = 0, late = 0;
  const rows = register.items.map((it) => {
    const m = matches.get(it.section);
    const lead = leadFor(leads, it.section);
    let needBy = "", submitBy = "", activity = null, basis = "";
    if (it.phase === "Closeout") {
      if (lastFinish) { needBy = lastFinish; submitBy = minusDays(lastFinish, reviewDays, working); basis = "closeout: last finish in the schedule"; }
    } else if (m) {
      activity = m.activity; basis = m.basis;
      needBy = m.activity.start;
      submitBy = minusDays(minusDays(needBy, lead, false), reviewDays * cycles, working);
    }
    if (submitBy) dated++;
    const isLate = !!(submitBy && dataDate && submitBy < dataDate);
    if (isLate) late++;
    return { ...it, needBy, submitBy, leadDays: lead, activityCode: activity?.code || "", activityName: activity?.name || "", match: basis, late: isLate };
  });
  const unmatched = sections.filter((s) => !matches.get(s.number)).map((s) => ({ number: s.number, title: s.title }));
  return {
    rows,
    reviewDays, working, cycles, dataDate, lastFinish,
    reviewSource: opts.reviewDays != null ? "set by you" : review ? `Division 01, page ${review.page}: "${review.text}"` : "assumed (no review period found in Division 01)",
    summary: { items: rows.length, dated, late, sections: sections.length, matchedSections: sections.length - unmatched.length, unmatched },
  };
}

// ------------------------------------------------------------ output

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const SCHEDULE_COLUMNS = ["Submittal No.", "Spec Section", "Section Title", "Submittal Type", "SD", "Phase", "Title", "Description", "Approval", "Flags", "Page", "Submit By", "Need By", "Activity ID", "Activity", "Matched On", "Review Days", "Review Cycles", "Lead Days", "Late at Data Date", "Status", "Date Submitted", "Date Returned", "Action"];

/** The register with dates, soonest first, as CSV. */
export function scheduleCsv(sched) {
  const rows = [SCHEDULE_COLUMNS];
  const sorted = [...sched.rows].sort((a, b) => (a.submitBy || "9999") < (b.submitBy || "9999") ? -1 : (a.submitBy || "9999") > (b.submitBy || "9999") ? 1 : a.id < b.id ? -1 : 1);
  for (const r of sorted) rows.push([r.id, r.section, r.sectionTitle, r.type, r.sd, r.phase, r.label, r.description, r.approval, (r.flags || []).join(" "), r.filePage ?? r.page, r.submitBy, r.needBy, r.activityCode, r.activityName, r.match, sched.reviewDays + (sched.working ? " working" : ""), sched.cycles, r.leadDays || "", r.late ? "yes" : "", "", "", "", ""]);
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Plain-text summary for the CLI. */
export function scheduleReport(sched) {
  const s = sched.summary;
  const out = [`Dated ${s.dated} of ${s.items} submittals; ${s.matchedSections} of ${s.sections} sections matched to an activity`];
  out.push(`Review: ${sched.reviewDays} ${sched.working ? "working" : "calendar"} days x ${sched.cycles} cycle(s), ${sched.reviewSource}`);
  if (sched.dataDate) out.push(`Data date ${sched.dataDate}: ${s.late} submittal(s) already past their submit-by date`);
  const bySec = new Map();
  for (const r of sched.rows) if (r.activityName && !bySec.has(r.section)) bySec.set(r.section, r);
  for (const r of [...bySec.values()].sort((a, b) => (a.submitBy < b.submitBy ? -1 : 1)).slice(0, 25)) out.push(`  ${r.submitBy}  ${r.section} ${r.sectionTitle.slice(0, 34).padEnd(34)} <- ${r.activityCode} ${r.activityName.slice(0, 50)} (${r.needBy}; ${r.match})`);
  if (s.unmatched.length) out.push(`No activity found for ${s.unmatched.length} section(s): ${s.unmatched.slice(0, 15).map((u) => u.number).join(", ")}${s.unmatched.length > 15 ? ", ..." : ""}`);
  return out.join("\n");
}
