// A mileage tracker's trip export (MileIQ, Stride, Everlance, TripLog, Driversnote, a spreadsheet)
// -> candidate business trips for the mileage log. Pure: no DB.
//
// Resellers drive to thrift stores, estate sales and the post office several times a week, and most
// already let a phone app record the drives. Typing each one into the log again is the chore that
// leaves line 9 short. This reads the CSV those apps export.
//
// Columns are matched by name, as for the marketplace reports (parse.ts); docs/IMPORTERS.md, "Mileage
// trackers", says where each spelling comes from and that no app's full header row is confirmed. Rules:
// - A trip needs a date and a distance. A distance in kilometres (a "km" header, or a unit column
//   saying km) is converted to miles. A distance that does not parse skips the row with its line number;
//   nothing is guessed.
// - A classification column (or a purpose column holding only a classification word, as Everlance's
//   "Purpose" does) decides business or not: personal, commute, charity, medical, moving and
//   unclassified trips are skipped with the reason. Charity and medical miles are not Schedule C
//   expenses. With no classification at all, every trip is offered, with a warning to untick
//   the personal ones.
// - The IRS log needs a business purpose per trip. The purpose comes from the purpose column, then the
//   notes; a trip with none is offered with `purpose: null` so the page asks for one before saving.
import { type ColumnSpec, ImportFormatError, parseDate, readTable } from "./parse";

export const MAX_MILEAGE_ROWS = 2000;
export const KM_PER_MILE = 1.609344;

export interface MileageRow {
  line: number;
  date: string;
  /** Miles x 10, as the log stores them. */
  milesTenths: number;
  /** The business purpose from the file, or null when it gave none (the page asks for one). */
  purpose: string | null;
  startPlace: string | null;
  endPlace: string | null;
  /** The classification as printed ("Business", "Work"), when there was one. */
  classification: string | null;
}

export interface MileageParseResult {
  rows: MileageRow[];
  rowCount: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  matched: Record<string, string>;
  unit: "mi" | "km";
}

type Field =
  | "date"
  | "miles"
  | "km"
  | "unit"
  | "classification"
  | "purpose"
  | "notes"
  | "start"
  | "end";

const SPEC: ColumnSpec<Field> = {
  date: {
    required: true,
    names: [
      "date",
      "trip date",
      "drive date",
      "start date",
      "start_date",
      "started",
      "started at",
      "start time",
      "start date time",
      "departure",
      "departure time",
      "date of trip",
    ],
  },
  miles: {
    names: [
      "miles",
      "mileage",
      "distance",
      "distance (mi)",
      "distance (miles)",
      "distance mi",
      "distance miles",
      "miles driven",
      "total miles",
      "trip miles",
      "business miles",
      "odometer miles",
    ],
  },
  km: {
    names: ["km", "kms", "kilometres", "kilometers", "distance (km)", "distance km", "total km"],
  },
  unit: { names: ["unit", "units", "distance unit", "distance units"] },
  classification: {
    names: ["classification", "category", "trip type", "drive type", "type", "trip category"],
  },
  purpose: {
    names: [
      "purpose",
      "business purpose",
      "trip purpose",
      "drive purpose",
      "reason",
      "description",
    ],
  },
  notes: { names: ["notes", "note", "memo", "comment", "comments"] },
  start: {
    names: [
      "start",
      "from",
      "start location",
      "start address",
      "starting location",
      "start place",
      "origin",
      "from address",
      "from location",
    ],
  },
  end: {
    names: [
      "stop",
      "end",
      "to",
      "end location",
      "end address",
      "stop location",
      "destination",
      "end place",
      "to address",
      "to location",
    ],
  },
};

type Class =
  | "business"
  | "personal"
  | "commute"
  | "charity"
  | "medical"
  | "moving"
  | "unclassified";

const CLASS_WORDS: [RegExp, Class][] = [
  [/^(business|work|biz|b)$/, "business"],
  [/^(personal|private|p)$/, "personal"],
  [/^(commute|commuting)$/, "commute"],
  [/^(charity|charitable|volunteer)$/, "charity"],
  [/^(medical|medical\/moving)$/, "medical"],
  [/^moving$/, "moving"],
  [/^(unclassified|unclassed|uncategori[sz]ed|none)$/, "unclassified"],
];

/** "Business" -> business; anything that is not one of the words above -> null (free text). */
export function classOf(raw: string | null | undefined): Class | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  for (const [re, c] of CLASS_WORDS) if (re.test(t)) return c;
  return null;
}

const SKIP_REASON: Record<Exclude<Class, "business">, string> = {
  personal: "Personal trip",
  commute: "Commuting is not a deductible business trip",
  charity: "Charity miles are not a Schedule C expense (they go on Schedule A)",
  medical: "Medical miles are not a Schedule C expense (they go on Schedule A)",
  moving: "Moving miles are not a Schedule C expense",
  unclassified: "Not classified in the tracker: classify it there as business, then import again",
};

/** "12.3", "12.3 mi", "1,204.5" -> 12.3 (a number); "", "--" -> null; anything else throws. */
export function parseDistance(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = raw.trim().toLowerCase();
  if (s === "" || s === "-" || s === "--" || /^n\/?a$/.test(s)) return null;
  s = s.replace(/\s*(miles|mile|mi|kilometres|kilometers|km|kms)\.?$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) throw new Error(`Not a distance: ${JSON.stringify(raw)}`);
  return Number(s);
}

const clean = (v: string | undefined, max: number) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

export function parseMileage(text: string): MileageParseResult {
  const table = readTable(
    text,
    SPEC,
    "mileage tracker export (it needs a date and a distance in miles or km)",
  );
  const has = (f: Field) => table.matched[f] !== undefined;
  if (!has("miles") && !has("km")) {
    throw new ImportFormatError(
      "This file has no distance column: expected Miles, Distance, or a km column.",
      [
        { field: "miles", expectedOneOf: SPEC.miles.names },
        { field: "km", expectedOneOf: SPEC.km.names },
      ],
    );
  }
  if (table.rows.length > MAX_MILEAGE_ROWS) {
    throw new ImportFormatError(
      `This file has ${table.rows.length} trips; split it into files of up to ${MAX_MILEAGE_ROWS}.`,
    );
  }
  // A miles column wins over a km one; a "Distance" column is miles unless a unit column says km.
  const headerKm = !has("miles") && has("km");
  const skipped: MileageParseResult["skipped"] = [];
  const warnings: string[] = [];
  const rows: MileageRow[] = [];
  let anyKm = headerKm;
  let classified = 0;
  let noPurpose = 0;
  for (const r of table.rows) {
    const date = parseDate(r.get("date"));
    if (!date) {
      skipped.push({
        line: r.line,
        reason: `No readable date (${JSON.stringify(r.get("date") ?? "")})`,
      });
      continue;
    }
    const rawDist = has("miles") ? r.get("miles") : r.get("km");
    let dist: number | null;
    try {
      dist = parseDistance(rawDist);
    } catch {
      skipped.push({
        line: r.line,
        reason: `Unreadable distance ${JSON.stringify(rawDist ?? "")}`,
      });
      continue;
    }
    if (dist == null || dist === 0) {
      skipped.push({ line: r.line, reason: "No distance" });
      continue;
    }
    const unitCell = (r.get("unit") ?? "").trim().toLowerCase();
    const inKm =
      headerKm ||
      /^(km|kms|kilomet)/.test(unitCell) ||
      (has("miles") && /km\s*$/i.test(rawDist ?? ""));
    if (inKm) anyKm = true;
    const miles = inKm ? dist / KM_PER_MILE : dist;
    const milesTenths = Math.round(miles * 10);
    if (milesTenths < 1) {
      skipped.push({ line: r.line, reason: "Under 0.1 mile" });
      continue;
    }
    if (milesTenths > 50000) {
      skipped.push({ line: r.line, reason: `Over 5,000 miles in one trip (${miles.toFixed(1)})` });
      continue;
    }

    // Business or not: the classification column, else a purpose cell that is only a class word.
    const classCell = clean(r.get("classification"), 60);
    const purposeCell = clean(r.get("purpose"), 300);
    const notesCell = clean(r.get("notes"), 300);
    let cls = classOf(classCell);
    let classification = cls ? classCell : null;
    const purposeIsClass = classOf(purposeCell);
    if (!cls && purposeIsClass) {
      cls = purposeIsClass;
      classification = purposeCell;
    }
    if (cls) classified++;
    if (cls && cls !== "business") {
      skipped.push({ line: r.line, reason: SKIP_REASON[cls] });
      continue;
    }
    // The purpose: free text in the purpose column, then the notes. A class word is not a purpose.
    const purpose = (purposeIsClass ? null : purposeCell) ?? notesCell;
    if (!purpose) noPurpose++;
    rows.push({
      line: r.line,
      date,
      milesTenths,
      purpose,
      startPlace: clean(r.get("start"), 200),
      endPlace: clean(r.get("end"), 200),
      classification,
    });
  }
  if (classified === 0 && rows.length > 0) {
    warnings.push(
      "The file says nothing about which trips were business, so every trip is listed. Untick the personal ones, or export only business drives from the tracker.",
    );
  }
  if (noPurpose > 0) {
    warnings.push(
      `${noPurpose} trip(s) have no business purpose in the file. The IRS expects one per trip: type it before saving (for example "Sourcing: Goodwill on Main St").`,
    );
  }
  if (anyKm)
    warnings.push("Distances in kilometres were converted to miles (1 mile = 1.609344 km).");
  const matched: Record<string, string> = {};
  for (const [k, v] of Object.entries(table.matched)) if (v !== undefined) matched[k] = v;
  skipped.sort((a, b) => a.line - b.line);
  return {
    rows,
    rowCount: table.rows.length,
    skipped,
    warnings,
    matched,
    unit: anyKm ? "km" : "mi",
  };
}
