// Pure logic behind the /demo walkthrough: quote highlighting, the interview heuristics, match
// ranking, the draft's flags and fact-check, automation levels and the submission package. No React,
// no network: everything is computed locally from ./data.ts.
import {
  type RoutingInput,
  type RoutingPolicy,
  type RoutingResult,
  routeApplication,
} from "@client/routes/org/settings/routing-preview";
import type { FactCategory, FlagKind } from "@shared/enums";
import {
  DEMO_ATTACHMENTS,
  DEMO_DRAFT,
  DEMO_FACTS,
  DEMO_OPPORTUNITIES,
  DEMO_ORG,
  type DemoClaim,
  type DemoFact,
  type DemoFactStatus,
  type DemoOpportunity,
  GAP,
  GAP_CLAIM_ID,
  MISMATCH,
  MISMATCH_CLAIM_ID,
} from "./data";

export type FactStatuses = Record<string, DemoFactStatus>;

export const initialFactStatuses = (): FactStatuses =>
  Object.fromEntries(DEMO_FACTS.map((f) => [f.id, f.initialStatus]));

// ── Documents → facts ───────────────────────────────────────────────────────────────────────────

export interface TextSegment {
  text: string;
  /** Set when this segment is a fact's verbatim quote. */
  factId?: string;
}

/** Splits `text` into plain runs and quote runs (first occurrence of each quote, no overlaps). */
export function quoteSegments(
  text: string,
  facts: readonly Pick<DemoFact, "id" | "quote">[],
): TextSegment[] {
  const hits = facts
    .map((f) => ({ id: f.id, start: text.indexOf(f.quote), length: f.quote.length }))
    .filter((h) => h.start >= 0 && h.length > 0)
    .sort((a, b) => a.start - b.start);
  const out: TextSegment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start < pos) continue; // overlapping quote: keep the earlier one
    if (h.start > pos) out.push({ text: text.slice(pos, h.start) });
    out.push({ text: text.slice(h.start, h.start + h.length), factId: h.id });
    pos = h.start + h.length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

// ── Interview: propose a fact from a typed answer (simple local heuristics, no AI) ──────────────

export interface ProposedFact {
  statement: string;
  /** The visitor's own words, verbatim. */
  quote: string;
  category: FactCategory;
  /** Numbers the checker would later match draft sentences against. */
  numbers: string[];
  asOf?: string;
  notes: string[];
}

export type ProposeResult = { ok: true; fact: ProposedFact } | { ok: false; reason: string };

const CATEGORY_RULES: [RegExp, FactCategory][] = [
  [/\bvolunteer/i, "capacity"],
  [/\b(staff|employees?|team|hired?)\b/i, "staff"],
  [/\$|\b(budget|revenue|funding|dollars?)\b/i, "financial"],
  [/\b(partners?|partnership|college|employers?|contractors?)\b/i, "partner"],
  [/\b(graduat\w*|completed|employed|jobs?|placed|wages?)\b/i, "outcome"],
  [
    /\b(famil(y|ies)|households?|people|residents|trainees|students|served)\b/i,
    "population_served",
  ],
  [/\b(county|counties|miles|towns?|region|rural)\b/i, "geography"],
];

const PRONOUNS: [RegExp, string][] = [
  [/\bwe have\b/gi, `${DEMO_ORG.shortName} has`],
  [/\bwe had\b/gi, `${DEMO_ORG.shortName} had`],
  [/\bwe are\b/gi, `${DEMO_ORG.shortName} is`],
  [/\bwe were\b/gi, `${DEMO_ORG.shortName} was`],
  [/\bour\b/gi, `${DEMO_ORG.shortName}'s`],
  [/\b(we|us)\b/gi, DEMO_ORG.shortName],
];

const YEAR_RE = /\b(19|20)\d{2}\b/;
const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?%?/g;

export function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? [])
    .map((n) => n.replace(/[,.]$/, ""))
    .filter((n) => !YEAR_RE.test(n) || n.length !== 4);
}

/**
 * Turns one typed interview answer into the fact the interviewer would propose: the sentence with a
 * number (or the first one) as the verbatim quote, a third-person statement, a guessed category, the
 * numbers to check later and plain-language notes. It never adds information that isn't in the answer.
 */
export function proposeFactFromAnswer(answer: string): ProposeResult {
  const text = answer.replace(/\s+/g, " ").trim();
  if (text.split(" ").filter(Boolean).length < 4) {
    return { ok: false, reason: "Add a little more detail. A full sentence works best." };
  }
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const quote = sentences.find((s) => /\d/.test(s)) ?? sentences[0] ?? text;

  let statement = quote;
  for (const [re, replacement] of PRONOUNS) statement = statement.replace(re, replacement);
  statement = statement.charAt(0).toUpperCase() + statement.slice(1);
  if (!/[.!?]$/.test(statement)) statement += ".";

  const numbers = extractNumbers(quote);
  const asOf = quote.match(YEAR_RE)?.[0];
  const category =
    CATEGORY_RULES.find(([re]) => re.test(quote))?.[1] ?? (numbers.length ? "metric" : "other");

  const notes: string[] = [];
  if (numbers.length === 0) {
    notes.push(
      "No number found. Funders usually want a count, so the interviewer would ask a follow-up.",
    );
  }
  const vague = quote.match(/\b(many|lots|several|some|a few|countless|tons)\b/i)?.[0];
  if (vague) notes.push(`“${vague}” is vague, so no sentence can claim a number from it.`);
  const approx = quote.match(/\b(about|around|roughly|approximately|nearly|almost)\b/i)?.[0];
  if (approx) {
    notes.push(`“${approx}” is kept, so a draft has to say it's approximate too.`);
  }
  if (!asOf && /\b(last|this|next) year\b|\brecently\b/i.test(quote)) {
    notes.push("There's no year, so you would be asked which year it means.");
  }
  if (/\b(best|largest|biggest|leading|only)\b/i.test(quote)) {
    notes.push("Words like “best” or “only” need a source, or the checker will flag them.");
  }
  if (sentences.length > 1) {
    notes.push("Only one sentence becomes this fact. The rest of the answer is kept on file.");
  }
  return { ok: true, fact: { statement, quote, category, numbers, asOf, notes } };
}

// ── Grant matches ───────────────────────────────────────────────────────────────────────────────

/** Same formula as the real matcher (services/matching/scoring.ts): likelihood × the ask. */
export const expectedValueCents = (o: Pick<DemoOpportunity, "likelihood" | "askCents">) =>
  Math.round(o.likelihood * o.askCents);

/** Highest expected value first, then fit (the order the real opportunities list uses). */
export function rankOpportunities(
  opps: readonly DemoOpportunity[] = DEMO_OPPORTUNITIES,
): DemoOpportunity[] {
  return [...opps].sort(
    (a, b) => expectedValueCents(b) - expectedValueCents(a) || b.fitScore - a.fitScore,
  );
}

// ── Draft review ────────────────────────────────────────────────────────────────────────────────

export interface DraftState {
  /** "Fix it" swapped the unsupported sentence for the supported one. */
  fixed: boolean;
  /** The visitor's answer to the gap question (trainees in year one), once given. */
  gapAnswer: number | null;
}

export const GAP_FACT_ID = "f-gap-answer";

export interface ClaimIssue {
  level: "danger" | "warning";
  reason: string;
}

export interface ResolvedClaim extends DemoClaim {
  gap: boolean;
  issue: ClaimIssue | null;
}

export const gapAnswerSentence = (n: number) =>
  `With this grant, we plan to train ${n} adults in the first year.`;

export function resolveClaim(
  claim: DemoClaim,
  draft: DraftState,
  statuses: FactStatuses,
): ResolvedClaim {
  if (claim.id === GAP_CLAIM_ID) {
    return draft.gapAnswer === null
      ? { ...claim, gap: true, issue: null }
      : {
          ...claim,
          text: gapAnswerSentence(draft.gapAnswer),
          factIds: [GAP_FACT_ID],
          gap: false,
          issue: null,
        };
  }
  if (claim.id === MISMATCH_CLAIM_ID && !draft.fixed) {
    return { ...claim, gap: false, issue: { level: "danger", reason: MISMATCH.explanation } };
  }
  const current =
    claim.id === MISMATCH_CLAIM_ID ? { ...claim, text: MISMATCH.supportedText } : claim;
  const cited = current.factIds.map((id) => statuses[id]);
  if (cited.includes("rejected")) {
    return {
      ...current,
      gap: false,
      issue: {
        level: "danger",
        reason: "This sentence cites a fact your team rejected, so nothing supports it now.",
      },
    };
  }
  if (cited.includes("proposed")) {
    return {
      ...current,
      gap: false,
      issue: { level: "warning", reason: "This sentence cites a fact nobody has confirmed yet." },
    };
  }
  return { ...current, gap: false, issue: null };
}

export const resolveDraft = (draft: DraftState, statuses: FactStatuses) =>
  DEMO_DRAFT.paragraphs.map((p) => p.map((c) => resolveClaim(c, draft, statuses)));

export interface DemoFlag {
  id: string;
  claimId: string;
  severity: "blocker" | "warning";
  kind: FlagKind;
  message: string;
  action: "fix" | "answer" | "facts";
}

export function draftFlags(draft: DraftState, statuses: FactStatuses): DemoFlag[] {
  const flags: DemoFlag[] = [];
  for (const claim of resolveDraft(draft, statuses).flat()) {
    if (claim.gap) {
      flags.push({
        id: "flag-gap",
        claimId: claim.id,
        severity: "blocker",
        kind: "missing_info",
        message: GAP.explanation,
        action: "answer",
      });
    } else if (claim.issue && claim.id === MISMATCH_CLAIM_ID && !draft.fixed) {
      flags.push({
        id: "flag-mismatch",
        claimId: claim.id,
        severity: "blocker",
        kind: "numeric_mismatch",
        message: claim.issue.reason,
        action: "fix",
      });
    } else if (claim.issue) {
      flags.push({
        id: `flag-${claim.id}`,
        claimId: claim.id,
        severity: claim.issue.level === "danger" ? "blocker" : "warning",
        kind: claim.issue.level === "danger" ? "unsupported_claim" : "unconfirmed_fact",
        message: claim.issue.reason,
        action: "facts",
      });
    }
  }
  return flags;
}

export interface FactCheck {
  factualClaims: number;
  supported: number;
  numericMismatches: number;
  unsupported: number;
  unconfirmed: number;
  gaps: number;
  passed: boolean;
}

export function factCheck(draft: DraftState, statuses: FactStatuses): FactCheck {
  const claims = resolveDraft(draft, statuses).flat();
  const factual = claims.filter((c) => !c.gap);
  const mismatch = claims.some((c) => c.id === MISMATCH_CLAIM_ID && c.issue?.level === "danger");
  const unsupported = factual.filter(
    (c) => c.issue?.level === "danger" && c.id !== MISMATCH_CLAIM_ID,
  ).length;
  const unconfirmed = factual.filter((c) => c.issue?.level === "warning").length;
  const gaps = claims.filter((c) => c.gap).length;
  const numericMismatches = mismatch ? 1 : 0;
  return {
    factualClaims: factual.length,
    supported: factual.filter((c) => !c.issue).length,
    numericMismatches,
    unsupported,
    unconfirmed,
    gaps,
    passed: numericMismatches + unsupported + gaps === 0,
  };
}

export const openBlockers = (draft: DraftState, statuses: FactStatuses) =>
  draftFlags(draft, statuses).filter((f) => f.severity === "blocker").length;

// ── Automation levels (mirror routes/org/settings/autopilot.tsx + services/review/policy.ts) ─────

export type AutomationLevelId = "manual" | "assisted" | "small_auto" | "full";
export type StageId = "find" | "draft" | "check" | "review" | "submit" | "follow";
export type Who = "autopilot" | "team" | "both";

export const STAGES: readonly { id: StageId; label: string }[] = [
  { id: "find", label: "Find and score grants" },
  { id: "draft", label: "Start drafts" },
  { id: "check", label: "Check every sentence" },
  { id: "review", label: "Review" },
  { id: "submit", label: "Submit" },
  { id: "follow", label: "Follow up" },
];

export interface AutomationLevel {
  id: AutomationLevelId;
  label: string;
  summary: string;
  /** The real settings this level stands for (Settings → Autopilot & review). */
  policy: RoutingPolicy & { autoDraftTopN: number };
  stages: Record<StageId, { who: Who; text: string }>;
}

/** The product's defaults (db/schema/org.ts): autopilot off, $10k / $100k lines, fit 80, 60%, 5/month. */
const DEFAULT_POLICY: AutomationLevel["policy"] = {
  autopilotEnabled: false,
  autoSubmitMaxCents: 1_000_000,
  fullReviewAboveCents: 10_000_000,
  minFitScoreForAuto: 80,
  highLikelihoodThreshold: 0.6,
  reviewFirstSubmissionPerFunder: true,
  maxAutoSubmissionsPerMonth: 5,
  autoDraftTopN: 3,
};

const ALWAYS = {
  find: {
    who: "autopilot",
    text: "Searches new grant listings every day and scores fit, likelihood and expected value.",
  },
  check: {
    who: "autopilot",
    text: "A separate checker compares every sentence with your facts. This can't be turned off.",
  },
  follow: {
    who: "both",
    text: "Reminders are scheduled for you. Your team sends updates and reports from drafts.",
  },
} as const satisfies Partial<AutomationLevel["stages"]>;

const PERSON_REVIEWS = {
  review: {
    who: "team",
    text: "A person reviews every application, with one click for simple ones or section by section.",
  },
  submit: { who: "team", text: "Nothing is sent until a person on your team approves it." },
} as const satisfies Partial<AutomationLevel["stages"]>;

export const AUTOMATION_LEVELS: readonly AutomationLevel[] = [
  {
    id: "manual",
    label: "Manual",
    summary: "You choose which grants to draft. A person approves everything.",
    policy: { ...DEFAULT_POLICY, autoDraftTopN: 0 },
    stages: {
      ...ALWAYS,
      ...PERSON_REVIEWS,
      draft: { who: "team", text: "You click “Start application” on the grants you pick." },
    },
  },
  {
    id: "assisted",
    label: "Assisted",
    summary: "Drafts start on their own for the best matches. A person still approves everything.",
    policy: DEFAULT_POLICY,
    stages: {
      ...ALWAYS,
      ...PERSON_REVIEWS,
      draft: { who: "autopilot", text: "Starts drafts for the top 3 matches each day." },
    },
  },
  {
    id: "small_auto",
    label: "Autopilot for small grants",
    summary: "Small, well-matched, fully verified grants can go out on their own.",
    policy: { ...DEFAULT_POLICY, autopilotEnabled: true },
    stages: {
      ...ALWAYS,
      draft: { who: "autopilot", text: "Starts drafts for the top 3 matches each day." },
      review: {
        who: "both",
        text: "Asks of $10,000 or less that pass every gate skip review. A person reviews the rest.",
      },
      submit: {
        who: "both",
        text: "Grants that pass every gate are sent for you, and you're emailed each time.",
      },
    },
  },
  {
    id: "full",
    label: "Full autopilot",
    summary: "Autopilot handles everything the safety rails allow, with a higher limit.",
    policy: {
      ...DEFAULT_POLICY,
      autopilotEnabled: true,
      autoSubmitMaxCents: 2_500_000,
      minFitScoreForAuto: 75,
      reviewFirstSubmissionPerFunder: false,
      maxAutoSubmissionsPerMonth: 10,
      autoDraftTopN: 5,
    },
    stages: {
      ...ALWAYS,
      draft: { who: "autopilot", text: "Starts drafts for the top 5 matches each day." },
      review: {
        who: "both",
        text: "Asks up to $25,000 that pass every gate skip review. Large or likely wins still get a full human review.",
      },
      submit: {
        who: "autopilot",
        text: "Sends everything that passes the gates, up to 10 a month, and emails you each time.",
      },
    },
  },
];

export const levelById = (id: AutomationLevelId) =>
  AUTOMATION_LEVELS.find((l) => l.id === id) ?? (AUTOMATION_LEVELS[1] as AutomationLevel);

/** How each eligible demo match would be routed at `level`. The Rural Trades draft is the live one. */
export function routeDemoMatches(
  level: AutomationLevel,
  draft: DraftState,
  statuses: FactStatuses,
): { opportunity: DemoOpportunity; route: RoutingResult }[] {
  const live = factCheck(draft, statuses);
  return rankOpportunities()
    .filter((o) => o.eligibility !== "ineligible")
    .map((o) => {
      const isLive = o.id === "opp-trades";
      const input: RoutingInput = {
        askCents: o.askCents,
        fitScore: o.fitScore,
        likelihood: o.likelihood,
        firstSubmissionToFunder: o.firstSubmissionToFunder,
        autoSubmissionsThisMonth: 0,
        groundingPassed: isLive ? live.passed : true,
        openBlockers: isLive ? openBlockers(draft, statuses) : 0,
        allCitedFactsConfirmed: isLive ? live.unconfirmed === 0 : true,
        channelSupportsAuto: o.channelSupportsAuto,
      };
      return { opportunity: o, route: routeApplication(level.policy, input) };
    });
}

// ── Submission package ──────────────────────────────────────────────────────────────────────────

export function packageText(draft: DraftState, statuses: FactStatuses): string {
  const opp = DEMO_OPPORTUNITIES.find((o) => o.id === "opp-trades");
  const body = resolveDraft(draft, statuses)
    .map((p) =>
      p
        .filter((c) => !c.gap)
        .map((c) => c.text)
        .join(" "),
    )
    .join("\n\n");
  return JSON.stringify(
    {
      demo: true,
      applicant: DEMO_ORG.name,
      opportunity: opp?.title,
      funder: opp?.funder,
      requestedAmountCents: opp?.askCents,
      sections: [{ title: DEMO_DRAFT.title, text: body }],
      attachments: DEMO_ATTACHMENTS,
    },
    null,
    2,
  );
}

/** SHA-256 hex of `text`, computed in the browser (Web Crypto). Null when unavailable. */
export async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
