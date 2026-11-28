// The table behind the /machining-tolerances guide: tolerance callouts as drawings and RFQ emails
// write them, and how Job Shop Quote's tolerance reader (apps/jobshop-quote/src/shared/tolerance.ts)
// reads each one: the full zone and the band it falls in.
//
// The site cannot import the app's code, so the figures are written out here and
// apps/jobshop-quote/test/unit/site-tolerance-example.test.ts runs every callout through the real
// reader and checks the zone and band, so the page cannot drift from what the app shows an estimator.
//
// The band limits are shop-floor rules of thumb the app uses as defaults, not a standard; the page says
// so. The ISO values are from ISO 2768-1 (table 1, over 6 up to 30 mm) and ISO 286-1 (standard
// tolerance grades, over 18 up to 30 mm).

export type Band = "standard" | "close" | "tight" | "precision";

export interface BandRow {
  band: Band;
  label: string;
  /** The zone range in words, inches. */
  range: string;
  /** What the band usually asks of the shop (process and inspection), in words. */
  asks: string;
}

export const BANDS: BandRow[] = [
  {
    band: "standard",
    label: "Standard",
    range: "±.005 in and looser (a zone of .010 in or more)",
    asks: "Ordinary roughing and finishing on a CNC mill or lathe, checked with calipers.",
  },
  {
    band: "close",
    label: "Close",
    range: "±.001 up to ±.005 in (a zone of .002 to under .010 in)",
    asks: "A finish pass and a micrometer or bore gauge on the feature; most CNC machines hold it.",
  },
  {
    band: "tight",
    label: "Tight",
    range: "±.0005 up to ±.001 in (a zone of .001 to under .002 in)",
    asks: "Finish passes at a lighter cut, tool wear watched, in-process gauging, and more parts checked per lot.",
  },
  {
    band: "precision",
    label: "Precision",
    range: "tighter than ±.0005 in (a zone under .001 in)",
    asks: "Often grinding, honing or reaming to size, a temperature-stable check and a CMM or air gauge; some shops send it out.",
  },
];

export interface CalloutRow {
  /** As written on the drawing or in the email. */
  callout: string;
  /** What it means, in words. */
  means: string;
  /** Full zone in inches as the reader gives it (rounded to 0.1 µin). */
  zoneIn: number;
  band: Band;
  /** True when the zone is the typical one for an assumed size. */
  sizeAssumed: boolean;
}

export const CALLOUTS: CalloutRow[] = [
  {
    callout: "+/- .005",
    means: "Five thousandths either way",
    zoneIn: 0.01,
    band: "standard",
    sizeAssumed: false,
  },
  {
    callout: "±.002",
    means: "Two thousandths either way",
    zoneIn: 0.004,
    band: "close",
    sizeAssumed: false,
  },
  {
    callout: "+.002/-.000",
    means: "Up to two thousandths over, nothing under (one-sided)",
    zoneIn: 0.002,
    band: "close",
    sizeAssumed: false,
  },
  {
    callout: "±.0005",
    means: "Half a thousandth either way",
    zoneIn: 0.001,
    band: "tight",
    sizeAssumed: false,
  },
  {
    callout: "+.0005/-.0000",
    means: "Half a thousandth over, nothing under",
    zoneIn: 0.0005,
    band: "precision",
    sizeAssumed: false,
  },
  {
    callout: "±0,02 mm",
    means: "Two hundredths of a millimetre either way (a comma decimal)",
    zoneIn: 0.0015748,
    band: "tight",
    sizeAssumed: false,
  },
  {
    callout: "ISO 2768-m",
    means: "The general tolerance class 'medium': ±0.2 mm on a 6 to 30 mm dimension",
    zoneIn: 0.015748,
    band: "standard",
    sizeAssumed: true,
  },
  {
    callout: "ISO 2768-f",
    means: "The general tolerance class 'fine': ±0.1 mm on a 6 to 30 mm dimension",
    zoneIn: 0.007874,
    band: "close",
    sizeAssumed: true,
  },
  {
    callout: "H7",
    means:
      "An ISO 286 hole fit, grade IT7: a 21 µm zone, read at 18 to 30 mm since no size is given",
    zoneIn: 0.0008268,
    band: "precision",
    sizeAssumed: true,
  },
  {
    callout: "Ø40 H7",
    means: "The same fit on a 40 mm bore: IT7 over 30 up to 50 mm is 25 µm",
    zoneIn: 0.0009843,
    band: "precision",
    sizeAssumed: false,
  },
  {
    callout: ".4995/.5000",
    means: "Limit dimensions: the two sizes the feature may be, half a thousandth apart",
    zoneIn: 0.0005,
    band: "precision",
    sizeAssumed: false,
  },
];

/**
 * ISO 286-1 table 1: standard tolerance grades IT5 to IT11, µm, by nominal size in mm ("over" the
 * previous limit "up to and including" this one). The same table the app's reader uses
 * (apps/jobshop-quote/src/shared/tolerance.ts, IT_GRADES_UM); a test holds the two together.
 */
export const IT_SIZE_LIMITS_MM = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500] as const;
export const IT_ROWS: { grade: number; um: number[] }[] = [
  { grade: 5, um: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27] },
  { grade: 6, um: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40] },
  { grade: 7, um: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63] },
  { grade: 8, um: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97] },
  { grade: 9, um: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155] },
  { grade: 10, um: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250] },
  { grade: 11, um: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400] },
];

/** ISO 2768-1 table 1: the class's ± value for each size range of a linear dimension, mm. */
export const ISO2768_RANGES = ["0.5–3", "3–6", "6–30", "30–120", "120–400"] as const;
export const ISO2768_ROWS: { cls: string; name: string; plusMinusMm: (number | null)[] }[] = [
  { cls: "f", name: "fine", plusMinusMm: [0.05, 0.05, 0.1, 0.15, 0.2] },
  { cls: "m", name: "medium", plusMinusMm: [0.1, 0.1, 0.2, 0.3, 0.5] },
  { cls: "c", name: "coarse", plusMinusMm: [0.2, 0.3, 0.5, 0.8, 1.2] },
  { cls: "v", name: "very coarse", plusMinusMm: [null, 0.5, 1, 1.5, 2.5] },
];

/** "0.0010": a zone in inches, to four places (five under .001). */
export function inchZone(zoneIn: number): string {
  return zoneIn < 0.001 ? zoneIn.toFixed(5) : zoneIn.toFixed(4);
}
