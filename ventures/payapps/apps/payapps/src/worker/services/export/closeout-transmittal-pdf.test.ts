import type { CloseoutItemDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import {
  closeoutDates,
  closeoutTransmittalFileName,
  closeoutTransmittalPdf,
} from "./closeout-transmittal-pdf";

const item = (over: Partial<CloseoutItemDto> = {}): CloseoutItemDto => ({
  id: "clo_1",
  kind: "warranty",
  title: "One-year warranty letter",
  requiredBy: null,
  dueOn: null,
  sentOn: null,
  acceptedOn: null,
  acceptedBy: null,
  waivedNote: null,
  note: null,
  status: "missing",
  daysOverdue: 0,
  files: 0,
  ...over,
});

const project = {
  name: "Mesa Clinic TI",
  number: null,
  location: null,
  gcName: "Copper State Builders",
  gcPmName: null,
  gcPmEmail: null,
  ownerName: null,
  architectName: null,
  isSample: false,
};

describe("close-out transmittal", () => {
  it("prints only the dates entered, in order, or the reason a document is not required", () => {
    expect(closeoutDates(item())).toBe("-");
    expect(
      closeoutDates(
        item({
          dueOn: "2026-12-01",
          sentOn: "2026-11-20",
          acceptedOn: "2026-11-24",
          acceptedBy: "D. Ruiz",
        }),
      ),
    ).toBe("due 2026-12-01, sent 2026-11-20, accepted 2026-11-24 (D. Ruiz)");
    expect(closeoutDates(item({ sentOn: "2026-11-20", waivedNote: "Not in our scope" }))).toBe(
      "Not required: Not in our scope",
    );
  });

  it("names the file after the job, and prints a page even with an empty checklist", () => {
    expect(closeoutTransmittalFileName({ project })).toBe("closeout-mesa-clinic-ti.pdf");
    expect(closeoutTransmittalFileName({ project: { ...project, name: "!!!" } })).toBe(
      "closeout.pdf",
    );
    const bytes = closeoutTransmittalPdf({
      contractor: { name: "Valley Electric" },
      project: { ...project, isSample: true },
      items: [],
      files: [],
      today: "2026-11-26",
    });
    const text = Array.from(bytes, (c) => String.fromCharCode(c)).join("");
    expect(text).toContain("(No close-out documents are on the checklist.)");
    expect(text).toContain("(SAMPLE DATA - NOT A REAL CLOSE-OUT)");
  });

  it("runs a long checklist onto more pages with the header repeated", () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      item({ id: `clo_${i}`, title: `Document ${i + 1}`, sentOn: "2026-11-20", status: "sent" }),
    );
    const bytes = closeoutTransmittalPdf({
      contractor: { name: "Valley Electric" },
      project,
      items,
      files: [],
      today: "2026-11-26",
    });
    const text = Array.from(bytes, (c) => String.fromCharCode(c)).join("");
    expect(text).toContain("(Document 60)");
    expect(text.match(/\(Status and dates\)/g)?.length).toBeGreaterThan(1);
  });
});
