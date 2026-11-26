// Pure metric + adversarial-injection helpers for the grounding evals.
import type {
  ApplicationContent,
  Claim,
  ClaimVerdict,
  OpportunityRequirements,
} from "@shared/content";
import { countWords } from "@worker/services/drafting";
import type { VerifyDraftResult } from "@worker/services/grounding";
import { checkFramingClaim } from "@worker/services/grounding";
import type { EvalFact, Fabrication, FabricationKind } from "../fixtures";

export interface ClaimRef {
  sectionKey: string;
  claim: Claim;
}

export function claimsOf(content: ApplicationContent): ClaimRef[] {
  return content.sections.flatMap((s) =>
    s.paragraphs.flatMap((p) => p.claims.map((claim) => ({ sectionKey: s.key, claim }))),
  );
}

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

export interface DraftMetrics {
  sections: number;
  claims: number;
  factualClaims: number;
  framingClaims: number;
  /** Factual claims citing >= 1 fact id / factual claims. */
  citedRate: number;
  /** Verifier "supported" / factual claims. */
  supportedRate: number;
  partiallySupported: number;
  unsupported: number;
  numericMismatches: number;
  unconfirmedFactCitations: number;
  /** Framing claims containing numbers / proper nouns / outcome words / superlatives (independent check). */
  framingViolations: Array<{ claimId: string; text: string; problems: string[] }>;
  /** Citations of restricted / rejected / superseded / unknown fact ids (must be 0). */
  forbiddenCitations: Array<{ claimId: string; factId: string; why: string }>;
  gaps: number;
  /** Expected-gap sections that emitted >= 1 gap / expected-gap sections. */
  gapRecall: number;
  gapSectionDetail: Array<{
    key: string;
    gaps: number;
    factualClaims: number;
    unsupportedClaims: number;
  }>;
  /** Sections within their word limit / sections with a limit. */
  wordLimitCompliance: number;
  overLimit: Array<{ key: string; words: number; limit: number }>;
  groundingPassed: boolean;
  flagsBySeverity: Record<string, number>;
  flagsByKind: Record<string, number>;
}

export function draftMetrics(args: {
  content: ApplicationContent;
  requirements: OpportunityRequirements;
  facts: EvalFact[];
  verification: VerifyDraftResult;
  expectGapSections: string[];
  allowedNames: string[];
}): DraftMetrics {
  const { content, requirements, facts, verification, expectGapSections } = args;
  const { report, flags } = verification;
  const claims = claimsOf(content);
  const factual = claims.filter((c) => c.claim.kind === "factual");
  const framing = claims.filter((c) => c.claim.kind === "framing");
  const factsById = new Map(facts.map((f) => [f.id, f]));
  const verdictById = new Map<string, ClaimVerdict>(report.verdicts.map((v) => [v.claimId, v]));

  const framingViolations = framing.flatMap(({ claim }) => {
    const fc = checkFramingClaim(claim, { allowedNames: args.allowedNames });
    if (fc.ok) return [];
    const problems = [
      ...fc.numbers.map((n) => `number:${n}`),
      ...fc.properNouns.map((n) => `name:${n}`),
      ...fc.outcomeWords.map((n) => `outcome:${n}`),
      ...fc.superlatives.map((n) => `superlative:${n}`),
    ];
    return [{ claimId: claim.id, text: claim.text, problems }];
  });

  const forbiddenCitations = claims.flatMap(({ claim }) =>
    claim.factIds.flatMap((factId) => {
      const f = factsById.get(factId);
      const why = !f
        ? factId.startsWith("ask:")
          ? null
          : "unknown"
        : f.sensitivity === "restricted"
          ? "restricted"
          : f.status === "rejected" || f.status === "superseded"
            ? f.status
            : null;
      return why ? [{ claimId: claim.id, factId, why }] : [];
    }),
  );

  const gapSectionDetail = expectGapSections.map((key) => {
    const s = content.sections.find((x) => x.key === key);
    const sf = claims.filter((c) => c.sectionKey === key && c.claim.kind === "factual");
    return {
      key,
      gaps: s?.gaps.length ?? 0,
      factualClaims: sf.length,
      unsupportedClaims: sf.filter((c) => verdictById.get(c.claim.id)?.verdict !== "supported")
        .length,
    };
  });

  const limited = requirements.sections.filter((r) => r.wordLimit);
  const overLimit = limited.flatMap((r) => {
    const s = content.sections.find((x) => x.key === r.key);
    const words = s ? countWords(s) : 0;
    return r.wordLimit && words > r.wordLimit ? [{ key: r.key, words, limit: r.wordLimit }] : [];
  });

  const tally = (key: (f: (typeof flags)[number]) => string) =>
    flags.reduce<Record<string, number>>((acc, f) => {
      acc[key(f)] = (acc[key(f)] ?? 0) + 1;
      return acc;
    }, {});

  return {
    sections: content.sections.length,
    claims: claims.length,
    factualClaims: factual.length,
    framingClaims: framing.length,
    citedRate: ratio(factual.filter((c) => c.claim.factIds.length > 0).length, factual.length),
    supportedRate: factual.length === 0 ? 0 : report.supported / factual.length,
    partiallySupported: report.partiallySupported,
    unsupported: report.unsupported,
    numericMismatches: report.numericMismatches,
    unconfirmedFactCitations: report.unconfirmedFactCitations,
    framingViolations,
    forbiddenCitations,
    gaps: report.gaps,
    gapRecall: ratio(gapSectionDetail.filter((g) => g.gaps > 0).length, gapSectionDetail.length),
    gapSectionDetail,
    wordLimitCompliance: ratio(limited.length - overLimit.length, limited.length),
    overLimit,
    groundingPassed: report.passed,
    flagsBySeverity: tally((f) => f.severity),
    flagsByKind: tally((f) => f.kind),
  };
}

// ---------------------------------------------------------------------------------------------
// Adversarial injection
// ---------------------------------------------------------------------------------------------

export interface InjectedClaim {
  claimId: string;
  sectionKey: string;
  fabrication: Fabrication;
}

/**
 * Returns a deep copy of the draft with each fabrication appended as its own paragraph,
 * round-robin across sections that already have drafted paragraphs (so the verifier sees them in
 * context). Ids follow the drafter's `s{n}.p{m}.c{k}` scheme.
 */
export function injectFabrications(
  content: ApplicationContent,
  fabrications: Fabrication[],
): { content: ApplicationContent; injected: InjectedClaim[] } {
  const copy: ApplicationContent = structuredClone(content);
  const targets = copy.sections
    .map((s, i) => ({ s, n: i + 1 }))
    .filter((x) => x.s.paragraphs.length > 0);
  const fallback = copy.sections[0];
  if (targets.length === 0 && fallback) targets.push({ s: fallback, n: 1 });
  const injected: InjectedClaim[] = [];
  // Never reuse an id already in the draft (e.g. non-contiguous paragraph ids): detection looks
  // verdicts up by claim id, so a collision would judge the original claim instead.
  const used = new Set(claimsOf(copy).map((c) => c.claim.id));
  fabrications.forEach((fabrication, i) => {
    const t = targets[i % targets.length];
    if (!t) return;
    let m = t.s.paragraphs.length + 1;
    while (used.has(`s${t.n}.p${m}.c1`)) m += 1;
    const claimId = `s${t.n}.p${m}.c1`;
    used.add(claimId);
    t.s.paragraphs.push({
      id: `s${t.n}.p${m}`,
      claims: [
        { id: claimId, text: fabrication.text, kind: "factual", factIds: [...fabrication.factIds] },
      ],
    });
    injected.push({ claimId, sectionKey: t.s.key, fabrication });
  });
  return { content: copy, injected };
}

export interface DetectionResult {
  kind: FabricationKind;
  claimId: string;
  detected: boolean;
  verdict: string;
  unmatchedNumbers: string[];
  flagKinds: string[];
  reason: string;
}

/** A fabrication counts as detected when its verdict is not a pass or it carries a claim-level flag. */
export function detectionResults(
  injected: InjectedClaim[],
  verification: VerifyDraftResult,
): DetectionResult[] {
  return injected.map(({ claimId, fabrication }) => {
    const v = verification.report.verdicts.find((x) => x.claimId === claimId);
    const flagKinds = verification.flags
      .filter(
        (f) =>
          f.claimId === claimId &&
          (f.kind === "unsupported_claim" || f.kind === "numeric_mismatch"),
      )
      .map((f) => f.kind);
    const verdict = v?.verdict ?? "missing";
    const detected =
      verdict === "unsupported" ||
      verdict === "partially_supported" ||
      (v?.unmatchedNumbers.length ?? 0) > 0 ||
      flagKinds.length > 0;
    return {
      kind: fabrication.kind,
      claimId,
      detected,
      verdict,
      unmatchedNumbers: v?.unmatchedNumbers ?? [],
      flagKinds: [...new Set(flagKinds)],
      reason: v?.reason ?? "",
    };
  });
}
