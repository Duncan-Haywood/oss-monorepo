// The job's lookahead as a PDF for the GC's weekly coordination meeting (each open activity in the
// window with its trade, dates and percent complete, and a bar across the workday columns it
// spans), and the whole schedule as CSV. Our own layout and wording, not any published form; nothing
// is added that was not entered, apart from the workday counts and statuses worked out from it.

import { ACTIVITY_STATUS_LABELS, activityLabel, type CompanyHoliday } from "@shared/schedule";
import type { ScheduleDocument } from "../payapps/schedule";
import { csvCell } from "./csv";
import { SAMPLE_SCHEDULE_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

// Landscape letter.
const W = 792;
const H = 612;
const M = 30;
const FOOTER_TOP = H - 44;
const ROW = 18;

/** What the day columns leave out: weekends, and the company's holidays in the window by name. */
export function daysLeftOut(holidays: readonly CompanyHoliday[]): string {
  if (holidays.length === 0) return "Weekends are left out, and the company's holidays it lists.";
  // Four by name keeps the footer to its three lines on a six-week lookahead over Christmas.
  const shown = holidays.slice(0, 4).map((h) => `${h.on.slice(5)} ${h.name}`);
  if (holidays.length > 4) shown.push(`${holidays.length - 4} more`);
  const names = shown.join(", ");
  return `Weekends and the company's holidays (${names}) are left out.`;
}

export function scheduleNotice(holidays: readonly CompanyHoliday[]): string {
  return (
    `Prepared with PayApps from the schedule as entered. ${daysLeftOut(holidays)} ` +
    "A schedule here does not change the contract or the general contractor's schedule."
  );
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "lookahead-riverside-clinic.pdf", "schedule-riverside-clinic.csv" */
export function scheduleFileName(
  kind: "lookahead" | "schedule",
  project: { name: string },
  ext: "pdf" | "csv",
): string {
  const slug = slugOf(project.name);
  return `${kind}${slug ? `-${slug}` : ""}.${ext}`;
}

const SHORT_DAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function lookaheadPdf(doc: ScheduleDocument): Uint8Array {
  const { project, contractor, schedule } = doc;
  const w = schedule.lookahead;
  const items = schedule.activities.filter((a) => a.inLookahead);
  const pdf = new PdfDocument({ title: `${w.weeks}-week lookahead: ${project.name}` });
  const width = W - 2 * M;
  // Left block: No., activity (with trade under it), dates, percent. Then one column per workday.
  const cols = { no: M, name: M + 40, dates: M + 230, pct: M + 318 };
  const gridX = M + 350;
  const dayW = (W - M - gridX) / w.days.length;
  let page: PdfPage;
  let y = 0;

  const header = () => {
    page.text(cols.no, y, "No.", { size: 7.5, font: "bold" });
    page.text(cols.name, y, "Activity / trade", { size: 7.5, font: "bold" });
    page.text(cols.dates, y, "Start - finish", { size: 7.5, font: "bold" });
    page.text(cols.pct, y, "Done", { size: 7.5, font: "bold" });
    w.days.forEach((d, i) => {
      const x = gridX + i * dayW + dayW / 2;
      if (d === schedule.today) {
        page.rect(gridX + i * dayW, y - 8, dayW, 11, { fill: 0.85, stroke: false });
      }
      if (i % 5 === 0) {
        page.text(gridX + i * dayW + 1, y - 10, `Week of ${d.slice(5)}`, {
          size: 6.5,
          font: "bold",
        });
      }
      page.text(x, y, `${SHORT_DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8)}`, {
        size: 6,
        align: "center",
      });
    });
    page.line(M, y + 4, W - M, y + 4, 0.4);
    y += 12;
  };

  const newPage = (first: boolean) => {
    page = pdf.addPage(W, H);
    if (project.isSample) {
      page.text(W - M, 26, SAMPLE_SCHEDULE_MARK, { size: 9, font: "bold", align: "right" });
    }
    if (first) {
      page.text(M, 42, `${w.weeks}-week lookahead`, { size: 16, font: "bold" });
      const job = project.number ? `${project.name} (${project.number})` : project.name;
      page.text(M, 58, fitText(job, width, 10, "bold"), { size: 10, font: "bold" });
      const parties = [
        `Contractor: ${contractor.name}`,
        `General contractor: ${project.gcName}`,
        project.location ? `Location: ${project.location}` : null,
      ].filter(Boolean);
      page.text(M, 72, fitText(parties.join("   |   "), width, 8.5), { size: 8.5 });
      const s = schedule.summary;
      const late = items.filter((a) => a.status === "late_start" || a.status === "late_finish");
      const line = [
        `${w.from} to ${w.to}`,
        `${items.length} activit${items.length === 1 ? "y" : "ies"} open in the window`,
        late.length ? `${late.length} late` : null,
        s.percentComplete !== null ? `schedule ${s.percentComplete}% complete` : null,
        s.finishOn ? `last finish ${s.finishOn}` : null,
        `as of ${schedule.today}`,
      ].filter(Boolean);
      page.text(M, 86, `${line.join(", ")}.`, { size: 8.5 });
      y = 116;
    } else {
      page.text(M, 36, fitText(`Lookahead: ${project.name} (continued)`, width, 9), {
        size: 9,
        font: "bold",
      });
      y = 62;
    }
    header();
  };

  newPage(true);
  if (items.length === 0) {
    // biome-ignore lint/style/noNonNullAssertion: newPage just set it
    page!.text(M, y + 4, "Nothing open in these weeks.", { size: 9 });
  }
  for (const a of items) {
    const h = a.trade || a.sequenceProblem ? ROW + 8 : ROW;
    if (y + h > FOOTER_TOP - 6) newPage(false);
    // biome-ignore lint/style/noNonNullAssertion: newPage sets it
    const p = page!;
    const late = a.status === "late_start" || a.status === "late_finish";
    p.text(cols.no, y + 4, activityLabel(a.number), { size: 8, font: "bold" });
    p.text(cols.name, y + 4, fitText(a.name, cols.dates - cols.name - 6, 8.5), { size: 8.5 });
    // The sequence note, short enough for the column: the full sentence is on screen and in the CSV.
    const seq =
      a.sequenceProblem && a.predecessorNumber !== null
        ? a.earliestStart
          ? `Before ${activityLabel(a.predecessorNumber)} done; earliest ${a.earliestStart.slice(5)}`
          : `${activityLabel(a.predecessorNumber)} not on schedule`
        : null;
    const sub = [a.trade, late ? ACTIVITY_STATUS_LABELS[a.status] : null, seq]
      .filter(Boolean)
      .join(" - ");
    if (sub) {
      p.text(cols.name, y + 13, fitText(sub, cols.dates - cols.name - 6, 6.5), {
        size: 6.5,
        font: late ? "bold" : "regular",
      });
    }
    p.text(cols.dates, y + 4, `${a.startOn.slice(5)} - ${a.finishOn.slice(5)}`, { size: 8 });
    p.text(cols.pct, y + 4, `${a.percentComplete}%`, { size: 8 });
    // The bar: from the first workday in the window it covers to the last. A late activity whose
    // finish has passed runs to today, so the meeting sees it is still open.
    const end =
      a.status === "late_finish" && a.finishOn < schedule.today ? schedule.today : a.finishOn;
    const first = w.days.findIndex((d) => d >= a.startOn);
    let last = -1;
    for (let i = w.days.length - 1; i >= 0; i--) {
      if ((w.days[i] as string) <= end) {
        last = i;
        break;
      }
    }
    if (first !== -1 && last >= first) {
      const x = gridX + first * dayW + 1;
      const bw = (last - first + 1) * dayW - 2;
      p.rect(x, y - 3, bw, 9, { fill: late ? 0.35 : 0.65, stroke: false });
      // The done share, darker, from the left.
      if (a.percentComplete > 0 && !late) {
        p.rect(x, y - 3, (bw * a.percentComplete) / 100, 9, { fill: 0.25, stroke: false });
      }
    }
    // A rule at each week's Monday, down this row only.
    for (let i = 5; i < w.days.length; i += 5) {
      p.line(gridX + i * dayW, y - 6, gridX + i * dayW, y + h - 6, 0.3);
    }
    y += h;
    p.line(M, y - 6, W - M, y - 6, 0.15);
  }

  pdf.pages.forEach((p, i) => {
    const fy = H - 22;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(scheduleNotice(w.holidays), width - 140, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `Lookahead - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}

const SCHEDULE_CSV_HEADER = [
  "No.",
  "Activity",
  "Trade or crew",
  "Start",
  "Finish",
  "Workdays",
  "Percent complete",
  "Status",
  "Waits for",
  "Lag (workdays)",
  "Earliest start",
  "Sequence problem",
  "Notes",
  "P6 activity ID",
];

/** Every activity, in start order; a spreadsheet formula in any text cell is neutralised. */
export function scheduleCsv(doc: ScheduleDocument): string {
  const rows = [SCHEDULE_CSV_HEADER.map(csvCell).join(",")];
  for (const a of doc.schedule.activities) {
    rows.push(
      [
        activityLabel(a.number),
        a.name,
        a.trade,
        a.startOn,
        a.finishOn,
        a.workdays,
        a.percentComplete,
        ACTIVITY_STATUS_LABELS[a.status],
        a.predecessorNumber === null ? null : activityLabel(a.predecessorNumber),
        a.predecessorNumber === null ? null : a.lagDays,
        a.earliestStart,
        a.sequenceProblem,
        a.notes,
        a.sourceCode,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
