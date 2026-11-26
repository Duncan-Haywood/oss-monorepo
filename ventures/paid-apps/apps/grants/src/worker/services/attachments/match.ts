// Deterministic matching of funder attachment requirements ("IRS determination letter",
// "Board of directors list", "Most recent audit") to the org's own documents, by document kind and
// title keywords. Pure functions. The optional LLM suggestion (attachments.match) may only pick
// among the candidate ids passed to it; validateLlmMatches() enforces that.
import type { DocumentKind } from "@shared/enums";

export interface MatchableDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  status: string;
  createdAt: Date;
}

export interface RequirementLike {
  name: string;
  description?: string;
}

export interface DocumentMatch {
  documentId: string;
  source: "kind" | "keyword";
  score: number;
}

/** Document kinds that are never a funder attachment (internal notes, crawled pages, transcripts). */
const NEVER_ATTACH: ReadonlySet<DocumentKind> = new Set([
  "interview_transcript",
  "website_page",
  "update_note",
  "past_application",
  "rejection_letter",
]);

interface Rule {
  /** Requirement text must match this. */
  req: RegExp;
  /** Document kinds that satisfy the requirement (kind match). */
  kinds: DocumentKind[];
  /** Title patterns that satisfy it (keyword match); a kind match plus a title hit scores highest. */
  titles: RegExp[];
}

/** Ordered: the first rule whose `req` matches is used. */
const RULES: Rule[] = [
  {
    req: /\b(irs|determination letter|501\s*\(?c\)?\s*\(?3\)?|tax[- ]exempt|exemption letter)\b/i,
    kinds: [],
    titles: [/\birs\b/i, /determination/i, /501\s*\(?c\)?\s*\(?3\)?/i, /tax[- ]?exempt/i],
  },
  {
    req: /\b(letters? of (support|commitment)|support letters?|commitment letters?|mou|memorand(um|a) of understanding)\b/i,
    kinds: ["letter_of_support"],
    titles: [/letter of (support|commitment)/i, /support letter/i, /\bmou\b/i],
  },
  {
    req: /\b(audit|audited|financial statements?|financials|990|form 990|balance sheet|income statement)\b/i,
    kinds: ["financial_statement"],
    titles: [/audit/i, /financial/i, /\b990\b/i, /balance sheet/i],
  },
  {
    req: /\bbudget\b/i,
    kinds: ["budget"],
    titles: [/budget/i],
  },
  {
    req: /\bboard\b.*\b(list|roster|members?|directors?|trustees?|affiliations?)\b|\b(list|roster) of (board|directors|trustees)\b/i,
    kinds: [],
    titles: [/\bboard\b/i, /directors/i, /trustees/i],
  },
  {
    req: /\b(bylaws|by-laws|articles of incorporation|charter|certificate of incorporation)\b/i,
    kinds: ["charter_bylaws"],
    titles: [/by-?laws/i, /articles of incorporation/i, /charter/i],
  },
  {
    req: /\b(resumes?|résumés?|cvs?|curricul(um|a) vitae|bios?|biographies|key (staff|personnel))\b/i,
    kinds: [],
    titles: [/r[ée]sum[ée]/i, /\bcv\b/i, /curriculum vitae/i, /\bbios?\b/i, /biograph/i],
  },
  {
    req: /\bannual report\b/i,
    kinds: ["annual_report"],
    titles: [/annual report/i],
  },
  {
    req: /\bmission\b/i,
    kinds: ["mission_statement"],
    titles: [/mission/i],
  },
  {
    req: /\bpolic(y|ies)\b/i,
    kinds: ["policy"],
    titles: [/polic(y|ies)/i],
  },
  {
    req: /\b(program description|project description|logic model|program narrative)\b/i,
    kinds: ["program_description"],
    titles: [/program/i, /project/i, /logic model/i],
  },
  {
    req: /\baward letters?\b/i,
    kinds: ["award_letter"],
    titles: [/award/i],
  },
];

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "copy",
  "current",
  "for",
  "from",
  "if",
  "in",
  "most",
  "of",
  "on",
  "or",
  "organization",
  "organizations",
  "recent",
  "required",
  "the",
  "to",
  "with",
  "your",
  "our",
  "applicant",
  "document",
  "documents",
  "attachment",
  "attachments",
  "signed",
  "latest",
  "year",
  "fiscal",
  "pdf",
]);

export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

export const requirementKey = (name: string) => name.trim().toLowerCase();

export function ruleFor(requirement: RequirementLike): Rule | null {
  const text = requirement.name;
  return RULES.find((r) => r.req.test(text)) ?? null;
}

export function isAttachable(doc: Pick<MatchableDocument, "kind" | "status">): boolean {
  return !NEVER_ATTACH.has(doc.kind) && doc.status !== "failed";
}

/**
 * Best existing document for one requirement, or null. Deterministic: rule (kind and/or title
 * keyword) first, then a generic title-token overlap; ties go to the newest document.
 */
export function matchRequirement(
  requirement: RequirementLike,
  docs: readonly MatchableDocument[],
): DocumentMatch | null {
  const candidates = docs.filter(isAttachable);
  if (candidates.length === 0) return null;
  const rule = ruleFor(requirement);
  const reqTokens = new Set(significantTokens(requirement.name));
  let best: (DocumentMatch & { at: number }) | null = null;
  for (const d of candidates) {
    let score = 0;
    let source: DocumentMatch["source"] = "keyword";
    if (rule) {
      const kindHit = rule.kinds.includes(d.kind);
      const titleHit = rule.titles.some((re) => re.test(d.title));
      if (kindHit && titleHit) score = 3;
      else if (kindHit) score = 2;
      else if (titleHit) score = 1.5;
      if (kindHit) source = "kind";
    }
    if (score === 0 && reqTokens.size > 0) {
      // Generic fallback: most of the requirement's significant words appear in the title.
      const titleTokens = new Set(significantTokens(d.title));
      let shared = 0;
      for (const t of reqTokens) if (titleTokens.has(t)) shared++;
      const coverage = shared / reqTokens.size;
      if (shared >= 2 || (shared >= 1 && coverage >= 0.99)) score = coverage;
    }
    if (score <= 0) continue;
    const at = d.createdAt.getTime();
    if (!best || score > best.score || (score === best.score && at > best.at)) {
      best = { documentId: d.id, source, score, at };
    }
  }
  return best ? { documentId: best.documentId, source: best.source, score: best.score } : null;
}

// ---- LLM suggestion contract (attachments.match) ----------------------------------------------

export interface LlmMatchOutput {
  matches: { requirement: number; documentId: string | null; reason?: string }[];
}

/**
 * Keep only suggestions that point at an unmatched requirement index and at a document id from the
 * candidate set (the org's own attachable documents). Anything else (invented ids, another org's
 * ids, duplicates) is dropped. Returns requirement index -> document id.
 */
export function validateLlmMatches(
  output: LlmMatchOutput,
  allowedRequirements: ReadonlySet<number>,
  candidateIds: ReadonlySet<string>,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of output.matches) {
    if (!Number.isInteger(m.requirement) || !allowedRequirements.has(m.requirement)) continue;
    if (!m.documentId || !candidateIds.has(m.documentId)) continue;
    if (out.has(m.requirement)) continue;
    out.set(m.requirement, m.documentId);
  }
  return out;
}
