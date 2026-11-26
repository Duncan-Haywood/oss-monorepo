// Deterministic FakeLlm handler for `reports.draft`. It reads the same prompt the model sees: the
// period results and background facts from the context, the goals, and the requested sections.
// Like the real contract it reports only period results as achieved and leaves the rest unknown.
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { REPORT_DRAFT_PURPOSE, type ReportDraftOutput } from "./prompts";

interface ParsedLine {
  id: string;
  text: string;
}

function block(text: string | undefined, tag: string): string {
  return new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(text ?? "")?.[1] ?? "";
}

/** `[id] (meta) statement — source: …` lines of a context block. */
export function parseFactLines(context: string | undefined, tag: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const line of block(context, tag).split("\n")) {
    const m = /^\[([A-Za-z0-9_:.-]+)\]\s*(?:\([^)]*\))?\s*(.*)$/.exec(line.trim());
    const text = m?.[2]?.split(/\s+—\s+source:/)[0]?.trim();
    if (m?.[1] && text) out.push({ id: m[1], text });
  }
  return out;
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

function overlap(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n;
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function fakeReportDraft(req: LlmRequestBase): ReportDraftOutput {
  const results = parseFactLines(req.context, "period_results");
  const background = parseFactLines(req.context, "background_facts");
  const goals = parseFactLines(req.context, "promised_goals");
  const sections = [...req.prompt.matchAll(/<section index="(\d+)" key="([^"]+)">\nTitle: (.*)/g)];

  const out: ReportDraftOutput = { sections: [], comparisons: [] };
  for (const [, idx, key = "section", title = "Section"] of sections) {
    const n = Number(idx) || out.sections.length + 1;
    const facts =
      key === "outcomes"
        ? results
        : key === "summary"
          ? results.slice(0, 1)
          : background.slice(0, 2);
    const claims = facts.map((f) => ({
      text: sentence(f.text),
      kind: "factual" as const,
      factIds: [f.id],
    }));
    const all = claims.length
      ? [
          {
            text: "We are glad to share our progress on this part of the work.",
            kind: "framing" as const,
            factIds: [],
          },
          ...claims,
        ]
      : [];
    out.sections.push({
      key,
      title,
      paragraphs: all.length
        ? [{ id: `s${n}.p1`, claims: all.map((c, i) => ({ ...c, id: `s${n}.p1.c${i + 1}` })) }]
        : [],
      gaps: all.length
        ? []
        : [
            {
              question: `What can you share about "${title}" for this period?`,
              why: "No facts on file cover it.",
            },
          ],
    });
  }
  for (const g of goals) {
    const best = results
      .map((f) => ({ f, score: overlap(g.text, f.text) }))
      .sort((a, b) => b.score - a.score)[0];
    out.comparisons.push(
      best && best.score >= 2
        ? { goalId: g.id, status: "met", achieved: sentence(best.f.text), factIds: [best.f.id] }
        : { goalId: g.id, status: "unknown", achieved: null, factIds: [] },
    );
  }
  return out;
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [REPORT_DRAFT_PURPOSE]: fakeReportDraft,
};
