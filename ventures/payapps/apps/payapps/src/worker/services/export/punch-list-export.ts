// The job's punch list as a PDF to bring to the walk-through or send the GC with a back-check
// request (each item with its location, status and dates, and a blank "accepted" column for the
// GC's initials), and as CSV. Our own layout and wording, not any published form. Nothing is added
// that was not entered.

import { PUNCH_SOURCE_LABELS, PUNCH_STATUS_LABELS, punchLabel } from "@shared/punch-list";
import type { PunchListDocument } from "../payapps/punch-list";
import { csvCell } from "./csv";
import { SAMPLE_PUNCH_LIST_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

// Landscape letter: seven columns need the width.
const W = 792;
const H = 612;
const M = 36;
const FOOTER_TOP = H - 44;

export const PUNCH_LIST_NOTICE =
  "Prepared with PayApps from the punch list as entered. Marking an item done or accepted here " +
  "does not by itself change the contract or release retainage; the subcontract's close-out terms apply.";

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "punch-list-riverside-clinic.pdf" */
export function punchListFileName(project: { name: string }, ext: "pdf" | "csv"): string {
  const slug = slugOf(project.name);
  return `punch-list${slug ? `-${slug}` : ""}.${ext}`;
}

/** The items the document prints: all of them, or only those still to fix or to back-check. */
export function printedItems(doc: PunchListDocument) {
  return doc.scope === "open"
    ? doc.list.items.filter(
        (i) => i.status === "open" || i.status === "overdue" || i.status === "done",
      )
    : doc.list.items;
}

export function punchListPdf(doc: PunchListDocument): Uint8Array {
  const { project, contractor, list } = doc;
  const items = printedItems(doc);
  const pdf = new PdfDocument({ title: `Punch list: ${project.name}` });
  const width = W - 2 * M;
  // Column x positions and widths: No., location, item, status, fixed, accepted by GC.
  const cols = {
    no: { x: M, w: 44 },
    loc: { x: M + 44, w: 120 },
    item: { x: M + 164, w: 300 },
    status: { x: M + 464, w: 110 },
    fixed: { x: M + 574, w: 70 },
    acc: { x: M + 644, w: width - 644 },
  };
  let page: PdfPage;
  let y = 0;
  const header = () => {
    page.line(M, y + 4, W - M, y + 4, 0.4);
    page.text(cols.no.x, y, "No.", { size: 7.5, font: "bold" });
    page.text(cols.loc.x, y, "Location", { size: 7.5, font: "bold" });
    page.text(cols.item.x, y, "Item", { size: 7.5, font: "bold" });
    page.text(cols.status.x, y, "Status", { size: 7.5, font: "bold" });
    page.text(cols.fixed.x, y, "Fixed", { size: 7.5, font: "bold" });
    page.text(cols.acc.x, y, "Accepted (date, initials)", { size: 7.5, font: "bold" });
    y += 16;
  };
  const newPage = (first: boolean) => {
    page = pdf.addPage(W, H);
    if (project.isSample) {
      page.text(W - M, 26, SAMPLE_PUNCH_LIST_MARK, { size: 9, font: "bold", align: "right" });
    }
    if (first) {
      page.text(M, 42, "Punch list", { size: 16, font: "bold" });
      const job = project.number ? `${project.name} (${project.number})` : project.name;
      page.text(M, 58, fitText(job, width, 10, "bold"), { size: 10, font: "bold" });
      const parties = [
        `Contractor: ${contractor.name}`,
        `General contractor: ${project.gcName}`,
        project.ownerName ? `Owner: ${project.ownerName}` : null,
        project.architectName ? `Architect: ${project.architectName}` : null,
      ].filter(Boolean);
      page.text(M, 72, fitText(parties.join("   |   "), width, 8.5), { size: 8.5 });
      const s = list.summary;
      const counts = [
        `${s.total} item${s.total === 1 ? "" : "s"}`,
        `${s.toFix} to fix`,
        s.overdue ? `${s.overdue} overdue` : null,
        `${s.done} awaiting back-check`,
        `${s.accepted} accepted`,
        s.disputed ? `${s.disputed} not ours` : null,
      ].filter(Boolean);
      page.text(M, 86, `${counts.join(", ")}. As of ${list.today}.`, { size: 8.5 });
      if (doc.scope === "open") {
        page.text(M, 98, "Showing only items still to fix or awaiting back-check.", { size: 8 });
      }
      y = 118;
    } else {
      page.text(M, 36, fitText(`Punch list: ${project.name} (continued)`, width, 9), {
        size: 9,
        font: "bold",
      });
      y = 58;
    }
    header();
  };
  newPage(true);
  if (items.length === 0) {
    // biome-ignore lint/style/noNonNullAssertion: newPage just set it
    page!.text(M, y, "No items.", { size: 9 });
  }
  for (const it of items) {
    const desc = wrapText(it.description, cols.item.w - 8, 8.5);
    const extra: string[] = [];
    if (it.source) extra.push(`Listed by ${PUNCH_SOURCE_LABELS[it.source].toLowerCase()}`);
    if (it.listedOn) extra.push(`on ${it.listedOn}`);
    if (it.dueOn) extra.push(`due ${it.dueOn}`);
    const notes = [extra.join(" "), it.disputeNote ? `Not ours: ${it.disputeNote}` : ""]
      .filter(Boolean)
      .flatMap((t) => wrapText(t, cols.item.w - 8, 7));
    const h = desc.length * 11 + notes.length * 9 + 10;
    if (y + h > FOOTER_TOP - 6) newPage(false);
    // biome-ignore lint/style/noNonNullAssertion: newPage sets it
    const p = page!;
    p.text(cols.no.x, y, punchLabel(it.number), { size: 8.5, font: "bold" });
    p.text(cols.loc.x, y, fitText(it.location ?? "", cols.loc.w - 8, 8.5), { size: 8.5 });
    desc.forEach((l, i) => {
      p.text(cols.item.x, y + i * 11, l, { size: 8.5 });
    });
    notes.forEach((l, i) => {
      p.text(cols.item.x, y + desc.length * 11 + i * 9, l, { size: 7 });
    });
    const status =
      it.status === "overdue"
        ? `Overdue ${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"}`
        : PUNCH_STATUS_LABELS[it.status];
    wrapText(status, cols.status.w - 8, 8).forEach((l, i) => {
      p.text(cols.status.x, y + i * 10, l, {
        size: 8,
        font: it.status === "overdue" ? "bold" : "regular",
      });
    });
    p.text(cols.fixed.x, y, it.completedOn ?? "", { size: 8.5 });
    if (it.acceptedOn) {
      const by = [it.acceptedOn, it.acceptedBy].filter(Boolean).join(", ");
      p.text(cols.acc.x, y, fitText(by, cols.acc.w, 8.5), { size: 8.5 });
    } else {
      p.line(cols.acc.x, y + 3, W - M, y + 3, 0.3);
    }
    y += h;
    // The rule sits in the gap between this row's last line and the next row's capitals.
    p.line(M, y - 12, W - M, y - 12, 0.15);
  }

  pdf.pages.forEach((p, i) => {
    const fy = H - 22;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(PUNCH_LIST_NOTICE, width - 140, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `Punch list - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}

const PUNCH_CSV_HEADER = [
  "No.",
  "Location",
  "Item",
  "Status",
  "Listed by",
  "Date listed",
  "Due",
  "Days overdue",
  "Date fixed",
  "Fixed by",
  "Date accepted",
  "Accepted by",
  "Not ours (why)",
];

/** One row per item, in number order; a spreadsheet formula in any text cell is neutralised. */
export function punchListCsv(doc: PunchListDocument): string {
  const rows = [PUNCH_CSV_HEADER.map(csvCell).join(",")];
  for (const r of printedItems(doc)) {
    rows.push(
      [
        punchLabel(r.number),
        r.location,
        r.description,
        PUNCH_STATUS_LABELS[r.status],
        r.source ? PUNCH_SOURCE_LABELS[r.source] : null,
        r.listedOn,
        r.dueOn,
        r.daysOverdue || null,
        r.completedOn,
        r.completedBy,
        r.acceptedOn,
        r.acceptedBy,
        r.disputeNote,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
