// Pure FIFO pick-log evidence logic -- no network, no DOM, no filesystem.
// Ports fifo_pick_evidence.py's check_rows/read_report rules (missing-data,
// invalid-timestamp, time-order, fifo-exception, and the headers-only-is-a
// clean-zero-row-report fix) so the browser tool and the CLI agree on every
// verdict. Loadable as a plain <script> in the browser (defines globals, no
// bundler) and requireable under `node --test`.

const REQUIRED = ["order_id", "sku", "lot", "received_at", "picked_at"];

const LIMITATIONS = [
  "This report is an observation of the supplied rows, not an audit conclusion, compliance determination, or chain-of-custody record.",
  "It cannot see picks that never made it into the log, or a warehouse system's own internal semantics -- confirm those before relying on a finding.",
  "Timestamps must include a timezone (for example a trailing Z or +00:00); a bare local timestamp is reported as invalid rather than guessed at.",
];

const TZ_RE = /(Z|[+-]\d{2}:\d{2})$/;

/** Minimal RFC4180-ish CSV parser: quoted fields, escaped "" quotes, CRLF or LF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { pushField(); continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { pushRow(); continue; }
    field += ch;
  }
  if (field !== "" || row.length) pushRow();
  return rows;
}

function rowsToObjects(csvText) {
  const table = parseCsv(csvText);
  if (table.length === 0) return { fieldnames: [], rows: [] };
  const fieldnames = table[0];
  const rows = table.slice(1).map((cells) => {
    const obj = {};
    fieldnames.forEach((name, idx) => { obj[name] = cells[idx] ?? ""; });
    return obj;
  });
  return { fieldnames, rows };
}

function parseTime(value) {
  if (!TZ_RE.test(value || "")) throw new Error("timestamp must include a timezone");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("timestamp must include a timezone");
  return date;
}

/** Same rules as fifo_pick_evidence.py's check_rows: one pass for row-level
 * problems, then a per-SKU pass flagging a newer-received lot picked before
 * an older-received lot from the same SKU was picked. */
function checkRows(rows) {
  const observations = [];
  const bySku = new Map();

  rows.forEach((row, idx) => {
    const number = idx + 2; // header occupies row 1
    const missing = REQUIRED.filter((field) => !(row[field] || "").trim());
    if (missing.length) {
      observations.push({ row: number, kind: "missing-data", fields: missing });
      return;
    }
    let received;
    let picked;
    try {
      received = parseTime(row.received_at);
      picked = parseTime(row.picked_at);
    } catch {
      observations.push({ row: number, kind: "invalid-timestamp" });
      return;
    }
    if (picked < received) {
      observations.push({ row: number, kind: "time-order", message: "picked_at precedes received_at" });
    }
    if (!bySku.has(row.sku)) bySku.set(row.sku, []);
    bySku.get(row.sku).push({ number, row, received, picked });
  });

  for (const items of bySku.values()) {
    for (const item of items) {
      for (const other of items) {
        if (other.received < item.received && other.picked > item.picked) {
          observations.push({
            row: item.number,
            kind: "fifo-exception",
            sku: item.row.sku,
            order_id: item.row.order_id,
            older_row: other.number,
            older_order_id: other.row.order_id,
          });
        }
      }
    }
  }
  return observations;
}

function describeObservation(obs) {
  switch (obs.kind) {
    case "missing-data":
      return `missing required value${obs.fields.length > 1 ? "s" : ""}: ${obs.fields.join(", ")}`;
    case "invalid-timestamp":
      return "received_at or picked_at is missing, unparsable, or has no timezone";
    case "time-order":
      return obs.message;
    case "fifo-exception":
      return `SKU ${obs.sku}: order ${obs.order_id} was picked before older order ${obs.older_order_id} (row ${obs.older_row}), which arrived earlier and was still picked later`;
    default:
      return obs.kind;
  }
}

/** Builds the full evidence report from raw CSV text and a display file name. */
function buildReport(csvText, fileName) {
  const { fieldnames, rows } = rowsToObjects(csvText);
  const missingHeaders = REQUIRED.filter((field) => !fieldnames.includes(field));
  if (missingHeaders.length) {
    throw new Error("missing required columns: " + missingHeaders.join(", "));
  }
  const observations = checkRows(rows);
  return {
    generatedOn: new Date().toISOString().slice(0, 10),
    fileName: fileName || "picks.csv",
    rowsChecked: rows.length,
    status: observations.length ? "observations" : "no-observations",
    observations,
    limitations: LIMITATIONS,
  };
}

function toMarkdown(report) {
  const lines = [
    "# FIFO pick evidence",
    "",
    `Checked \`${report.fileName}\` on ${report.generatedOn}: **${report.rowsChecked} rows**, **${report.observations.length} observations**.`,
    "",
    "This report is an observation of the supplied rows, not an audit conclusion or compliance determination.",
    "",
  ];
  if (report.observations.length === 0) {
    lines.push("No observations -- nothing in this pick log needed a closer look.");
  } else {
    lines.push("## Observations", "", "| Row | Kind | Detail |", "|---|---|---|");
    for (const obs of report.observations) {
      lines.push(`| ${obs.row} | ${obs.kind} | ${describeObservation(obs).replace(/\|/g, "\\|")} |`);
    }
  }
  lines.push("", "## Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push(
    "",
    "**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, legal, tax, financial, or compliance advice. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.",
  );
  return lines.join("\n") + "\n";
}

function toJson(report) {
  return JSON.stringify(report, null, 2) + "\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REQUIRED,
    parseCsv,
    rowsToObjects,
    parseTime,
    checkRows,
    describeObservation,
    buildReport,
    toMarkdown,
    toJson,
    LIMITATIONS,
  };
}
