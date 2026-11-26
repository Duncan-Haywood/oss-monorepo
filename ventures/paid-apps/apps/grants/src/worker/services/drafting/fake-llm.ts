// Deterministic FakeLlm handlers for the drafting module's LLM purposes ("drafting.*").
// Must return data that satisfies the zod schema the real call uses. They read the same prompt
// text the real model sees: facts from the context's <facts> block, the section from <section>.
import type { DraftSection } from "@shared/content";
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import type { DraftSummary } from "./prompts";
import { rankRelevantFacts } from "./relevance";
import { countWordsInText, targetWords } from "./text";

export interface ParsedFact {
  id: string;
  statement: string;
  confirmed: boolean;
}

/** Facts listed in the context's <facts> block (one fact per line, id in [brackets] or bare). */
export function parseFactsFromContext(context: string | undefined): ParsedFact[] {
  const block = /<facts>([\s\S]*?)<\/facts>/.exec(context ?? "")?.[1] ?? "";
  const out: ParsedFact[] = [];
  for (const line of block.split("\n")) {
    const m = /\[([A-Za-z0-9_:.-]+)\]\s*(?:\(([^)]*)\))?\s*(.*)$/.exec(line);
    if (!m?.[1] || !m[3]) continue;
    const statement = m[3].split(/\s+—\s+source:/)[0]?.trim() ?? "";
    if (!statement) continue;
    out.push({ id: m[1], statement, confirmed: /\bconfirmed\b/.test(m[2] ?? "") });
  }
  return out;
}

/** Priced rows of the prompt's <budget> table ("[budget:<id>] description"), citable like facts. */
export function parseBudgetFromPrompt(prompt: string): ParsedFact[] {
  const block = /<budget>([\s\S]*?)<\/budget>/.exec(prompt)?.[1] ?? "";
  return [...block.matchAll(/^\[(budget:[A-Za-z0-9_:.-]+)\]\s*(.+)$/gm)].map((m) => ({
    id: m[1] ?? "",
    statement: (m[2] ?? "").trim(),
    confirmed: true,
  }));
}

export interface ParsedSection {
  index: number;
  key: string;
  kind: string;
  title: string;
  funderPrompt: string;
  wordLimit: number | null;
  text: string;
}

export function parseSectionFromPrompt(prompt: string): ParsedSection {
  const block = /<section ([^>]*)>([\s\S]*?)<\/section>/.exec(prompt);
  const attrs = block?.[1] ?? "";
  const body = block?.[2] ?? prompt;
  const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";
  const title = /Title: (.*)/.exec(body)?.[1]?.trim() ?? "Section";
  const limit = /at most (\d+) words/.exec(body)?.[1];
  const funderPrompt = /<funder_prompt>\n([\s\S]*?)\n<\/funder_prompt>/.exec(body)?.[1] ?? "";
  return {
    index: Number(attr("index")) || 1,
    key: attr("key") || "section",
    kind: attr("kind") || "narrative",
    title,
    funderPrompt: funderPrompt.replace(/\s+/g, " ").trim(),
    wordLimit: limit ? Number(limit) : null,
    text: body.replace(
      /Length:.*|Character limit:.*|Title:|Funder prompt: none published.*|<\/?funder_(?:prompt|guidance)>/g,
      " ",
    ),
  };
}

/** Framing openers: connective only — no numbers, names or outcomes. */
const OPENERS = [
  "We are glad to respond to this part of the request.",
  "The points below speak directly to this question.",
  "We welcome the chance to describe this part of our work.",
];

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function fakeDraftSection(req: LlmRequestBase): DraftSection {
  const facts = parseFactsFromContext(req.context);
  const sec = parseSectionFromPrompt(req.prompt);
  const ranked = [
    ...(sec.kind === "budget" ? parseBudgetFromPrompt(req.prompt) : []),
    ...rankRelevantFacts(sec.text, facts)
      .sort((a, b) => b.score - a.score || Number(b.fact.confirmed) - Number(a.fact.confirmed))
      .map((r) => r.fact),
  ];

  const budget = targetWords(sec.wordLimit) ?? 400;
  const opener = OPENERS[(sec.index - 1) % OPENERS.length] ?? "";
  let words = countWordsInText(opener);
  const chosen: ParsedFact[] = [];
  for (const f of ranked.slice(0, 6)) {
    const w = countWordsInText(f.statement);
    if (chosen.length > 0 && words + w > budget) break;
    chosen.push(f);
    words += w;
  }

  const n = sec.index;
  const factual = chosen.map((f) => ({
    text: sentence(f.statement),
    kind: "factual" as const,
    factIds: [f.id],
  }));
  const groups = [factual.slice(0, 3), factual.slice(3)].filter((g) => g.length > 0);
  const paragraphs = groups.map((g, pi) => {
    const claims =
      pi === 0 && sec.kind !== "form_field"
        ? [{ text: opener, kind: "framing" as const, factIds: [] }, ...g]
        : g;
    return {
      id: `s${n}.p${pi + 1}`,
      claims: claims.map((c, ci) => ({ ...c, id: `s${n}.p${pi + 1}.c${ci + 1}` })),
    };
  });

  const gaps =
    chosen.length < 2
      ? [
          {
            question: !sec.funderPrompt
              ? `What specific details can you share for "${sec.title}"?`
              : `For "${sec.title}", the funder asks: ${sec.funderPrompt} What can you tell us?`,
            why: "Fewer than two facts on file address this section.",
          },
        ]
      : [];
  return { key: sec.key, title: sec.title, paragraphs, gaps };
}

export function fakeSummary(req: LlmRequestBase): DraftSummary {
  const claims = (/<claims>([\s\S]*?)<\/claims>/.exec(req.prompt)?.[1] ?? "")
    .split("\n")
    .map((l) => /^- \(([^)]*)\) \[(factual|framing)\] (.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ section: m[1] ?? "", kind: m[2], text: m[3] ?? "" }));
  const seen = new Set<string>();
  const factual = claims.filter(
    (c) => c.kind === "factual" && !seen.has(c.text) && !!seen.add(c.text),
  );
  const openQuestions = (/<open_questions>([\s\S]*?)<\/open_questions>/.exec(req.prompt)?.[1] ?? "")
    .split("\n")
    .filter((l) => l.trim().startsWith("-")).length;

  const picked: string[] = [];
  let words = 0;
  for (const c of factual) {
    const w = countWordsInText(c.text);
    if (words + w > 190) break;
    picked.push(c.text);
    words += w;
  }
  // one key point per section first, then fill up to four
  const firstPerSection = factual.filter(
    (c, i) => factual.findIndex((d) => d.section === c.section) === i,
  );
  const ordered = [...firstPerSection, ...factual.filter((c) => !firstPerSection.includes(c))];
  const keyPoints = ordered.slice(0, 4).map((c) => `${c.section}: ${c.text}`);
  keyPoints.push(
    openQuestions
      ? `${openQuestions} open question(s) must be answered before submission.`
      : "Every factual claim cites the fact base.",
  );
  return {
    executiveSummary: picked.join(" ") || "The draft contains no factual claims yet.",
    keyPoints: keyPoints.slice(0, 6),
  };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  "drafting.section": fakeDraftSection,
  "drafting.summary": fakeSummary,
};
