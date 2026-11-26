// Deterministic FakeLlm handlers for the attachments module ("attachments.*"). They return data that
// satisfies the real call's zod schema, and behave like a well-behaved model: they only cite the
// facts / pick the document ids listed in the prompt.
import type { FakeHandler } from "../../ports/fake-llm";
import { significantTokens } from "./match";

/** attachments.match: pick the listed document whose title shares the most words with a requirement. */
export const matchFake: FakeHandler = (req) => {
  const reqs = [...req.prompt.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => ({
    index: Number(m[1]),
    tokens: new Set(significantTokens(m[2] ?? "")),
  }));
  const docs = [...req.prompt.matchAll(/^- (doc_[a-z0-9]+) \| [a-z_]+ \| (.+)$/gm)].map((m) => ({
    id: m[1] as string,
    tokens: significantTokens(m[2] ?? ""),
  }));
  return {
    matches: reqs.map((r) => {
      let best: { id: string; n: number } | null = null;
      for (const d of docs) {
        const n = d.tokens.filter((t) => r.tokens.has(t)).length;
        if (n > 0 && (!best || n > best.n)) best = { id: d.id, n };
      }
      return {
        requirement: r.index,
        documentId: best?.id ?? null,
        reason: best ? "Title matches" : "",
      };
    }),
  };
};

/** attachments.letter_request: restate the listed partner facts (cited) and a placeholder outline. */
export const letterRequestFake: FakeHandler = (req) => {
  const org = /^Organization: (.+)$/m.exec(req.prompt)?.[1] ?? "our organization";
  const partner = /^Partner: (.+)$/m.exec(req.prompt)?.[1] ?? "your organization";
  const grant = /^Grant: (.+)$/m.exec(req.prompt)?.[1] ?? "a grant";
  const facts = [...req.prompt.matchAll(/^- \[(fct_[a-z0-9]+)\] (.+)$/gm)].map((m) => ({
    id: m[1] as string,
    statement: (m[2] ?? "").trim(),
  }));
  const paragraphs: { text: string; factIds: string[] }[] = [
    {
      text: `${org} is preparing an application for ${grant}, and a letter from ${partner} would mean a great deal.`,
      factIds: [],
    },
  ];
  if (facts.length) {
    paragraphs.push({
      text: `Our records about our work together:\n${facts.map((f) => f.statement).join("\n")}`,
      factIds: facts.map((f) => f.id),
    });
  }
  return {
    paragraphs,
    outline: [
      `How ${partner} works with ${org}: [describe in your own words]`,
      "What you have seen of the program's impact: [your perspective]",
      "Any commitment you are able to make: [describe only what you are actually committing to]",
    ],
  };
};

export const fakeHandlers: Record<string, FakeHandler> = {
  "attachments.match": matchFake,
  "attachments.letter_request": letterRequestFake,
};
