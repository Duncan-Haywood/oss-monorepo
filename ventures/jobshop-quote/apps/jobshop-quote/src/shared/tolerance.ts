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
//   fits        H7, g6, H7/g6, js6 (ISO 286): the IT grade's zone for an 18-30 mm feature
// Angles (±0.5°, ±1 deg) are skipped. A number with no unit takes the text's unit: millimetres when
// the text says "mm" (or "µm") and never "in" or ", inches otherwise (the shop's own default).

export type ToleranceBand = "standard" | "close" | "tight" | "precision";

export type ToleranceKind = "bilateral" | "unequal" | "general" | "fit";

export interface ToleranceRead {
  /** The text as written in the field, trimmed. */
  text: string;
  kind: ToleranceKind;
  /** Full tolerance zone, inches (rounded to 0.1 µin so ±0.0005 is exactly 0.001). */
  zoneIn: number;
  /** True when the zone is the typical value for an assumed size (general classes and fits). */
  sizeAssumed: boolean;
  band: ToleranceBand;
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

/** ISO 286-1 standard tolerance grades, nominal sizes over 18 up to 30 mm: the zone, µm. */
const IT_18_30_UM: Record<number, number> = {
  5: 9,
  6: 13,
  7: 21,
  8: 33,
  9: 52,
  10: 84,
  11: 130,
};

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
  // job-shop drawings, so a thread (M6), a roughness grade (N7) or a revision letter is not a fit.
  for (const m of src.matchAll(
    /(?<![A-Za-z0-9.])(H|G|F|JS|K|P|h|g|f|js|k|m|n|p|s)(\d{1,2})(?![\dxX]|[.,]\d|\s*[xX]\s*\d)/g,
  )) {
    const grade = Number(m[2]);
    const um = IT_18_30_UM[grade];
    if (!um) continue;
    const zone = um / 1000 / MM_PER_IN;
    found.push({ at: m.index ?? 0, read: read(m[0], "fit", zone, true) });
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
        ? ", for an 18-30 mm feature (ISO 286)"
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
