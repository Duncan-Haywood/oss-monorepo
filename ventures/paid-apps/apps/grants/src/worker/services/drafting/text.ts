// Pure helpers: word counting, plain-text rendering and deterministic post-processing of
// model output (fact-id sanitization, stable ids, trimming to the funder's limits).
import type { ApplicationContent, Claim, DraftSection, RequirementSection } from "@shared/content";
import { findNewContactInfo } from "../safety/output-guards";

/** Words in a string (whitespace-separated tokens). */
export function countWordsInText(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Words across every claim of a section (gaps are not part of the submitted text). */
export function countWords(section: DraftSection): number {
  let n = 0;
  for (const p of section.paragraphs) for (const c of p.claims) n += countWordsInText(c.text);
  return n;
}

const paragraphText = (claims: Claim[]) =>
  claims
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ");

/** The submitted text of one section (paragraphs separated by blank lines, no title). */
export function renderSectionText(section: DraftSection): string {
  return section.paragraphs
    .map((p) => paragraphText(p.claims))
    .filter(Boolean)
    .join("\n\n");
}

/** Plain-text rendering of the whole application: title, blank line, paragraphs, per section. */
export function renderPlainText(content: ApplicationContent): string {
  return content.sections
    .map((s) => {
      const body = renderSectionText(s);
      return body ? `${s.title}\n\n${body}` : s.title;
    })
    .join("\n\n\n");
}

/** Target length we ask the model for: 90% of the word limit. */
export function targetWords(wordLimit: number | null | undefined): number | null {
  return wordLimit ? Math.max(1, Math.floor(wordLimit * 0.9)) : null;
}

export interface PostProcessOptions {
  /** 1-based position of the section in the application (claim ids are `s{n}.p{m}.c{k}`). */
  sectionIndex: number;
  requirement: Pick<RequirementSection, "key" | "title" | "wordLimit" | "charLimit">;
  /** Fact ids the drafter was given. Citations outside this set are dropped. */
  allowedFactIds: ReadonlySet<string>;
  /**
   * Fact id -> its statement and quote. When given, a claim with an email, URL or phone number
   * that none of its cited facts contains is dropped and turned into a gap (the model invented it,
   * or copied it from injected funder text).
   */
  factTexts?: ReadonlyMap<string, string>;
}

export interface PostProcessResult {
  section: DraftSection;
  /** Cited ids that were not in the provided fact set (removed from their claims). */
  droppedFactIds: string[];
  /** Number of claims removed to fit the funder's limit. */
  trimmedClaims: number;
  /** Claims removed because they carried contact details not in their cited facts. */
  droppedContactClaims: number;
}

/**
 * Deterministic clean-up of a model-written section:
 * - forces key/title from the requirement,
 * - drops empty claims/paragraphs and fact ids not in the provided set (the claim is kept so the
 *   grounding verifier flags it as uncited),
 * - trims trailing claims when over the word limit by >10% (or over a char limit at all),
 * - assigns stable ids `s{n}.p{m}` / `s{n}.p{m}.c{k}`,
 * - de-duplicates gaps.
 */
export function postProcessSection(raw: DraftSection, opts: PostProcessOptions): PostProcessResult {
  const dropped = new Set<string>();
  let droppedContactClaims = 0;
  const hasNewContact = (c: Claim) =>
    !!opts.factTexts &&
    findNewContactInfo(
      c.text,
      c.factIds.map((id) => opts.factTexts?.get(id)),
    ).length > 0;
  let paragraphs = raw.paragraphs
    .map((p) => ({
      claims: p.claims
        .map((c): Claim => {
          const factIds: string[] = [];
          for (const id of c.factIds ?? []) {
            const fid = id.trim();
            if (!fid || factIds.includes(fid)) continue;
            if (opts.allowedFactIds.has(fid)) factIds.push(fid);
            else dropped.add(fid);
          }
          return {
            id: "",
            text: c.text.replace(/\s+/g, " ").trim(),
            kind: c.kind === "framing" ? "framing" : "factual",
            factIds,
          };
        })
        .filter((c) => c.text.length > 0)
        .filter((c) => {
          if (!hasNewContact(c)) return true;
          droppedContactClaims++;
          return false;
        }),
    }))
    .filter((p) => p.claims.length > 0);

  const { wordLimit, charLimit } = opts.requirement;
  let trimmedClaims = 0;
  const words = () =>
    paragraphs.reduce((n, p) => n + p.claims.reduce((m, c) => m + countWordsInText(c.text), 0), 0);
  const chars = () => paragraphs.map((p) => paragraphText(p.claims)).join("\n\n").length;
  const overWords = () => !!wordLimit && words() > wordLimit;
  const overChars = () => !!charLimit && chars() > charLimit;
  const needsTrim = (!!wordLimit && words() > wordLimit * 1.1) || overChars();
  if (needsTrim) {
    while ((overWords() || overChars()) && totalClaims(paragraphs) > 1) {
      const last = paragraphs[paragraphs.length - 1];
      if (!last) break;
      last.claims.pop();
      trimmedClaims++;
      if (last.claims.length === 0) paragraphs = paragraphs.slice(0, -1);
    }
  }

  const n = opts.sectionIndex;
  const section: DraftSection = {
    key: opts.requirement.key,
    title: opts.requirement.title,
    paragraphs: paragraphs.map((p, pi) => ({
      id: `s${n}.p${pi + 1}`,
      claims: p.claims.map((c, ci) => ({ ...c, id: `s${n}.p${pi + 1}.c${ci + 1}` })),
    })),
    gaps: dedupeGaps([
      ...(raw.gaps ?? []),
      ...(droppedContactClaims
        ? [
            {
              question:
                "Which contact details (email, website or phone), if any, should this section give?",
              why: "A drafted sentence had contact details that are not in the facts it cites, so it was removed.",
            },
          ]
        : []),
    ]),
  };
  return { section, droppedFactIds: [...dropped], trimmedClaims, droppedContactClaims };
}

function totalClaims(paragraphs: { claims: Claim[] }[]) {
  return paragraphs.reduce((n, p) => n + p.claims.length, 0);
}

export function dedupeGaps(gaps: DraftSection["gaps"]): DraftSection["gaps"] {
  const seen = new Set<string>();
  const out: DraftSection["gaps"] = [];
  for (const g of gaps) {
    const question = g.question.replace(/\s+/g, " ").trim();
    if (!question) continue;
    const k = question.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ question, why: g.why.replace(/\s+/g, " ").trim() });
  }
  return out;
}

/** All claims of a content object in reading order (used for the summary prompt). */
export function allClaims(content: ApplicationContent): { sectionTitle: string; claim: Claim }[] {
  const out: { sectionTitle: string; claim: Claim }[] = [];
  for (const s of content.sections)
    for (const p of s.paragraphs)
      for (const c of p.claims) out.push({ sectionTitle: s.title, claim: c });
  return out;
}
