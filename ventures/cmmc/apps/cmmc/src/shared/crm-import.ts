// External service providers, part 3: a provider's customer responsibility matrix (CRM) read into
// the requirement marks on its record, so a shop whose MSP or cloud provider sent a 110-row matrix
// does not set 110 dropdowns by hand. Pure: the Providers form runs it in the browser on a CSV, or on
// the chosen sheet of an .xlsx turned into CSV (controls/sheet-import.ts), shows the preview, and
// saves the marks through the ordinary provider PATCH, which checks them again
// (controlSharesProblem).
//
// Nothing is guessed. A row counts only when its requirement id is a Level 2 one (CMMC id or NIST
// SP 800-171 Rev. 2 number; an assessment objective such as 3.1.1[a] counts for its requirement)
// and who carries it is written in its own cell, in one of two layouts matrices use:
//
// - one responsibility column whose cells name a party ("Customer", "Provider", "Shared",
//   "Inherited", "Hybrid", the provider's own name...);
// - a column per party ("Customer", "Provider" or the provider's name, "Shared"), marked with an X,
//   a tick or yes, or holding that party's description of what it does.
//
// A cell the reader does not recognise is listed with its line and left out. When the rows of one
// requirement disagree (objectives split between the customer and the provider), the requirement is
// marked shared and the disagreement is listed, so the reader sees why. Requirements the file does
// not list keep the marks they have.

import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  parseCsv,
  resolveControlId,
} from "./controls/csv-import";
import type { ControlShare, Responsibility } from "./service-providers";

/** Who a CRM row gives a requirement to; "customer" and "na" leave it unmarked (yours). */
export type CrmParty = "customer" | "provider" | "shared" | "na";

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const WORDS: Record<string, CrmParty> = {};
const say = (p: CrmParty, ...list: string[]) => {
  for (const w of list) WORDS[normalise(w)] = p;
};
say(
  "customer",
  "customer",
  "customer responsibility",
  "customer responsible",
  "customer owned",
  "customer managed",
  "client",
  "client responsibility",
  "osa",
  "osc",
  "osa responsibility",
  "osc responsibility",
  "contractor",
  "organization",
  "organisation",
  "tenant",
  "subscriber",
  "not inherited",
  "you",
  "yours",
);
say(
  "provider",
  "provider",
  "provider responsibility",
  "provider responsible",
  "provider managed",
  "service provider",
  "esp",
  "csp",
  "msp",
  "mssp",
  "vendor",
  "inherited",
  "fully inherited",
  "inherit",
  "esp responsibility",
  "csp responsibility",
  "msp responsibility",
);
say(
  "shared",
  "shared",
  "shared responsibility",
  "hybrid",
  "joint",
  "both",
  "partially inherited",
  "partial inheritance",
  "customer and provider",
  "provider and customer",
  "customer provider",
  "provider customer",
  "shared customer provider",
);
say("na", "n a", "na", "not applicable", "none", "not covered", "out of scope");

/** Words that mean a provider column but name no provider ("Provider", "MSP"...). */
const PROVIDER_HEADER = /\b(provider|esp|csp|msp|mssp|vendor|inherited)\b/;
const CUSTOMER_HEADER = /\b(customer|client|osa|osc|contractor|tenant|subscriber)\b/;
const SHARED_HEADER = /\b(shared|hybrid|joint)\b/;
const RESPONSIBILITY_HEADER =
  /\b(responsibility|responsible|responsibilities|ownership|owner|owned by|inheritance|inherited|party|assigned to|who)\b/;

/** The first word of a provider name long enough to stand for it ("Microsoft 365 GCC High"). */
function nameWords(providerName: string): string[] {
  const n = normalise(providerName);
  if (n.length < 3) return [];
  const first = n.split(" ")[0] ?? "";
  return first.length >= 4 && first !== n ? [n, first] : [n];
}

const mentions = (text: string, words: string[]) =>
  words.some((w) => ` ${text} `.includes(` ${w} `));

/** The party a responsibility cell names, null when it names none the reader knows. */
export function parseCrmParty(cell: string, providerName = ""): CrmParty | null {
  const n = normalise(cell);
  if (!n) return null;
  const known = WORDS[n];
  if (known) return known;
  const words = nameWords(providerName);
  if (words.length > 0) {
    if (words.includes(n) || words.some((w) => n === `${w} responsibility`)) return "provider";
    // "Customer and Microsoft", "Shared (Microsoft / customer)".
    if (mentions(n, words) && (CUSTOMER_HEADER.test(n) || SHARED_HEADER.test(n))) return "shared";
  }
  return null;
}

/** A mark in a per-party column: X, a tick, yes, or that party's own text. Null when blank or "no". */
function marked(cell: string): boolean | null {
  const raw = cell.trim();
  if (!raw) return null;
  const n = normalise(raw);
  if (/^(no|n|false|0|none|n a|na|not applicable)$/.test(n)) return false;
  if (!n && /^[-–—]+$/.test(raw)) return false;
  return true;
}

export interface CrmImportIssue {
  line: number | null;
  message: string;
}

export interface CrmImportPlan {
  /** "column": one responsibility column; "parties": a column per party; null when neither was found. */
  layout: "column" | "parties" | null;
  /** Headers used: the id column, and the responsibility column or each party's column. */
  columns: {
    id: string | null;
    responsibility: string | null;
    customer: string | null;
    provider: string | null;
    shared: string | null;
  };
  /** The marks the file gives, one per Level 2 requirement listed, in file order. */
  marks: { controlId: string; party: CrmParty; lines: number[] }[];
  issues: CrmImportIssue[];
  /** Requirements whose rows disagreed and were marked shared, with why. */
  notices: CrmImportIssue[];
}

const REV3 =
  /^(?:NIST\s*)?(?:SP\s*)?(?:800-171\s*(?:r(?:ev)?\.?\s*3)?\s*[-:]?\s*)?0[1-9]\.\d{2}\.\d{2}\b/i;

/**
 * Reads a CRM saved as CSV. The id column is found by its contents, the header row is the nearest
 * row above the first id with two or more labels, and the responsibility column or party columns by
 * that header (contents decide when no header names a responsibility column).
 */
export function planCrmImport(csv: string, providerName = ""): CrmImportPlan {
  const columns: CrmImportPlan["columns"] = {
    id: null,
    responsibility: null,
    customer: null,
    provider: null,
    shared: null,
  };
  const issues: CrmImportIssue[] = [];
  const notices: CrmImportIssue[] = [];
  const plan: CrmImportPlan = { layout: null, columns, marks: [], issues, notices };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the matrix sheet as CSV.",
    });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the matrix sheet as CSV.`,
    });
    return plan;
  }
  const width = Math.max(0, ...table.map((r) => r.length));
  const cell = (r: number, c: number) => (table[r]?.[c] ?? "").trim();

  let idCol = -1;
  let idHits = 0;
  let rev3Hits = 0;
  for (let c = 0; c < width; c++) {
    let hits = 0;
    for (let r = 0; r < table.length; r++) {
      if (resolveControlId(cell(r, c), 2)) hits++;
      else if (REV3.test(cell(r, c))) rev3Hits++;
    }
    if (hits > idHits) {
      idCol = c;
      idHits = hits;
    }
  }
  if (idCol < 0) {
    issues.push({
      line: null,
      message:
        rev3Hits > 0
          ? "The requirement ids look like NIST SP 800-171 Rev. 3 numbers (03.01.01). CMMC Level 2 is assessed against Rev. 2 (3.1.1, AC.L2-3.1.1): ask the provider for its Rev. 2 or CMMC matrix."
          : "No column of Level 2 requirement ids was found. The matrix needs one column with ids such as AC.L2-3.1.1 or 3.1.1.",
    });
    return plan;
  }
  const firstIdRow = table.findIndex((_, r) => resolveControlId(cell(r, idCol), 2));
  const filled = (r: number) => (table[r] ?? []).filter((v) => v.trim()).length;
  let headerRow = -1;
  for (let r = firstIdRow - 1; r >= 0; r--) {
    if (filled(r) >= 2) {
      headerRow = r;
      break;
    }
  }
  const header = (c: number) => (headerRow >= 0 ? cell(headerRow, c) : "");
  const label = (c: number) => header(c) || `column ${c + 1}`;
  columns.id = label(idCol);

  const idRows: number[] = [];
  for (let r = firstIdRow; r < table.length; r++)
    if (resolveControlId(cell(r, idCol), 2)) idRows.push(r);
  const partyHits = (c: number) =>
    idRows.filter((r) => parseCrmParty(cell(r, c), providerName) !== null).length;

  // Party columns: a header naming exactly one party.
  const names = nameWords(providerName);
  const partyOf = (c: number): Exclude<CrmParty, "na"> | null => {
    const h = normalise(header(c));
    if (!h) return null;
    const found: Exclude<CrmParty, "na">[] = [];
    if (CUSTOMER_HEADER.test(h)) found.push("customer");
    if (PROVIDER_HEADER.test(h) || (names.length > 0 && mentions(h, names))) found.push("provider");
    if (SHARED_HEADER.test(h)) found.push("shared");
    return found.length === 1 ? (found[0] ?? null) : null;
  };
  const partyCols: Partial<Record<Exclude<CrmParty, "na">, number>> = {};
  for (let c = 0; c < width; c++) {
    if (c === idCol) continue;
    const p = partyOf(c);
    if (p && partyCols[p] === undefined) partyCols[p] = c;
  }

  // One responsibility column: by header when at least half its cells name a party, else by
  // contents (the column most of whose cells do).
  let respCol = -1;
  const half = Math.ceil(idRows.length / 2);
  for (let c = 0; c < width; c++) {
    if (c === idCol) continue;
    const h = normalise(header(c));
    if (h && RESPONSIBILITY_HEADER.test(h) && partyHits(c) >= half) {
      respCol = c;
      break;
    }
  }
  const usableParties = partyCols.provider !== undefined || partyCols.shared !== undefined;
  if (respCol < 0 && !usableParties) {
    let best = 0;
    for (let c = 0; c < width; c++) {
      if (c === idCol) continue;
      const hits = partyHits(c);
      if (hits > best) {
        best = hits;
        respCol = c;
      }
    }
    if (best < half) respCol = -1;
  }

  if (respCol >= 0) {
    plan.layout = "column";
    columns.responsibility = label(respCol);
  } else if (usableParties) {
    plan.layout = "parties";
    for (const p of ["customer", "provider", "shared"] as const) {
      const c = partyCols[p];
      if (c !== undefined) columns[p] = label(c);
    }
  } else {
    issues.push({
      line: null,
      message:
        "No column saying who carries each requirement was found. The matrix needs a responsibility column (Customer, Provider, Shared, Inherited) or a column per party marked with an X.",
    });
    return plan;
  }

  const byControl = new Map<string, { parties: CrmParty[]; lines: number[] }>();
  const order: string[] = [];
  for (let r = firstIdRow; r < table.length; r++) {
    const line = r + 1;
    const id = resolveControlId(cell(r, idCol), 2);
    if (!id) continue;
    if (!id.ok) {
      issues.push({ line, message: id.reason });
      continue;
    }
    let party: CrmParty | null;
    if (plan.layout === "column") {
      const v = cell(r, respCol);
      party = parseCrmParty(v, providerName);
      if (!party) {
        issues.push({
          line,
          message: v
            ? `${id.controlId}: "${v.slice(0, 60)}" does not say Customer, Provider or Shared; left out.`
            : `${id.controlId}: the responsibility cell is blank; left out.`,
        });
        continue;
      }
    } else {
      const at = (p: Exclude<CrmParty, "na">) => {
        const c = partyCols[p];
        return c === undefined ? null : marked(cell(r, c));
      };
      const cust = at("customer");
      const prov = at("provider");
      const shared = at("shared");
      if (shared || (cust && prov)) party = "shared";
      else if (prov) party = "provider";
      else if (cust) party = "customer";
      else if (cust === false || prov === false || shared === false) party = "na";
      else {
        issues.push({ line, message: `${id.controlId}: no party column is marked; left out.` });
        continue;
      }
    }
    let entry = byControl.get(id.controlId);
    if (!entry) {
      entry = { parties: [], lines: [] };
      byControl.set(id.controlId, entry);
      order.push(id.controlId);
    }
    entry.parties.push(party);
    entry.lines.push(line);
  }

  for (const controlId of order) {
    const entry = byControl.get(controlId);
    if (!entry) continue;
    const kinds = new Set(entry.parties.filter((p) => p !== "na"));
    let party: CrmParty;
    if (kinds.size === 0) party = "na";
    else if (kinds.size === 1) party = [...kinds][0] ?? "na";
    else {
      party = "shared";
      const count = (p: CrmParty) => entry.parties.filter((x) => x === p).length;
      const parts = (["provider", "customer", "shared"] as const)
        .filter((p) => count(p) > 0)
        .map((p) => `${p} on ${count(p)} row${count(p) === 1 ? "" : "s"}`);
      notices.push({
        line: entry.lines[0] ?? null,
        message: `${controlId}: its rows disagree (${parts.join(", ")}), so it is marked shared.`,
      });
    }
    plan.marks.push({ controlId, party, lines: entry.lines });
  }
  if (plan.marks.length === 0)
    issues.push({ line: null, message: "No requirement row said who carries it." });
  return plan;
}

/** The provider record's marks after the plan: listed requirements replaced, the rest kept. */
export function applyCrmMarks(current: ControlShare[], plan: CrmImportPlan): ControlShare[] {
  const listed = new Set(plan.marks.map((m) => m.controlId));
  const kept = current.filter((s) => !listed.has(s.controlId));
  const added: ControlShare[] = [];
  for (const m of plan.marks)
    if (m.party === "provider" || m.party === "shared")
      added.push({ controlId: m.controlId, responsibility: m.party as Responsibility });
  return [...kept, ...added];
}

/** Counts for the preview line: how many requirements the file gives to each party. */
export function crmSummary(plan: CrmImportPlan) {
  const n = (p: CrmParty) => plan.marks.filter((m) => m.party === p).length;
  return { provider: n("provider"), shared: n("shared"), customer: n("customer"), na: n("na") };
}
