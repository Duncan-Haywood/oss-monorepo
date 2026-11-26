// Deterministic FakeLlm handlers for the imports module ("imports.*"). The fake extractor reads the
// source text with simple heuristics, so everything it returns is literally present in the source.
import type { RequirementSection } from "@shared/content";
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { EXTRACT_PURPOSE, type ExtractedOpportunity, sourceTextFromPrompt } from "./extract";

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

function parseDollars(raw: string, unit?: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const u = (unit ?? "").toLowerCase();
  const mult = u.startsWith("m") ? 1_000_000 : u.startsWith("k") || u.startsWith("t") ? 1_000 : 1;
  return Math.round(n * mult * 100);
}

function findDates(text: string): { iso: string; index: number }[] {
  const out: { iso: string; index: number }[] = [];
  const named = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi");
  for (const m of text.matchAll(named)) {
    const month = MONTHS.indexOf((m[1] ?? "").toLowerCase());
    const iso = `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    out.push({ iso, index: m.index ?? 0 });
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    out.push({ iso: `${m[1]}-${m[2]}-${m[3]}`, index: m.index ?? 0 });
  }
  return out.sort((a, b) => a.index - b.index);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "section";

export function fakeExtract(text: string): ExtractedOpportunity {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const heading = lines.find((l) => /^#{1,3}\s+/.test(l))?.replace(/^#+\s+/, "");
  const titleLine = text.match(/^\s*title\s*:\s*(.+)$/im)?.[1]?.trim();
  const title = titleLine ?? heading ?? lines[0]?.slice(0, 200) ?? null;

  const funderLine = text.match(
    /^\s*(?:funder|funded by|offered by|sponsor|grantor|agency)\s*[:-]\s*(.+)$/im,
  )?.[1];
  const funderPhrase = text.match(
    /\b((?:[A-Z][\w&'.-]*\s+){0,5}(?:Foundation|Fund|Trust|Endowment|Department of [A-Z][\w]*(?:\s+[A-Z][\w]*)*))\b/,
  )?.[1];
  const funderName = (funderLine ?? funderPhrase)?.trim() ?? null;

  const amounts = [...text.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(million|m\b|k\b|thousand)?/gi)]
    .map((m) => parseDollars(m[1] ?? "", m[2]))
    .filter((n): n is number => n !== null && n > 0);
  const awardFloorCents = amounts.length >= 2 ? Math.min(...amounts) : null;
  const awardCeilingCents = amounts.length ? Math.max(...amounts) : null;

  const dates = findDates(text);
  const deadlineIdx = text.search(/deadline|due|close[sd]?\b|submit by/i);
  const closeDate =
    (deadlineIdx >= 0 ? dates.find((d) => d.index >= deadlineIdx) : undefined)?.iso ??
    dates.at(-1)?.iso ??
    null;

  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  const applyUrl = text.match(/https?:\/\/[^\s)>"']*apply[^\s)>"']*/i)?.[0] ?? null;
  const submissionMethod = email
    ? "email"
    : /grants\.gov/i.test(text)
      ? "grants_gov"
      : applyUrl || /\b(portal|apply online|online application)\b/i.test(text)
        ? "portal"
        : null;

  const eligibilityText =
    lines.find((l) => /eligib/i.test(l) && !/^#/.test(l) && l.length > 20) ?? null;
  const applicantTypes = [
    [/501\s?\(c\)\s?\(3\)|nonprofit|non-profit/i, "nonprofit"],
    [/tribal|tribe|native american/i, "tribal_organization"],
    [/\bgovernments?\b|municipalit/i, "government"],
    [/school|universit|college/i, "educational"],
  ]
    .filter(([re]) => (re as RegExp).test(eligibilityText ?? ""))
    .map(([, t]) => t as string);

  const sections: RequirementSection[] = [];
  const seenKeys = new Set<string>();
  for (const l of lines) {
    const q = l.replace(/^(?:\d+[.)]|[-*•]|q\d+[:.])\s*/i, "");
    if (!q.endsWith("?") && !/\(\s*\d+\s*words?\s*(max(imum)?)?\s*\)/i.test(q)) continue;
    if (q.length < 15) continue;
    let key = slug(q.split(/\s+/).slice(0, 6).join(" "));
    while (seenKeys.has(key)) key = `${key}_2`;
    seenKeys.add(key);
    const words = q.match(/(\d+)\s*words?/i)?.[1];
    sections.push({
      key,
      title: q.replace(/\s*\(.*?\)\s*$/, "").slice(0, 120),
      prompt: q,
      kind: /budget/i.test(q) ? "budget" : "narrative",
      required: true,
      wordLimit: words ? Number(words) : null,
      charLimit: null,
      guidance: "",
    });
  }

  const paragraphs = lines.filter((l) => !/^#/.test(l) && l.length > 60);
  const summary = paragraphs[0] ?? null;
  return {
    isGrantOpportunity: /\b(grant|funding|award|rfp|proposals?|request for applications)\b/i.test(
      text,
    ),
    title,
    funderName,
    opportunityNumber: null,
    summary,
    description: paragraphs.slice(0, 5).join("\n\n") || null,
    eligibilityText,
    applicantTypes,
    geographicScope: null,
    awardFloorCents,
    awardCeilingCents,
    totalFundingCents: null,
    openDate: null,
    closeDate,
    submissionMethod,
    submissionEmail: email,
    submissionUrl: applyUrl,
    requirements: {
      sections,
      attachments: [],
      eligibilityCriteria: eligibilityText ? [eligibilityText] : [],
      submissionInstructions: "",
      complete: sections.length > 0,
    },
  };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [EXTRACT_PURPOSE]: (req: LlmRequestBase) => fakeExtract(sourceTextFromPrompt(req.prompt)),
};
