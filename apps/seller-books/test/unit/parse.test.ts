import { csvCell, parseCsv, toCsv } from "@shared/csv";
import {
  normHeader,
  parseDate,
  parseMoney,
  readTable,
  rowKey,
} from "@worker/services/importers/parse";
import { describe, expect, it } from "vitest";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b,1","c ""q"""\r\n1,"line\nbreak",3\n')).toEqual([
      ["a", "b,1", 'c "q"'],
      ["1", "line\nbreak", "3"],
    ]);
  });
  it("keeps a last line without a newline and empty trailing fields", () => {
    expect(parseCsv("a,b,\n1,,")).toEqual([
      ["a", "b", ""],
      ["1", "", ""],
    ]);
  });
  it("round-trips through toCsv and neutralises formulas", () => {
    expect(parseCsv(toCsv([["x,y", 'q"', 12]]))).toEqual([["x,y", 'q"', "12"]]);
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12.50")).toBe("-12.50");
  });
});

describe("parseMoney", () => {
  it.each([
    ["$1,234.56", 123456],
    ["-$1.00", -100],
    ["($2.50)", -250],
    ["−3.10", -310],
    ["USD 12", 1200],
    ["12.00 USD", 1200],
    ["US $3.5", 350],
    ["0.005", 1],
    [".5", 50],
    ["4.50-", -450],
  ])("%s -> %i", (raw, cents) => expect(parseMoney(raw)).toBe(cents));
  it.each(["", "--", "-", "N/A", undefined])("%s -> null", (raw) =>
    expect(parseMoney(raw)).toBeNull(),
  );
  it("refuses text instead of guessing", () =>
    expect(() => parseMoney("twelve")).toThrow(/Not an amount/));
});

describe("parseDate", () => {
  it.each([
    ["2026-01-05", "2026-01-05"],
    ["2026-03-02 19:04:11", "2026-03-02"],
    ["2026-03-02T19:04:11Z", "2026-03-02"],
    ["1/5/2026", "2026-01-05"],
    ["05/02/26", "2026-05-02"],
    ["Jan 5, 2026", "2026-01-05"],
    ["January 5 2026", "2026-01-05"],
    ["Sept 9, 2026", "2026-09-09"],
    ["Jan-05-26", "2026-01-05"],
    ["05-Jan-2026", "2026-01-05"],
    ["5 Jan 2026", "2026-01-05"],
    ["Jan 5, 2026 10:01:02 PM PST", "2026-01-05"],
  ])("%s -> %s", (raw, iso) => expect(parseDate(raw)).toBe(iso));
  it.each(["Feb 30 2026", "13/01/2026", "yesterday", "", "1/1/1980"])("%s -> null", (raw) =>
    expect(parseDate(raw)).toBeNull(),
  );
});

describe("readTable", () => {
  const spec = {
    a: { names: ["Order ID"], required: true },
    b: { names: ["Net amount", "Net"] },
  } as const;
  it("matches headers ignoring case/punctuation and finds the header below a preamble", () => {
    const t = readTable("Report\n\nORDER_ID,NET\n1,2\n\nfooter only\n", spec, "test");
    expect(t.matched).toEqual({ a: "ORDER_ID", b: "NET" });
    expect(t.rows.map((r) => [r.line, r.get("a"), r.get("b")])).toEqual([[4, "1", "2"]]);
  });
  it("names the missing columns", () => {
    try {
      readTable("x,y\n1,2", spec, "test file");
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/test file/);
      expect((e as { details: unknown }).details).toEqual([
        { field: "a", expectedOneOf: ["Order ID"] },
      ]);
    }
  });
  it("normalises headers", () =>
    expect(normHeader("Final Value Fee - variable")).toBe("finalvaluefeevariable"));
});

describe("rowKey", () => {
  it("is deterministic and separates fields", () => {
    expect(rowKey("a", "b")).toBe(rowKey("a", "b"));
    expect(rowKey("ab", "")).not.toBe(rowKey("a", "b"));
    expect(rowKey(null, 1)).toMatch(/^k[0-9a-f]{16}$/);
  });
});
