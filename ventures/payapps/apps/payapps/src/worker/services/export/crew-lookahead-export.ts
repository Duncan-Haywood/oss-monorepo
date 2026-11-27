// The crew lookahead as a landscape PDF for the Monday crew meeting: for each crew (as typed on the
// job schedules), its open activities on every active job in the window, with a bar across the
// workdays each spans and the days the crew has work on two jobs. Our own layout and wording;
// nothing is added that was not entered apart from statuses and the overlap days worked out from it.

import { ACTIVITY_STATUS_LABELS, activityLabel, type CompanyHoliday } from "@shared/schedule";
import type { CrewLookaheadDocument } from "../payapps/crew-lookahead";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";
import { daysLeftOut } from "./schedule-export";

const W = 792;
const H = 612;
const M = 30;
const FOOTER_TOP = H - 44;
const ROW = 18;
const SHORT_DAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function crewLookaheadNotice(holidays: readonly CompanyHoliday[]): string {
  return (
    "Prepared with PayApps from the job schedules as entered; crews are matched by the name typed " +
    `on each activity. ${daysLeftOut(holidays)} Two jobs on one day is what the dates say, not a ` +
    "conflict: a crew can split."
  );
}

const dayLabel = (d: string) =>
  `${SHORT_DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(5)}`;

export function crewLookaheadFileName(weeks: number): string {
  return `crew-lookahead-${weeks}-weeks.pdf`;
}

export function crewLookaheadPdf(doc: CrewLookaheadDocument): Uint8Array {
  const { contractor, lookahead: la } = doc;
  const w = la.lookahead;
  const pdf = new PdfDocument({ title: `Crew lookahead: ${contractor.name}` });
  const width = W - 2 * M;
  const cols = { job: M, name: M + 130, dates: M + 280, pct: M + 340 };
  const gridX = M + 370;
  const dayW = (W - M - gridX) / w.days.length;
  let page: PdfPage;
  let y = 0;

  const header = () => {
    page.text(cols.job, y, "Job", { size: 7.5, font: "bold" });
    page.text(cols.name, y, "Activity", { size: 7.5, font: "bold" });
    page.text(cols.dates, y, "Start - finish", { size: 7.5, font: "bold" });
    page.text(cols.pct, y, "Done", { size: 7.5, font: "bold" });
    w.days.forEach((d, i) => {
      if (d === la.today)
        page.rect(gridX + i * dayW, y - 8, dayW, 11, { fill: 0.85, stroke: false });
      if (i % 5 === 0) {
        page.text(gridX + i * dayW + 1, y - 10, `Week of ${d.slice(5)}`, {
          size: 6.5,
          font: "bold",
        });
      }
      page.text(
        gridX + i * dayW + dayW / 2,
        y,
        `${SHORT_DAY[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8)}`,
        {
          size: 6,
          align: "center",
        },
      );
    });
    page.line(M, y + 4, W - M, y + 4, 0.4);
    y += 12;
  };

  const newPage = (first: boolean) => {
    page = pdf.addPage(W, H);
    if (first) {
      page.text(M, 42, `${w.weeks}-week crew lookahead`, { size: 16, font: "bold" });
      page.text(M, 58, fitText(contractor.name, width, 10, "bold"), { size: 10, font: "bold" });
      const named = la.groups.filter((g) => g.crew !== null);
      const split = named.filter((g) => g.daysOnSeveralJobs.length > 0).length;
      const line = [
        `${w.from} to ${w.to}`,
        `${named.length} crew${named.length === 1 ? "" : "s"}`,
        `${la.jobCount} active job${la.jobCount === 1 ? "" : "s"}`,
        split ? `${split} with days on two jobs` : null,
        `as of ${la.today}`,
      ].filter(Boolean);
      page.text(M, 72, `${line.join(", ")}.`, { size: 8.5 });
      y = 100;
    } else {
      page.text(M, 36, "Crew lookahead (continued)", { size: 9, font: "bold" });
      y = 62;
    }
    header();
  };

  newPage(true);
  if (la.groups.length === 0) {
    // biome-ignore lint/style/noNonNullAssertion: newPage just set it
    page!.text(M, y + 4, "Nothing open on any active job in these weeks.", { size: 9 });
  }
  for (const g of la.groups) {
    const names = new Map(g.activities.map((a) => [a.projectId, a.projectName]));
    const split = g.daysOnSeveralJobs.map((d) => dayLabel(d.day)).join(", ");
    if (y + ROW * 2 + (split ? 9 : 0) > FOOTER_TOP - 6) newPage(false);
    // biome-ignore lint/style/noNonNullAssertion: newPage sets it
    let p = page!;
    p.rect(M, y - 4, width, 12, { fill: 0.92, stroke: false });
    const title = `${g.crew ?? "No trade or crew named"} - ${g.activities.length} activit${g.activities.length === 1 ? "y" : "ies"} on ${g.jobCount} job${g.jobCount === 1 ? "" : "s"}`;
    p.text(M + 2, y + 4, fitText(title, width - 4, 8.5, "bold"), { size: 8.5, font: "bold" });
    y += 14;
    if (split) {
      p.text(M + 2, y + 2, fitText(`On two or more jobs: ${split}`, width - 4, 7, "bold"), {
        size: 7,
        font: "bold",
      });
      y += 10;
    }
    for (const a of g.activities) {
      if (y + ROW > FOOTER_TOP - 6) {
        newPage(false);
        // biome-ignore lint/style/noNonNullAssertion: newPage sets it
        p = page!;
        p.text(
          M + 2,
          y + 4,
          fitText(`${g.crew ?? "No trade or crew named"} (continued)`, width, 8, "bold"),
          {
            size: 8,
            font: "bold",
          },
        );
        y += 12;
      }
      const late = a.status === "late_start" || a.status === "late_finish";
      const job = `${names.get(a.projectId) ?? ""}${a.projectNumber ? ` (${a.projectNumber})` : ""}${a.isSample ? " [sample]" : ""}`;
      p.text(cols.job, y + 4, fitText(job, cols.name - cols.job - 6, 8), { size: 8 });
      const label = `${activityLabel(a.number)} ${a.name}${late ? ` - ${ACTIVITY_STATUS_LABELS[a.status]}` : ""}`;
      p.text(
        cols.name,
        y + 4,
        fitText(label, cols.dates - cols.name - 6, 8, late ? "bold" : "regular"),
        {
          size: 8,
          font: late ? "bold" : "regular",
        },
      );
      p.text(cols.dates, y + 4, `${a.startOn.slice(5)} - ${a.finishOn.slice(5)}`, { size: 8 });
      p.text(cols.pct, y + 4, `${a.percentComplete}%`, { size: 8 });
      const first = w.days.findIndex((d) => d >= a.startOn);
      let last = -1;
      for (let i = w.days.length - 1; i >= 0; i--) {
        if ((w.days[i] as string) <= a.barEnd) {
          last = i;
          break;
        }
      }
      if (first !== -1 && last >= first) {
        const x = gridX + first * dayW + 1;
        const bw = (last - first + 1) * dayW - 2;
        p.rect(x, y - 3, bw, 9, { fill: late ? 0.35 : 0.65, stroke: false });
        if (a.percentComplete > 0 && !late) {
          p.rect(x, y - 3, (bw * a.percentComplete) / 100, 9, { fill: 0.25, stroke: false });
        }
      }
      for (let i = 5; i < w.days.length; i += 5) {
        p.line(gridX + i * dayW, y - 6, gridX + i * dayW, y + ROW - 6, 0.3);
      }
      y += ROW;
      p.line(M, y - 6, W - M, y - 6, 0.15);
    }
    y += 6;
  }
  if (la.truncated) {
    if (y + ROW > FOOTER_TOP - 6) newPage(false);
    // biome-ignore lint/style/noNonNullAssertion: newPage sets it
    page!.text(
      M,
      y + 4,
      "More open activities than one lookahead lists: the earliest starts are shown.",
      {
        size: 8,
        font: "bold",
      },
    );
  }

  pdf.pages.forEach((p, i) => {
    const fy = H - 22;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(crewLookaheadNotice(w.holidays), width - 140, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `Crew lookahead - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
