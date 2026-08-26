// Turn a carrier's own invoice export into audit rows.
//
// The auditor's engine was already able to review a whole invoice; the page
// could only be fed by hand, one row at a time. Nobody retypes a 200-line LTL
// invoice, so in practice the tool only ever saw the two or three lines a
// person already suspected — and a duplicate they had not spotted stayed
// invisible, which is the finding the audit is best at.
//
// Nothing here is network-aware. The text comes from a file the browser reads
// locally or from a paste; it is parsed in memory and never uploaded.
//
// Two honesty rules shape this module:
//
//   1. A carrier invoice says what you were *billed*. It never says what you
//      *expected*. Expected amounts come from the user's own rate card (see
//      `parseRateCard`) or stay blank — they are never inferred from the
//      billed amount, which would make every line agree with itself.
//   2. A value this module cannot read becomes a visible issue, never a
//      silent zero. A dropped line in an audit tool reads as "nothing wrong
//      here", which is worse than refusing to import.

/** Fields an imported row can carry into `auditCharges`. */
export const IMPORT_FIELDS = [
  { key: "invoice", label: "Invoice / bill number", kind: "text" },
  { key: "reference", label: "Reference / PRO / BOL", kind: "text" },
  { key: "code", label: "Accessorial code", kind: "text" },
  { key: "billed", label: "Billed amount", kind: "money" },
  { key: "expected", label: "Expected amount", kind: "money" },
  // Only needed by per-unit rate-card rules (detention hours, storage days,
  // reweigh hundredweight). Left unmapped, flat rates still price normally.
  { key: "units", label: "Quantity / hours (for per-unit rates)", kind: "number" },
];

// Header names seen across LTL carrier and TMS exports, lowercased and
// stripped of punctuation. Order matters: the first match wins, so the more
// specific spelling is listed before the generic one.
const HEADER_HINTS = {
  invoice: ["invoice number", "invoice no", "invoice", "bill number", "bill no", "billing document", "document number"],
  reference: ["pro number", "pro no", "pro", "bol number", "bol", "reference number", "reference", "shipment id", "shipment", "load number", "load id", "order number", "po number", "po"],
  code: ["accessorial code", "charge code", "service code", "code", "accessorial", "charge type", "charge description", "description", "service"],
  billed: ["billed amount", "billed", "amount billed", "charge amount", "net amount", "total charge", "amount", "charge", "total"],
  expected: ["expected amount", "expected", "contract amount", "contracted amount", "quoted amount", "quoted", "rated amount", "agreed amount"],
  // "hours" and "minutes" lead because detention is the accessorial a
  // quantity column is most often present for, and the most often overbilled.
  units: ["detention hours", "billable hours", "hours", "hrs", "minutes", "mins", "storage days", "days", "quantity", "qty", "units", "unit count", "pieces", "pallets", "weight", "billed weight", "hundredweight", "cwt", "count"],
};

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Guess the delimiter from the first non-empty line.
 *
 * Tabs are checked before commas because a range pasted straight out of Excel
 * is tab-separated, and a comma inside "$1,250.00" would otherwise make a
 * one-column paste look like a two-column CSV.
 */
export function detectDelimiter(text) {
  const line = String(text ?? "")
    .split(/\r\n|\n|\r/)
    .find((candidate) => candidate.trim() !== "");
  if (!line) return ",";
  const counts = [
    ["\t", (line.match(/\t/g) || []).length],
    [";", (line.match(/;/g) || []).length],
    ["|", (line.match(/\|/g) || []).length],
    [",", (line.match(/,/g) || []).length],
  ];
  const best = counts.reduce((winner, entry) => (entry[1] > winner[1] ? entry : winner), ["", 0]);
  return best[1] > 0 ? best[0] : ",";
}

/**
 * RFC 4180 parse with a caller-supplied or detected delimiter.
 *
 * Handles quoted fields containing the delimiter, doubled quotes, embedded
 * newlines, CRLF, and a leading byte-order mark — all of which appear in real
 * carrier exports, and any of which silently shifts every column by one if it
 * is mishandled.
 */
export function parseDelimited(text, delimiter) {
  const source = String(text ?? "").replace(/^﻿/, "");
  const sep = delimiter || detectDelimiter(source);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === sep) {
      endField();
      continue;
    }
    if (char === "\r") {
      if (source[i + 1] === "\n") i += 1;
      endRow();
      continue;
    }
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
    started = true;
  }
  // A file that does not end in a newline still has a final field to flush;
  // one that does must not gain a phantom trailing row.
  if (field !== "" || row.length) endRow();

  const cleaned = rows.filter((entry) => entry.some((cell) => String(cell).trim() !== ""));
  return { delimiter: sep, rows: cleaned.map((entry) => entry.map((cell) => cell.trim())) };
}

/**
 * Split a delimited export into its header row and its data rows.
 *
 * `hasHeader: false` is for the export that starts straight into data; the
 * columns are then named "Column 1", "Column 2" so the mapping selects still
 * have something to show.
 */
export function readTable(text, { delimiter, hasHeader = true } = {}) {
  const parsed = parseDelimited(text, delimiter);
  if (!parsed.rows.length) {
    return { header: [], rows: [], delimiter: parsed.delimiter };
  }
  if (hasHeader) {
    const [header, ...rows] = parsed.rows;
    return { header, rows, delimiter: parsed.delimiter };
  }
  const width = parsed.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const header = Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  return { header, rows: parsed.rows, delimiter: parsed.delimiter };
}

/**
 * Read a money cell the way carrier exports actually write one.
 *
 * `$1,250.00`, `1 250,00`, `(125.00)` for a credit, a trailing minus, and a
 * `USD` suffix all appear. A cell this cannot read returns `ok: false` so the
 * caller can surface it instead of importing a zero.
 */
export function parseMoney(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return { ok: false, value: null, reason: "empty" };

  let text = raw.replace(/[\s ]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/^(usd|us\$|\$)/i, "").replace(/(usd)$/i, "");
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (text === "") return { ok: false, value: null, reason: "unreadable" };

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point: 1,250.00 vs 1.250,00.
    if (lastComma > lastDot) text = text.replaceAll(".", "").replace(",", ".");
    else text = text.replaceAll(",", "");
  } else if (lastComma > -1) {
    // A lone comma is a decimal comma only when it looks like one (1,50);
    // 1,250 is a thousands separator and must not become 1.25.
    const decimals = text.length - lastComma - 1;
    text = decimals > 0 && decimals <= 2 && text.indexOf(",") === lastComma
      ? text.replace(",", ".")
      : text.replaceAll(",", "");
  }

  if (!/^\d*\.?\d*$/.test(text) || text === "." || text === "") {
    return { ok: false, value: null, reason: "unreadable" };
  }
  const number = Number(text);
  if (!Number.isFinite(number)) return { ok: false, value: null, reason: "unreadable" };
  return { ok: true, value: negative ? -number : number, reason: "" };
}

/**
 * Propose a column for each audit field from the export's own headers.
 *
 * A guess is a convenience, not a claim: the page shows every proposal in an
 * editable select and says it guessed. A column is never used for two fields,
 * so a sheet whose only money column is "Amount" maps it to `billed` (the
 * thing an invoice states) and leaves `expected` unmapped (the thing it
 * cannot state).
 */
export function suggestMapping(header = []) {
  const normalized = header.map(normalizeHeader);
  const mapping = {};
  const taken = new Set();
  for (const field of IMPORT_FIELDS) {
    mapping[field.key] = null;
    for (const hint of HEADER_HINTS[field.key]) {
      const exact = normalized.findIndex((name, index) => name === hint && !taken.has(index));
      const index = exact > -1
        ? exact
        : normalized.findIndex((name, position) => name.includes(hint) && !taken.has(position));
      if (index > -1) {
        mapping[field.key] = index;
        taken.add(index);
        break;
      }
    }
  }
  return mapping;
}

function normalizeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

// Units an accessorial can be rated in. Each entry lists the spellings that
// appear on rate confirmations and in carrier exports; the key is what the
// tool calls the unit back to the user.
//
// `minute` exists only so a quantity column reporting dock time in minutes can
// be priced against a per-hour detention rate — the single conversion carriers
// and TMS exports disagree about often enough to be worth handling. Every
// other unit is compared by name and never converted, because guessing that
// "3 pallets" satisfies a per-hundredweight rate would invent a number.
const UNIT_SPELLINGS = {
  hour: ["hour", "hours", "hr", "hrs", "h"],
  minute: ["minute", "minutes", "min", "mins", "m"],
  day: ["day", "days"],
  cwt: ["cwt", "hundredweight"],
  pallet: ["pallet", "pallets", "plt", "plts", "skid", "skids"],
  piece: ["piece", "pieces", "pc", "pcs", "carton", "cartons", "case", "cases"],
  mile: ["mile", "miles", "mi"],
  stop: ["stop", "stops"],
  unit: ["unit", "units", "each", "ea"],
};

const UNIT_BY_SPELLING = new Map(
  Object.entries(UNIT_SPELLINGS).flatMap(([unit, spellings]) =>
    spellings.map((spelling) => [spelling, unit]),
  ),
);

/** Canonical unit name for a spelling as written, or null. */
export function normalizeUnit(value) {
  const word = String(value ?? "").trim().toLowerCase().replace(/[.]/g, "");
  if (word === "") return null;
  return UNIT_BY_SPELLING.get(word) ?? null;
}

function ratedMoney(value) {
  const rounded = Math.round(value * 100) / 100;
  return `$${rounded.toFixed(2)}`;
}

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

/** Trim a number the way a basis line should read: 2 not 2.00, 1.5 not 1.50. */
function quantityText(value) {
  return Number.isInteger(value) ? String(value) : String(roundCents(value));
}

// Trailing clauses, peeled off the end of a rate line before the code and rate
// are read. Each is optional and they may appear in any order, because a rate
// confirmation writes "max $325" and "not to exceed $325" with equal frequency
// and a shipper pasting one should not have to reorder it.
const CAP_CLAUSE = /[,;]?\s*\b(?:max|maximum|cap|capped\s+at|not\s+to\s+exceed|nte)\b\s*(?:of|at|:)?\s*(\$?\s*[\d.,]+)\s*$/i;
const FLOOR_CLAUSE = /[,;]?\s*\b(?:min|minimum|at\s+least)\b\s*(?:of|at|:)?\s*(\$?\s*[\d.,]+)\s*$/i;
// The unit group must not swallow a trailing "free": in "after 2 free" it is
// greedy enough to read the word as the unit name and reject the whole line as
// naming an unknown unit. "after 2 free" and "after 2 hours free" are both how
// a confirmation states an allowance, so both have to land on the same rule.
const AFTER_CLAUSE = /[,;]?\s*\b(?:after|beyond|over|past)\b\s*([\d.,]+)\s*(?!free\b)([a-z]+)?\s*(?:free)?\s*$/i;
const FREE_CLAUSE = /[,;]?\s*\b([\d.,]+)\s*([a-z]+)?\s+free\b\s*$/i;
const RATE_CLAUSE = /^(.*?)[\s,;:=]+(\$?\s*[\d.,]+)\s*(?:\/|\bper\b)\s*([a-z]+)\s*$/i;
const FLAT_CLAUSE = /^(.*?)[\s,;:=]+([^\s,;:=]+)$/;

/**
 * Parse one rate-card line into a rule, or explain why it could not be read.
 *
 * The grammar is `CODE rate[/unit] [after N unit] [min $M] [max $X]`, matching
 * how accessorial tariffs are actually written:
 *
 *   LIFT, 75                          flat — the whole line is $75
 *   DET 65/hr after 2 hours           $65 an hour past 2 free hours
 *   STO $40 per day after 1, max 300  the same, floored by a cap
 *   REWEIGH 4.50/cwt min 45           per hundredweight, never under $45
 */
function parseRateLine(trimmed) {
  let rest = trimmed;
  let max = null;
  let min = null;
  let free = 0;
  let freeUnit = null;

  // Peel trailing clauses until none is left. Each clause is anchored to the
  // end of the line, so a single pass per keyword would only ever read the
  // last one written — "max 325 min 65 after 2" would leave `max` and `min`
  // stranded inside the code. Looping makes the three genuinely commutative,
  // which matters because a rate confirmation writes them in any order.
  for (let peeled = true; peeled; ) {
    peeled = false;

    if (max == null) {
      const capMatch = rest.match(CAP_CLAUSE);
      if (capMatch) {
        const parsed = parseMoney(capMatch[1]);
        if (!parsed.ok || parsed.value < 0) return { reason: "cap is not a non-negative amount" };
        max = parsed.value;
        rest = rest.slice(0, capMatch.index).trim();
        peeled = true;
        continue;
      }
    }

    if (min == null) {
      const floorMatch = rest.match(FLOOR_CLAUSE);
      if (floorMatch) {
        const parsed = parseMoney(floorMatch[1]);
        if (!parsed.ok || parsed.value < 0) return { reason: "minimum is not a non-negative amount" };
        min = parsed.value;
        rest = rest.slice(0, floorMatch.index).trim();
        peeled = true;
        continue;
      }
    }

    if (free === 0) {
      const afterMatch = rest.match(AFTER_CLAUSE) ?? rest.match(FREE_CLAUSE);
      if (afterMatch) {
        const parsed = parseMoney(afterMatch[1]);
        if (!parsed.ok || parsed.value < 0) return { reason: "free allowance is not a non-negative number" };
        free = parsed.value;
        freeUnit = normalizeUnit(afterMatch[2]);
        if (afterMatch[2] && !freeUnit) return { reason: `free allowance names an unknown unit "${afterMatch[2]}"` };
        rest = rest.slice(0, afterMatch.index).trim();
        peeled = true;
      }
    }
  }

  if (min != null && max != null && min > max) {
    return { reason: "minimum is above the cap" };
  }

  const rated = rest.match(RATE_CLAUSE);
  if (rated) {
    const code = normalizeCode(rated[1]);
    const amount = parseMoney(rated[2]);
    const per = normalizeUnit(rated[3]);
    if (!code) return { reason: "no code found" };
    if (!amount.ok || amount.value < 0) return { reason: "rate is not a non-negative amount" };
    if (!per) return { reason: `unknown unit "${rated[3]}" — try hour, day, cwt, pallet, piece, mile, stop, or unit` };
    if (freeUnit && freeUnit !== per && !(freeUnit === "minute" && per === "hour")) {
      return { reason: `free allowance is in ${freeUnit}s but the rate is per ${per}` };
    }
    // "after 30 min" against a per-hour rate is the same conversion the
    // quantity column gets, and for the same reason.
    const freeInRateUnits = freeUnit === "minute" && per === "hour" ? free / 60 : free;
    return { rule: { code, amount: amount.value, per, free: freeInRateUnits, min, max, source: trimmed } };
  }

  const flat = rest.match(FLAT_CLAUSE);
  if (!flat) return { reason: "no code and amount found" };
  const code = normalizeCode(flat[1]);
  const amount = parseMoney(flat[2]);
  if (!code) return { reason: "no code found" };
  // A code may legitimately contain spaces — "INSIDE DELIVERY 95" is how most
  // people write their first card, straight out of the description column. It
  // may not contain a rate or a clause keyword: that means the line was meant
  // to be per-unit and something in it did not parse, and accepting it here
  // would bury a broken rule under a code nobody will ever match against.
  if (/[/]|\b(?:per|max|maximum|cap|nte|min|minimum|after|beyond|free)\b/i.test(flat[1])) {
    return { reason: "could not read this as CODE rate[/unit] [after N] [min $M] [max $X]" };
  }
  if (!amount.ok || amount.value < 0) return { reason: "amount is not a non-negative number" };
  if (free > 0) {
    // A free allowance only means something against a per-unit rate. Silently
    // dropping it would price the line as flat while the shipper believes the
    // allowance is being applied — the expensive kind of wrong.
    return { reason: "a free allowance needs a per-unit rate (write 65/hr, not 65)" };
  }
  return { rule: { code, amount: amount.value, per: null, free: 0, min, max, source: trimmed } };
}

/**
 * Parse the user's contract rates: one rule per line.
 *
 * This is the half of the import a carrier file cannot supply. A shipper types
 * their accessorial rates once and every imported line gets an expected
 * amount, which is what turns a bulk import from a tidy list into an audit.
 *
 * Accepts `LIFT,75`, `LIFT 75`, `LIFT: $75.00`, and `LIFT = 75` because the
 * text is usually pasted out of a rate confirmation, not typed to a spec — and
 * `DET 65/hr after 2 hours, max $325` because the accessorials worth auditing
 * are rated per unit with an allowance and a cap. A flat card cannot price
 * detention, storage, or a reweigh at all, which left the highest-dollar,
 * most-disputed lines on a bulk import with no expected amount.
 *
 * Values are rules, not numbers: `{ code, amount, per, free, min, max }`.
 * A flat rate is the `per: null` case rather than a separate shape.
 */
export function parseRateCard(text) {
  const rates = new Map();
  const issues = [];
  const lines = String(text ?? "").split(/\r\n|\n|\r/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const parsed = parseRateLine(trimmed);
    if (parsed.reason) {
      issues.push({ line: index + 1, text: trimmed, reason: parsed.reason });
      return;
    }
    rates.set(parsed.rule.code, parsed.rule);
  });
  return { rates, issues };
}

/**
 * Read a quantity cell: `3`, `3.5`, `180 min`, `2 hours`, `1,250 cwt`.
 *
 * A bare number is taken to be in the rule's own unit. A cell that names a
 * different unit is refused rather than converted, except minutes against a
 * per-hour rate — see `UNIT_SPELLINGS`.
 */
export function parseQuantity(value, per) {
  const raw = String(value ?? "").trim();
  if (raw === "") return { ok: false, reason: "empty" };
  const match = raw.match(/^([^a-z]*)\s*([a-z]+)?\.?$/i);
  if (!match) return { ok: false, reason: "unreadable" };
  const amount = parseMoney(match[1]);
  if (!amount.ok || amount.value < 0) return { ok: false, reason: "unreadable" };
  if (!match[2]) return { ok: true, value: amount.value, unit: per ?? null };
  const unit = normalizeUnit(match[2]);
  if (!unit) return { ok: false, reason: "unreadable" };
  if (per && unit !== per) {
    if (unit === "minute" && per === "hour") {
      return { ok: true, value: amount.value / 60, unit: "hour", converted: "minutes" };
    }
    return { ok: false, reason: "wrong-unit", unit };
  }
  return { ok: true, value: amount.value, unit };
}

/**
 * Price one line from a rate-card rule and the row's quantity.
 *
 * Returns the expected amount plus the plain-language `basis` behind it. The
 * basis is the point: a shipper asking a carrier for a credit has to say what
 * the contract says the line should have cost, and "$65.00/hour × 1 h past 2 h
 * free" is an argument in a way that a bare "$65.00 expected" is not.
 *
 * A rule that needs a quantity and does not get one returns `ok: false`. The
 * caller leaves the expected amount blank and surfaces the reason — never a
 * zero, which would read as "the contract says this line is free".
 */
export function expectedFor(rule, units) {
  if (!rule) return { ok: false, reason: "no rate-card entry for this code" };
  if (!rule.per) {
    let amount = rule.amount;
    const clauses = [];
    if (rule.min != null && amount < rule.min) {
      amount = rule.min;
      clauses.push(`raised to the ${ratedMoney(rule.min)} minimum`);
    }
    if (rule.max != null && amount > rule.max) {
      amount = rule.max;
      clauses.push(`capped at ${ratedMoney(rule.max)}`);
    }
    const basis = [`flat contract rate ${ratedMoney(rule.amount)}`, ...clauses].join(", ");
    return { ok: true, amount: roundCents(amount), basis };
  }

  const quantity = parseQuantity(units, rule.per);
  if (!quantity.ok) {
    if (quantity.reason === "empty") {
      return { ok: false, reason: `${rule.code} is rated per ${rule.per} — map a quantity column to price it` };
    }
    if (quantity.reason === "wrong-unit") {
      return { ok: false, reason: `quantity is in ${quantity.unit}s but ${rule.code} is rated per ${rule.per}` };
    }
    return { ok: false, reason: `quantity could not be read` };
  }

  const billable = Math.max(0, quantity.value - rule.free);
  let amount = billable * rule.amount;
  const clauses = [
    `${quantityText(billable)} ${rule.per}${billable === 1 ? "" : "s"}` +
      (rule.free > 0 ? ` past ${quantityText(rule.free)} free` : "") +
      ` × ${ratedMoney(rule.amount)}/${rule.per}`,
  ];
  if (quantity.converted) clauses.unshift(`${quantityText(quantity.value)} ${rule.per}s from ${quantity.converted}`);
  // A contract minimum applies to a line that is billable at all. Applying it
  // to zero billable units would invent a charge on a shipment that stayed
  // inside its free time.
  if (rule.min != null && billable > 0 && amount < rule.min) {
    amount = rule.min;
    clauses.push(`raised to the ${ratedMoney(rule.min)} minimum`);
  }
  if (rule.max != null && amount > rule.max) {
    amount = rule.max;
    clauses.push(`capped at ${ratedMoney(rule.max)}`);
  }
  return { ok: true, amount: roundCents(amount), basis: clauses.join(", "), billable };
}

/**
 * Price hand-entered rows from the rate card, the way imported ones are.
 *
 * The card used to run at import only, so a shipper who typed six lines out of
 * a paper invoice — the way anyone tries the tool for the first time — got no
 * expected amount from rates they had already typed, and the detention line
 * they came to check stayed unpriced. The rules are the same rules; only the
 * source of the rows differed.
 *
 * A typed expected amount is never overwritten: the shipper's own figure for
 * this shipment beats the card's general rule, exactly as a carrier export's
 * expected column does. Rows are returned as copies, so the card can be edited
 * and re-applied without the previous pass having baked itself into the table.
 *
 * `priceHint` carries the reason a matching rule could not price a row (almost
 * always a missing quantity) so the page can say so on the row itself rather
 * than leaving a blank the user has to account for.
 */
export function priceEnteredRows(rows, rates) {
  if (!rates || rates.size === 0) return rows.map((row) => ({ ...row }));
  return rows.map((row) => {
    if (String(row.expected ?? "").trim() !== "") return { ...row };
    const rule = rates.get(normalizeCode(row.code));
    if (!rule) return { ...row };
    const priced = expectedFor(rule, row.units);
    if (!priced.ok) return { ...row, priceHint: priced.reason };
    return {
      ...row,
      expected: priced.amount.toFixed(2),
      basis: priced.basis,
      pricedFromCard: true,
      // Which kind of rule priced it, so the page can count per-unit use
      // without having to read it back out of the basis sentence.
      pricedPerUnit: Boolean(rule.per),
    };
  });
}

/**
 * Build audit rows from a parsed table and a column mapping.
 *
 * Returns rows shaped for `auditCharges`, plus a summary and a list of
 * per-row issues. `defaultEvidence` seeds the evidence status every imported
 * line starts with; it defaults to blank ("not selected") because the import
 * knows nothing about what the shipper can prove, and pre-selecting "missing"
 * would manufacture actionable overages the user never assessed.
 *
 * `onlyRatedCodes` drops lines whose code is not in the rate card — the way a
 * shipper skips line haul and fuel on a full invoice export. It reports how
 * many lines it dropped and which codes, because a filter that hides its work
 * turns "nothing else was flagged" into a false statement.
 */
export function buildImportedRows(table, mapping, options = {}) {
  const { rates = new Map(), onlyRatedCodes = false, defaultEvidence = "" } = options;
  const header = table?.header ?? [];
  const sourceRows = table?.rows ?? [];
  const rows = [];
  const issues = [];
  const skippedCodes = new Map();
  let unreadableBilled = 0;
  let unmatchedCodes = 0;
  let skipped = 0;
  let needsUnits = 0;
  let pricedPerUnit = 0;

  const cell = (row, field) => {
    const index = mapping?.[field];
    if (index == null || index < 0) return "";
    return row[index] ?? "";
  };

  sourceRows.forEach((row, position) => {
    const lineNumber = position + 1;
    const code = normalizeCode(cell(row, "code"));
    const billedCell = cell(row, "billed");
    const expectedCell = cell(row, "expected");
    const unitsCell = cell(row, "units");

    if (onlyRatedCodes && !rates.has(code)) {
      skipped += 1;
      const label = code || "(no code)";
      skippedCodes.set(label, (skippedCodes.get(label) || 0) + 1);
      return;
    }

    const billed = parseMoney(billedCell);
    if (!billed.ok) {
      unreadableBilled += 1;
      issues.push({
        line: lineNumber,
        field: "billed",
        value: String(billedCell),
        reason: billed.reason === "empty" ? "billed amount is blank" : "billed amount could not be read",
      });
    }

    let expected = "";
    let basis = "";
    if (expectedCell !== "") {
      const parsedExpected = parseMoney(expectedCell);
      if (parsedExpected.ok) {
        expected = parsedExpected.value.toFixed(2);
        basis = "expected amount from the carrier's own export";
      } else {
        issues.push({
          line: lineNumber,
          field: "expected",
          value: String(expectedCell),
          reason: "expected amount could not be read",
        });
      }
    }
    // The export's own expected column wins over the rate card: it is the
    // figure the two parties already agreed on for this shipment, where the
    // rate card is the general rule. The card fills the far more common gap.
    let awaitingUnits = false;
    if (expected === "" && rates.has(code)) {
      const priced = expectedFor(rates.get(code), unitsCell);
      if (priced.ok) {
        expected = priced.amount.toFixed(2);
        basis = priced.basis;
        if (rates.get(code).per) pricedPerUnit += 1;
      } else {
        needsUnits += 1;
        awaitingUnits = true;
        issues.push({
          line: lineNumber,
          field: "units",
          value: String(unitsCell),
          reason: priced.reason,
        });
      }
    }
    // Counted only when the code is genuinely absent from the card. A line
    // that matched a per-unit rule and is only missing its quantity belongs to
    // `needsUnits` alone — counting it here too would report one line twice
    // and tell the shipper to add a code that is already on their rate card.
    if (expected === "" && !awaitingUnits) {
      unmatchedCodes += 1;
    }

    rows.push({
      invoice: String(cell(row, "invoice")),
      reference: String(cell(row, "reference")),
      code,
      billed: billed.ok ? billed.value.toFixed(2) : String(billedCell),
      expected,
      units: String(unitsCell),
      basis,
      evidence: defaultEvidence,
    });
  });

  return {
    rows,
    issues,
    summary: {
      columns: header.length,
      readRows: sourceRows.length,
      imported: rows.length,
      skipped,
      skippedCodes: [...skippedCodes.entries()].map(([code, count]) => ({ code, count })),
      unreadableBilled,
      withoutExpected: unmatchedCodes,
      needsUnits,
      pricedPerUnit,
      ratedCodes: rates.size,
      perUnitRules: [...rates.values()].filter((rule) => rule.per).length,
    },
  };
}

/**
 * One plain sentence about what the import did, for the page's status line.
 *
 * Written so the counts that mean "check this" — dropped lines, unreadable
 * amounts, lines with no expected figure — are stated rather than left for
 * the user to infer from a row count.
 */
export function importSummaryNote(summary) {
  if (!summary || summary.readRows === 0) {
    return "No data rows were found. Check that the file has a header row and at least one charge below it.";
  }
  const parts = [
    `Read ${summary.readRows} row${summary.readRows === 1 ? "" : "s"} across ${summary.columns} column${summary.columns === 1 ? "" : "s"} and imported ${summary.imported}.`,
  ];
  if (summary.skipped > 0) {
    const codes = summary.skippedCodes
      .slice(0, 4)
      .map((entry) => `${entry.code} ×${entry.count}`)
      .join(", ");
    const more = summary.skippedCodes.length > 4 ? `, and ${summary.skippedCodes.length - 4} more` : "";
    parts.push(`Skipped ${summary.skipped} line${summary.skipped === 1 ? "" : "s"} whose code is not in your rate card (${codes}${more}).`);
  }
  if (summary.unreadableBilled > 0) {
    parts.push(`${summary.unreadableBilled} billed amount${summary.unreadableBilled === 1 ? "" : "s"} could not be read and ${summary.unreadableBilled === 1 ? "is" : "are"} flagged in the queue rather than counted as zero.`);
  }
  if (summary.pricedPerUnit > 0) {
    parts.push(`${summary.pricedPerUnit} line${summary.pricedPerUnit === 1 ? " was" : "s were"} priced from a per-unit rule against the quantity column, and each says which rule and quantity produced its figure.`);
  }
  if (summary.needsUnits > 0) {
    // Separated from `withoutExpected` because the fix is different: this one
    // is a column away, not a rate-card entry away.
    parts.push(`${summary.needsUnits} line${summary.needsUnits === 1 ? " matched a per-unit rule but could not be priced" : "s matched a per-unit rule but could not be priced"} — map the column holding hours, days, or weight above, or type the figure in the row.`);
  }
  if (summary.withoutExpected > 0) {
    parts.push(`${summary.withoutExpected} line${summary.withoutExpected === 1 ? " has" : "s have"} no expected amount yet — add the code to your rate card or type the figure in the row. Duplicate and missing-code checks still run on them.`);
  }
  parts.push("Nothing was uploaded; the file was read in this browser.");
  return parts.join(" ");
}
