import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditDecisionsLinks,
  listBusinessDecisionIds,
  listReferencedDecisionIds,
} from "./decisions-link-audit";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const PROCESS_DIR = path.join(REPO_ROOT, "src/lib/process");
const ARCHIVE_DIR = path.join(PROCESS_DIR, "archive");

function readArchiveFiles(prefix: string): string {
  return readdirSync(ARCHIVE_DIR)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".ts"))
    .sort()
    .map((name) => readFileSync(path.join(ARCHIVE_DIR, name), "utf8"))
    .join("\n");
}

/**
 * BUSINESS_DECISIONS and ITERATIONS are split across archive files (oldest
 * entries) plus a live tail (business-decisions.ts and prompt_process.tsx's
 * ITERATIONS section respectively) — see process-log-archive-scalability-split
 * in BUSINESS_DECISIONS. Every id and every id-filter reference must still be
 * visible to this audit regardless of which file physically holds it.
 */
function loadPromptProcessSections(): { businessDecisionsSource: string; iterationsSource: string } {
  const businessDecisionsLive = readFileSync(path.join(PROCESS_DIR, "business-decisions.ts"), "utf8");
  const businessDecisionsArchived = readArchiveFiles("business-decisions-archive-");
  const businessDecisionsSource = businessDecisionsArchived + "\n" + businessDecisionsLive;

  const promptProcessSource = readFileSync(path.join(PROCESS_DIR, "prompt_process.tsx"), "utf8");
  const itStart = promptProcessSource.indexOf("export const ITERATIONS");
  if (itStart === -1) {
    throw new Error("Could not locate ITERATIONS export boundary in prompt_process.tsx");
  }
  const iterationsArchived = readArchiveFiles("iterations-archive-");
  const iterationsSource = iterationsArchived + "\n" + promptProcessSource.slice(itStart);

  return { businessDecisionsSource, iterationsSource };
}

describe("listBusinessDecisionIds", () => {
  it("extracts every id: \"...\" from a BUSINESS_DECISIONS block", () => {
    const source = `
export const BUSINESS_DECISIONS = [
  {
    date: "2026-01-01",
    id: "first-decision",
    decision: "...",
    rationale: "...",
  },
  {
    date: "2026-01-02",
    id: "second-decision",
    decision: "...",
    rationale: "...",
  },
];
`;
    expect(listBusinessDecisionIds(source)).toEqual(["first-decision", "second-decision"]);
  });
});

describe("listReferencedDecisionIds", () => {
  it("extracts a single-line filter call", () => {
    const source = `decisions: BUSINESS_DECISIONS.filter((d) => d.id === "some-id"),`;
    expect(listReferencedDecisionIds(source)).toEqual(["some-id"]);
  });

  it("extracts a Prettier-wrapped multi-line filter call", () => {
    const source = `
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "wrapped-id",
    ),
`;
    expect(listReferencedDecisionIds(source)).toEqual(["wrapped-id"]);
  });

  it("extracts both ids from a combined OR condition", () => {
    const source = `
    decisions: BUSINESS_DECISIONS.filter(
      (d) =>
        d.id === "first-id" ||
        d.id === "second-id",
    ),
`;
    expect(listReferencedDecisionIds(source)).toEqual(["first-id", "second-id"]);
  });

  it("does not match the legacy slice-index or bare-index conventions", () => {
    const source = `
    decisions: BUSINESS_DECISIONS.slice(6, 7),
    decisions: [BUSINESS_DECISIONS[6], BUSINESS_DECISIONS[7]],
    decisions: [],
`;
    expect(listReferencedDecisionIds(source)).toEqual([]);
  });
});

describe("auditDecisionsLinks", () => {
  it("flags a referenced id with no matching BUSINESS_DECISIONS entry", () => {
    const result = auditDecisionsLinks({
      businessDecisionIds: ["a", "b"],
      referencedIds: ["a", "b", "ghost"],
    });
    expect(result.danglingReferencedIds).toEqual(["ghost"]);
    expect(result.duplicateBusinessDecisionIds).toEqual([]);
  });

  it("flags a duplicate BUSINESS_DECISIONS id", () => {
    const result = auditDecisionsLinks({
      businessDecisionIds: ["a", "a", "b"],
      referencedIds: ["a", "b"],
    });
    expect(result.duplicateBusinessDecisionIds).toEqual(["a"]);
    expect(result.danglingReferencedIds).toEqual([]);
  });

  it("de-duplicates repeated dangling references in its output", () => {
    const result = auditDecisionsLinks({
      businessDecisionIds: ["a"],
      referencedIds: ["ghost", "ghost", "a"],
    });
    expect(result.danglingReferencedIds).toEqual(["ghost"]);
  });

  it("is clean when every referenced id resolves and every id is unique", () => {
    const result = auditDecisionsLinks({
      businessDecisionIds: ["a", "b", "c"],
      referencedIds: ["a", "c"],
    });
    expect(result).toEqual({ duplicateBusinessDecisionIds: [], danglingReferencedIds: [] });
  });
});

describe("prompt_process.tsx BUSINESS_DECISIONS / ITERATIONS id links (repo)", () => {
  it("every ITERATIONS id-filter reference resolves to a real BUSINESS_DECISIONS entry, and every id is unique", () => {
    const { businessDecisionsSource, iterationsSource } = loadPromptProcessSections();
    const businessDecisionIds = listBusinessDecisionIds(businessDecisionsSource);
    const referencedIds = listReferencedDecisionIds(iterationsSource);
    const result = auditDecisionsLinks({ businessDecisionIds, referencedIds });

    expect(result.danglingReferencedIds).toEqual([]);
    expect(result.duplicateBusinessDecisionIds).toEqual([]);
    // Sanity floor so this test can't pass vacuously if the extraction regex
    // ever stops matching the file's actual shape (e.g. a source-format
    // change) — both counts should keep growing with every new iteration.
    expect(businessDecisionIds.length).toBeGreaterThan(100);
    expect(referencedIds.length).toBeGreaterThan(100);
  });
});
