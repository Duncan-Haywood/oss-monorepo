import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyWorksheetAsset,
  isWorksheetFile,
  normaliseWorksheet,
  WORKSHEET_KINDS,
} from "./scope-worksheet";

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url), "utf8");

interface Case {
  kind: string;
  cui: string;
  security: boolean;
  unsecurable: boolean;
  policy: string;
  espData: string;
  csp: boolean;
  cat: string;
  gaps: string[];
}

describe("classifyWorksheetAsset", () => {
  it("agrees with the worksheet's own classify on every combination of answers", () => {
    const { cases } = JSON.parse(fixture("scoping-worksheet-classify.json")) as { cases: Case[] };
    expect(cases.length).toBeGreaterThan(400);
    // Every kind the worksheet has is covered, and no kind is missing here.
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(Object.keys(WORKSHEET_KINDS)));
    for (const c of cases) {
      const [a] = normaliseWorksheet({ assets: [{ ...c, name: "x" }] }).assets;
      if (!a) throw new Error("no asset");
      const got = classifyWorksheetAsset(a);
      // Only the open questions that block a category are ported (the worksheet's "unresolved").
      const want = c.cat === "unresolved" ? c.gaps : [];
      expect({ ...c, cat: got.cat, gaps: got.gaps }).toEqual({ ...c, gaps: want });
    }
  });
});

describe("normaliseWorksheet", () => {
  it("cleans a hand-edited file the way the worksheet does", () => {
    const s = normaliseWorksheet({
      level: "3",
      assets: [
        null,
        "x",
        { name: 5, kind: "toaster", cui: "maybe", security: "yes" },
        { kind: "cnc" },
      ],
    });
    expect(s.level).toBe("2");
    expect(s.assets).toHaveLength(2);
    expect(s.assets[0]).toMatchObject({ name: "", kind: "other", cui: "unknown", security: false });
    // A kind the rule lists as specialized defaults to "cannot be fully secured", as in the worksheet.
    expect(s.assets[1]?.unsecurable).toBe(true);
  });
  it("recognises the saved file only by its format field", () => {
    expect(isWorksheetFile(JSON.parse(fixture("scoping-worksheet-example.json")))).toBe(true);
    expect(isWorksheetFile({ assets: [] })).toBe(false);
    expect(isWorksheetFile([])).toBe(false);
  });
});
