import { describe, expect, it } from "vitest";
import { draftCharacteristics, form3Csv } from "./fai-characteristics";
import { addedNumbers, buildRows, faiSaveSchema, judge, readings, summarise } from "./fai-results";

const dim = { lower: 3.245, upper: 3.255, unit: "in", record: "value" as const };
const gauge = { lower: null, upper: null, unit: null, record: "accept/reject" as const };

describe("readings", () => {
  it("reads one or several readings, with a trailing unit", () => {
    expect(readings("3.2502")).toEqual([3.2502]);
    expect(readings(".2015 .2021; .2030")).toEqual([0.2015, 0.2021, 0.203]);
    expect(readings("12,005 mm")).toEqual([12.005]);
    expect(readings("3.250 in")).toEqual([3.25]);
  });
  it("refuses text that is not readings", () => {
    expect(readings("about 3.25")).toBeNull();
    expect(readings("3.25x")).toBeNull();
  });
});

describe("judge", () => {
  it("accepts a reading inside the limits, the limits themselves included", () => {
    expect(judge(dim, { result: "3.250" }).verdict).toBe("accept");
    expect(judge(dim, { result: "3.245" }).verdict).toBe("accept");
    expect(judge(dim, { result: "3.255" }).verdict).toBe("accept");
  });
  it("rejects a reading outside and says which limit, asking for an NCR", () => {
    expect(judge(dim, { result: "3.2551" })).toEqual({
      verdict: "reject",
      reason: "3.2551 is over the upper limit 3.255 in; enter a nonconformance number",
    });
    expect(judge(dim, { result: "3.244", ncr: "NCR-12" })).toEqual({
      verdict: "reject",
      reason: "3.244 is under the lower limit 3.245 in",
    });
  });
  it("rejects when any one of several readings is outside", () => {
    expect(judge(dim, { result: "3.250 3.251 3.260" }).verdict).toBe("reject");
  });
  it("checks only the maximum when there is no lower limit (surface finish)", () => {
    const ra = { lower: null, upper: 63, unit: "µin", record: "value" as const };
    expect(judge(ra, { result: "32" }).verdict).toBe("accept");
    expect(judge(ra, { result: "64" }).verdict).toBe("reject");
  });
  it("leaves an empty or unreadable result open, never accepted", () => {
    expect(judge(dim, {}).verdict).toBe("open");
    expect(judge(dim, undefined).verdict).toBe("open");
    expect(judge(dim, { result: "looks fine to me" }).verdict).toBe("open");
  });
  it("needs accept or reject in words on a checked row", () => {
    expect(judge(gauge, { result: "Accept" }).verdict).toBe("accept");
    expect(judge(gauge, { result: "ok" }).reason).toBeNull();
    expect(judge(gauge, { result: "NC" }).verdict).toBe("reject");
    expect(judge(gauge, { result: "0.25" }).verdict).toBe("open");
  });
  it("takes the inspector's word on a value row and says the limits were not checked", () => {
    expect(judge(dim, { result: "accept" })).toEqual({
      verdict: "accept",
      reason: "accepted by the inspector; the limits were not checked",
    });
  });
  it("leaves a row marked not a characteristic out", () => {
    expect(judge(dim, { result: "9", notApplicable: true }).verdict).toBe("n/a");
  });
});

describe("summarise", () => {
  it("is complete only when every counted row is judged and each reject has an NCR", () => {
    const rows = [
      { verdict: "accept" as const },
      { verdict: "reject" as const, entry: { ncr: "" } },
      { verdict: "n/a" as const },
    ];
    expect(summarise(rows)).toMatchObject({
      total: 2,
      accepted: 1,
      rejected: 1,
      notApplicable: 1,
      rejectsWithoutNcr: 1,
      complete: false,
    });
    rows[1] = { verdict: "reject", entry: { ncr: "NCR-1" } };
    expect(summarise(rows).complete).toBe(true);
    expect(summarise([]).complete).toBe(false);
  });
});

const DRAWING = `MATERIAL: 6061-T6 ALUMINUM
UNLESS OTHERWISE SPECIFIED: .XXX ±.005
3.250 ±.005
2X Ø.201 +.003/-.000 THRU
1/4-20 UNC-2B`;

describe("buildRows and the CSV with results", () => {
  const draft = draftCharacteristics(DRAWING);

  it("numbers added rows after the draft's last whole number", () => {
    expect(draft.characteristics.map((c) => c.no)).toEqual(["1", "2", "3.1", "3.2", "4"]);
    expect(addedNumbers(draft.characteristics, 2)).toEqual(["5", "6"]);
  });

  it("judges drafted and added rows and writes them to Form 3", () => {
    const added = [
      {
        requirement: "[2.000] BASIC",
        lower: 1.99,
        upper: 2.01,
        unit: "in",
        record: "value" as const,
      },
    ];
    const rows = buildRows(draft.characteristics, added, {
      "1": { result: "accept", tooling: "cert" },
      "2": { result: "3.251", location: "B3" },
      "3.1": { result: ".2045", ncr: "NCR-7" },
      "3.2": { result: ".2020" },
      "5": { result: "2.003" },
    });
    expect(rows.map((r) => [r.no, r.verdict])).toEqual([
      ["1", "accept"],
      ["2", "accept"],
      ["3.1", "reject"],
      ["3.2", "accept"],
      ["4", "open"],
      ["5", "accept"],
    ]);
    const csv = form3Csv(draft, { fileName: "BRK.pdf" }, rows, summarise(rows));
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("AS9102 Form 3 with results: characteristic accountability");
    expect(lines.find((l) => l.startsWith("Results,"))).toContain(
      "4 accepted, 1 rejected, 1 open of 6",
    );
    expect(lines).toContain("2,B3,,3.250 ±.005,3.251,,,Dimension,3.245,3.255,in,value,3,accept,");
    expect(lines.find((l) => l.startsWith("3.1,"))).toContain(",NCR-7,");
    expect(lines.at(-1)).toBe(
      "5,,,[2.000] BASIC,2.003,,,Added by inspector,1.99,2.01,in,value,,accept,",
    );
  });
});

describe("faiSaveSchema", () => {
  it("refuses bad keys, inverted limits and unknown fields", () => {
    expect(faiSaveSchema.safeParse({ entries: { "1": { result: "1" } }, added: [] }).success).toBe(
      true,
    );
    expect(faiSaveSchema.safeParse({ entries: { x: {} }, added: [] }).success).toBe(false);
    expect(
      faiSaveSchema.safeParse({ entries: { "1": { verdict: "accept" } }, added: [] }).success,
    ).toBe(false);
    expect(
      faiSaveSchema.safeParse({
        entries: {},
        added: [{ requirement: "A", lower: 2, upper: 1, unit: "in", record: "value" }],
      }).success,
    ).toBe(false);
  });
});
