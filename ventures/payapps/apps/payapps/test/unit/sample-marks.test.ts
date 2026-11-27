// The sample job's lien waivers say so on every page (CSVs and change order PDFs:
// test/worker/sample-job.test.ts).
import type { WaiverDocument } from "@lien-waivers";
import { SAMPLE_WAIVER_MARK, waiverPdf } from "@worker/services/export/waiver-pdf";
import { describe, expect, it } from "vitest";

const decode = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const count = (text: string, mark: string) => text.split(mark).length - 1;
const pages = (text: string) => (text.match(/\/Type \/Page\b/g) ?? []).length;

describe("sample marks", () => {
  it("every page of a sample lien waiver says so, outside the form's body", () => {
    const doc: WaiverDocument = {
      formId: "general/conditional-progress",
      state: null,
      kind: "conditional-progress",
      source: "general",
      title: "Conditional Waiver",
      citation: null,
      disclaimers: ["Not legal advice."],
      values: {},
      blocks: Array.from({ length: 80 }, (_, i) => ({
        type: "paragraph" as const,
        text: `Paragraph ${i}`,
      })),
    } as never;
    const text = decode(waiverPdf(doc, { sample: true }));
    expect(pages(text)).toBeGreaterThan(1);
    expect(count(text, SAMPLE_WAIVER_MARK)).toBe(pages(text));
    expect(decode(waiverPdf(doc))).not.toContain(SAMPLE_WAIVER_MARK);
  });
});
