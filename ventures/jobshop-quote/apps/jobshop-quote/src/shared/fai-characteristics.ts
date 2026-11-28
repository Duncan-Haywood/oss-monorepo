// First article characteristics: a draft of the characteristic list AS9102 Form 3 holds, read from
// the text of a customer's drawing (rfq_files.extracted_text), numbered in reading order so the
// numbers can become the balloon numbers.
//
// Why: a shop that wins an aerospace or defense order owes the customer a first article inspection
// report, and the slow part before any measuring is listing every characteristic on the drawing and
// numbering it. The drawing text is already read for the quote; this turns it into the list, so the
// inspector starts from a draft and checks it against the drawing instead of typing from nothing.
//
// It reads, never decides: a draft for a person to check, never a finished Form 3. What a text layer
// cannot show is said, not guessed: dimensions drawn as geometry with no text, basic dimensions in
// boxes, feature control frames drawn as lines, and the drawing zone of each characteristic (text has
// no position), which the inspector fills in. Nothing is judged and no result is invented.
//
// What it finds, one characteristic per item, in the order written:
//   dimension   a nominal with its tolerance: 1.250 ±.005, Ø.500 +.002/-.000, 12.00 +0.1 -0.05 mm,
//               limits 1.005/1.000 or 12.000-12.010 (both sides with the same decimals); a leading
//               "4X" or a trailing "4 PL" repeats it as 4.1 ... 4.4, one row per place
//   gdt         a geometric tolerance named by its word or symbol with a number after it:
//               POSITION ⌀.010 A B C, ⏥ 0.05, FLATNESS .002 (limits 0 to the tolerance)
//   thread      1/4-20 UNC-2B, #10-32 UNF-2A, M6x1.0-6H, 1/8-27 NPT (checked with a gauge)
//   surface     Ra 63, 32 RMS, Ra 0.8 µm (a maximum)
//   note        each numbered line under a NOTES heading ("3. BREAK ALL SHARP EDGES .010 MAX")
//   material    the title block's MATERIAL line, and FINISH / HEAT TREAT / PLATING lines
//               (usually verified by certificate on Form 2; listed so nothing is dropped)
// Not listed: the title block's general tolerance block ("UNLESS OTHERWISE SPECIFIED"), which is
// read instead as the general tolerance and shown in the header, and bare numbers (scale, dates,
// sheet numbers and drawing numbers are bare numbers too).

export type CharacteristicKind = "dimension" | "gdt" | "thread" | "surface" | "note" | "material";

export interface Characteristic {
  /** "1", "2", or "4.1" ... "4.4" for a repeated feature. */
  no: string;
  kind: CharacteristicKind;
  /** The requirement as written on the drawing (trimmed, one line). */
  requirement: string;
  /** Lower and upper limits for a variable characteristic, in the drawing's unit; null otherwise. */
  lower: number | null;
  upper: number | null;
  /** "in" or "mm" for a variable dimension or GD&T tolerance; "µin" / "µm" for a surface finish. */
  unit: string | null;
  /** How to record the result: a measured value, or accept/reject (thread gauge, note, cert). */
  record: "value" | "accept/reject";
  /** 1-based line number in the drawing text, so the inspector can find it. */
  line: number;
}

export interface GeneralTolerance {
  /** "UNLESS OTHERWISE SPECIFIED: .XXX +/- .005" as written. */
  text: string;
}

export interface CharacteristicDraft {
  characteristics: Characteristic[];
  /** The general tolerance lines read from the title block (shown, never applied to a bare number). */
  general: GeneralTolerance[];
  /** True when the list stopped at MAX_CHARACTERISTICS. */
  truncated: boolean;
}

export const MAX_CHARACTERISTICS = 500;
const MAX_REPEAT = 50;
const MAX_TEXT = 200_000;

const NUM = String.raw`(?:\d+(?:[.,]\d+)?|[.,]\d+)`;
const toNum = (s: string) => Number(s.replace(",", ".").replace(/\s/g, ""));
const decimals = (s: string) => /[.,](\d+)/.exec(s)?.[1]?.length ?? 0;
/** Limits rounded to the drawing's precision plus two places, so 1.250 - .005 prints as 1.245. */
const round = (n: number, places: number) => Number(n.toFixed(Math.min(places + 2, 8)));

export const GDT_WORDS = [
  "TRUE POSITION",
  "POSITION",
  "FLATNESS",
  "STRAIGHTNESS",
  "CIRCULARITY",
  "ROUNDNESS",
  "CYLINDRICITY",
  "PERPENDICULARITY",
  "PARALLELISM",
  "ANGULARITY",
  "PROFILE OF A SURFACE",
  "PROFILE OF A LINE",
  "SURFACE PROFILE",
  "LINE PROFILE",
  "TOTAL RUNOUT",
  "CIRCULAR RUNOUT",
  "RUNOUT",
  "CONCENTRICITY",
  "SYMMETRY",
];
/** Position, flatness, straightness, circularity, cylindricity, perpendicularity, parallelism,
 * angularity, surface and line profile, runouts, concentricity, symmetry. */
const GDT_SYMBOLS = "⌖⏥⏤○⌭⊥∥∠⌓⌒↗⌰◎⌯";

function normalise(line: string): string {
  return line
    .replace(/[−‒–—]/g, "-")
    .replace(/\+\s*\/\s*-|\+\s*-(?=\s*[\d.,])|±/g, "±")
    .replace(/\s+/g, " ")
    .trim();
}

function unitFor(text: string, fallback: "in" | "mm"): "in" | "mm" {
  if (/\d\s*mm\b|\bmm\b/i.test(text)) return "mm";
  if (/\d\s*(?:in\b|")|\binch/i.test(text)) return "in";
  return fallback;
}

/** The drawing's default unit: millimetres when it says so and never says inches. */
export function drawingUnit(text: string): "in" | "mm" {
  const mm = /\bmm\b|millimet|\bISO\s*2768|DIMENSIONS?\s+(?:ARE\s+)?IN\s+MM|\bMETRIC\b/i.test(text);
  const inch = /\binch(?:es)?\b|DIMENSIONS?\s+(?:ARE\s+)?IN\s+IN|\d\s*"/i.test(text);
  return mm && !inch ? "mm" : "in";
}

interface Found {
  at: number;
  end: number;
  kind: CharacteristicKind;
  requirement: string;
  lower: number | null;
  upper: number | null;
  unit: string | null;
  record: Characteristic["record"];
  count: number;
}

/** A repeat count just before the match ("4X ", "4 X ") or just after it ("4 PL", "TYP 4X"). */
function repeatCount(
  line: string,
  at: number,
  end: number,
): { count: number; start: number; stop: number } {
  const before = line.slice(0, at);
  const lead = /(\d{1,3})\s*[xX×]\s*$/.exec(before);
  if (lead) {
    return { count: clampCount(lead[1]), start: at - lead[0].length, stop: end };
  }
  const after = line.slice(end);
  const trail = /^\s*(?:TYP\.?\s*)?(\d{1,3})\s*(?:PL|PLS|PLCS|PLACES|X)\b\.?/i.exec(after);
  if (trail) return { count: clampCount(trail[1]), start: at, stop: end + trail[0].length };
  return { count: 1, start: at, stop: end };
}

function clampCount(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_REPEAT) : 1;
}

/** Every characteristic on one (normalised) line, in order. */
function readLine(line: string, fallback: "in" | "mm"): Found[] {
  const found: Found[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
  const add = (f: Omit<Found, "count" | "requirement">, withRepeat: boolean) => {
    if (!free(f.at, f.end)) return;
    const r = withRepeat ? repeatCount(line, f.at, f.end) : { count: 1, start: f.at, stop: f.end };
    taken.push([r.start, r.stop]);
    found.push({
      ...f,
      at: r.start,
      end: r.stop,
      count: r.count,
      requirement: line.slice(r.start, r.stop).trim(),
    });
  };
  const unit = unitFor(line, fallback);

  // Geometric tolerances: the word or symbol, an optional diameter sign, the tolerance, modifiers
  // and up to three datum letters.
  const words = GDT_WORDS.map((w) => w.replace(/ /g, "\\s+")).join("|");
  const gdt = new RegExp(
    String.raw`(?:\b(?:${words})\b|[${GDT_SYMBOLS}])[\s|:]*(?:Ø|⌀|DIA\.?\s*)?(${NUM})(?:\s*(?:mm|in)\b)?(?:\s*(?:Ⓜ|Ⓛ|Ⓢ|\((?:M|L|S)\)|MMC|LMC|RFS))?(?:[\s|]+[A-HJ-NP-Z](?![A-Za-z0-9])){0,3}`,
    "giu",
  );
  for (const m of line.matchAll(gdt)) {
    const at = m.index ?? 0;
    const tol = toNum(m[1] ?? "");
    if (!(tol > 0)) continue;
    add(
      {
        at,
        end: at + m[0].length,
        kind: "gdt",
        lower: 0,
        upper: round(tol, decimals(m[1] ?? "")),
        unit,
        record: "value",
      },
      true,
    );
  }

  // Threads (before dimensions, so "1/4-20" is not read as a limit dimension).
  const thread =
    /(?:\b\d+\/\d+|#\d{1,2}|\b\d(?:\.\d+)?)\s*-\s*\d{1,3}\s*(?:UNC|UNF|UNEF|UNS|UN|NPTF?|NPSM?)(?:\s*-\s*[1-3][AB])?\b|\bM\d{1,2}(?:[.,]\d+)?\s*[xX×]\s*\d(?:[.,]\d+)?(?:\s*-\s*\d[gGhHe]{1,2}(?:\d[gGhH])?)?(?![\d.])|\bM\d{1,2}(?:\s*-\s*\d[gGhH])(?![\d.])/g;
  for (const m of line.matchAll(thread)) {
    const at = m.index ?? 0;
    const tail = /^\s*(?:THRU|THD|THREAD)?(?:\s*[xX]\s*\.?\d+(?:\.\d+)?\s*(?:DP|DEEP)\.?)?/i.exec(
      line.slice(at + m[0].length),
    );
    const end = at + m[0].length + (tail?.[0].length ?? 0);
    add(
      { at, end, kind: "thread", lower: null, upper: null, unit: null, record: "accept/reject" },
      true,
    );
  }

  // Surface finish.
  const surface = new RegExp(
    String.raw`\b(?:Ra|RMS|AA)\s*(${NUM})(?:\s*(µm|μm|um|µin|μin|uin))?(?:\s*MAX)?\b|\b(${NUM})\s*(?:(µm|μm|um|µin|μin|uin)\s*)?(?:Ra|RMS)\b(?:\s*MAX)?`,
    "giu",
  );
  for (const m of line.matchAll(surface)) {
    const at = m.index ?? 0;
    const raw = m[1] ?? m[3] ?? "";
    const u = (m[2] ?? m[4] ?? "").toLowerCase();
    const sUnit = /m$/.test(u) ? "µm" : u ? "µin" : unit === "mm" ? "µm" : "µin";
    const v = toNum(raw);
    if (!(v > 0)) continue;
    add(
      {
        at,
        end: at + m[0].length,
        kind: "surface",
        lower: null,
        upper: v,
        unit: sUnit,
        record: "value",
      },
      false,
    );
  }

  // Dimensions with a tolerance. A feature prefix (Ø, R, SR, DIA) stays in the requirement.
  const prefix = String.raw`(?:(?:Ø|⌀|SØ|SR|CR|R)\s*)?`;
  const suffix = String.raw`(?:\s*(?:mm|in\b|"|°))?`;
  const bilateral = new RegExp(
    String.raw`${prefix}(${NUM})${suffix}\s*±\s*(${NUM})${suffix}`,
    "giu",
  );
  for (const m of line.matchAll(bilateral)) {
    const at = m.index ?? 0;
    const n = toNum(m[1] ?? "");
    const d = toNum(m[2] ?? "");
    if (!(d > 0) || !Number.isFinite(n)) continue;
    const places = Math.max(decimals(m[1] ?? ""), decimals(m[2] ?? ""));
    const angle = /°/.test(m[0]);
    add(
      {
        at,
        end: at + m[0].length,
        kind: "dimension",
        lower: round(n - d, places),
        upper: round(n + d, places),
        unit: angle ? "°" : unit,
        record: "value",
      },
      true,
    );
  }
  const unequal = new RegExp(
    String.raw`${prefix}(${NUM})${suffix}\s*([+-])\s*(${NUM})${suffix}\s*/?\s*([+-])\s*(${NUM})${suffix}`,
    "giu",
  );
  for (const m of line.matchAll(unequal)) {
    const at = m.index ?? 0;
    const [, rn, s1, r1, s2, r2] = m;
    if (!rn || !r1 || !r2 || s1 === s2) continue;
    const n = toNum(rn);
    const a = toNum(r1) * (s1 === "-" ? -1 : 1);
    const b = toNum(r2) * (s2 === "-" ? -1 : 1);
    const places = Math.max(decimals(rn), decimals(r1), decimals(r2));
    const angle = /°/.test(m[0]);
    add(
      {
        at,
        end: at + m[0].length,
        kind: "dimension",
        lower: round(n + Math.min(a, b), places),
        upper: round(n + Math.max(a, b), places),
        unit: angle ? "°" : unit,
        record: "value",
      },
      true,
    );
  }
  // Limit dimensions: two values with the same decimals (at least two), close together, so a date,
  // a part number or a thread is not read as limits.
  const limits = new RegExp(
    String.raw`${prefix}(\d*[.,]\d{2,})\s*(?:/|-|\bTO\b)\s*(\d*[.,]\d{2,})(?![\d/])`,
    "giu",
  );
  for (const m of line.matchAll(limits)) {
    const at = m.index ?? 0;
    const [, ra, rb] = m;
    if (!ra || !rb || decimals(ra) !== decimals(rb)) continue;
    const a = toNum(ra);
    const b = toNum(rb);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (!(hi > lo) || hi - lo > Math.max(hi * 0.05, 0.1)) continue;
    add(
      { at, end: at + m[0].length, kind: "dimension", lower: lo, upper: hi, unit, record: "value" },
      true,
    );
  }

  found.sort((x, y) => x.at - y.at);
  return found;
}

const GENERAL =
  /UNLESS\s+OTHERWISE|TOLERANCES?\s*:|\bTOL(?:ERANCE)?S?\b.*\.X{1,4}\b|\.X{1,4}\s*±|ANGLES?\s*±|ISO\s*2768/i;
const NOTES_HEAD = /^\s*(?:GENERAL\s+)?NOTES?\s*:?\s*$|^\s*NOTES?\s*:/i;
const NOTE_ITEM = /^\s*(?:NOTE\s*)?(\d{1,2})\s*[.)]\s+(\S.*)$/i;
const MATERIAL =
  /^\s*(?:MAT(?:ERIA)?L|MATERIAL|FINISH|HEAT\s*TREAT(?:MENT)?|PLATING|PLATE|COATING|PAINT|PASSIVATE|ANODIZE)\b\s*[:-]\s*(\S.*)$/i;

/** Drafts the Form 3 characteristic list from a drawing's text. */
export function draftCharacteristics(text: string | null | undefined): CharacteristicDraft {
  const src = (text ?? "").slice(0, MAX_TEXT);
  const fallback = drawingUnit(src);
  const lines = src.split(/\r?\n/);
  const rows: Characteristic[] = [];
  const general: GeneralTolerance[] = [];
  let next = 1;
  let inNotes = false;
  let truncated = false;

  const push = (f: Omit<Characteristic, "no">, count: number) => {
    const base = next++;
    const n = Math.max(1, count);
    for (let i = 1; i <= n; i++) {
      if (rows.length >= MAX_CHARACTERISTICS) {
        truncated = true;
        return;
      }
      rows.push({ ...f, no: n === 1 ? String(base) : `${base}.${i}` });
    }
  };

  for (let i = 0; i < lines.length && !truncated; i++) {
    const raw = lines[i] ?? "";
    const line = normalise(raw.replace(/^[#>*\-|\s]+(?=\S)/, (s) => (/\d/.test(s) ? s : "")));
    if (!line) {
      continue;
    }
    const lineNo = i + 1;

    if (GENERAL.test(line)) {
      general.push({ text: line });
      continue;
    }
    if (NOTES_HEAD.test(line)) {
      inNotes = true;
      const rest = line.replace(/^\s*(?:GENERAL\s+)?NOTES?\s*:?\s*/i, "");
      if (!rest) continue;
    }

    const note = inNotes ? NOTE_ITEM.exec(line) : null;
    if (note) {
      // The note is one characteristic; a tolerance inside it ("BREAK EDGES .010 MAX") is checked
      // as part of it, so the note is not split into more rows.
      push(
        {
          kind: "note",
          requirement: `Note ${note[1]}: ${note[2]}`,
          lower: null,
          upper: null,
          unit: null,
          record: "accept/reject",
          line: lineNo,
        },
        1,
      );
      continue;
    }
    // A note block ends at a line that is not a numbered item and does not continue one.
    if (inNotes && !/^\s{2,}\S/.test(raw) && !NOTES_HEAD.test(line)) inNotes = false;

    const mat = MATERIAL.exec(line);
    if (mat) {
      push(
        {
          kind: "material",
          requirement: line,
          lower: null,
          upper: null,
          unit: null,
          record: "accept/reject",
          line: lineNo,
        },
        1,
      );
      continue;
    }

    for (const f of readLine(line, fallback)) {
      push(
        {
          kind: f.kind,
          requirement: f.requirement,
          lower: f.lower,
          upper: f.upper,
          unit: f.unit,
          record: f.record,
          line: lineNo,
        },
        f.count,
      );
      if (truncated) break;
    }
  }
  return { characteristics: rows, general, truncated };
}

export const KIND_LABEL: Record<CharacteristicKind, string> = {
  dimension: "Dimension",
  gdt: "Geometric tolerance",
  thread: "Thread",
  surface: "Surface finish",
  note: "Drawing note",
  material: "Material / process",
};

function cell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  // Quote every cell that needs it, and defuse spreadsheet formulas (=, +, -, @ at the start).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The CSV columns: Form 3's characteristic columns, then what this draft adds. */
export const FORM3_COLUMNS = [
  "Char. No.",
  "Reference Location",
  "Characteristic Designator",
  "Requirement",
  "Results",
  "Designed / Qualified Tooling",
  "Nonconformance Number",
  "Type",
  "Lower Limit",
  "Upper Limit",
  "Unit",
  "Record As",
  "Drawing Text Line",
] as const;

export interface Form3Header {
  fileName: string;
  partNumber?: string | null;
  revision?: string | null;
}

/**
 * The draft as CSV: a few header rows (part, source, general tolerance, the draft warning), a blank
 * row, then one row per characteristic. Reference Location, Characteristic Designator, Results,
 * tooling and nonconformance are left blank for the inspector: the text cannot say them.
 */
export function form3Csv(draft: CharacteristicDraft, header: Form3Header): string {
  const out: string[] = [];
  const row = (cells: (string | number | null)[]) => out.push(cells.map(cell).join(","));
  row(["AS9102 Form 3 draft: characteristic accountability"]);
  row(["Part Number", header.partNumber ?? ""]);
  row(["Revision", header.revision ?? ""]);
  row(["Read from", header.fileName]);
  for (const g of draft.general) row(["General tolerance", g.text]);
  row([
    "Draft",
    "Listed from the drawing's text by Job Shop Quote. Check every row against the drawing: dimensions drawn without text, basic dimensions and frames drawn as lines are not in the text. Add the drawing zone, any key characteristic designator, the results and the tooling.",
  ]);
  if (draft.truncated)
    row(["Truncated", `Only the first ${MAX_CHARACTERISTICS} characteristics are listed.`]);
  out.push("");
  row([...FORM3_COLUMNS]);
  for (const c of draft.characteristics) {
    row([
      c.no,
      "",
      "",
      c.requirement,
      "",
      "",
      "",
      KIND_LABEL[c.kind],
      c.lower,
      c.upper,
      c.unit,
      c.record,
      c.line,
    ]);
  }
  return `${out.join("\r\n")}\r\n`;
}
