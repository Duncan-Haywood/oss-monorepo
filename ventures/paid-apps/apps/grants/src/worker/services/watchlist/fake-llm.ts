// Deterministic FakeLlm handlers for the watchlist module ("watchlist.*"). The fake detector reads
// headings / list items that name a grant program and quotes text that is literally in the input.
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { changedTextFromPrompt, DETECT_PURPOSE, type DetectOutput } from "./detect";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const TITLE_RE =
  /\b(grants?|rfps?|rfas?|request for (proposals|applications)|fund|funding|program|initiative|award)\b/i;

function findDate(text: string): string | null {
  const named = text.match(
    new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i"),
  );
  if (named) {
    const m = MONTHS.indexOf((named[1] ?? "").toLowerCase()) + 1;
    return `${named[3]}-${String(m).padStart(2, "0")}-${String(named[2]).padStart(2, "0")}`;
  }
  return text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
}

function findAmount(text: string): number | null {
  const all = [...text.matchAll(/\$\s?(\d[\d,]*)(?:\.\d+)?\s*(million|k\b)?/gi)].map((m) => {
    const n = Number((m[1] ?? "").replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    return n * (unit === "million" ? 1_000_000 : unit === "k" ? 1_000 : 1) * 100;
  });
  const valid = all.filter((n) => Number.isFinite(n) && n > 0);
  return valid.length ? Math.max(...valid) : null;
}

export function fakeDetect(changedText: string): DetectOutput {
  const lines = changedText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "…");
  const linkLines = lines
    .filter((l) => /^(- )?https?:\/\//.test(l))
    .map((l) => l.replace(/^- /, ""));
  const candidates: DetectOutput["candidates"] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = line.match(/^#{1,4}\s+(.+)$/)?.[1];
    if (!heading || !TITLE_RE.test(heading) || heading.length > 160) continue;
    const window: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const l = lines[j] ?? "";
      if (/^#{1,4}\s/.test(l)) break;
      window.push(l);
    }
    const body = window.filter(
      (l) => !/^(- )?https?:\/\//.test(l) && !/^Links on this page/i.test(l),
    );
    const quote = body.find((l) => l.length >= 30) ?? heading;
    const near = body.join("\n");
    const words = heading
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 5);
    const link = linkLines.find((u) => words.some((w) => u.toLowerCase().includes(w))) ?? null;
    candidates.push({
      title: heading,
      deadline: findDate(near),
      amountCents: findAmount(near),
      eligibility: body.find((l) => /eligib/i.test(l)) ?? null,
      link,
      evidenceQuote: quote,
    });
  }
  return { candidates };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [DETECT_PURPOSE]: (req: LlmRequestBase) => fakeDetect(changedTextFromPrompt(req.prompt)),
};
