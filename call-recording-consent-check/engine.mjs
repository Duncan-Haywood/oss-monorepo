// Deterministic call-recording consent-classification engine.
//
// What this is: a lookup table of each US state's *default* rule on how many
// parties to a phone call must consent before it may be recorded, plus a
// federal baseline and a conservative "which rule applies when the two
// parties are in different states" heuristic. Nothing here is a legal
// determination for any specific call -- see the "How this can be wrong"
// section in why-call-recording-consent-laws-differ-by-state.html and the
// no-warranty clause on every page. This engine exists to make the
// *reference lookup* instant and consistent, not to replace reading the
// actual statute or asking a lawyer.
//
// Scope, stated once so every caller inherits it rather than re-deriving it:
//   - Ordinary two-party phone/video calls only. Not in-person conversations,
//     not calls to/from law enforcement, not 911, not a parent recording a
//     minor child's calls (several states carry a separate "vicarious
//     consent" exception for that), not a wiretap by a non-party. Those all
//     have different rules this table does not encode.
//   - "Consent" here means consent to being RECORDED. It has nothing to do
//     with TCPA consent-to-be-called/texted, which is a completely different
//     federal regime this tool does not touch.
//   - A default classification, not a guarantee. A small number of states
//     (noted per-entry below) have real ambiguity in the case law or a
//     statute that reads differently depending on who is asked; that
//     ambiguity is disclosed in the `note` field rather than resolved by
//     picking a side.
//
// Sourcing: the fourteen "all-party" classifications and their statute
// citations are the same list repeated, in substance, across the major free
// public references on this topic (state bar consumer-law pages, the
// Reporters Committee for Freedom of the Press's long-running "Can We Tape?"
// guide, and most call-center-compliance vendor blogs) -- this table did not
// invent a new classification for any state. Citations for the thirty-six
// "one-party" states are intentionally left as a pointer to that state's own
// wiretapping/eavesdropping statute rather than a specific section number,
// because getting a *pinpoint* citation wrong reads as more authoritative
// than getting a *classification* wrong, and only the classification claim
// is one this build can stand behind. State statutes are renumbered and
// amended without notice -- verify the current text before relying on this
// for an actual call.

export const FEDERAL_CITATION =
  "18 U.S.C. § 2511(2)(d) — federal Wiretap Act one-party-consent baseline: a person who is a party to a call, or who has the prior consent of one party, may record it, unless the recording is done for the purpose of committing a criminal or tortious act.";

// Cases where the practical guidance below cites precedent rather than
// asserting a universal rule.
export const INTERSTATE_PRECEDENT =
  "Kearney v. Salomon Smith Barney, Inc., 39 Cal. 4th 95 (2006) — the California Supreme Court applied California's all-party-consent law to protect a California call recipient even though the recording party was based out of state. Courts do not uniformly resolve interstate wiretap conflicts this way in every state pair; treat this as the reason the conservative reading below is conservative, not as a guarantee.";

const ALL_PARTY = "all-party";
const ONE_PARTY = "one-party";

// name -> { type, statute?, note? }
const STATE_TABLE = {
  Alabama: { type: ONE_PARTY },
  Alaska: { type: ONE_PARTY },
  Arizona: { type: ONE_PARTY },
  Arkansas: { type: ONE_PARTY },
  California: {
    type: ALL_PARTY,
    statute: "Cal. Penal Code §§ 631, 632",
    note: "Civil penalty up to $5,000 per violation under Penal Code § 637.2, separate from any criminal exposure.",
  },
  Colorado: { type: ONE_PARTY },
  Connecticut: {
    type: ALL_PARTY,
    statute: "Conn. Gen. Stat. § 52-570d (civil action); § 53a-187 (criminal eavesdropping)",
  },
  Delaware: { type: ALL_PARTY, statute: "Del. Code Ann. tit. 11, § 1335" },
  Florida: { type: ALL_PARTY, statute: "Fla. Stat. § 934.03" },
  Georgia: { type: ONE_PARTY },
  Hawaii: {
    type: ONE_PARTY,
    note: "One-party for a call you are personally part of (Haw. Rev. Stat. § 711-1111); a separate, stricter rule applies to a non-party planting a recording device in a private place.",
  },
  Idaho: { type: ONE_PARTY },
  Illinois: {
    type: ALL_PARTY,
    statute: "720 ILCS 5/14-2",
    note: "Illinois's prior all-party statute was struck down as unconstitutional in People v. Melongo (2014); the legislature re-enacted an all-party consent requirement the same year. Cited version is the current, post-2014 statute.",
  },
  Indiana: { type: ONE_PARTY },
  Iowa: { type: ONE_PARTY },
  Kansas: { type: ONE_PARTY },
  Kentucky: { type: ONE_PARTY },
  Louisiana: { type: ONE_PARTY },
  Maine: { type: ONE_PARTY },
  Maryland: { type: ALL_PARTY, statute: "Md. Code Ann., Cts. & Jud. Proc. § 10-402" },
  Massachusetts: { type: ALL_PARTY, statute: "Mass. Gen. Laws ch. 272, § 99" },
  Michigan: {
    type: ALL_PARTY,
    statute: "Mich. Comp. Laws § 750.539c",
    note: "The statute's text is read by some courts as one-party for a participant recording their own call; Michigan appellate decisions have gone the other way for a recording by someone not a party to the call. Commonly listed as all-party out of caution — treat this as the least certain classification in this table.",
  },
  Minnesota: { type: ONE_PARTY },
  Mississippi: { type: ONE_PARTY },
  Missouri: { type: ONE_PARTY },
  Montana: { type: ALL_PARTY, statute: "Mont. Code Ann. § 45-8-213" },
  Nebraska: { type: ONE_PARTY },
  Nevada: {
    type: ALL_PARTY,
    statute: "Nev. Rev. Stat. § 200.620",
    note: "The statute's own text reads as one-party consent, but the Nevada Supreme Court in Lane v. Allstate Ins. Co., 969 P.2d 938 (Nev. 1998) interpreted it to require all-party consent. Listed as all-party to match how it is actually enforced.",
  },
  "New Hampshire": { type: ALL_PARTY, statute: "N.H. Rev. Stat. Ann. § 570-A:2" },
  "New Jersey": { type: ONE_PARTY },
  "New Mexico": { type: ONE_PARTY },
  "New York": { type: ONE_PARTY },
  "North Carolina": { type: ONE_PARTY },
  "North Dakota": { type: ONE_PARTY },
  Ohio: { type: ONE_PARTY },
  Oklahoma: { type: ONE_PARTY },
  Oregon: {
    type: ALL_PARTY,
    statute: "Or. Rev. Stat. § 165.540",
    note: "Telephone and other electronic communications require all-party consent. In-person conversations have a narrower rule (only announcement to those present may be required in some cases) — this tool covers phone/video calls only.",
  },
  Pennsylvania: {
    type: ALL_PARTY,
    statute: "18 Pa. Cons. Stat. § 5703 (Wiretapping and Electronic Surveillance Control Act)",
  },
  "Rhode Island": { type: ONE_PARTY },
  "South Carolina": { type: ONE_PARTY },
  "South Dakota": { type: ONE_PARTY },
  Tennessee: { type: ONE_PARTY },
  Texas: { type: ONE_PARTY },
  Utah: { type: ONE_PARTY },
  Vermont: {
    type: ONE_PARTY,
    note: "Vermont has no wiretap statute at all; its highest court has instead recognized a common-law privacy tort for secret recording in some circumstances. Treated as one-party/no-statutory-bar here because there is no consent statute to classify against — this is the one entry in the table that is a structural exception rather than a same-shape one-party rule.",
  },
  Virginia: { type: ONE_PARTY },
  Washington: { type: ALL_PARTY, statute: "Wash. Rev. Code § 9.73.030" },
  "West Virginia": { type: ONE_PARTY },
  Wisconsin: { type: ONE_PARTY },
  Wyoming: { type: ONE_PARTY },
  "District of Columbia": { type: ONE_PARTY },
};

// Abbreviation -> canonical name, so the CLI and the page can both accept
// "CA" as well as "California".
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

const LOWER_NAME_INDEX = new Map(Object.keys(STATE_TABLE).map((name) => [name.toLowerCase(), name]));

/** All 51 jurisdiction names, in table order. */
export function listStates() {
  return Object.keys(STATE_TABLE);
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

/** The consent rule for one jurisdiction: { state, type, statute, note }. */
export function getRule(input) {
  const state = normalizeState(input);
  const entry = STATE_TABLE[state];
  return { state, type: entry.type, statute: entry.statute ?? null, note: entry.note ?? null };
}

/**
 * Assess a call between two parties in (possibly different) states.
 * Returns the two individual rules, the practical combined requirement, and
 * the reasoning — never a bare verdict with no citation attached.
 */
export function assessCall(callerInput, recipientInput) {
  const caller = getRule(callerInput);
  const recipient = getRule(recipientInput);
  const interstate = caller.state !== recipient.state;
  const eitherAllParty = caller.type === ALL_PARTY || recipient.type === ALL_PARTY;

  let requirement;
  let reason;
  if (!interstate) {
    requirement = caller.type;
    reason =
      caller.type === ALL_PARTY
        ? `Both parties are in ${caller.state}, an all-party-consent state: every party to the call must consent before it is recorded.`
        : `Both parties are in ${caller.state}, a one-party-consent state: the party doing the recording (or anyone with that party's consent) may record without telling the other party, per the federal baseline and this state's own rule.`;
  } else if (eitherAllParty) {
    requirement = ALL_PARTY;
    const stricterState = caller.type === ALL_PARTY ? caller.state : recipient.state;
    reason =
      `The call crosses state lines and ${stricterState} requires all-party consent. Courts have applied the more protective state's rule to interstate calls before (see the Kearney precedent below) — the conservative, commonly recommended reading is to get every party's consent whenever either side of the call is in an all-party state, rather than assume the recording party's own state's rule controls.`;
  } else {
    requirement = ONE_PARTY;
    reason = `The call crosses state lines, and both ${caller.state} and ${recipient.state} are one-party-consent states, matching the federal Wiretap Act baseline — the party recording (or anyone with that party's consent) may record without announcing it.`;
  }

  return { caller, recipient, interstate, requirement, reason };
}

/**
 * A ready-to-read call-opening disclosure script for the given requirement.
 * Always includes an explicit request for a verbal "yes" when all-party
 * consent is required — a business is free to disclose under one-party
 * consent too (many do, as a trust/best-practice matter, and it is required
 * separately by some industry-specific rules this tool does not model, e.g.
 * certain state insurance or financial-services call-recording notices) but
 * the wiretap statute itself does not require the verbal-consent request.
 */
export function disclosureScript(requirement, { company = "[Your Company]", purpose = "quality and training purposes" } = {}) {
  const co = String(company || "[Your Company]").trim() || "[Your Company]";
  const why = String(purpose || "quality and training purposes").trim() || "quality and training purposes";
  if (requirement === ALL_PARTY) {
    return (
      `Hi, this is [Your Name] with ${co}. This call may be recorded for ${why}. ` +
      `Do you consent to being recorded on this call? [Wait for a clear "yes."] ` +
      `Thank you — I'll continue with the recording on.`
    );
  }
  return (
    `This call may be recorded for ${why}. ` +
    `(One-party consent applies here, so this notice is a trust/best-practice courtesy, not a statutory requirement — see the tool's guidance for why.)`
  );
}
