// The proposal sent to the GC from an estimate: who it is from and to, the job, each bid item at its
// price and the total, the add and deduct alternates (each with a box the GC ticks to accept it), what
// is included and excluded, the date it lapses and an acceptance block.
// Prices only: cost, tax and markup stay with the contractor (the estimate page shows them). Our own
// layout and wording, nothing added that was not entered.
import { addDays } from "@shared/cash-report";
import { estimateLabel } from "@shared/estimate";
import { formatCents } from "@shared/money";
import type { EstimateDocument } from "../payapps/estimates";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 48;

export const PROPOSAL_NOTICE =
  "Prepared with PayApps from the estimate as entered by the contractor. Check the scope, " +
  "quantities and prices before sending; PayApps does not review them.";

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "proposal-est-0007-riverside-clinic.pdf" */
export function proposalFileName(doc: Pick<EstimateDocument, "estimate">): string {
  const slug = slugOf(doc.estimate.name);
  return `proposal-${estimateLabel(doc.estimate.number).toLowerCase()}${slug ? `-${slug}` : ""}.pdf`;
}

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

export function proposalPdf(doc: EstimateDocument): Uint8Array {
  const { estimate: e, contractor, dated } = doc;
  const pdf = new PdfDocument({ title: `Proposal ${estimateLabel(e.number)}: ${e.name}` });
  let page = pdf.addPage(W, H);
  const width = W - 2 * M;
  let y = 46;
  page.text(M, y, "Proposal", { size: 18, font: "bold" });
  page.text(W - M, y, estimateLabel(e.number), { size: 10, font: "bold", align: "right" });
  y += 16;
  page.text(M, y, fitText(e.name, width, 10.5, "bold"), { size: 10.5, font: "bold" });

  const colW = width / 3;
  y = 90;
  page.rect(M, y - 8, width, 66, { stroke: true });
  labelValue(page, M + 8, y, "From (contractor)", contractor.name, colW - 16);
  labelValue(page, M + 8 + colW, y, "To (general contractor)", e.gcName, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Attention", e.gcContactName ?? "", colW - 16);
  y += 30;
  labelValue(page, M + 8, y, "Job location", e.location ?? "", colW - 16);
  labelValue(page, M + 8 + colW, y, "Date", dated, colW - 16);
  labelValue(
    page,
    M + 8 + 2 * colW,
    y,
    "Open for acceptance until",
    addDays(dated, e.validDays),
    colW - 16,
  );

  const newPage = () => {
    page = pdf.addPage(W, H);
    y = 54;
  };
  const ensure = (h: number) => {
    if (y + h > FOOTER_TOP - 10) newPage();
  };

  // Bid items and prices.
  y = 178;
  const priceX = W - M - 8;
  const head = () => {
    page.rect(M, y - 11, width, 16, { fill: 0.92 });
    page.text(M + 8, y, "Item", { size: 8, font: "bold" });
    page.text(M + 44, y, "Description", { size: 8, font: "bold" });
    page.text(priceX, y, "Price", { size: 8, font: "bold", align: "right" });
  };
  head();
  const alternates = e.bidItems.filter((b) => b.alternate);
  for (const b of e.bidItems.filter((x) => x.alternate !== "add")) {
    const rows = wrapText(b.description, width - 150, 9.5);
    if (y + 14 * rows.length > FOOTER_TOP - 40) {
      newPage();
      head();
    }
    y += 16;
    page.text(M + 8, y, b.itemNumber, { size: 9.5 });
    rows.forEach((r, i) => {
      page.text(M + 44, y + i * 12, r, { size: 9.5 });
    });
    page.text(priceX, y, formatCents(b.priceCents), { size: 9.5, align: "right" });
    y += (rows.length - 1) * 12;
    page.line(M, y + 5, W - M, y + 5, 0.25);
  }
  y += 22;
  ensure(20);
  page.text(M + 44, y, alternates.length ? "Base bid" : "Total", { size: 11, font: "bold" });
  page.text(priceX, y, formatCents(e.totals.priceCents), {
    size: 11,
    font: "bold",
    align: "right",
  });

  if (alternates.length) {
    y += 26;
    ensure(40);
    page.text(M, y, "Alternates", { size: 11, font: "bold" });
    y += 4;
    page.text(M, y + 10, "Tick each alternate accepted; the base bid changes by its amount.", {
      size: 7.5,
    });
    y += 10;
    for (const b of alternates) {
      const what =
        b.alternate === "add"
          ? `Alternate No. ${b.alternateNumber} (add): ${b.description}`
          : `Alternate No. ${b.alternateNumber} (deduct): omit item ${b.itemNumber}, ${b.description}`;
      const rows = wrapText(what, width - 170, 9.5);
      ensure(14 * rows.length + 8);
      y += 16;
      page.rect(M + 8, y - 8, 9, 9, { stroke: true });
      rows.forEach((r, i) => {
        page.text(M + 24, y + i * 12, r, { size: 9.5 });
      });
      page.text(
        priceX,
        y,
        `${b.alternate === "add" ? "Add" : "Deduct"} ${formatCents(b.priceCents)}`,
        { size: 9.5, align: "right" },
      );
      y += (rows.length - 1) * 12;
      page.line(M, y + 5, W - M, y + 5, 0.25);
    }
  }

  const block = (title: string, body: string | null) => {
    if (!body) return;
    y += 26;
    ensure(32);
    page.text(M, y, title, { size: 11, font: "bold" });
    y += 2;
    for (const l of wrapText(body, width, 9.5)) {
      ensure(14);
      y += 13;
      page.text(M, y, l, { size: 9.5 });
    }
  };
  block("Includes", e.inclusions);
  block("Excludes", e.exclusions);
  block("Notes", e.notes);

  // Acceptance.
  y += 30;
  ensure(90);
  page.text(M, y, "Accepted by", { size: 11, font: "bold" });
  y += 36;
  const half = (width - 24) / 2;
  for (const [x, label] of [
    [M, "Signature"],
    [M + half + 24, "Name and title"],
  ] as const) {
    page.line(x, y, x + half, y, 0.5);
    page.text(x, y + 10, label, { size: 7 });
  }
  y += 34;
  for (const [x, label] of [
    [M, "Company"],
    [M + half + 24, "Date"],
  ] as const) {
    page.line(x, y, x + half, y, 0.5);
    page.text(x, y + 10, label, { size: 7 });
  }

  // Footer on every page.
  pdf.pages.forEach((p, i, all) => {
    const lines = wrapText(PROPOSAL_NOTICE, width - 60, 7);
    lines.forEach((l, k) => {
      p.text(M, FOOTER_TOP + 12 + k * 9, l, { size: 7 });
    });
    p.text(W - M, FOOTER_TOP + 12, `Page ${i + 1} of ${all.length}`, { size: 7, align: "right" });
  });
  return pdf.toBytes();
}
