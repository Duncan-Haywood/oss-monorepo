// T&M tickets as a PDF (one ticket, or every ticket on a change order as its backup, each on its own
// page) and the job's ticket log as CSV. Our own layout and wording, not any published T&M form.
// The field copy prints quantities only, with blank lines to sign by hand; the priced copy adds the
// rates, markups and total. A drawn signature is printed as captured.

import type { TmTicketDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import {
  bpsText,
  equipmentCents,
  jpegInfo,
  laborCents,
  laborManHours,
  materialCents,
  qtyText,
  STAGE_LABEL,
  TM_TICKETS_NOTE,
  tmLabel,
} from "@shared/tm-tickets";
import type { TmTicketDocument } from "../payapps/tm-tickets";
import { csvCell } from "./csv";
import { SAMPLE_TM_TICKET_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 48;

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const withSlug = (base: string, name: string, ext: string) => {
  const slug = slugOf(name);
  return `${base}${slug ? `-${slug}` : ""}.${ext}`;
};

/** "tm-ticket-12-riverside-clinic.pdf", or "tm-tickets-co-4-riverside-clinic.pdf" for a change order. */
export function tmTicketFileName(
  doc: Pick<TmTicketDocument, "project" | "tickets">,
  changeOrderNumber?: string,
): string {
  const one = doc.tickets.length === 1 ? doc.tickets[0] : undefined;
  const base =
    changeOrderNumber !== undefined
      ? `tm-tickets-co-${slugOf(changeOrderNumber) || "x"}`
      : one
        ? `tm-ticket-${one.number}`
        : "tm-tickets";
  return withSlug(base, doc.project.name, "pdf");
}

/** "tm-tickets-riverside-clinic.csv" */
export function tmTicketLogFileName(project: { name: string }): string {
  return withSlug("tm-tickets", project.name, "csv");
}

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

const money = (c: number | null) => (c === null ? "not priced" : formatCents(c));
const rate = (c: number | null, per: string) => (c === null ? "-" : `${formatCents(c)}${per}`);

export function tmTicketPdf(doc: TmTicketDocument): Uint8Array {
  const { project, contractor, tickets, withPrices } = doc;
  const pdf = new PdfDocument({
    title: `T&M ticket${tickets.length > 1 ? "s" : ""}: ${project.name}`,
  });
  const width = W - 2 * M;
  let page!: PdfPage;
  let y = 0;
  let current: TmTicketDto | null = null;

  const heading = (p: PdfPage) => {
    if (project.isSample) {
      p.text(W - M, 30, SAMPLE_TM_TICKET_MARK, { size: 9, font: "bold", align: "right" });
    }
  };
  const continuation = () => {
    page = pdf.addPage(W, H);
    heading(page);
    y = 54;
    if (current) page.text(M, y - 12, `${tmLabel(current.number)} (continued)`, { size: 8 });
  };
  const ensure = (h: number) => {
    if (y + h > FOOTER_TOP - 10) continuation();
  };

  /** A table: column x positions (right edge for numbers), a header, then rows. */
  const table = (
    title: string,
    cols: { head: string; x: number; right?: boolean; w?: number }[],
    body: string[][],
  ) => {
    if (body.length === 0) return;
    y += 22;
    ensure(40);
    page.text(M, y, title, { size: 11, font: "bold" });
    const header = () => {
      y += 15;
      for (const c of cols) {
        page.text(c.x, y, c.head, { size: 8, font: "bold", align: c.right ? "right" : "left" });
      }
      page.line(M, y + 4, W - M, y + 4, 0.3);
    };
    header();
    for (const r of body) {
      if (y + 14 > FOOTER_TOP - 10) {
        continuation();
        header();
      }
      y += 14;
      cols.forEach((c, i) => {
        const v = r[i] ?? "";
        page.text(c.x, y, c.w ? fitText(v, c.w, 9) : v, {
          size: 9,
          align: c.right ? "right" : "left",
        });
      });
    }
  };

  const totalLine = (label: string, value: string, bold = false) => {
    ensure(14);
    y += 13;
    page.text(W - M - 110, y, label, { size: 9, font: bold ? "bold" : "regular", align: "right" });
    page.text(W - M, y, value, { size: 9, font: bold ? "bold" : "regular", align: "right" });
  };

  for (const t of tickets) {
    current = null;
    page = pdf.addPage(W, H);
    heading(page);
    current = t;
    page.text(M, 46, `Time and Material Ticket No. ${t.number}`, { size: 16, font: "bold" });
    page.text(M, 62, `Work done ${t.workDate}`, { size: 10, font: "bold" });
    if (t.changeOrderNumber) {
      page.text(W - M, 62, `Billed on change order ${t.changeOrderNumber}`, {
        size: 9,
        align: "right",
      });
    }

    const colW = width / 3;
    y = 86;
    page.rect(M, y - 8, width, 66, { stroke: true });
    labelValue(
      page,
      M + 8,
      y,
      "Project",
      project.number ? `${project.name} (${project.number})` : project.name,
      colW - 16,
    );
    labelValue(page, M + 8 + colW, y, "Contractor", contractor.name, colW - 16);
    labelValue(page, M + 8 + 2 * colW, y, "General contractor", project.gcName, colW - 16);
    y += 30;
    labelValue(page, M + 8, y, "Location on site", t.location ?? "", colW - 16);
    labelValue(page, M + 8 + colW, y, "Directed by", t.directedBy ?? "", colW - 16);
    labelValue(
      page,
      M + 8 + 2 * colW,
      y,
      "Directive / RFI / reference",
      t.reference ?? "",
      colW - 16,
    );
    y = 152;

    y += 18;
    page.text(M, y, "Extra work performed", { size: 11, font: "bold" });
    for (const l of wrapText(t.description, width, 9.5)) {
      ensure(14);
      y += 13;
      page.text(M, y, l, { size: 9.5 });
    }

    const priced = withPrices;
    table(
      "Labor",
      [
        { head: "Trade", x: M, w: 200 },
        { head: "Workers", x: M + 270, right: true },
        { head: "Hours each", x: M + 340, right: true },
        { head: "Man-hours", x: M + 410, right: true },
        ...(priced
          ? [
              { head: "Rate", x: M + 470, right: true },
              { head: "Amount", x: W - M, right: true },
            ]
          : []),
      ],
      t.labor.map((l) => [
        l.trade,
        String(l.workers),
        qtyText(l.hoursEach),
        qtyText(laborManHours(l)),
        ...(priced ? [rate(l.rateCents, "/h"), money(laborCents(l))] : []),
      ]),
    );
    table(
      "Material",
      [
        { head: "Description", x: M, w: 240 },
        { head: "Quantity", x: M + 320, right: true },
        { head: "Unit", x: M + 330, w: 60 },
        ...(priced
          ? [
              { head: "Unit cost", x: M + 470, right: true },
              { head: "Amount", x: W - M, right: true },
            ]
          : []),
      ],
      t.material.map((l) => [
        l.description,
        qtyText(l.quantity),
        l.unit ?? "",
        ...(priced ? [rate(l.unitCostCents, ""), money(materialCents(l))] : []),
      ]),
    );
    table(
      "Equipment",
      [
        { head: "Description", x: M, w: 280 },
        { head: "Hours", x: M + 340, right: true },
        ...(priced
          ? [
              { head: "Rate", x: M + 470, right: true },
              { head: "Amount", x: W - M, right: true },
            ]
          : []),
      ],
      t.equipment.map((l) => [
        l.description,
        qtyText(l.hours),
        ...(priced ? [rate(l.rateCents, "/h"), money(equipmentCents(l))] : []),
      ]),
    );

    y += 8;
    totalLine("Total man-hours", qtyText(t.pricing.manHours));
    if (priced) {
      const p = t.pricing;
      for (const [label, s, bps] of [
        ["Labor", p.labor, t.laborMarkupBps],
        ["Material", p.material, t.materialMarkupBps],
        ["Equipment", p.equipment, t.equipmentMarkupBps],
      ] as const) {
        const lines =
          label === "Labor"
            ? t.labor.length
            : label === "Material"
              ? t.material.length
              : t.equipment.length;
        if (lines === 0) continue;
        totalLine(`${label}`, formatCents(s.subtotalCents));
        if (bps > 0) totalLine(`${label} markup ${bpsText(bps)}%`, formatCents(s.markupCents));
      }
      totalLine(
        "Total",
        p.totalCents === null
          ? `${formatCents(p.pricedSoFarCents)} so far, ${p.labor.unpriced + p.material.unpriced + p.equipment.unpriced} line(s) not priced`
          : formatCents(p.totalCents),
        true,
      );
    }

    if (t.notes?.trim()) {
      y += 20;
      ensure(30);
      page.text(M, y, "Notes", { size: 11, font: "bold" });
      for (const l of wrapText(t.notes, width, 9.5)) {
        ensure(14);
        y += 13;
        page.text(M, y, l, { size: 9.5 });
      }
    }

    // The signature block: the GC's representative signs for the work and quantities above.
    y += 24;
    ensure(120);
    page.text(M, y, `Accepted for ${project.gcName}`, { size: 11, font: "bold" });
    y += 6;
    page.text(
      M,
      y + 10,
      fitText(
        "The undersigned saw the labor, material and equipment above used for this extra work.",
        width,
        8,
      ),
      { size: 8 },
    );
    y += 20;
    const sigTop = y;
    const img = doc.signatures.get(t.id);
    const info = img ? jpegInfo(img) : null;
    if (img && info) {
      const scale = Math.min(220 / info.width, 64 / info.height, 1);
      page.image(M, sigTop, info.width * scale, info.height * scale, {
        bytes: img,
        width: info.width,
        height: info.height,
        components: info.components,
      });
    } else if (t.signedName && t.signedOn) {
      page.text(M, sigTop + 40, "Signed on paper; the signed original is kept by the contractor.", {
        size: 8.5,
      });
    }
    y = sigTop + 68;
    page.line(M, y, M + 240, y, 0.5);
    page.line(M + 270, y, W - M, y, 0.5);
    page.text(M, y + 10, "Signature", { size: 7 });
    page.text(M + 270, y + 10, "Name and title", { size: 7 });
    if (t.signedName) {
      page.text(
        M + 270,
        y - 4,
        fitText(
          t.signedTitle ? `${t.signedName}, ${t.signedTitle}` : t.signedName,
          width - 270,
          9.5,
        ),
        { size: 9.5 },
      );
    }
    y += 34;
    page.line(M, y, M + 240, y, 0.5);
    page.text(M, y + 10, "Date", { size: 7 });
    if (t.signedOn) page.text(M, y - 4, t.signedOn, { size: 9.5 });

    y += 30;
    ensure(16);
    const by = t.createdByName ? `Written up by ${t.createdByName}` : "Written up in PayApps";
    page.text(M, y, fitText(`${by}. ${STAGE_LABEL[t.stage]}.`, width, 8.5), { size: 8.5 });
  }

  pdf.pages.forEach((p, i) => {
    const fy = H - 24;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(
      `Prepared with PayApps from the ticket as entered. ${TM_TICKETS_NOTE}`,
      width - 120,
      6.5,
    ).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `page ${i + 1}/${pdf.pages.length}`, { size: 6.5, align: "right" });
  });
  return pdf.toBytes();
}

const CSV_HEADER = [
  "Ticket",
  "Work date",
  "Description",
  "Location",
  "Directed by",
  "Reference",
  "Man-hours",
  "Labor",
  "Material",
  "Equipment",
  "Labor $",
  "Material $",
  "Equipment $",
  "Markups $",
  "Total $",
  "Lines not priced",
  "Signed by",
  "Signed on",
  "Change order",
  "Stage",
  "Notes",
];

const dollars = (c: number) => (c / 100).toFixed(2);

/** One row per ticket, oldest first; a spreadsheet formula in any text cell is neutralised. */
export function tmTicketLogCsv(tickets: readonly TmTicketDto[]): string {
  const rows = [CSV_HEADER.map(csvCell).join(",")];
  for (const t of tickets) {
    const p = t.pricing;
    rows.push(
      [
        t.number,
        t.workDate,
        t.description,
        t.location,
        t.directedBy,
        t.reference,
        p.manHours,
        t.labor.map((l) => `${l.trade} ${l.workers} x ${qtyText(l.hoursEach)} h`).join("; "),
        t.material
          .map((l) => `${l.description} ${qtyText(l.quantity)}${l.unit ? ` ${l.unit}` : ""}`)
          .join("; "),
        t.equipment.map((l) => `${l.description} ${qtyText(l.hours)} h`).join("; "),
        dollars(p.labor.subtotalCents),
        dollars(p.material.subtotalCents),
        dollars(p.equipment.subtotalCents),
        dollars(p.labor.markupCents + p.material.markupCents + p.equipment.markupCents),
        p.totalCents === null ? "" : dollars(p.totalCents),
        p.labor.unpriced + p.material.unpriced + p.equipment.unpriced,
        t.signedName ? (t.signedTitle ? `${t.signedName}, ${t.signedTitle}` : t.signedName) : "",
        t.signedOn,
        t.changeOrderNumber,
        STAGE_LABEL[t.stage],
        t.notes,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
