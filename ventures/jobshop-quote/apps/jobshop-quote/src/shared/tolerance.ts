// Tolerance reader: finds the tolerances written in a part's "Tolerances" text (as extracted from the
// RFQ email or drawing, or typed by the estimator) and says how tight the tightest one is, so the
// estimator checks the run time, the process and the gauging before pricing the line.
//
// It reads, never prices: nothing here changes a cost (docs/ARCHITECTURE.md, "No invented prices").
// The tolerance zone (the full width a dimension may vary) is the measure throughout: ±0.001 in is a
// 0.002 in zone, +.002/-.000 is a 0.002 in zone too.
//
// Read forms:
//   bilateral   ±.005, +/- 0.005, +- .01", ± 0,02 mm, ±5 µm            zone = 2 × value
//   unequal     +.002/-.000, +0.1/-0.05 mm, -0.000 +0.002              zone = upper + lower
//   general     ISO 2768-f / -m / -c / -v (with or without the K/H/L geometry class): the class's
//               linear value for a 6-30 mm feature (ISO 2768-1, table 1), since the size is unknown
//   fits        H7, g6, H7/g6, js6 (ISO 286): the IT grade's zone at the feature's nominal size when
//               the callout gives it (Ø20 H7, 50g6, DIA 8 H7: millimetres, ISO 286-1 table 1 to
//               500 mm), else for an 18-30 mm feature
//   limits      .4995/.5000, 12.000-12.010, 1.250 TO 1.255: two sizes with the same decimals (at
//               least two), close together (zone = the difference)
// Angles (±0.5°, ±1 deg) are skipped. A number with no unit takes the text's unit: millimetres when
// the text says "mm" (or "µm") and never "in" or ", inches otherwise (the shop's own default).

export type ToleranceBand = "standard" | "close" | "tight" | "precision";

export type ToleranceKind = "bilateral" | "unequal" | "general" | "fit" | "limits";

export interface ToleranceRead {
  /** The text as written in the field, trimmed. */
  text: string;
  kind: ToleranceKind;
  /** Full tolerance zone, inches (rounded to 0.1 µin so ±0.0005 is exactly 0.001). */
  zoneIn: number;
  /** True when the zone is the typical value for an assumed size (general classes and fits). */
  sizeAssumed: boolean;
  band: ToleranceBand;
  /** Fits: the nominal size read from the callout, mm ("Ø20 H7" is 20); null when assumed. */
  sizeMm?: number | null;
  /** Fits: the ISO 286 grade (7 for H7). */
  grade?: number;
}

export interface ToleranceSummary {
  reads: ToleranceRead[];
  /** The read with the smallest zone; null when nothing was read. */
  tightest: ToleranceRead | null;
}

export const MM_PER_IN = 25.4;

/**
 * Zone limits in inches, smallest first. Shop-floor rules of thumb, not a standard:
 * ±0.005 in and looser is standard machining; ±0.001 up to ±0.005 is close; ±0.0005 up to ±0.001
 * is tight; tighter than ±0.0005 is precision (often grinding, honing or a CMM check).
 */
export const BAND_LIMITS_IN: { band: ToleranceBand; belowIn: number }[] = [
  { band: "precision", belowIn: 0.001 },
  { band: "tight", belowIn: 0.002 },
  { band: "close", belowIn: 0.01 },
];

export const BAND_LABEL: Record<ToleranceBand, string> = {
  standard: "Standard",
  close: "Close",
  tight: "Tight",
  precision: "Precision",
};

export const BAND_ADVICE: Record<ToleranceBand, string> = {
  standard: "Standard machining tolerance.",
  close: "Holdable on most CNC mills and lathes; check the setup and the gauges the feature needs.",
  tight:
    "Usually means finish passes, a slower cycle and in-process gauging; check the run time on this line.",
  precision:
    "Often means grinding, honing, a temperature-stable check or a CMM; confirm the shop can hold and measure it before quoting.",
};

/** ISO 2768-1 table 1, linear dimensions over 6 up to 30 mm: the class's ± value, mm. */
const ISO2768_6_30_MM: Record<string, number> = { f: 0.1, m: 0.2, c: 0.5, v: 1 };

/**
 * ISO 286-1 table 1, standard tolerance grades IT5 to IT11: the zone in µm for each nominal size
 * range, "over" the previous limit "up to and including" this one (the first range is up to 3 mm).
 */
export const IT_SIZE_LIMITS_MM = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500] as const;
export const IT_GRADES_UM: Record<number, readonly number[]> = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
};
/** The 18-30 mm column, used when the callout gives no size. */
const ASSUMED_RANGE = 4;

/** "18-30 mm": the ISO 286 size range a nominal size falls in. */
export function itRangeLabel(sizeMm: number): string | null {
  const i = IT_SIZE_LIMITS_MM.findIndex((hi) => sizeMm <= hi);
  if (i < 0 || !(sizeMm > 0)) return null;
  return `${i === 0 ? 0 : IT_SIZE_LIMITS_MM[i - 1]}-${IT_SIZE_LIMITS_MM[i]} mm`;
}

/** The IT grade's zone in µm at a nominal size (null: no size, the 18-30 mm value), or null. */
export function itZoneUm(grade: number, sizeMm: number | null): number | null {
  const row = IT_GRADES_UM[grade];
  if (!row) return null;
  if (sizeMm == null) return row[ASSUMED_RANGE] ?? null;
  const i = IT_SIZE_LIMITS_MM.findIndex((hi) => sizeMm <= hi);
  return i < 0 || !(sizeMm > 0) ? null : (row[i] ?? null);
}

export function bandFor(zoneIn: number): ToleranceBand {
  for (const { band, belowIn } of BAND_LIMITS_IN) {
    if (zoneIn < belowIn) return band;
  }
  return "standard";
}

function roundZone(zoneIn: number): number {
  return Math.round(zoneIn * 1e7) / 1e7;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?|[.,]\d+)`;
const UNIT = String.raw`\s*(mm|µm|μm|um|in\b|inch(?:es)?\b|"|°|deg\b)?`;

type Unit = "in" | "mm" | "um" | "angle";

function decimalsOf(raw: string): number {
  const i = raw.search(/[.,]/);
  return i < 0 ? 0 : raw.length - i - 1;
}

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function unitOf(raw: string | undefined, fallback: "in" | "mm"): Unit {
  if (!raw) return fallback;
  const u = raw.toLowerCase();
  if (u === "°" || u === "deg") return "angle";
  if (u === "mm") return "mm";
  if (u === "µm" || u === "μm" || u === "um") return "um";
  return "in";
}

function toInches(value: number, unit: Exclude<Unit, "angle">): number {
  if (unit === "mm") return value / MM_PER_IN;
  if (unit === "um") return value / 1000 / MM_PER_IN;
  return value;
}

function defaultUnit(text: string): "in" | "mm" {
  const saysMm = /\d\s*(mm|µm|μm|um)\b|\bmm\b|\bmillimet/i.test(text);
  const saysIn = /\d\s*(in\b|inch|")|\binch/i.test(text);
  return saysMm && !saysIn ? "mm" : "in";
}

function read(
  text: string,
  kind: ToleranceKind,
  zoneIn: number,
  sizeAssumed: boolean,
): ToleranceRead {
  const zone = roundZone(zoneIn);
  return { text: text.trim(), kind, zoneIn: zone, sizeAssumed, band: bandFor(zone) };
}

/** Reads every tolerance in the text, in the order written. */
export function readTolerances(text: string | null | undefined): ToleranceSummary {
  const src = (text ?? "").slice(0, 2_000);
  const fallback = defaultUnit(src);
  const found: { at: number; read: ToleranceRead }[] = [];
  // Spans already read, so "+.002/-.000" is not read again as a bilateral "-.000".
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);

  // Unequal limits: +a/-b or -b/+a (the slash optional, units on either value).
  const unequal = new RegExp(
    String.raw`([+-])\s*${NUM}${UNIT}\s*/?\s*([+-])\s*${NUM}${UNIT}`,
    "giu",
  );
  for (const m of src.matchAll(unequal)) {
    const [whole, s1, n1, u1, s2, n2, u2] = m;
    if (s1 === s2) continue;
    const at = m.index ?? 0;
    // "+/-" or "+-" followed by a number is bilateral, not "+<nothing>/-n".
    if (!n1 || !n2) continue;
    const unitA = unitOf(u1 ?? u2, fallback);
    const unitB = unitOf(u2 ?? u1, fallback);
    if (unitA === "angle" || unitB === "angle") continue;
    const zone = toInches(toNumber(n1), unitA) + toInches(toNumber(n2), unitB);
    if (!(zone > 0)) continue;
    taken.push([at, at + whole.length]);
    found.push({ at, read: read(whole, "unequal", zone, false) });
  }

  const bilateral = new RegExp(
    String.raw`(?:±|\+\s*/\s*-|\+\s*-(?=\s*[\d.,]))\s*${NUM}${UNIT}`,
    "giu",
  );
  for (const m of src.matchAll(bilateral)) {
    const [whole, n, u] = m;
    const at = m.index ?? 0;
    if (!n || !free(at, at + whole.length)) continue;
    const unit = unitOf(u, fallback);
    if (unit === "angle") continue;
    const zone = 2 * toInches(toNumber(n), unit);
    if (!(zone > 0)) continue;
    taken.push([at, at + whole.length]);
    found.push({ at, read: read(whole, "bilateral", zone, false) });
  }

  for (const m of src.matchAll(/ISO\s*2768\s*[-–]?\s*([fmcv])(?:[KHL])?(?![a-z])/gi)) {
    const half = ISO2768_6_30_MM[(m[1] ?? "").toLowerCase()];
    if (!half) continue;
    const zone = (2 * half) / MM_PER_IN;
    found.push({ at: m.index ?? 0, read: read(m[0], "general", zone, true) });
  }

  // ISO 286 fits. Case matters: lowercase is a shaft, uppercase a hole; only the deviations common on
  // job-shop drawings, so a thread (M6), a roughness grade (N7) or a revision letter is not a fit. A
  // size right before the fit ("Ø20 H7", "20H7", "DIA 8 g6") is its nominal size. ISO 286 is a metric
  // table, so the size is in millimetres unless it is marked in inches, or the text is in inches and
  // the size is written inch-style with two or more decimals (Ø.750 H7, 1.000 g6). A size over 500 mm
  // is outside the table and the fit is not read; "ISO 286 H7" is a standard's number, not a size.
  for (const m of src.matchAll(
    /(?:(?:[Øø⌀]|\bDIA\.?)\s*)?(?:(\d+(?:[.,]\d+)?|[.,]\d+)\s*(mm|in\b|")?\s*)?(?<![A-Za-z.])(H|G|F|JS|K|P|h|g|f|js|k|m|n|p|s)(\d{1,2})(?![\dxX]|[.,]\d|\s*[xX]\s*\d)/g,
  )) {
    const [matched, rawSizeRead, sizeUnit, letter, rawGrade] = m;
    let at = m.index ?? 0;
    let whole = matched;
    let rawSize = rawSizeRead;
    if (rawSize && /ISO\s*$/i.test(src.slice(Math.max(0, at - 6), at))) {
      at += matched.length - (letter ?? "").length - (rawGrade ?? "").length;
      whole = `${letter}${rawGrade}`;
      rawSize = undefined;
    }
    // "M6" style threads and part numbers: a size glued to letters before it is not a nominal size.
    const before = at > 0 ? src[at - 1] : "";
    if (before && /[A-Za-z0-9.]/.test(before)) continue;
    const grade = Number(rawGrade);
    let sizeMm: number | null = null;
    if (rawSize) {
      const n = toNumber(rawSize);
      const inches =
        sizeUnit === "in" ||
        sizeUnit === '"' ||
        (!sizeUnit && fallback === "in" && decimalsOf(rawSize) >= 2);
      sizeMm = inches ? n * MM_PER_IN : n;
      if (!(sizeMm > 0)) sizeMm = null;
    }
    const um = itZoneUm(grade, sizeMm);
    if (!um) continue;
    const zone = um / 1000 / MM_PER_IN;
    const r = read(whole, "fit", zone, sizeMm == null);
    found.push({ at, read: { ...r, sizeMm, grade } });
  }

  // Limit dimensions: the two sizes a feature may be, smaller or larger first. Same decimals (at
  // least two) on both and close together, so a date, a part number or a thread is not read as one.
  const limits = new RegExp(
    String.raw`(?<![\d.,+\-±/])(\d*[.,]\d{2,})\s*(?:/|-|\bTO\b)\s*(\d*[.,]\d{2,})${UNIT}(?![\d/])`,
    "giu",
  );
  for (const m of src.matchAll(limits)) {
    const [whole, ra, rb, u] = m;
    const at = m.index ?? 0;
    if (!ra || !rb || !free(at, at + whole.length)) continue;
    if (decimalsOf(ra) !== decimalsOf(rb)) continue;
    const unit = unitOf(u, fallback);
    if (unit === "angle") continue;
    const a = toNumber(ra);
    const b = toNumber(rb);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (!(hi > lo) || hi - lo > Math.max(hi * 0.05, 0.1)) continue;
    const zone = toInches(Number((hi - lo).toFixed(decimalsOf(ra))), unit);
    taken.push([at, at + whole.length]);
    found.push({ at, read: read(whole, "limits", zone, false) });
  }

  found.sort((a, b) => a.at - b.at);
  const reads = found.map((f) => f.read);
  let tightest: ToleranceRead | null = null;
  for (const r of reads) if (!tightest || r.zoneIn < tightest.zoneIn) tightest = r;
  return { reads, tightest };
}

/** "0.0010 in (0.025 mm)": a zone printed in both units, to four decimals of an inch. */
export function formatZone(zoneIn: number): string {
  const inches = zoneIn < 0.001 ? zoneIn.toFixed(5) : zoneIn.toFixed(4);
  const mm = zoneIn * MM_PER_IN;
  return `${inches} in (${mm < 0.1 ? mm.toFixed(3) : mm.toFixed(2)} mm)`;
}

/** One line for the estimator, or null when the text holds no tolerance the reader knows. */
export function toleranceNote(text: string | null | undefined): {
  band: ToleranceBand;
  /** "Tight" */
  label: string;
  /** "±.0005, a 0.0010 in (0.025 mm) zone." */
  detail: string;
  /** label and detail as one line. */
  line: string;
  advice: string;
} | null {
  const { tightest, reads } = readTolerances(text);
  if (!tightest) return null;
  const assumed =
    tightest.kind === "general"
      ? ", for a 6-30 mm feature (ISO 2768-1)"
      : tightest.kind === "fit"
        ? tightest.sizeMm != null
          ? `, IT${tightest.grade} for ${itRangeLabel(tightest.sizeMm)} (ISO 286)`
          : ", for an 18-30 mm feature (ISO 286)"
        : "";
  const more = reads.length > 1 ? ` (tightest of ${reads.length} read)` : "";
  const label = BAND_LABEL[tightest.band];
  const detail = `${tightest.text}, a ${formatZone(tightest.zoneIn)} zone${assumed}${more}.`;
  return {
    band: tightest.band,
    label,
    detail,
    line: `${label}: ${detail}`,
    advice: BAND_ADVICE[tightest.band],
  };
}
