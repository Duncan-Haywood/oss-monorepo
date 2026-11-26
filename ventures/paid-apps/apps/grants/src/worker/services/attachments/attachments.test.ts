// Pure logic: requirement -> document auto-matching, AI suggestion validation, and the
// no-invented-commitments guard on letter-of-support request drafts.
import { describe, expect, it } from "vitest";
import type { LlmRequestBase } from "../../ports/llm";
import { attachmentRequirements } from "../submission/package";
import { letterRequestFake, matchFake } from "./fake-llm";
import {
  checkLetterDraft,
  LetterDraftOutput,
  letterPrompt,
  suggestedOutline,
  templateDraft,
} from "./letter-text";
import { type MatchableDocument, matchRequirement, validateLlmMatches } from "./match";

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const doc = (
  id: string,
  title: string,
  kind: MatchableDocument["kind"],
  created = "2026-01-01",
) => ({
  id,
  title,
  kind,
  status: "ready",
  createdAt: at(created),
});

const DOCS: MatchableDocument[] = [
  doc("doc_irs", "IRS Determination Letter 1999", "other"),
  doc("doc_budget", "FY27 Program Budget", "budget"),
  doc("doc_audit", "2025 Audited Financial Statements", "financial_statement"),
  doc("doc_board", "Board of Directors roster", "other"),
  doc("doc_bylaws", "Bylaws (amended 2019)", "charter_bylaws"),
  doc("doc_cv", "Resume - Executive Director", "other"),
  doc("doc_transcript", "IRS letter interview", "interview_transcript"),
  doc("doc_letter_old", "Letter of support - City", "letter_of_support", "2025-01-01"),
  doc("doc_letter_new", "Letter of support - Clinic", "letter_of_support", "2026-03-01"),
];

describe("matchRequirement", () => {
  it.each([
    ["IRS determination letter", "doc_irs"],
    ["501(c)(3) tax-exempt status letter", "doc_irs"],
    ["Project budget", "doc_budget"],
    ["Most recent audit", "doc_audit"],
    ["Financial statements", "doc_audit"],
    ["Board list with affiliations", "doc_board"],
    ["Bylaws", "doc_bylaws"],
    ["Resumes of key staff", "doc_cv"],
  ])("%s -> %s", (name, expected) => {
    expect(matchRequirement({ name }, DOCS)?.documentId).toBe(expected);
  });

  it("prefers a kind match and, on ties, the newest document", () => {
    const m = matchRequirement({ name: "Letters of support" }, DOCS);
    expect(m).toEqual({ documentId: "doc_letter_new", source: "kind", score: 3 });
  });

  it("never matches transcripts, website pages or failed documents", () => {
    const only = [doc("doc_t", "IRS determination letter", "interview_transcript")];
    expect(matchRequirement({ name: "IRS determination letter" }, only)).toBeNull();
    const failed = [{ ...doc("doc_f", "Program budget", "budget"), status: "failed" }];
    expect(matchRequirement({ name: "Budget" }, failed)).toBeNull();
  });

  it("returns null when nothing plausible exists (deterministic, no guessing)", () => {
    expect(matchRequirement({ name: "Map of service area" }, DOCS)).toBeNull();
  });

  it("falls back to title-word overlap for unknown requirement names", () => {
    const docs = [doc("doc_map", "Service area map", "other")];
    expect(matchRequirement({ name: "Map of service area" }, docs)?.documentId).toBe("doc_map");
  });
});

describe("attachmentRequirements", () => {
  it("dedupes listed attachments and attachment-kind sections by name", () => {
    const out = attachmentRequirements({
      sections: [
        {
          key: "a",
          title: "Budget",
          prompt: "Line items",
          kind: "attachment",
          required: false,
          wordLimit: null,
          charLimit: null,
          guidance: "",
        },
        {
          key: "n",
          title: "Need",
          prompt: "",
          kind: "narrative",
          required: true,
          wordLimit: null,
          charLimit: null,
          guidance: "",
        },
      ],
      attachments: [
        { name: "IRS determination letter", required: true, description: "" },
        { name: "irs determination letter ", required: false, description: "dupe" },
      ],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    });
    expect(out).toEqual([
      { name: "IRS determination letter", required: true, description: "" },
      { name: "Budget", required: false, description: "Line items" },
    ]);
  });
});

describe("validateLlmMatches", () => {
  it("keeps only unmatched requirement indexes and candidate document ids", () => {
    const out = validateLlmMatches(
      {
        matches: [
          { requirement: 0, documentId: "doc_a" },
          { requirement: 1, documentId: "doc_other_org" }, // not a candidate
          { requirement: 2, documentId: "doc_a" }, // already matched requirement
          { requirement: 3, documentId: null },
          { requirement: 0, documentId: "doc_b" }, // duplicate
          { requirement: 1.5, documentId: "doc_b" },
        ],
      },
      new Set([0, 1, 3]),
      new Set(["doc_a", "doc_b"]),
    );
    expect([...out.entries()]).toEqual([[0, "doc_a"]]);
  });

  it("the fake handler only proposes ids listed in the prompt", () => {
    const req = {
      purpose: "attachments.match",
      system: "",
      prompt:
        "Requirements:\n0. Service area map\n\nDocuments:\n<untrusted_content>\n- doc_map1 | other | Service area map\n</untrusted_content>",
    } as LlmRequestBase;
    expect(matchFake(req)).toEqual({
      matches: [{ requirement: 0, documentId: "doc_map1", reason: "Title matches" }],
    });
  });
});

const CTX = {
  orgName: "Southwest Indian Foundation",
  partnerName: "Gallup Food Pantry",
  grantTitle: "Rural Workforce Fund 2027",
  funderName: "Example Foundation",
  dueAt: at("2027-01-10"),
  facts: [
    {
      id: "fct_a",
      statement: "Gallup Food Pantry has referred 120 trainees to our program since 2021.",
    },
    { id: "fct_b", statement: "Gallup Food Pantry provides lunch for trainees on Fridays." },
  ],
};
const KNOWN = [CTX.orgName, CTX.partnerName, CTX.grantTitle, CTX.funderName];

describe("letter request drafts", () => {
  it("the template states only identity, verbatim partner facts and placeholders", () => {
    const d = templateDraft(CTX);
    expect(d.intro).toContain(CTX.facts[0]?.statement);
    expect(d.intro).toContain(
      "We have not described any commitment on behalf of Gallup Food Pantry",
    );
    expect(d.outline.every((o) => /\[[^\]]+\]/.test(o))).toBe(true);
    expect(suggestedOutline(CTX)).toEqual(d.outline);
  });

  it("the fake AI path cites the partner facts, uses placeholders, and passes the check", async () => {
    const raw = await letterRequestFake({
      purpose: "attachments.letter_request",
      system: "",
      prompt: letterPrompt(CTX),
    });
    const out = LetterDraftOutput.parse(raw);
    const cited = out.paragraphs.flatMap((p) => p.factIds);
    expect(cited.sort()).toEqual(["fct_a", "fct_b"]);
    expect(checkLetterDraft(out, CTX.facts, KNOWN)).toEqual({ ok: true, problems: [] });
  });

  it.each([
    [
      "an invented commitment",
      { text: "Gallup Food Pantry will donate $5,000 to the project.", factIds: [] },
    ],
    [
      "an invented number in a cited paragraph",
      { text: "Gallup Food Pantry has referred 300 trainees.", factIds: ["fct_a"] },
    ],
    [
      "a commitment the cited fact does not contain",
      { text: "Gallup Food Pantry provides vans for transport.", factIds: ["fct_b"] },
    ],
    ["a citation to a non-partner fact", { text: "We work together.", factIds: ["fct_x"] }],
  ])("rejects %s", (_label, paragraph) => {
    const out = LetterDraftOutput.parse({
      paragraphs: [paragraph],
      outline: ["Your commitment: [describe]"],
    });
    expect(checkLetterDraft(out, CTX.facts, KNOWN).ok).toBe(false);
  });

  it("allows commitment language only inside [placeholders] and requires them in the outline", () => {
    const ok = LetterDraftOutput.parse({
      paragraphs: [
        {
          text: "Please tell funders what you will provide: [your commitment, in your words].",
          factIds: [],
        },
      ],
      outline: ["Commitment: [describe only what you are committing to]"],
    });
    expect(checkLetterDraft(ok, CTX.facts, KNOWN).ok).toBe(true);
    const noPlaceholder = LetterDraftOutput.parse({
      paragraphs: [{ text: "Thank you for considering this.", factIds: [] }],
      outline: ["Describe your commitment of 10 volunteers."],
    });
    expect(checkLetterDraft(noPlaceholder, CTX.facts, KNOWN).problems).toContain(
      "outline item 1 has no [placeholder]",
    );
  });
});
