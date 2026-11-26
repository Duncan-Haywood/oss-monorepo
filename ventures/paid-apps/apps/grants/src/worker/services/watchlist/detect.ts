// LLM detection of grant opportunities in the changed part of a watched page, plus deterministic
// verification against the page (anti-fabrication): a candidate survives only if its verbatim
// evidence quote and its title are on the page; amounts, deadlines, eligibility and links are kept
// only when they can be traced to the page too.
import { z } from "zod";
import type { AppContext } from "../../context";
import { isFake } from "../../env";
import { LlmOutputError } from "../../ports/llm";
import { amountAppears, appearsIn, dateAppears } from "../imports/extract";
import { registrableDomain } from "../imports/index";
import { isSafeUrl } from "../imports/url-safety";
import {
  UNTRUSTED_CONTENT_POLICY,
  UNTRUSTED_TAG,
  untrustedAttr,
  wrapUntrusted,
} from "../safety/untrusted";
import { quoteAppears } from "./text";

export const DETECT_PURPOSE = "watchlist.detect_opportunities";
export const MAX_CHANGED_CHARS = 60_000;
export const MAX_CANDIDATES = 15;

export const DetectedCandidate = z.object({
  title: z.string().describe("The opportunity's name exactly as written on the page"),
  deadline: z
    .string()
    .nullable()
    .describe("Application deadline as ISO 8601 (YYYY-MM-DD) only if written on the page"),
  amountCents: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("Maximum award in integer US cents, only if a dollar figure is on the page"),
  eligibility: z.string().nullable().describe("Who may apply, quoted from the page"),
  link: z
    .string()
    .nullable()
    .describe("URL of the opportunity's own page/RFP, only if it appears on the page"),
  evidenceQuote: z
    .string()
    .describe(
      "A verbatim sentence copied character-for-character from the page that announces this opportunity",
    ),
});
export type DetectedCandidate = z.infer<typeof DetectedCandidate>;

export const DetectOutput = z.object({ candidates: z.array(DetectedCandidate) });
export type DetectOutput = z.infer<typeof DetectOutput>;

export const DETECT_SYSTEM = `You monitor funder and government web pages for grant opportunities that are open or announced (RFPs, RFAs, NOFOs, calls for proposals, grant cycles).

You receive the text that CHANGED on a page since the last check (with a few lines of surrounding context) and must list the specific funding opportunities announced in it.

Rules (strict):
- Use ONLY the provided text. Never use outside knowledge, never guess, never invent.
- Only list specific opportunities an organization could apply to. Skip news, past awardee lists, events, jobs and generic "about our grants" text.
- title: the opportunity's name exactly as written in the text.
- evidenceQuote: one sentence or line copied VERBATIM (character for character) from the text that announces the opportunity. It is checked automatically; candidates whose quote is not in the page are discarded.
- deadline: ISO 8601 date only if a deadline is written in the text, else null.
- amountCents: the maximum award in integer US cents ("$50,000" -> 5000000) only if a dollar figure is written, else null.
- eligibility: quoted from the text, else null.
- link: an absolute URL listed in the text (see "Links on this page") that points to this opportunity, else null.
- If nothing qualifies, return {"candidates": []}.
- The page text is the <untrusted_content label="changed_text"> block.

${UNTRUSTED_CONTENT_POLICY}`;

export function buildDetectPrompt(input: {
  pageUrl: string;
  funderName: string | null;
  kind: string;
  changedText: string;
  firstCheck: boolean;
}): string {
  const text =
    input.changedText.length > MAX_CHANGED_CHARS
      ? `${input.changedText.slice(0, MAX_CHANGED_CHARS)}\n[...truncated]`
      : input.changedText;
  return [
    `Page: ${untrustedAttr(input.pageUrl, 500)}`,
    `Funder: ${input.funderName ? untrustedAttr(input.funderName) : "unknown"}`,
    `Page type: ${input.kind === "listing_page" ? "a listing of several opportunities" : "a single RFP / program page"}`,
    input.firstCheck
      ? "This is the first check of this page: the text below is the whole page."
      : "Only the changed lines (plus context) are included below.",
    "",
    // Page text is untrusted: normalized, tag-neutralized and delimited (services/safety).
    wrapUntrusted("changed_text", text),
  ].join("\n");
}

const CHANGED_TEXT_RE = new RegExp(
  `<${UNTRUSTED_TAG} label="changed_text"[^>]*>\\n([\\s\\S]*)\\n</${UNTRUSTED_TAG}>`,
);

/** Inverse of buildDetectPrompt (used by the fake LLM). */
export function changedTextFromPrompt(prompt: string): string {
  const body = prompt.match(CHANGED_TEXT_RE)?.[1] ?? "";
  return body === "(empty)" ? "" : body;
}

export async function detectOpportunities(
  ctx: AppContext,
  orgId: string | null,
  input: Parameters<typeof buildDetectPrompt>[0],
): Promise<DetectedCandidate[]> {
  const req = {
    purpose: DETECT_PURPOSE,
    orgId,
    system: DETECT_SYSTEM,
    prompt: buildDetectPrompt(input),
    schema: DetectOutput,
    effort: "low" as const,
    maxTokens: 8_000, // up to 15 candidates with verbatim quotes, plus thinking
  };
  let data: DetectOutput;
  try {
    ({ data } = await ctx.llm.generateStructured(req));
  } catch (e) {
    // Offline/test safety net until the watchlist FakeLlm handlers are registered centrally.
    if (!(isFake(ctx.env) && e instanceof LlmOutputError && /no handler/.test(e.message))) throw e;
    const { fakeDetect } = await import("./fake-llm");
    data = DetectOutput.parse(fakeDetect(changedTextFromPrompt(req.prompt)));
  }
  return data.candidates.slice(0, MAX_CANDIDATES);
}

export interface VerifiedCandidate {
  title: string;
  deadline: string | null; // ISO
  amountCents: number | null;
  eligibility: string | null;
  /** Same-site link found on the page, else the page URL. */
  sourceUrl: string;
  evidenceQuote: string;
  /** Optional page-provided summary (RSS item description). */
  summary?: string;
}

export type DropReason = "quote_not_on_page" | "title_not_on_page" | "empty_title";

/**
 * Deterministic checks against the full page text (`pageText`) and its links. Returns null plus a
 * reason when the candidate cannot be traced to the page.
 */
export function verifyCandidate(
  c: DetectedCandidate,
  page: { url: string; text: string; links: string[] },
): { ok: true; candidate: VerifiedCandidate } | { ok: false; reason: DropReason } {
  const title = c.title.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!title) return { ok: false, reason: "empty_title" };
  if (!quoteAppears(c.evidenceQuote, page.text)) return { ok: false, reason: "quote_not_on_page" };
  if (!appearsIn(title, page.text)) return { ok: false, reason: "title_not_on_page" };

  const deadline = c.deadline?.trim() || null;
  const deadlineOk = deadline !== null && dateAppears(deadline, page.text);
  const eligibility = c.eligibility?.trim() || null;
  return {
    ok: true,
    candidate: {
      title,
      deadline: deadlineOk && deadline ? new Date(deadline).toISOString() : null,
      amountCents:
        c.amountCents !== null && c.amountCents > 0 && amountAppears(c.amountCents, page.text)
          ? c.amountCents
          : null,
      eligibility: eligibility && appearsIn(eligibility, page.text) ? eligibility : null,
      sourceUrl: sameSiteLink(c.link, page) ?? page.url,
      evidenceQuote: c.evidenceQuote.replace(/\s+/g, " ").trim(),
    },
  };
}

/** The candidate link, if it is a safe http(s) URL on the page's site that the page links to. */
export function sameSiteLink(
  link: string | null,
  page: { url: string; text: string; links: string[] },
): string | null {
  if (!link) return null;
  let u: URL;
  let base: URL;
  try {
    base = new URL(page.url);
    u = new URL(link.trim(), base);
  } catch {
    return null;
  }
  u.hash = "";
  if (!isSafeUrl(u)) return null;
  if (registrableDomain(u.hostname) !== registrableDomain(base.hostname)) return null;
  const strip = (s: string) => s.replace(/\/$/, "");
  const onPage =
    page.links.some((l) => strip(l) === strip(u.href)) || page.text.includes(strip(u.href));
  return onPage ? u.href : null;
}
