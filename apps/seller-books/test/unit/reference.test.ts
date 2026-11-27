// Guards the "no invented numbers" rules for reference data.
import { readFileSync } from "node:fs";
import { PLATFORMS } from "@shared/enums";
import { FEE_SOURCES } from "@shared/reference/fee-sources";
import { FEDERAL_1099K, STATE_1099K } from "@shared/reference/form-1099k";
import { REPORTS } from "@worker/services/importers";
import { describe, expect, it } from "vitest";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

describe("fee sources", () => {
  it("covers every platform with the marketplace's own page", () => {
    expect(FEE_SOURCES.map((f) => f.platform).sort()).toEqual([...PLATFORMS].sort());
    const own: Record<string, RegExp> = {
      ebay: /^https:\/\/www\.ebay\.com\//,
      poshmark: /^https:\/\/support\.poshmark\.com\//,
      mercari: /^https:\/\/www\.mercari\.com\//,
      whatnot: /^https:\/\/(www|help)\.whatnot\.com\//,
      depop: /^https:\/\/depophelp\.zendesk\.com\//,
      etsy: /^https:\/\/www\.etsy\.com\//,
    };
    for (const f of FEE_SOURCES) {
      expect(f.officialPages.length).toBeGreaterThan(0);
      for (const url of f.officialPages) expect(url, f.platform).toMatch(own[f.platform] as RegExp);
    }
  });

  it("any recorded rate cites the marketplace page, a verbatim quote and the date read", () => {
    for (const f of FEE_SOURCES) {
      for (const r of f.rules) {
        expect(f.officialPages).toContain(r.url);
        expect(r.quote.length).toBeGreaterThan(20);
        expect(isDate(r.checkedOn)).toBe(true);
      }
    }
  });

  it("no importer computes a fee from a percentage", () => {
    for (const file of ["ebay", "poshmark", "mercari", "whatnot", "depop", "etsy"]) {
      const src = readFileSync(
        new URL(`../../src/worker/services/importers/${file}.ts`, import.meta.url),
        "utf8",
      );
      expect(src, file).not.toMatch(/\*\s*0\.\d|\/\s*100\b|percent|bps/i);
    }
  });

  it("every platform has at least one report importer", () => {
    const platforms = new Set(Object.values(REPORTS).map((r) => r.platform));
    for (const p of PLATFORMS) expect(platforms.has(p), p).toBe(true);
  });
});

describe("1099-K notes", () => {
  it("federal threshold is the restored $20,000 / 200 rule, sourced from irs.gov", () => {
    expect(FEDERAL_1099K.rule).toMatch(/\$20,000/);
    expect(FEDERAL_1099K.rule).toMatch(/200 transactions/);
    expect(FEDERAL_1099K.url).toMatch(/^https:\/\/www\.irs\.gov\//);
  });

  it("every state note has a source, quote, status and check date; one entry per state", () => {
    const codes = STATE_1099K.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const s of STATE_1099K) {
      expect(s.url, s.code).toMatch(/^https:\/\/[a-z0-9.-]+\.(gov|us)\//);
      expect(s.quote.length, s.code).toBeGreaterThan(10);
      expect(isDate(s.checkedOn)).toBe(true);
      expect(["official-excerpt", "general-1099-rule", "unverified"]).toContain(s.status);
    }
  });
});

describe("wrangler configs", () => {
  const read = (f: string) =>
    JSON.parse(
      readFileSync(new URL(`../../${f}`, import.meta.url), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n"),
    ) as {
      compatibility_date: string;
      compatibility_flags: string[];
      main: string;
      d1_databases: { binding: string }[];
    };
  it("test config mirrors the real one", () => {
    const real = read("wrangler.jsonc");
    const test = read("wrangler.test.jsonc");
    expect(test.compatibility_date).toBe(real.compatibility_date);
    expect(test.compatibility_flags).toEqual(real.compatibility_flags);
    expect(test.main).toBe(real.main);
    expect(test.d1_databases.map((d) => d.binding)).toEqual(
      real.d1_databases.map((d) => d.binding),
    );
  });
});
