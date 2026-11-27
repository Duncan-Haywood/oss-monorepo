// The job's delay log as a PDF: each schedule activity the daily reports say was held up, with the
// days, the hours lost and the delay as the foreman wrote it, and the reports not tied to an
// activity after. Printed on its own or attached to a change order as the backup for a time
// extension. Our own layout and wording; nothing is printed that was not entered apart from sums
// and counts, and it never says how much time the delays earn.

import { hoursText } from "@shared/daily-reports";
import { DELAY_LOG_NOTE, delayTotalsText } from "@shared/schedule-delays";
import type { DelayLogDocument } from "../payapps/schedule-delays";
import { SAMPLE_SCHEDULE_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

// Portrait letter.
const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 92;
const LINE = 10;

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "delay-log-riverside-clinic.pdf", or "delay-log-a-003-riverside-clinic.pdf" for one activity. */
export function delayLogFileName(doc: Pick<DelayLogDocument, "project" | "log">): string {
  const one = doc.log.activityId ? doc.log.groups[0] : undefined;
  const parts = ["delay-log"];
  if (one?.number) parts.push(`a-${String(one.number).padStart(3, "0")}`);
  const slug = slugOf(doc.project.name);
  if (slug) parts.push(slug);
  return `${parts.join("-")}.pdf`;
}

const rangeText = (from: string | null, to: string | null) =>
  from && to ? `${from} to ${to}` : from ? `from ${from}` : to ? `through ${to}` : "every report";

export function delayLogPdf(doc: DelayLogDocument): Uint8Array {
  const { project, contractor, log, changeOrder } = doc;
  const pdf = new PdfDocument({ title: `Delay log: ${project.name}` });
  const width = W - 2 * M;
  const cols = { date: M, hours: M + 70, weather: M + 120, cause: M + 230 };
  const causeW = W - M - cols.cause;
  let page: PdfPage;
  let y = 0;

  const colHeader = () => {
    page.text(cols.date, y, "Date", { size: 7.5, font: "bold" });
    page.text(cols.hours + 36, y, "Hours lost", { size: 7.5, font: "bold", align: "right" });
    page.text(cols.weather, y, "Weather", { size: 7.5, font: "bold" });
    page.text(cols.cause, y, "Delay, as written in the daily report", { size: 7.5, font: "bold" });
    page.line(M, y + 4, W - M, y + 4, 0.4);
    y += 14;
  };

  const newPage = (first: boolean) => {
    page = pdf.addPage(W, H);
    if (project.isSample) {
      page.text(W - M, 26, SAMPLE_SCHEDULE_MARK, { size: 9, font: "bold", align: "right" });
    }
    if (!first) {
      page.text(M, 40, fitText(`Delay log: ${project.name} (continued)`, width, 9), {
        size: 9,
        font: "bold",
      });
      y = 64;
      return;
    }
    page.text(M, 46, "Delay log", { size: 16, font: "bold" });
    const job = project.number ? `${project.name} (${project.number})` : project.name;
    page.text(M, 62, fitText(job, width, 10, "bold"), { size: 10, font: "bold" });
    const parties = [
      `Contractor: ${contractor.name}`,
      `General contractor: ${project.gcName}`,
      project.ownerName ? `Owner: ${project.ownerName}` : null,
      project.location ? `Location: ${project.location}` : null,
    ].filter(Boolean);
    page.text(M, 76, fitText(parties.join("   |   "), width, 8.5), { size: 8.5 });
    y = 92;
    if (changeOrder) {
      const time =
        changeOrder.scheduleDays === null
          ? "time requested not stated"
          : changeOrder.scheduleDays === 0
            ? "no time requested"
            : `${changeOrder.scheduleDays} calendar day${changeOrder.scheduleDays === 1 ? "" : "s"} requested`;
      page.text(
        M,
        y,
        fitText(
          `Backup for change order ${changeOrder.number}: ${changeOrder.description} (${time})`,
          width,
          8.5,
          "bold",
        ),
        { size: 8.5, font: "bold" },
      );
      y += 14;
    }
    const scope = [
      log.activityId ? (log.groups[0]?.label ?? "One activity") : "Every activity",
      rangeText(log.from, log.to),
      delayTotalsText({
        dayCount: log.dayCount,
        hours: log.hours,
        hoursNotStated: log.groups.reduce((s, g) => s + g.hoursNotStated, 0),
      }),
      `printed ${doc.printedOn}`,
    ];
    page.text(M, y, fitText(`${scope.join(", ")}.`, width, 8.5), { size: 8.5 });
    y += 22;
  };

  newPage(true);
  if (log.groups.length === 0) {
    // biome-ignore lint/style/noNonNullAssertion: newPage just set it
    page!.text(M, y, "No daily report in this range records hours lost or a delayed activity.", {
      size: 9,
    });
  }
  for (const g of log.groups) {
    if (y + 40 > FOOTER_TOP) newPage(false);
    // biome-ignore lint/style/noNonNullAssertion: newPage sets it
    let p = page!;
    p.text(M, y, fitText(g.label, width - 170, 10, "bold"), { size: 10, font: "bold" });
    p.text(W - M, y, delayTotalsText(g), { size: 8.5, align: "right" });
    y += 11;
    if (g.startOn && g.finishOn) {
      p.text(M, y, `Scheduled ${g.startOn} to ${g.finishOn}; delays ${g.firstOn} to ${g.lastOn}`, {
        size: 7.5,
      });
      y += 10;
    }
    y += 6;
    colHeader();
    for (const d of g.days) {
      const lines = d.cause ? wrapText(d.cause, causeW, 8) : ["(not described)"];
      const shown = lines.slice(0, 12);
      if (lines.length > shown.length) shown[shown.length - 1] = `${shown.at(-1)} ...`;
      const h = Math.max(1, shown.length) * LINE + 8;
      if (y + h > FOOTER_TOP) {
        newPage(false);
        // biome-ignore lint/style/noNonNullAssertion: newPage sets it
        p = page!;
        colHeader();
      }
      p.text(cols.date, y, d.reportDate, { size: 8 });
      p.text(cols.hours + 36, y, d.hours === null ? "not stated" : hoursText(d.hours), {
        size: 8,
        align: "right",
      });
      p.text(cols.weather, y, fitText(d.weather ?? "", cols.cause - cols.weather - 8, 8), {
        size: 8,
      });
      shown.forEach((l, i) => {
        p.text(cols.cause, y + i * LINE, l, { size: 8 });
      });
      y += h;
      p.line(M, y - 9, W - M, y - 9, 0.15);
    }
    y += 14;
  }

  const notice = `Prepared with PayApps from the daily reports as entered. ${DELAY_LOG_NOTE}`;
  pdf.pages.forEach((p, i) => {
    const fy = H - 74;
    p.line(M, fy - 10, W - M, fy - 10, 0.3);
    wrapText(notice, width - 80, 6.5).forEach((l, j) => {
      p.text(M, fy + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy, `Delay log - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
