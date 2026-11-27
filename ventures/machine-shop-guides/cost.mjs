/**
 * What CMMC costs a small shop, from the Department of Defense's own estimate.
 *
 * The CMMC final rule (32 CFR part 170, 89 FR 83092, 15 Oct 2024) carries a regulatory impact
 * analysis that prices each assessment line by line: who works on it (a director, an IT
 * specialist, an external service provider), for how many hours, at what loaded rate, plus the
 * C3PAO's team for a certification assessment. It is the only published cost estimate with its
 * workings shown, and it is DoD's, not a vendor's. This module holds those lines exactly as the
 * rule prints them (fixtures/cost/89-fr-83092-cost.txt; cost.test.mjs checks every hour, rate and
 * stated total against that text) and recomputes them with the shop's own rates and its C3PAO
 * quote, over the three-year cycle.
 *
 * What the estimate leaves out, in the rule's own words: the cost "to implement the CMMC Level 1
 * or 2 security requirements, maintain implementation of these existing security requirements, or
 * remediate a plan of action for unimplemented requirements". A shop that is not already
 * compliant pays that on top, so the page asks for it as the shop's own figure and ships none.
 *
 * Pure functions; nothing is transmitted. An estimate, not a quote and not advice.
 */

/** Labor categories and hourly rates as the rule uses them (in-house rates include fringe and expenses; ESP/C3PAO include overhead and profit). */
export const ROLES = {
  director: { label: "Director (MGMT5)", rate: 190.52, kind: "in-house" },
  manager: { label: "Manager (MGMT2)", rate: 95.96, kind: "in-house" },
  it4: { label: "Staff IT specialist (IT4)", rate: 97.49, kind: "in-house" },
  it4sb: { label: "Staff IT specialist, small entity (IT4-SB)", rate: 86.24, kind: "in-house" },
  it3: { label: "Senior IT specialist (IT3)", rate: 81.96, kind: "in-house" },
  it2: { label: "IT specialist (IT2)", rate: 54.27, kind: "in-house" },
  it1: { label: "Associate IT specialist (IT1)", rate: 36.32, kind: "in-house" },
  esp: { label: "External service provider (ESP)", rate: 260.28, kind: "outsourced" },
  c3pao: { label: "C3PAO assessment team", rate: 260.28, kind: "outsourced" },
};

export const LEVELS = {
  l1: { label: "Level 1 (Self)", cycleYears: 1 },
  l2self: { label: "Level 2 (Self)", cycleYears: 3 },
  l2c3pao: { label: "Level 2 (C3PAO)", cycleYears: 3 },
};

export const SIZES = { small: "Small business", other: "Other than small" };

const P1 = "Planning and preparing for the assessment";
const P2 = "Conducting the assessment";
const P3 = "Reporting the results into SPRS";

/**
 * The rule's lines: [role, hours]. `stated` is what the rule prints: the assessment with its
 * initial affirmation, and for Level 2 the three-year figure (that plus two annual affirmations).
 * `c3pao` is the C3PAO team's hours (Level 2 (C3PAO) only).
 */
export const ESTIMATES = {
  small: {
    l1: {
      phases: [[P1, [["director", 4], ["esp", 4]]], [P2, [["director", 6], ["esp", 6]]], [P3, [["director", 2], ["esp", 2], ["it4sb", 0.08]]]],
      affirmation: [["director", 2], ["it4sb", 2.08]],
      stated: { assessment: 5977, phases: [1803, 2705, 909], affirmation: 560 },
    },
    l2self: {
      phases: [[P1, [["director", 32], ["esp", 32]]], [P2, [["director", 16], ["esp", 48]]], [P3, [["director", 4], ["esp", 8], ["it4sb", 0.08]]]],
      affirmation: [["director", 4], ["it4sb", 8.08]],
      stated: { assessment: 34277, threeYear: 37196, phases: [14426, 15542, 2851], affirmation: 1459 },
    },
    l2c3pao: {
      phases: [[P1, [["director", 54], ["esp", 40]]], [P2, [["director", 64], ["esp", 128]]], [P3, [["director", 4], ["esp", 8], ["it4sb", 0.08]]]],
      affirmation: [["director", 4], ["it4sb", 8.08]],
      c3pao: { hours: 120, team: 3 },
      stated: { assessment: 101752, threeYear: 104670, phases: [20699, 45509, 2851], affirmation: 1459, c3pao: 31234 },
    },
  },
  other: {
    l1: {
      phases: [[P1, [["director", 4], ["manager", 4]]], [P2, [["director", 6], ["it4", 6]]], [P3, [["director", 2], ["it4", 2.08]]]],
      affirmation: [["director", 2], ["it4", 2.08]],
      stated: { assessment: 4042, phases: [1146, 1728, 584], affirmation: 584 },
    },
    l2self: {
      phases: [
        [P1, [["director", 30], ["manager", 40], ["it4", 46], ["it3", 26], ["it2", 34]]],
        [P2, [["director", 24], ["manager", 24], ["it4", 56], ["it3", 56], ["it2", 56]]],
        [P3, [["director", 4], ["manager", 4], ["it4", 16], ["it3", 0.08]]],
      ],
      affirmation: [["director", 4], ["manager", 4], ["it4", 16], ["it3", 0.08]],
      stated: { assessment: 43403, threeYear: 48827, phases: [18015, 19964, 2712], affirmation: 2712 },
    },
    l2c3pao: {
      phases: [
        [P1, [["director", 32], ["manager", 64], ["it4", 72], ["it3", 40], ["it2", 58], ["it1", 16]]],
        [P2, [["director", 32], ["manager", 32], ["it4", 72], ["it3", 72], ["it2", 120]]],
        [P3, [["director", 4], ["manager", 4], ["it4", 16], ["it3", 0.08]]],
      ],
      // The rule's reaffirmation list prints the IT4 line as 8 hours but prices it at $1,560, which is
      // 16 hours, and totals $2,712 like the initial one; 16 is used so the totals match the rule's.
      affirmation: [["director", 4], ["manager", 4], ["it4", 16], ["it3", 0.08]],
      c3pao: { hours: 200, team: 5 },
      stated: { assessment: 112345, threeYear: 117768, phases: [26264, 28600, 2712], affirmation: 2712, c3pao: 52056 },
    },
  },
};

/**
 * Sentences from the rule the page quotes. page.test.mjs checks each <q> is one of these and
 * cost.test.mjs checks each is in the fixture (whitespace folded).
 */
export const QUOTES = {
  notImplement: "cost estimates are not included for an entity to implement the CMMC Level 1 or 2 security requirements, maintain implementation of these existing security requirements, or remediate a plan of action for unimplemented requirements",
  firstAttempt: "Assessment costs assume the OSA passes the assessment on the first attempt",
  outsource: "small entities are likely to outsource IT and cybersecurity to an External Service Provider (ESP)",
  espRate: "The ESP/C3PAO rate represents an estimate for outsourced labor and includes the labor rate, overhead expense, G&A expense, and profit.",
};

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const pick = (obj, key, fallback) => (Object.hasOwn(obj, key) ? obj[key] : fallback);

/** Lookups that never reach Object.prototype ("constructor", "toString"): unknown keys read as the defaults. */
export const levelOf = (key) => (Object.hasOwn(LEVELS, key) ? LEVELS[key] : LEVELS.l2c3pao);
export function estimateFor(inp) {
  const bySize = Object.hasOwn(ESTIMATES, inp.size) ? ESTIMATES[inp.size] : ESTIMATES.small;
  return Object.hasOwn(bySize, inp.level) ? bySize[inp.level] : bySize.l2c3pao;
}

export function emptyInputs() {
  return {
    size: "small",
    level: "l2c3pao",
    rates: {},          // role -> the shop's own hourly rate; blank keeps DoD's
    c3paoQuote: "",     // the C3PAO's quoted price for the assessment; blank uses DoD's hours x rate
    gapOneTime: "",     // the shop's own figure to close its gaps before the assessment
    gapYearly: "",      // the shop's own yearly running cost (MSP, tools, enclave)
  };
}

/** Coerce anything (a saved file, a query string) into inputs; unknown keys fall back to the defaults. */
export function normaliseInputs(raw = {}) {
  const base = emptyInputs();
  const r = raw && typeof raw === "object" ? raw : {};
  const size = Object.hasOwn(SIZES, r.size) ? r.size : base.size;
  const level = Object.hasOwn(LEVELS, r.level) ? r.level : base.level;
  const rates = {};
  if (r.rates && typeof r.rates === "object") for (const k of Object.keys(ROLES)) if (Object.hasOwn(r.rates, k)) rates[k] = String(r.rates[k] ?? "");
  const s = (k) => (r[k] === undefined || r[k] === null ? "" : String(r[k]));
  return { size, level, rates, c3paoQuote: s("c3paoQuote"), gapOneTime: s("gapOneTime"), gapYearly: s("gapYearly") };
}

/** Problems with what was typed; an estimate is still shown for the valid parts. */
export function checkInputs(inp) {
  const errors = [];
  for (const [k, v] of Object.entries(inp.rates)) {
    const n = num(v);
    if (n !== null && (Number.isNaN(n) || n < 0)) errors.push(`${ROLES[k].label}: enter an hourly rate of 0 or more, or leave it blank for DoD's.`);
  }
  for (const [k, label] of [["c3paoQuote", "C3PAO quote"], ["gapOneTime", "Cost to close your gaps"], ["gapYearly", "Yearly running cost"]]) {
    const n = num(inp[k]);
    if (n !== null && (Number.isNaN(n) || n < 0)) errors.push(`${label}: enter an amount of 0 or more, or leave it blank.`);
  }
  if (inp.level !== "l2c3pao" && num(inp.c3paoQuote) > 0) errors.push("A C3PAO quote only counts for Level 2 (C3PAO); it is left out here.");
  return errors;
}

/** The rate used for a role: the shop's own when it typed a valid one, DoD's otherwise. */
export function rateOf(inp, role) {
  const n = num(pick(inp.rates, role, ""));
  return n !== null && !Number.isNaN(n) && n >= 0 ? n : ROLES[role].rate;
}

const priced = (inp, lines) => lines.map(([role, hours]) => {
  const rate = rateOf(inp, role);
  return { role, label: ROLES[role].label, hours, rate, cost: Math.round(rate * hours), dod: Math.round(ROLES[role].rate * hours) };
});
const sum = (rows) => rows.reduce((a, r) => a + r.cost, 0);

/**
 * The estimate. `rows` are the rule's lines priced at the shop's rates; `years` lays out the
 * cycle (three years at every level, so the levels compare like for like: Level 1 repeats its
 * self-assessment every year, Level 2 assesses in year 1 and affirms in years 2 and 3).
 */
export function estimate(raw) {
  const inp = normaliseInputs(raw);
  const est = estimateFor(inp);
  const phases = est.phases.map(([label, lines]) => { const rows = priced(inp, lines); return { label, rows, cost: sum(rows) }; });
  const affirmRows = priced(inp, est.affirmation);
  const affirmation = sum(affirmRows);
  let c3pao = null;
  if (est.c3pao) {
    const quote = num(inp.c3paoQuote);
    const fromQuote = quote !== null && !Number.isNaN(quote) && quote >= 0;
    const rate = rateOf(inp, "c3pao");
    c3pao = { hours: est.c3pao.hours, team: est.c3pao.team, rate, fromQuote, cost: fromQuote ? Math.round(quote) : Math.round(rate * est.c3pao.hours), dod: Math.round(ROLES.c3pao.rate * est.c3pao.hours) };
  }
  const money = (k) => { const n = num(inp[k]); return n !== null && !Number.isNaN(n) && n >= 0 ? Math.round(n) : 0; };
  const gapOneTime = money("gapOneTime");
  const gapYearly = money("gapYearly");
  const assessment = phases.reduce((a, p) => a + p.cost, 0) + affirmation + (c3pao ? c3pao.cost : 0);

  const cycle = levelOf(inp.level).cycleYears;
  const years = [1, 2, 3].map((y) => {
    const assessed = (y - 1) % cycle === 0;
    const lines = [];
    if (assessed) {
      lines.push(["Assessment and its affirmation", assessment]);
    } else lines.push(["Annual affirmation", affirmation]);
    if (y === 1 && gapOneTime) lines.push(["Closing your gaps (your figure)", gapOneTime]);
    if (gapYearly) lines.push(["Running cost (your figure)", gapYearly]);
    return { year: y, lines, total: lines.reduce((a, [, v]) => a + v, 0) };
  });
  const threeYear = years.reduce((a, y) => a + y.total, 0);
  const custom = Object.keys(inp.rates).some((k) => num(inp.rates[k]) !== null && !Number.isNaN(num(inp.rates[k]))) || (c3pao?.fromQuote ?? false);
  const dodAssessment = est.phases.reduce((a, [, lines]) => a + lines.reduce((b, [r, h]) => b + Math.round(ROLES[r].rate * h), 0), 0)
    + est.affirmation.reduce((b, [r, h]) => b + Math.round(ROLES[r].rate * h), 0) + (c3pao ? c3pao.dod : 0);
  return {
    inputs: inp, level: levelOf(inp.level).label, size: Object.hasOwn(SIZES, inp.size) ? SIZES[inp.size] : SIZES.small,
    phases, affirmRows, affirmation, c3pao, assessment, gapOneTime, gapYearly,
    years, threeYear, perMonth: Math.round(threeYear / 36), custom, dodAssessment, stated: est.stated,
  };
}

export const usd = (n) => {
  const text = "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

const mdCell = (s) => String(s).replace(/[|\\`*_[\]<>]/g, (c) => "\\" + c).replace(/\r?\n/g, " ");

/** A Markdown record of the estimate, for the owner, the IT provider or a budget file. */
export function estimateToMarkdown(e, today) {
  const L = [];
  L.push(`# CMMC cost estimate: ${e.level}, ${e.size.toLowerCase()}`, "");
  L.push(`Made ${today} with the method and hours in DoD's regulatory impact analysis for the CMMC final rule (89 FR 83092, 15 Oct 2024)${e.custom ? ", priced at your own rates where you entered them" : ", at DoD's assumed rates"}. An estimate, not a quote.`, "");
  L.push("| Phase | Who | Hours | Rate | Cost |", "|---|---|---:|---:|---:|");
  for (const p of e.phases) for (const r of p.rows) L.push(`| ${mdCell(p.label)} | ${mdCell(r.label)} | ${r.hours} | ${usd(r.rate)} | ${usd(r.cost)} |`);
  for (const r of e.affirmRows) L.push(`| Affirmation in SPRS | ${mdCell(r.label)} | ${r.hours} | ${usd(r.rate)} | ${usd(r.cost)} |`);
  if (e.c3pao) L.push(`| C3PAO assessment | ${e.c3pao.fromQuote ? "Your C3PAO's quote" : `${e.c3pao.team}-person team`} | ${e.c3pao.fromQuote ? "" : e.c3pao.hours} | ${e.c3pao.fromQuote ? "" : usd(e.c3pao.rate)} | ${usd(e.c3pao.cost)} |`);
  L.push("", `**Assessment with its affirmation: ${usd(e.assessment)}**`, "");
  L.push("| Year | What | Cost |", "|---|---|---:|");
  for (const y of e.years) for (const [what, v] of y.lines) L.push(`| ${y.year} | ${mdCell(what)} | ${usd(v)} |`);
  L.push("", `**Three years: ${usd(e.threeYear)}** (about ${usd(e.perMonth)} a month)`, "");
  if (!e.gapOneTime) L.push("Not included: the cost to implement the requirements or close a POA&M. DoD's estimate assumes they are already in place.", "");
  L.push("Not legal, compliance or financial advice. Get quotes from your IT provider and an authorized C3PAO before you budget on it.");
  return L.join("\n") + "\n";
}
