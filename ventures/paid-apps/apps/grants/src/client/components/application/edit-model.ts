// Turn an edited paragraph (plain text in a textarea) back into claims for PATCH /sections/:key.
// Unchanged sentences keep their claim (id, kind, citations). An edited sentence inherits the
// citations of the original claim it overlaps most, so the verifier re-checks it against the same
// facts; a brand-new sentence with a number becomes an uncited factual claim, which the verifier
// will flag. Nothing here can make an edit look grounded when it isn't.
import type { Claim, Paragraph } from "@shared/content";
import { paragraphText } from "./model";

// A raw piece ending like this is an abbreviation ("U.S.", "Dr.", "e.g."), not a sentence end.
const ABBREVIATION_END = /(?:^|[\s.(])(?:[A-Za-z]|Dr|Mr|Mrs|Ms|St|No|vs|etc|Inc|Jr|Sr)\.$/;

/** Split text into sentences, keeping closing quotes/brackets with their sentence. */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g) ?? [normalized];
  const out: string[] = [];
  for (const raw of parts) {
    const prev = out[out.length - 1];
    // Raw pieces concatenate back to the original text, so merging never changes spacing.
    if (
      prev !== undefined &&
      (ABBREVIATION_END.test(prev) || (/\d\.$/.test(prev) && /^\d/.test(raw)))
    ) {
      out[out.length - 1] = prev + raw;
    } else {
      out.push(raw);
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

function overlap(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(A.size, B.size);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Rebuild a paragraph's claims from edited text. Returns null when the text is empty. */
export function paragraphFromText(
  original: Paragraph,
  text: string,
  makeId: (i: number) => string = (i) => `${original.id}.e${i + 1}`,
): Paragraph | null {
  if (norm(text) === norm(paragraphText(original))) return original;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;
  const used = new Set<string>();
  const taken = new Set(original.claims.map((c) => c.id));
  let n = 0;
  const freshId = () => {
    let id = makeId(n++);
    while (taken.has(id)) id = makeId(n++);
    taken.add(id);
    return id;
  };
  const claims: Claim[] = sentences.map((sentence) => {
    const exact = original.claims.find((c) => !used.has(c.id) && norm(c.text) === sentence);
    if (exact) {
      used.add(exact.id);
      return exact;
    }
    let best: Claim | undefined;
    let bestScore = 0;
    for (const c of original.claims) {
      const score = overlap(c.text, sentence);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0.3) {
      return { id: freshId(), text: sentence, kind: best.kind, factIds: [...best.factIds] };
    }
    const looksFactual = /\d/.test(sentence);
    return {
      id: freshId(),
      text: sentence,
      kind: looksFactual ? "factual" : "framing",
      factIds: [],
    };
  });
  return { id: original.id, claims };
}

/** Apply textarea values (one per paragraph, plus any new ones) to a section's paragraphs. */
export function paragraphsFromDrafts(
  originals: Paragraph[],
  drafts: string[],
  sectionKey: string,
  stamp: string = Date.now().toString(36),
): Paragraph[] {
  const out: Paragraph[] = [];
  drafts.forEach((text, i) => {
    const original = originals[i] ?? { id: `${sectionKey}.p${i + 1}.${stamp}`, claims: [] };
    const p = paragraphFromText(original, text, (j) => `${original.id}.e${stamp}${j + 1}`);
    if (p && p.claims.length > 0) out.push(p);
  });
  return out;
}
