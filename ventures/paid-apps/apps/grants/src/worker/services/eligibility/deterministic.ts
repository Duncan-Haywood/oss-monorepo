// Deterministic eligibility checks from the org profile and the listing's structured fields. Pure.
// Decisions are made from the funder's verified quote only (never the model's restatement), and
// return null whenever the rule cannot settle the criterion, leaving it to the assessment step.
import type {
  CheckStatus,
  EligibilityCriterion,
  EvidenceRef,
  ProfileEvidenceField,
} from "@shared/eligibility";
import type { OrgType } from "@shared/enums";
import { quoteInText } from "../knowledge/text";
import {
  applicantCompatibility,
  classifyApplicantType,
  geographyCompatibility,
} from "../matching/prefilter";
import { applicantsLine } from "./criteria";

export interface EligibilityProfile {
  legalName: string;
  orgType: OrgType;
  ein: string | null;
  uei: string | null;
  city: string | null;
  state: string | null;
  country: string;
  serviceAreas: string[];
  foundedYear: number | null;
}

export interface DeterministicOpportunity {
  applicantTypes: string[];
}

export interface Decision {
  status: Exclude<CheckStatus, "unknown">;
  reason: string;
  evidence: ProfileEvidenceField[];
}

const ORG_TYPE_TEXT: Record<OrgType, string> = {
  nonprofit_501c3: "a 501(c)(3) nonprofit",
  tribal_government: "a tribal government",
  tribal_organization: "a tribal organization",
  faith_based: "a faith-based organization",
  community_based: "a community-based organization",
  educational: "an educational institution",
  government: "a government entity",
  fiscally_sponsored: "a fiscally sponsored project",
  other: "another type of organization",
};

/** Language that flips or hedges a requirement; such quotes are never decided by regex. */
const NEGATION =
  /\b(not|no|never|ineligible|excluded?|excluding|prohibited|cannot|unable|except|nor)\b|n't\b/i;

const present = (v: string | null | undefined): v is string => Boolean(v?.trim());

export function profileValue(p: EligibilityProfile, field: ProfileEvidenceField): string | null {
  switch (field) {
    case "serviceAreas":
      return p.serviceAreas.length > 0 ? p.serviceAreas.join("; ") : null;
    case "foundedYear":
      return p.foundedYear == null ? null : String(p.foundedYear);
    case "orgType":
      return p.orgType;
    default: {
      const v = p[field];
      return present(v) ? v.trim() : null;
    }
  }
}

const FIELD_LABEL: Record<ProfileEvidenceField, string> = {
  legalName: "Legal name",
  orgType: "Organization type",
  ein: "EIN",
  uei: "UEI (SAM.gov)",
  city: "City",
  state: "State",
  country: "Country",
  serviceAreas: "Service areas",
  foundedYear: "Founded",
};

/** Evidence ref for a profile field, or null when the field is empty (never citable). */
export function profileEvidence(
  p: EligibilityProfile,
  field: ProfileEvidenceField,
): EvidenceRef | null {
  const v = profileValue(p, field);
  if (v == null) return null;
  const shown = field === "orgType" ? ORG_TYPE_TEXT[p.orgType].replace(/^an? /, "") : v;
  return {
    ref: `profile:${field}`,
    kind: "profile",
    label: `${FIELD_LABEL[field]}: ${shown.length > 160 ? `${shown.slice(0, 159)}…` : shown}`,
    factStatus: null,
  };
}

const met = (reason: string, evidence: ProfileEvidenceField[]): Decision => ({
  status: "met",
  reason,
  evidence,
});
const notMet = (reason: string, evidence: ProfileEvidenceField[]): Decision => ({
  status: "not_met",
  reason,
  evidence,
});

/** Split a free-text applicant list into candidate labels. */
function applicantSegments(quote: string): string[] {
  return quote
    .split(/[;,:]|\band\/or\b|\bor\b|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

function checkApplicantType(
  c: EligibilityCriterion,
  opp: DeterministicOpportunity,
  p: EligibilityProfile,
): Decision | null {
  if (p.orgType === "other") return null;
  const who = ORG_TYPE_TEXT[p.orgType];
  // The listing's applicant-type list (grants.gov codes) is exhaustive: decide either way.
  const line = applicantsLine(opp.applicantTypes);
  if (line && quoteInText(c.sourceQuote, line)) {
    const r = applicantCompatibility(opp.applicantTypes, p.orgType);
    if (r.eligibility === "likely_eligible" || r.eligibility === "eligible") {
      return met(`The listed applicant types include ${who}.`, ["orgType"]);
    }
    if (r.eligibility === "ineligible") {
      return notMet(`The listed applicant types do not include ${who}.`, ["orgType"]);
    }
    return null;
  }
  // Free text is not exhaustive: only a plain, positive mention of the org's type decides it.
  if (NEGATION.test(c.sourceQuote)) return null;
  const labels = applicantSegments(c.sourceQuote).filter((s) => {
    const cat = classifyApplicantType(s);
    return cat !== null && cat !== "open";
  });
  if (labels.length === 0) return null;
  const r = applicantCompatibility(labels, p.orgType);
  if (r.eligibility === "likely_eligible") {
    return met(`The funder's eligible applicants include ${who}.`, ["orgType"]);
  }
  return null;
}

const RE_501C3 = /501\s*\(?\s*c\s*\)?\s*\(?\s*3\s*\)?|tax[- ]exempt/i;
const RE_EIN = /\bEIN\b|employer identification|\btax(payer)? id/i;

function checkTaxStatus(c: EligibilityCriterion, p: EligibilityProfile): Decision | null {
  const q = c.sourceQuote;
  if (NEGATION.test(q)) return null;
  const needs501 = RE_501C3.test(q);
  const needsEin = RE_EIN.test(q);
  if (!needs501 && !needsEin) return null;
  const evidence: ProfileEvidenceField[] = [];
  const reasons: string[] = [];
  if (needs501) {
    if (p.orgType !== "nonprofit_501c3") return null;
    evidence.push("orgType");
    reasons.push("The profile records the organization as a 501(c)(3) nonprofit");
  }
  if (needsEin) {
    if (!present(p.ein)) return null;
    evidence.push("ein");
    reasons.push("an EIN is on file");
  } else if (present(p.ein)) {
    evidence.push("ein");
  }
  return met(`${reasons.join(" and ")}.`, evidence);
}

const RE_SAM = /\bSAM\b|sam\.gov|system for award management|\bUEI\b|unique entity/i;
const RE_OTHER_REGISTRATION =
  /grants\.gov|charit\w* registration|secretary of state|good standing/i;

function checkRegistration(c: EligibilityCriterion, p: EligibilityProfile): Decision | null {
  const q = c.sourceQuote;
  if (NEGATION.test(q) || !RE_SAM.test(q) || RE_OTHER_REGISTRATION.test(q)) return null;
  if (!present(p.uei)) return null; // a missing profile field proves nothing either way
  return met(
    "A SAM.gov Unique Entity ID is on file. SAM registrations must be renewed every year; confirm it is active before submitting.",
    ["uei"],
  );
}

/** Population / economic qualifiers a place match does not prove ("rural counties in NM"). */
const GEO_QUALIFIERS =
  /\b(rural|urban|frontier|low[- ]income|underserved|under-served|distressed|persistent poverty|opportunity zones?|colonias?|disadvantaged|high[- ]poverty|reservations?|tribal|native|indigenous|american indian|indian country|census tracts?)\b/i;
/** Sub-state units: a state match alone does not prove the org serves the named place. */
const SUB_STATE =
  /\b(county|counties|city|cities|municipal\w*|parish\w*|boroughs?|towns?|metro\w*|regions?|chapters?|pueblos?|districts?)\b/i;
/** Parts of a state or the country ("southern New Mexico", "the U.S. Southwest"). */
const REGIONAL =
  /\b(south\w*|north\w*|east\w*|west\w*|midwest\w*|central|mountain|plains|appalachia\w*|delta|four corners|border\w*|gulf|coastal|pacific|atlantic|great lakes|new england)\b/i;
const US_NAMES =
  /\b(?:[Tt]he\s+)?(?:[Uu]nited [Ss]tates(?: of [Aa]merica)?|U\.S\.A?\.?|USA|US)(?![\w.])/g;
const NATIONAL_WORDS = /\b(national|nationwide|all (?:50 )?states|any state)\b/i;

/** Wording about where the applicant / project is, as opposed to whom it serves. */
const LOCATION_RULE =
  /\b(located|based|headquarter\w*|incorporated|domiciled|organized under|residents? of)\b|^Geographic scope: /i;

function checkGeography(c: EligibilityCriterion, p: EligibilityProfile): Decision | null {
  const q = c.sourceQuote;
  if (NEGATION.test(q)) return null;
  // Evaluate states/service areas without the "national" short-circuit for "U.S." mentions.
  const geo = geographyCompatibility(q.replace(US_NAMES, " "), p);
  if (!geo.compatible) {
    // Only location rules exclude: "must serve communities in Arizona" may still fit an org whose
    // service area (e.g. Navajo Nation) crosses state lines, so that is left to the assessment.
    if (!LOCATION_RULE.test(q)) return null;
    return notMet(
      `The funder's geographic requirement does not include the organization's state (${p.state}) or service areas.`,
      p.serviceAreas.length > 0 ? ["state", "serviceAreas"] : ["state"],
    );
  }
  if (GEO_QUALIFIERS.test(q)) return null;
  const note = geo.note ?? "";
  if (note.startsWith("scope includes service area")) {
    return met(`The funder's area includes the organization's ${note.slice(15)}.`, [
      "serviceAreas",
    ]);
  }
  if (SUB_STATE.test(q) || REGIONAL.test(q)) return null;
  if (note.startsWith("scope includes")) {
    return met(`The funder's area includes the organization's state (${note.slice(15)}).`, [
      "state",
    ]);
  }
  US_NAMES.lastIndex = 0;
  const national = NATIONAL_WORDS.test(q) || US_NAMES.test(q);
  US_NAMES.lastIndex = 0;
  if (national && p.country === "US") {
    return met("The funder accepts applicants anywhere in the United States.", ["country"]);
  }
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function checkYearsOperating(
  c: EligibilityCriterion,
  p: EligibilityProfile,
  now: Date,
): Decision | null {
  const q = c.sourceQuote;
  if (p.foundedYear == null || NEGATION.test(q)) return null;
  if (!/operat|exist|establish|incorporat|founded|in business|track record|history/i.test(q)) {
    return null;
  }
  const m = q.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:or more\s+)?(?:full\s+)?years?\b/i,
  );
  const raw = m?.[1]?.toLowerCase();
  if (!raw) return null;
  const required = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? Number.NaN);
  if (!Number.isFinite(required) || required <= 0) return null;
  const age = now.getUTCFullYear() - p.foundedYear;
  // Founding month is unknown: the boundary year is undecidable.
  if (age > required) {
    return met(`Founded in ${p.foundedYear}: more than ${required} years of operation.`, [
      "foundedYear",
    ]);
  }
  if (age < required) {
    return notMet(`Founded in ${p.foundedYear}: fewer than ${required} years of operation.`, [
      "foundedYear",
    ]);
  }
  return null;
}

/** Deterministic decision for one criterion, or null when only the assessment can decide it. */
export function decideDeterministically(
  c: EligibilityCriterion,
  opp: DeterministicOpportunity,
  p: EligibilityProfile,
  now: Date,
): Decision | null {
  switch (c.kind) {
    case "applicant_type":
      return checkApplicantType(c, opp, p);
    case "tax_status":
      return checkTaxStatus(c, p);
    case "registration":
      return checkRegistration(c, p);
    case "geography":
      return checkGeography(c, p);
    case "years_operating":
      return checkYearsOperating(c, p, now);
    default:
      return null;
  }
}
