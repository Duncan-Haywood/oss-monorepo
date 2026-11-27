// Georgia's waiver forms must "be in at least 12 point font" (O.C.G.A. § 44-14-366(d), (e)): every
// block of the form prints at 12 pt or more. The 7 pt footer band (citation and disclaimer) is
// outside the form. Other states keep the 10 pt body.
import { listForms, render } from "@lien-waivers";
import { waiverPdf } from "@worker/services/export/waiver-pdf";
import { describe, expect, it } from "vitest";

const decode = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
/** The type size of every text run, except the footer band's 7 pt. */
const formSizes = (pdf: string) =>
  [...pdf.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map((m) => Number(m[1])).filter((s) => s !== 7);

const GA = {
  county: "Fulton",
  customerName: "Peachtree Builders, Inc.",
  workDescription: "electrical labor and materials",
  projectName: "Midtown Clinic Addition",
  cityOrTown: "Atlanta",
  propertyCounty: "Fulton",
  ownerName: "Example Holdings LLC",
  propertyDescription: "100 Example St NE, Atlanta, GA 30309",
  amountPaidCents: 4_250_000,
  claimantName: "Red Clay Electric LLC",
  throughDate: "2026-10-31",
};

describe("waiver PDF type size", () => {
  it("prints a Georgia waiver at 12 pt or larger throughout", () => {
    const form = listForms("GA").find((f) => f.kind === "conditional-progress");
    if (!form) throw new Error("no GA form");
    const r = render(form, GA);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const sizes = formSizes(decode(waiverPdf(r.document)));
    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it("keeps the 10 pt body elsewhere", () => {
    const form = listForms("AZ").find((f) => f.kind === "unconditional-final");
    if (!form) throw new Error("no AZ form");
    expect(form.minFontPt).toBeUndefined();
    const data = Object.fromEntries(
      form.fields.map((f) => [
        f.key,
        f.type === "money" ? 100_000 : f.type === "date" ? "2026-11-26" : `Example ${f.key}`,
      ]),
    );
    const r = render(form, data);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(Math.min(...formSizes(decode(waiverPdf(r.document))))).toBe(10);
  });
});
