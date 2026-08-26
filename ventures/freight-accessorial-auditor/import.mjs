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

/**
 * Parse the user's contract rates: one `CODE amount` pair per line.
 *
 * This is the half of the import a carrier file cannot supply. A shipper
 * types six accessorial rates once and every imported line gets an expected
 * amount, which is what turns a bulk import from a tidy list into an audit.
 *
 * Accepts `LIFT,75`, `LIFT 75`, `LIFT: $75.00`, and `LIFT = 75` because the
 * text is usually pasted out of a rate confirmation, not typed to a spec.
 */
export function parseRateCard(text) {
  const rates = new Map();
  const issues = [];
  const lines = String(text ?? "").split(/\r\n|\n|\r/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^(.*?)[\s,;:=]+([^\s,;:=]+)$/);
    if (!match) {
      issues.push({ line: index + 1, text: trimmed, reason: "no code and amount found" });
      return;
    }
    const code = normalizeCode(match[1]);
    const amount = parseMoney(match[2]);
    if (!code) {
      issues.push({ line: index + 1, text: trimmed, reason: "no code found" });
      return;
    }
    if (!amount.ok || amount.value < 0) {
      issues.push({ line: index + 1, text: trimmed, reason: "amount is not a non-negative number" });
      return;
    }
    rates.set(code, amount.value);
  });
  return { rates, issues };
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
    if (expectedCell !== "") {
      const parsedExpected = parseMoney(expectedCell);
      if (parsedExpected.ok) {
        expected = parsedExpected.value.toFixed(2);
      } else {
        issues.push({
          line: lineNumber,
          field: "expected",
          value: String(expectedCell),
          reason: "expected amount could not be read",
        });
      }
    }
    if (expected === "" && rates.has(code)) {
      expected = rates.get(code).toFixed(2);
    }
    if (expected === "") {
      unmatchedCodes += 1;
    }

    rows.push({
      invoice: String(cell(row, "invoice")),
      reference: String(cell(row, "reference")),
      code,
      billed: billed.ok ? billed.value.toFixed(2) : String(billedCell),
      expected,
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
      ratedCodes: rates.size,
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
  if (summary.withoutExpected > 0) {
    parts.push(`${summary.withoutExpected} line${summary.withoutExpected === 1 ? " has" : "s have"} no expected amount yet — add the code to your rate card or type the figure in the row. Duplicate and missing-code checks still run on them.`);
  }
  parts.push("Nothing was uploaded; the file was read in this browser.");
  return parts.join(" ");
}
