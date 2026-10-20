// Deterministic pay-range job-posting reference engine.
//
// What this is: (1) a text-pattern detector that looks at a job posting's
// own wording and reports whether it appears to state a numeric pay RANGE,
// a single figure, or no dollar amount at all, and (2) a lookup table of
// which US jurisdictions currently require a posted pay range in a job ad,
// with the effective date and a size threshold where this build is
// confident of one. Neither half is a compliance determination for any
// specific posting -- see the "How this can be wrong" section in
// why-pay-range-laws-differ-by-state.html and the no-warranty clause on
// every page. This engine exists to make the *reference lookup and text
// scan* instant and consistent, not to replace reading the actual statute,
// checking the state labor agency's current guidance, or asking a lawyer.
//
// Scope, stated once so every caller inherits it rather than re-deriving it:
//   - Covers only the requirement to state a pay range IN the job posting
//     itself. Several other jurisdictions (Connecticut, Nevada, Rhode
//     Island, and others) require disclosure at a *different* point in the
//     process -- upon request, before an interview, or after an offer --
//     rather than in the ad, and are deliberately not modeled here; a
//     posting-scan tool would give a false "not required" reading for a
//     rule that fires at a different moment entirely.
//   - State/DC level only. A growing number of *cities and counties* run
//     their own, separate posting ordinances with their own thresholds
//     (e.g. Cincinnati, Toledo, Columbus, and Jersey City) -- this table
//     does not include them, and a posting can be state-law-clear while
//     still needing a local check this tool does not do.
//   - "Requires a range" here means the jurisdiction's law, as commonly
//     summarized by employment-law publishers, requires the ad to state a
//     good-faith range. It does not encode every carve-out (e.g. some
//     states exempt commission-only or certain government roles) --
//     those are noted only where this build is confident of the general
//     shape, never asserted as complete.
//   - A reference table, not a guarantee. Effective dates, thresholds, and
//     even which jurisdictions have a law at all change with each
//     legislative session -- this table was last checked against public
//     summaries in September 2026 (see `LAST_CHECKED`) and will drift.
//
// Sourcing: effective dates and thresholds below were cross-checked against
// multiple current (2026) employment-law-firm and HR-vendor summaries
// during this build; none is a pinpoint citation to a specific subsection,
// because getting a *pinpoint* citation wrong reads as more authoritative
// than getting the *existence/date/threshold* wrong, and only the latter is
// something this build can stand behind at moderate confidence. Every entry
// below names the public act/law by its common name so a reader can search
// for the current text themselves.

export const LAST_CHECKED = "2026-09-24";

const RANGE = "range-required";
const NONE = "no-posting-requirement";

// name -> { type, law, effective, threshold, thresholdConfident, note? }
const JURISDICTION_TABLE = {
  Colorado: {
    type: RANGE,
    law: "Equal Pay for Equal Work Act (Colo. Rev. Stat. § 8-5-201 et seq.)",
    effective: "2021-01-01",
    threshold: "All employers with at least one Colorado employee",
    thresholdConfident: true,
    note: "A fully remote posting that could be performed from Colorado is commonly treated as covered even if the employer has no Colorado office -- this is the rule that produced the once-common \"not open to Colorado applicants\" workaround.",
  },
  California: {
    type: RANGE,
    law: "Cal. Lab. Code § 432.3 (as amended by SB 1162)",
    effective: "2023-01-01",
    threshold: "15+ employees, at least one in California",
    thresholdConfident: true,
  },
  Washington: {
    type: RANGE,
    law: "Equal Pay and Opportunities Act, RCW 49.58.110 (as amended by SB 5761)",
    effective: "2023-01-01",
    threshold: "15+ employees",
    thresholdConfident: true,
  },
  "New York": {
    type: RANGE,
    law: "N.Y. Lab. Law § 194-b",
    effective: "2023-09-17",
    threshold: "4+ employees",
    thresholdConfident: true,
    note: "New York City has run its own, earlier posting ordinance (Local Law 32 of 2022, same 4+ threshold) since 2022-11-01; the statewide law layered on top of it rather than replacing it.",
  },
  Hawaii: {
    type: RANGE,
    law: "Haw. Rev. Stat. § 378-2.3 (Act 208)",
    effective: "2024-01-01",
    threshold: "50+ employees",
    thresholdConfident: true,
  },
  Illinois: {
    type: RANGE,
    law: "820 ILCS 112/10 (Illinois Equal Pay Act, as amended by HB 3129)",
    effective: "2025-01-01",
    threshold: "15+ employees",
    thresholdConfident: true,
  },
  Maryland: {
    type: RANGE,
    law: "Md. Code, Lab. & Empl. § 3-304.2 (Equal Pay for Equal Work Act amendment)",
    effective: "2024-10-01",
    threshold: "All employers (commonly reported as no minimum size)",
    thresholdConfident: false,
  },
  Minnesota: {
    type: RANGE,
    law: "Minn. Stat. § 181.173",
    effective: "2025-01-01",
    threshold: "30+ employees",
    thresholdConfident: true,
  },
  "New Jersey": {
    type: RANGE,
    law: "Pay Transparency Act, N.J. Stat. § 34:6B-20 et seq. (S2310)",
    effective: "2025-06-01",
    threshold: "10+ employees",
    thresholdConfident: true,
  },
  Vermont: {
    type: RANGE,
    law: "21 V.S.A. § 495n (Act 20 / S.103)",
    effective: "2025-07-01",
    threshold: "5+ employees",
    thresholdConfident: false,
  },
  "District of Columbia": {
    type: RANGE,
    law: "Wage Transparency Omnibus Amendment Act of 2023 (D.C. Law 25-9)",
    effective: "2024-06-30",
    threshold: "All employers (commonly reported as no minimum size)",
    thresholdConfident: false,
  },
  Massachusetts: {
    type: RANGE,
    law: "Frances Perkins Workplace Equity Act",
    effective: "2025-10-29",
    threshold: "25+ Massachusetts employees",
    thresholdConfident: true,
  },
  Virginia: {
    type: RANGE,
    law: "HB 636",
    effective: "2026-07-01",
    threshold: "All private employers (no minimum size)",
    thresholdConfident: true,
  },
  Maine: {
    type: RANGE,
    law: "Maine pay-range posting law (2026 enactment)",
    effective: "2026-07-29",
    threshold: "10+ employees",
    thresholdConfident: true,
    note: "Relies on state enforcement; commonly reported summaries note no explicit private right of action, unlike most of the states above.",
  },
};

const ALL_STATE_NAMES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "District of Columbia",
];

const ABBREVIATIONS = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

const LOWER_NAME_INDEX = new Map(ALL_STATE_NAMES.map((name) => [name.toLowerCase(), name]));

/** All 51 jurisdiction names (50 states + DC), in table order. */
export function listStates() {
  return ALL_STATE_NAMES;
}

/** Resolve "CA", "ca", "California" or "california" to the canonical name. Throws on no match. */
export function normalizeState(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("Expected a US state name or two-letter abbreviation, got nothing.");
  const upper = raw.toUpperCase();
  if (ABBREVIATIONS[upper]) return ABBREVIATIONS[upper];
  const byName = LOWER_NAME_INDEX.get(raw.toLowerCase());
  if (byName) return byName;
  throw new Error(`Unrecognized US state or territory: "${raw}". This tool covers the 50 states and DC only.`);
}

/** The posting-range rule for one jurisdiction: { state, type, law, effective, threshold, thresholdConfident, note }. */
export function getRule(input) {
  const state = normalizeState(input);
  const entry = JURISDICTION_TABLE[state];
  if (!entry) {
    return {
      state,
      type: NONE,
      law: null,
      effective: null,
      threshold: null,
      thresholdConfident: null,
      note: null,
    };
  }
  return {
    state,
    type: entry.type,
    law: entry.law,
    effective: entry.effective,
    threshold: entry.threshold,
    thresholdConfident: entry.thresholdConfident,
    note: entry.note ?? null,
  };
}

/** Only the jurisdictions that currently require a posted range, in table order. */
export function rangeRequiredStates() {
  return Object.keys(JURISDICTION_TABLE);
}

// A "figure" is a dollar amount: $65,000 · $65k · $28.50/hr · USD 70,000
const FIGURE = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b)?|\bUSD\s?\d[\d,]*(?:\.\d+)?/gi;
// A separator token that plausibly joins two figures into a range --
// matched against the text *between* two figures, not the whole posting,
// so an unrelated wage and bonus figure a sentence apart is not counted as
// a range just because they are both dollar amounts.
const RANGE_SEPARATOR = /(?:^|\s)(?:-|–|—|to|through)(?:\s|$)/i;
const MAX_RANGE_GAP = 40;

/**
 * Scan free-text job-posting copy for a stated dollar figure. Returns
 * { classification, figures, detail } where classification is one of
 * "range", "single-figure", or "none". This is a literal text-pattern
 * scan -- it has no idea whether the number found is a *good-faith*
 * range, or a wage vs. a bonus target vs. a sign-on figure; it only
 * reports what the wording contains.
 */
export function scanPostingText(text) {
  const raw = String(text ?? "");
  const matches = [...raw.matchAll(FIGURE)].map((m) => m[0].trim());
  if (matches.length === 0) {
    return { classification: "none", figures: [], detail: "No dollar amount found in the pasted text." };
  }
  if (matches.length === 1) {
    return {
      classification: "single-figure",
      figures: matches,
      detail: `Found one dollar figure (${matches[0]}) and no second bound nearby. A single ceiling or floor ("up to $X", "starting at $X") is commonly read as not satisfying a posted-RANGE requirement, though this scan cannot tell which case it is -- read the sentence yourself.`,
    };
  }
  // Two-or-more figures: look at the text immediately between the first
  // pair for a range-shaped separator before calling it a range.
  const firstIndex = raw.indexOf(matches[0]);
  const secondIndex = raw.indexOf(matches[1], firstIndex + matches[0].length);
  const between = firstIndex >= 0 && secondIndex > firstIndex ? raw.slice(firstIndex + matches[0].length, secondIndex) : "";
  const looksLikeRange = between.length <= MAX_RANGE_GAP && (between.trim() === "" || RANGE_SEPARATOR.test(between));
  if (looksLikeRange) {
    return {
      classification: "range",
      figures: matches,
      detail: `Found two dollar figures that read as a range (${matches[0]} … ${matches[1]}).`,
    };
  }
  return {
    classification: "single-figure",
    figures: matches,
    detail: `Found ${matches.length} dollar figures, but the first two are not close enough together to read as one range (e.g. they may be a wage and a separate bonus or benefit figure). Found: ${matches.join(", ")}.`,
  };
}

/**
 * Combine a posting-text scan with a set of selected jurisdictions. Returns
 * the scan, the per-jurisdiction rules, and a plain-language flag list of
 * which selected jurisdictions require a range this scan did not detect.
 * Never asserts compliance either way -- see every page's disclaimer.
 */
export function checkPosting(text, stateInputs) {
  const scan = scanPostingText(text);
  const rules = (stateInputs ?? []).map((s) => getRule(s));
  const missing = rules.filter((r) => r.type === RANGE && scan.classification !== "range");
  const covered = rules.filter((r) => r.type === RANGE && scan.classification === "range");
  const notApplicable = rules.filter((r) => r.type === NONE);
  return { scan, rules, missing, covered, notApplicable };
}
