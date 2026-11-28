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
    means: "An ISO 286 hole fit, grade IT7: a 21 µm zone on an 18 to 30 mm bore",
    zoneIn: 0.0008268,
    band: "precision",
    sizeAssumed: true,
  },
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
