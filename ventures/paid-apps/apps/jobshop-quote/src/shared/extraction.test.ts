import { describe, expect, it } from "vitest";
import { DRAWING_TEXT, RFQ_EMAIL } from "../../test/fixtures/rfq";
import { fakeExtract } from "../worker/services/rfq/fake-llm";
import {
  digitTokens,
  type LlmExtraction,
  matchFinishingOps,
  matchMaterial,
  verifyExtraction,
} from "./extraction";

const f = (value: string | null, quote: string | null = value) => ({ value, quote });
const empty = { value: null, quote: null };

const onePart = (over: Partial<LlmExtraction["parts"][number]> = {}): LlmExtraction => ({
  customer: { company: empty, contactName: empty, email: empty },
  parts: [
    {
      partNumber: f("BRK-1001", "Part number: BRK-1001 Rev B"),
      revision: f("B", "Part number: BRK-1001 Rev B"),
      description: f("Motor mount bracket"),
      material: f("6061-T6 aluminum", "Material: 6061-T6 aluminum plate"),
      quantities: { values: [10, 50, 100], quote: "Qty: 10, 50, 100" },
      tolerances: f("+/- .005", "Tolerances: +/- .005 unless noted"),
      finish: f("Black anodize Type II", "Finish: Black anodize Type II"),
      dueDate: f("2026-12-18", "Need by 2026-12-18"),
      ...over,
    },
  ],
  missingInfo: [],
});

describe("verifyExtraction", () => {
  it("keeps values whose verbatim quote is in the RFQ", () => {
    const v = verifyExtraction(onePart(), RFQ_EMAIL);
    expect(v.warnings).toEqual([]);
    expect(v.parts[0]).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      materialText: "6061-T6 aluminum",
      quantities: [10, 50, 100],
      tolerances: "+/- .005",
      dueDate: "2026-12-18",
    });
    expect(v.parts[0]?.sources.partNumber?.status).toBe("verified");
  });

  it("tolerates whitespace, case and dash differences in quotes", () => {
    const v = verifyExtraction(
      onePart({ material: f("6061-T6", "MATERIAL:   6061‑T6 ALUMINUM PLATE") }),
      RFQ_EMAIL,
    );
    expect(v.parts[0]?.materialText).toBe("6061-T6");
  });

  it("drops a value whose quote is not in the RFQ (fabricated)", () => {
    const v = verifyExtraction(onePart({ material: f("7075-T6", "Material: 7075-T6") }), RFQ_EMAIL);
    expect(v.parts[0]?.materialText).toBeNull();
    expect(v.parts[0]?.sources.material?.status).toBe("dropped");
    expect(v.warnings[0]).toMatch(/material "7075-T6" was dropped/);
  });

  it("drops a value with a number its (real) quote does not contain", () => {
    const v = verifyExtraction(
      onePart({ tolerances: f("+/- .001", "Tolerances: +/- .005 unless noted") }),
      RFQ_EMAIL,
    );
    expect(v.parts[0]?.tolerances).toBeNull();
    expect(v.warnings[0]).toMatch(/"\.001" is not in the quote/);
  });

  it("drops values with no quote at all", () => {
    const v = verifyExtraction(onePart({ finish: f("Clear anodize", null) }), RFQ_EMAIL);
    expect(v.parts[0]?.finishText).toBeNull();
  });

  it("keeps only quantities the quote states", () => {
    const v = verifyExtraction(
      onePart({ quantities: { values: [10, 25, 50], quote: "Qty: 10, 50, 100" } }),
      RFQ_EMAIL,
    );
    expect(v.parts[0]?.quantities).toEqual([10, 50]);
    expect(v.warnings[0]).toMatch(/quantities 25/);
  });

  it("drops a due date the quote does not support", () => {
    const v = verifyExtraction(
      onePart({ dueDate: f("2026-12-19", "Need by 2026-12-18") }),
      RFQ_EMAIL,
    );
    expect(v.parts[0]?.dueDate).toBeNull();
    const named = verifyExtraction(
      onePart({ dueDate: f("2026-12-18", "Need by Dec 18, 2026") }),
      `${RFQ_EMAIL}\nNeed by Dec 18, 2026`,
    );
    expect(named.parts[0]?.dueDate).toBe("2026-12-18");
  });
});

describe("verifyExtraction rejects near-misses (review regressions)", () => {
  const src = `${RFQ_EMAIL}
Part number: ABC-100 Rev 2
Tolerance: ±.005
PN 12345-500
Due Dec 5 2026, decimal marking per spec`;
  const one = (over: Partial<LlmExtraction["parts"][number]>) =>
    verifyExtraction(onePart(over), src).parts[0];

  it("does not loosen numbers by stripping dots or matching substrings", () => {
    expect(one({ tolerances: f("±0.05", "Tolerance: ±.005") })?.tolerances).toBeNull();
    expect(one({ tolerances: f("±0.005", "Tolerance: ±.005") })?.tolerances).toBe("±0.005");
    expect(one({ partNumber: f("ABC-10", "Part number: ABC-100 Rev 2") })?.partNumber).toBeNull();
    expect(one({ partNumber: f("ABC-100", "Part number: ABC-100 Rev 2") })?.partNumber).toBe(
      "ABC-100",
    );
  });

  it("checks values without digits too", () => {
    expect(one({ revision: f("D", "Part number: BRK-1001 Rev B") })?.revision).toBeNull();
    expect(
      one({ finish: f("Clear anodize", "Finish: Black anodize Type II") })?.finishText,
    ).toBeNull();
    const v = verifyExtraction(
      {
        ...onePart(),
        customer: { company: f("Boeing", "Rev B"), contactName: empty, email: empty },
      },
      src,
    );
    expect(v.customer.company).toBeNull();
  });

  it("requires the full date, year included, and a real calendar date", () => {
    const q = "Due Dec 5 2026, decimal marking per spec";
    expect(one({ dueDate: f("2026-12-05", q) })?.dueDate).toBe("2026-12-05");
    expect(one({ dueDate: f("2031-12-05", q) })?.dueDate).toBeNull();
    expect(one({ dueDate: f("2026-03-05", q) })?.dueDate).toBeNull(); // "mar" in "marking"
    expect(one({ dueDate: f("2026-02-31", "Need by 2026-02-31") })?.dueDate).toBeNull();
  });

  it("counts only standalone quantities", () => {
    expect(
      one({ quantities: { values: [2], quote: "Part number: ABC-100 Rev 2" } })?.quantities,
    ).toEqual([]);
    expect(one({ quantities: { values: [500], quote: "PN 12345-500" } })?.quantities).toEqual([]);
  });
});

describe("FakeLlm rfq.extract handler + verification (offline demo path)", () => {
  it("extracts both parts from the sample email with every value verified", () => {
    const raw = fakeExtract({ purpose: "rfq.extract", system: "", prompt: "", context: RFQ_EMAIL });
    const v = verifyExtraction(raw, RFQ_EMAIL);
    expect(v.warnings).toEqual([]);
    expect(v.customer).toEqual({
      company: "Example Robotics LLC",
      contactName: "Dana Ortiz",
      email: "dana.ortiz@example-robotics.test",
    });
    expect(v.parts.map((p) => [p.partNumber, p.revision, p.quantities, p.finishText])).toEqual([
      ["BRK-1001", "B", [10, 50, 100], "Black anodize Type II"],
      ["SPC-220", null, [250], "Passivate"],
    ]);
    expect(v.parts[0]?.dueDate).toBe("2026-12-18");
    expect(v.parts[1]?.materialText).toBe("303 stainless bar");
  });

  it("reads a drawing title block", () => {
    const raw = fakeExtract({
      purpose: "rfq.extract",
      system: "",
      prompt: "",
      context: DRAWING_TEXT,
    });
    const v = verifyExtraction(raw, DRAWING_TEXT);
    expect(v.parts[0]?.materialText).toBe("6061-T6 ALUMINUM");
    expect(v.missingInfo).toContain("Quantity for part 1");
  });
});

describe("rate-card matching", () => {
  const materials = [
    { id: "al6061", name: "Aluminum 6061-T6 plate" },
    { id: "al7075", name: "Aluminum 7075-T651 plate" },
    { id: "ss303", name: "303 Stainless round bar" },
    { id: "ss304", name: "304 Stainless sheet" },
  ];
  it("matches on alloy grade, never on words alone", () => {
    expect(matchMaterial("6061-T6 aluminum plate", materials)).toBe("al6061");
    expect(matchMaterial("AL 6061", materials)).toBe("al6061");
    expect(matchMaterial("303 stainless bar", materials)).toBe("ss303");
    expect(matchMaterial("aluminum plate", materials)).toBeNull();
    expect(matchMaterial("Ti-6Al-4V", materials)).toBeNull();
    expect(matchMaterial(null, materials)).toBeNull();
  });
  it("suggests finishing ops by distinctive words", () => {
    const ops = [
      { id: "anod", name: "Anodize Type II (black)" },
      { id: "pass", name: "Passivation" },
      { id: "pc", name: "Powder coat" },
    ];
    expect(matchFinishingOps("Black anodize Type II", ops)).toEqual(["anod"]);
    expect(matchFinishingOps("Passivate per AMS 2700", ops)).toEqual(["pass"]);
    expect(matchFinishingOps("Type II", ops)).toEqual([]);
  });
  it("tokenises numbers with their units and grades", () => {
    expect(digitTokens("6061-T6, ±.005, Rev 3")).toEqual(["6061-t6", ".005", "3"]);
    // A leading decimal point is kept, so ".001" can't hide inside "BRK-1001".
    expect(digitTokens("+/- .001")).toEqual([".001"]);
  });
});
