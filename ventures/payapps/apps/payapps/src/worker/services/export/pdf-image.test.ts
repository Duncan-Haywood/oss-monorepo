// The PDF writer's JPEG images (pdf.ts): an image XObject per placed image, named on its page,
// embedded as is behind ASCIIHexDecode so the file stays ASCII and its xref offsets stay right.
import { base64ToBytes, jpegInfo } from "@shared/tm-tickets";
import { expect, it } from "vitest";
import { SIGNATURE_JPEG_B64 } from "../../../../test/fixtures/signature-jpeg";
import { PdfDocument } from "./pdf";

it("embeds a JPEG as an image XObject drawn into its box", () => {
  const bytes = base64ToBytes(SIGNATURE_JPEG_B64) as Uint8Array;
  const info = jpegInfo(bytes);
  if (!info) throw new Error("fixture is not a JPEG");
  const pdf = new PdfDocument({ title: "t" });
  pdf.addPage(612, 792).image(40, 100, 120, 40, { bytes, ...info });
  pdf.addPage(612, 792).text(40, 40, "no image here");
  const out = new TextDecoder().decode(pdf.toBytes());
  expect(out).toContain("/Subtype /Image /Width 120 /Height 40 /ColorSpace /DeviceRGB");
  expect(out).toContain("q 120 0 0 40 40 652 cm /Im1 Do Q");
  // The hex stream decodes back to the JPEG, start and end markers included.
  const m = /\/DCTDecode\] \/Length (\d+) >>\nstream\n([0-9a-f\n]+)>/.exec(out);
  expect(m).not.toBeNull();
  const hex = (m?.[2] ?? "").replace(/\n/g, "");
  expect(hex.length).toBe(bytes.length * 2);
  expect(hex.slice(0, 4)).toBe("ffd8");
  expect(hex.slice(-4)).toBe("ffd9");
  expect(Number(m?.[1])).toBe((m?.[2] ?? "").length + 1);
  // Only the page with the image names an XObject.
  expect(out.match(/\/XObject <</g)).toHaveLength(1);
  // Every xref offset points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(out)?.[1]);
  const entries = out
    .slice(xref)
    .split("\n")
    .slice(3)
    .filter((l) => / 00000 n $/.test(l));
  entries.forEach((e, i) => {
    expect(out.slice(Number(e.slice(0, 10)), Number(e.slice(0, 10)) + 12)).toMatch(
      new RegExp(`^${i + 1} 0 obj`),
    );
  });
});
