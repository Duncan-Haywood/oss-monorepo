// Reads the reviewer's action and date off a returned submittal (docs/SUBMITTALS.md, "Reading the
// stamp"): the stamped copy the GC or architect sends back is a PDF whose stamp is either markup laid
// over the page (a Bluebeam or Acrobat stamp annotation) or text printed into the page. This file
// gets that text from `@shared/pdf/text` and decides, with fixed rules and no model:
//
// - Which action: a stamp line names one of the reviewer phrases below ("NO EXCEPTIONS TAKEN",
//   "MAKE CORRECTIONS NOTED", "REVISE AND RESUBMIT", ...). A phrase counts only where it stands as a
//   stamp entry: at the start of a line or after a check box, and followed by the end of the line, a
//   box or punctuation, so "use an approved equal" in a product data sheet is not read as a stamp.
// - Which box is ticked: a stamp that prints every choice marks one with a tick, an X or a filled
//   box. When the marks are text (☒, ✔, [X]) the marked choice is the action. When they are drawn
//   lines (no text to read) and the stamp lists more than one choice, the reading says so and
//   proposes nothing.
// - Which date: a date printed in the stamp ("DATE: 11/20/2026"), preferring one labelled DATE;
//   otherwise the date the PDF records for when the stamp annotation was placed (/M), said as such.
//
// The result is a proposal shown with the words it came from; the user saves it. Two stamps that
// disagree (the GC's and the architect's), a date before the submittal went out or after today, and
// a scan with no text layer are all reported, never resolved by guessing.
import { extractText, type PdfText, type TextRun } from "@shared/pdf/text";
import { SUBMITTAL_ACTION_LABELS, type SubmittalAction } from "./submittals";

/**
 * Reviewer phrases and the action each one means in the log. Spellings from the stamps in common
 * use: AIA-style architects' stamps ("NO EXCEPTIONS TAKEN", "MAKE CORRECTIONS NOTED", "REVISE AND
 * RESUBMIT", "REJECTED", "SUBMIT SPECIFIED ITEM"), engineers' ("FURNISH AS CORRECTED", "AMEND AND
 * RESUBMIT") and the Bluebeam and Acrobat stock stamps ("APPROVED", "APPROVED AS NOTED", "NOT
 * APPROVED", "FOR RECORD ONLY"). "Approved as noted, resubmit" needs a new revision, so it is a
 * resubmittal here (`RESUBMIT_ACTIONS` in ./submittals).
 */
export const STAMP_PHRASES: readonly (readonly [string, SubmittalAction])[] = [
  ["APPROVED AS NOTED AND RESUBMIT", "revise_resubmit"],
  ["APPROVED AS NOTED RESUBMIT", "revise_resubmit"],
  ["APPROVED AS CORRECTED", "approved_as_noted"],
  ["APPROVED AS NOTED", "approved_as_noted"],
  ["APPROVED WITH COMMENTS", "approved_as_noted"],
  ["MAKE CORRECTIONS NOTED", "approved_as_noted"],
  ["FURNISH AS CORRECTED", "approved_as_noted"],
  ["EXCEPTIONS NOTED", "approved_as_noted"],
  ["REVIEWED AS NOTED", "approved_as_noted"],
  ["NO EXCEPTIONS TAKEN", "approved"],
  ["NO EXCEPTION TAKEN", "approved"],
  ["NOT APPROVED", "rejected"],
  ["DISAPPROVED", "rejected"],
  ["REJECTED", "rejected"],
  ["SUBMIT SPECIFIED ITEM", "rejected"],
  ["NOT ACCEPTED", "rejected"],
  ["APPROVED", "approved"],
  ["ACCEPTED", "approved"],
  ["REVISE AND RESUBMIT", "revise_resubmit"],
  ["AMEND AND RESUBMIT", "revise_resubmit"],
  ["REVISE RESUBMIT", "revise_resubmit"],
  ["REVISE AND RE SUBMIT", "revise_resubmit"],
  ["RETURNED FOR CORRECTIONS", "revise_resubmit"],
  ["RETURNED FOR CORRECTION", "revise_resubmit"],
  ["RESUBMIT", "revise_resubmit"],
  ["RECEIVED FOR RECORD", "for_record"],
  ["FOR RECORD ONLY", "for_record"],
  ["RECEIVED FOR INFORMATION", "for_record"],
  ["FOR INFORMATION ONLY", "for_record"],
];

/** A tick, an X or a filled box: the choice it sits against is the one picked. */
const MARK = "[✓✔✗✘☒☑■▪●◼⊠⊗]";
/** A letter X typed as the tick: only on its own, so the X ending "TAX" is not one. */
const LETTER_MARK = "(?:^|(?<=\\s))[Xx]";
/** An empty box: the choice it sits against is not picked. */
const BOX = "[☐□○◯▢❏❑]";

/** Words between phrase words may be split by a space, a hyphen, a slash or a comma; AND may be &. */
const phrasePattern = (p: string) =>
  p
    .split(" ")
    .map((w) => (w === "AND" ? "(?:AND|&)" : w))
    .join("(?:\\s*[-–/,]\\s*|\\s+)");

const PHRASES = new RegExp(
  `(?<![A-Z])(${[...STAMP_PHRASES]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([p]) => phrasePattern(p))
    .join("|")})(?![A-Z])`,
  "gi",
);

const BEFORE_MARKED = new RegExp(
  `(?:${MARK}|${LETTER_MARK}|\\[\\s*[Xx✓✔]\\s*\\]|\\(\\s*[Xx✓✔]\\s*\\))\\s*[-:.]?\\s*$`,
);
const BEFORE_EMPTY = new RegExp(`(?:${BOX}|\\[\\s*\\]|\\(\\s*\\)|_{2,})\\s*$`);
/** What may follow a stamp entry: the end, another box, a wide gap, or a remark after a dash. */
const AFTER_ENTRY = `\\s*$|\\s*${BOX}|\\s*${MARK}|\\s+[Xx]\\s|\\s+\\[|\\s{2,}|\\s*[-–]\\s`;
const AFTER_PAGE = new RegExp(`^(?:${AFTER_ENTRY})`);
/** In a stamp annotation, which is nothing but the stamp, punctuation may follow too. */
const AFTER_STAMP = new RegExp(`^(?:${AFTER_ENTRY}|\\s*[-–:,.;(!)\\]])`);

export interface StampHit {
  action: SubmittalAction;
  /** The words as printed. */
  phrase: string;
  page: number;
  /** "stamp": an annotation laid over the page; "page": text printed into it. */
  from: "stamp" | "page";
  mark: "marked" | "empty" | "none";
}

export interface StampDate {
  date: string;
  /** The words it came from, or "when the stamp was placed" for an annotation's /M. */
  text: string;
  page: number;
  labelled: boolean;
  /** From the annotation's record (/M), not from words on the stamp. */
  placed: boolean;
}

export interface StampReading {
  /** The action to fill in, when the file says one thing; null otherwise (see `problem`). */
  action: SubmittalAction | null;
  /** The returned date to fill in, when the stamp shows one date that fits; null otherwise. */
  returnedOn: string | null;
  /** Every reviewer phrase found, for the user to check against the file. */
  hits: StampHit[];
  /** The date `returnedOn` came from, when it came from somewhere. */
  dateSource: StampDate | null;
  /** Why no action (or no date) was filled in, in a sentence for the user; null when both were. */
  problem: string | null;
}

interface Block {
  page: number;
  from: "stamp" | "page";
  lines: { y: number; text: string }[];
  placed: string | null;
}

/** Text runs on one baseline, left to right, as lines of text (top to bottom). */
export function linesOf(runs: readonly TextRun[]): { y: number; text: string }[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: { y: number; size: number; runs: TextRun[] }[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.y - last.y) <= Math.max(1, Math.min(r.size, last.size) * 0.4))
      last.runs.push(r);
    else lines.push({ y: r.y, size: r.size, runs: [r] });
  }
  return lines.map((l) => {
    const rs = l.runs.sort((a, b) => a.x0 - b.x0);
    let text = "";
    let end = Number.NEGATIVE_INFINITY;
    for (const r of rs) {
      const gap = r.x0 - end;
      // A gap wider than about two spaces separates two entries ("☒ APPROVED    ☐ REJECTED").
      if (text) text += gap > l.size * 1.2 ? "   " : gap > l.size * 0.15 ? " " : "";
      text += r.text;
      end = r.x1;
    }
    return { y: l.y, text: text.replace(/\s+$/, "") };
  });
}

function blocksOf(text: PdfText): Block[] {
  const out: Block[] = [];
  for (const p of text.pages) {
    for (const a of p.annotations ?? []) {
      const lines = linesOf(a.runs);
      // A stamp with no appearance text (or a text box) still has /Contents.
      if (!lines.length && a.contents)
        a.contents.split(/[\r\n]+/).forEach((t, i) => {
          lines.push({ y: i, text: t });
        });
      out.push({ page: p.page, from: "stamp", lines, placed: a.modified });
    }
    out.push({ page: p.page, from: "page", lines: linesOf(p.runs), placed: null });
  }
  return out;
}

const ACTION_OF = new Map(STAMP_PHRASES.map(([p, a]) => [p, a]));
const canonical = (s: string) =>
  s
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[-–/,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The reviewer phrases a line shows as stamp entries. */
export function hitsInLine(
  line: string,
  from: "stamp" | "page" = "page",
): { phrase: string; action: SubmittalAction; mark: StampHit["mark"]; at: number }[] {
  const out: { phrase: string; action: SubmittalAction; mark: StampHit["mark"]; at: number }[] = [];
  const afterOk = from === "stamp" ? AFTER_STAMP : AFTER_PAGE;
  for (const m of line.matchAll(PHRASES)) {
    const at = m.index ?? 0;
    // Only what sits just before and after the phrase matters; the cap keeps a long line cheap.
    const before = line.slice(Math.max(0, at - 40), at);
    const after = line.slice(at + m[0].length, at + m[0].length + 40);
    const marked = BEFORE_MARKED.test(before);
    const empty = !marked && BEFORE_EMPTY.test(before);
    // An entry starts the line (after any box), or follows a box or a wide gap.
    const starts = marked || empty || /^\s*[-•*]?\s*$/.test(before) || /\s{3,}$/.test(before);
    if (!starts || !afterOk.test(after)) continue;
    const action = ACTION_OF.get(canonical(m[0]));
    if (!action) continue;
    out.push({
      phrase: line.slice(at, at + m[0].length),
      action,
      mark: marked ? "marked" : empty ? "empty" : "none",
      at,
    });
  }
  return out;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
};

/**
 * The dates written in a line, as YYYY-MM-DD. US order for numeric dates (M/D/Y, as US stamps print
 * them), ISO dates, and dates with the month spelled out ("Nov 20, 2026", "20 November 2026").
 */
export function datesInLine(line: string): string[] {
  const out: string[] = [];
  const u = line.toUpperCase();
  for (const m of u.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) {
    const d = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) out.push(d);
  }
  for (const m of u.matchAll(/(?<![\d-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d-])/g)) {
    const d = iso(Number(m[3]), Number(m[1]), Number(m[2]));
    if (d) out.push(d);
  }
  const mon = "(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\\.?";
  for (const m of u.matchAll(
    new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:ST|ND|RD|TH)?,?\\s+(\\d{4})\\b`, "g"),
  )) {
    const d = iso(Number(m[3]), MONTHS.indexOf(m[1] as string) + 1, Number(m[2]));
    if (d) out.push(d);
  }
  for (const m of u.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${mon},?\\s+(\\d{4})\\b`, "g"))) {
    const d = iso(Number(m[3]), MONTHS.indexOf(m[2] as string) + 1, Number(m[1]));
    if (d) out.push(d);
  }
  return out;
}

/** How far from a stamp line printed into the page a date may sit and still be the stamp's, in points. */
export const STAMP_REACH = 120;

export interface ReadStampOptions {
  /** The user's local date (YYYY-MM-DD): a stamp date after it is a misread. */
  today: string;
  /** When the submittal went out: a stamp date before it is not this review's. */
  submittedOn?: string | null;
}

const label = (a: SubmittalAction) => SUBMITTAL_ACTION_LABELS[a].toLowerCase();

/** Reads the action and date from extracted PDF text (see the top of this file). */
export function readStampText(text: PdfText, opts: ReadStampOptions): StampReading {
  const hits: StampHit[] = [];
  const chosen: { hit: StampHit; block: Block; y: number }[] = [];
  let ambiguousBlock: StampHit[] | null = null;

  for (const block of blocksOf(text)) {
    const found: { hit: StampHit; y: number }[] = [];
    for (const line of block.lines)
      for (const h of hitsInLine(line.text, block.from))
        found.push({
          hit: {
            action: h.action,
            phrase: h.phrase.trim(),
            page: block.page,
            from: block.from,
            mark: h.mark,
          },
          y: line.y,
        });
    if (!found.length) continue;
    hits.push(...found.map((f) => f.hit));
    const marked = found.filter((f) => f.hit.mark === "marked");
    const unboxed = found.filter((f) => f.hit.mark === "none");
    // A ticked box picks; otherwise a block that names one action (any number of times) says it;
    // a block that lists several with nothing ticked as text cannot be read.
    const picks = marked.length ? marked : unboxed.length ? unboxed : found;
    const actions = new Set(picks.map((f) => f.hit.action));
    if (actions.size === 1) {
      const first = picks[0] as (typeof picks)[number];
      chosen.push({ hit: first.hit, block, y: first.y });
    } else if (!ambiguousBlock) ambiguousBlock = picks.map((f) => f.hit);
  }

  const none = (problem: string): StampReading => ({
    action: null,
    returnedOn: null,
    hits,
    dateSource: null,
    problem,
  });
  const actions = [...new Set(chosen.map((c) => c.hit.action))];
  if (!hits.length) {
    if (text.chars === 0)
      return none(
        "This PDF has no text to read: it looks like a scan. Read the stamp on the copy and set the action yourself.",
      );
    return none(
      'No reviewer\'s stamp wording (such as "No exceptions taken" or "Revise and resubmit") was found in this PDF.',
    );
  }
  if (actions.length > 1)
    return none(
      `The file has stamps that disagree (${actions.map(label).join(", ")}), perhaps the GC's and the architect's. Pick the one that governs.`,
    );
  if (!actions.length) {
    const listed = [...new Set((ambiguousBlock ?? hits).map((h) => h.action))].map(label);
    return none(
      `The stamp lists ${listed.join(", ")}, and which box is ticked is drawn rather than written, so PayApps cannot tell. Set the action yourself.`,
    );
  }
  const action = actions[0] as SubmittalAction;

  // The date: in the chosen stamps' own lines (a whole annotation; near the line on the page).
  const dates: StampDate[] = [];
  for (const c of chosen) {
    for (const line of c.block.lines) {
      if (c.block.from === "page" && Math.abs(line.y - c.y) > STAMP_REACH) continue;
      for (const d of datesInLine(line.text))
        dates.push({
          date: d,
          text: line.text.trim(),
          page: c.block.page,
          labelled: /\bDATE[D]?\b/i.test(line.text),
          placed: false,
        });
    }
  }
  const fits = (d: string) => d <= opts.today && (!opts.submittedOn || d >= opts.submittedOn);
  const fitting = dates.filter((d) => fits(d.date));
  const labelled = fitting.filter((d) => d.labelled);
  const pool = labelled.length ? labelled : fitting;
  const distinct = [...new Set(pool.map((d) => d.date))];
  let dateSource: StampDate | null = distinct.length === 1 ? (pool[0] as StampDate) : null;
  let problem: string | null = null;
  if (!dateSource && distinct.length > 1)
    problem = `The stamp shows more than one date (${distinct.join(", ")}). Set the returned date yourself.`;
  if (!dateSource && !distinct.length) {
    const placed = chosen
      .map((c) => ({ date: c.block.placed, page: c.block.page }))
      .filter((p): p is { date: string; page: number } => p.date !== null && fits(p.date));
    const placedDates = [...new Set(placed.map((p) => p.date))];
    if (placedDates.length === 1) {
      const p = placed[0] as { date: string; page: number };
      dateSource = {
        date: p.date,
        text: "when the stamp was placed, as the PDF records it",
        page: p.page,
        labelled: false,
        placed: true,
      };
    } else if (dates.length)
      problem = `The stamp's date (${[...new Set(dates.map((d) => d.date))].join(", ")}) is ${
        opts.submittedOn ? "before the submittal went out or " : ""
      }after today, so it was left out. Check the returned date.`;
    else problem = "The stamp shows no date. Set the returned date yourself.";
  }
  return { action, returnedOn: dateSource?.date ?? null, hits, dateSource, problem };
}

/** Reads the stamp from a PDF file's bytes. Throws PdfUnreadable for a file that is not a readable PDF. */
export async function readStamp(bytes: Uint8Array, opts: ReadStampOptions): Promise<StampReading> {
  return readStampText(await extractText(bytes, { annotations: true }), opts);
}
