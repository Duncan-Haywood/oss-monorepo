// Daily reports as a PDF (one report, or a week's or a month's in one file, each starting on its own
// page) and the job's log as CSV. Our own layout and wording, not any published daily report form.
// Nothing is added that was not entered: a section left blank is left out of the PDF.

import type { DailyReportDto } from "@shared/api/types";
import {
  DAILY_REPORTS_NOTE,
  dayLabel,
  hoursText,
  lineHours,
  weatherText,
} from "@shared/daily-reports";
import type { DailyReportDocument } from "../payapps/daily-reports";
import { csvCell } from "./csv";
import { SAMPLE_DAILY_REPORT_MARK } from "./model";
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

/** "daily-report-2026-11-24-riverside-clinic.pdf", or "daily-reports-2026-11-23-to-2026-11-27-..." */
export function dailyReportFileName(doc: Pick<DailyReportDocument, "project" | "reports">): string {
  const first = doc.reports[0]?.reportDate ?? "";
  const last = doc.reports.at(-1)?.reportDate ?? first;
  const base = first === last ? `daily-report-${first}` : `daily-reports-${first}-to-${last}`;
  return withSlug(base, doc.project.name, "pdf");
}

/** "daily-reports-riverside-clinic.csv" */
export function dailyReportLogFileName(project: { name: string }): string {
  return withSlug("daily-reports", project.name, "csv");
}

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

export function dailyReportPdf(doc: DailyReportDocument): Uint8Array {
  const { project, contractor, reports } = doc;
  const pdf = new PdfDocument({
    title: `Daily report${reports.length > 1 ? "s" : ""}: ${project.name}`,
  });
  const width = W - 2 * M;
  let page!: PdfPage;
  let y = 0;
  let current: DailyReportDto | null = null;

  const heading = (p: PdfPage) => {
    if (project.isSample) {
      p.text(W - M, 30, SAMPLE_DAILY_REPORT_MARK, { size: 9, font: "bold", align: "right" });
    }
  };
  const continuation = () => {
    page = pdf.addPage(W, H);
    heading(page);
    y = 54;
    if (current) {
      page.text(M, y - 12, `Daily report ${dayLabel(current.reportDate)} (continued)`, {
        size: 8,
      });
    }
  };
  const ensure = (h: number) => {
    if (y + h > FOOTER_TOP - 10) continuation();
  };
  const block = (head: string, body: string | null) => {
    if (!body?.trim()) return;
    y += 24;
    ensure(30);
    page.text(M, y, head, { size: 11, font: "bold" });
    y += 2;
    for (const para of body.split(/\r?\n/)) {
      const lines = para.trim() ? wrapText(para, width, 9.5) : [""];
      for (const l of lines) {
        ensure(14);
        y += 13;
        page.text(M, y, l, { size: 9.5 });
      }
    }
  };

  for (const r of reports) {
    current = null;
    page = pdf.addPage(W, H);
    heading(page);
    current = r;
    page.text(M, 46, "Daily Report", { size: 16, font: "bold" });
    page.text(M, 62, dayLabel(r.reportDate), { size: 10, font: "bold" });

    const colW = width / 3;
    y = 86;
    page.rect(M, y - 8, width, 96, { stroke: true });
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
    labelValue(page, M + 8, y, "Location", project.location ?? "", colW - 16);
    labelValue(
      page,
      M + 8 + colW,
      y,
      "Hours lost to weather or delay",
      r.delayHours === null ? "not stated" : hoursText(r.delayHours),
      colW - 16,
    );
    y += 30;
    labelValue(page, M + 8, y, "Weather", weatherText(r, { ascii: true }), width - 16);
    y = 180;

    // The crew table: company, trade, workers, hours each, man-hours.
    y += 18;
    page.text(M, y, "Crew on site", { size: 11, font: "bold" });
    if (r.crew.length === 0) {
      y += 14;
      page.text(M, y, "No crew entered.", { size: 9.5 });
    } else {
      const cols = [M, M + 200, M + 340, M + 400, M + 470];
      const header = () => {
        y += 15;
        page.text(cols[0] as number, y, "Company", { size: 8, font: "bold" });
        page.text(cols[1] as number, y, "Trade", { size: 8, font: "bold" });
        page.text((cols[3] as number) - 8, y, "Workers", { size: 8, font: "bold", align: "right" });
        page.text((cols[4] as number) - 8, y, "Hours each", {
          size: 8,
          font: "bold",
          align: "right",
        });
        page.text(W - M, y, "Man-hours", { size: 8, font: "bold", align: "right" });
        page.line(M, y + 4, W - M, y + 4, 0.3);
      };
      header();
      for (const l of r.crew) {
        if (y + 14 > FOOTER_TOP - 10) {
          continuation();
          header();
        }
        y += 14;
        page.text(cols[0] as number, y, fitText(l.company ?? contractor.name, 190, 9), { size: 9 });
        page.text(cols[1] as number, y, fitText(l.trade, 130, 9), { size: 9 });
        page.text((cols[3] as number) - 8, y, String(l.workers), { size: 9, align: "right" });
        page.text((cols[4] as number) - 8, y, hoursText(l.hoursEach), { size: 9, align: "right" });
        page.text(W - M, y, hoursText(lineHours(l)), { size: 9, align: "right" });
      }
      ensure(18);
      page.line(M, y + 4, W - M, y + 4, 0.3);
      y += 15;
      page.text(M, y, "Total", { size: 9, font: "bold" });
      page.text((cols[3] as number) - 8, y, String(r.workers), {
        size: 9,
        font: "bold",
        align: "right",
      });
      page.text(W - M, y, hoursText(r.manHours), { size: 9, font: "bold", align: "right" });
    }

    block("Work performed", r.workPerformed);
    block("Delays and problems", r.delays);
    block("Equipment on site", r.equipment);
    block("Deliveries", r.deliveries);
    block("Visitors and inspections", r.visitors);
    block("Safety", r.safety);
    block("Notes", r.notes);

    y += 26;
    ensure(16);
    const by = r.createdByName ? `Prepared by ${r.createdByName}` : "Prepared in PayApps";
    const changed =
      r.updatedByName && r.updatedAt !== r.createdAt
        ? `; last changed by ${r.updatedByName} ${r.updatedAt.slice(0, 10)}`
        : "";
    page.text(M, y, fitText(`${by}${changed}.`, width, 8.5), { size: 8.5 });
  }

  pdf.pages.forEach((p, i) => {
    const fy = H - 24;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(
      `Prepared with PayApps from the report as entered. ${DAILY_REPORTS_NOTE}`,
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
  "Date",
  "Day",
  "Weather",
  "High F",
  "Low F",
  "Hours lost",
  "Workers",
  "Man-hours",
  "Crew",
  "Work performed",
  "Delays and problems",
  "Equipment",
  "Deliveries",
  "Visitors and inspections",
  "Safety",
  "Notes",
  "Prepared by",
];

const crewCell = (r: DailyReportDto, own: string) =>
  r.crew
    .map((l) => `${l.company ?? own}: ${l.trade} ${l.workers} x ${hoursText(l.hoursEach)} h`)
    .join("; ");

/** One row per report, oldest first; a spreadsheet formula in any text cell is neutralised. */
export function dailyReportLogCsv(
  reports: readonly DailyReportDto[],
  contractorName: string,
): string {
  const rows = [CSV_HEADER.map(csvCell).join(",")];
  for (const r of reports) {
    rows.push(
      [
        r.reportDate,
        dayLabel(r.reportDate).split(" ")[0] as string,
        r.weather,
        r.tempHighF,
        r.tempLowF,
        r.delayHours,
        r.workers,
        r.manHours,
        crewCell(r, contractorName),
        r.workPerformed,
        r.delays,
        r.equipment,
        r.deliveries,
        r.visitors,
        r.safety,
        r.notes,
        r.createdByName,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
