// Primavera P6 XER reader. An XER file is tab-separated text: one ERMHDR
// line, then for each table a `%T name` line, a `%F field...` line and
// `%R value...` rows, ending with `%E`. P6 writes it in the Windows code page
// of the exporting machine (usually Windows-1252), with CRLF line ends.
//
// parseXer(text) -> { version, exportDate, tables: { TASK: [{field: value}], ... } }
// decodeXer(bytes) -> text (UTF-8 when the bytes are valid UTF-8, else
// Windows-1252), so a file read from disk or a browser <input> gives the same
// result.

export function decodeXer(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder("windows-1252").decode(u8);
  }
}

export function parseXer(text) {
  if (typeof text !== "string") throw new TypeError("parseXer expects text; use decodeXer(bytes) first");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  const out = { version: null, exportDate: null, currency: null, tables: {}, warnings: [] };
  let table = null;
  let fields = null;
  let sawHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("ERMHDR")) {
      const p = line.split("\t");
      out.version = p[1] || null;
      out.exportDate = p[2] || null;
      // the export's base currency (ERMHDR's ninth field, e.g. USD)
      out.currency = (p[8] || "").trim() || null;
      sawHeader = true;
      continue;
    }
    const tag = line.slice(0, 2);
    if (tag === "%T") {
      const name = line.split("\t")[1]?.trim();
      table = name || null;
      fields = null;
      if (table && !out.tables[table]) out.tables[table] = [];
    } else if (tag === "%F") {
      fields = line.split("\t").slice(1).map((f) => f.trim());
    } else if (tag === "%R") {
      if (!table || !fields) {
        out.warnings.push(`line ${i + 1}: a row before its table's field list`);
        continue;
      }
      // P6 Web exports quote a value that holds line breaks (clndr_data),
      // so a row can run over several lines: join until the quotes balance.
      let raw = line;
      // Only a last value that opens with a quote can continue: a name such
      // as `6" drain` has an odd quote count but stays on its line.
      const tail = raw.slice(raw.lastIndexOf("\t") + 1);
      if (tail.startsWith('"')) {
        let open = quoteCount(tail) % 2 === 1;
        while (open && i + 1 < lines.length && !/^%[TFRE]\t/.test(lines[i + 1])) {
          const next = lines[++i];
          raw += "\n" + next;
          if (quoteCount(next) % 2 === 1) open = false;
        }
      }
      const vals = splitRow(raw).slice(1);
      const row = {};
      for (let k = 0; k < fields.length; k++) row[fields[k]] = vals[k] === undefined ? "" : vals[k];
      if (vals.length > fields.length) out.warnings.push(`line ${i + 1}: ${table} row has ${vals.length} values for ${fields.length} fields`);
      out.tables[table].push(row);
    } else if (tag === "%E") {
      break;
    }
  }
  if (!sawHeader && !Object.keys(out.tables).length) throw new Error("not an XER file: no ERMHDR line and no %T tables");
  return out;
}

function quoteCount(s) {
  let n = 0;
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 34) n++;
  return n;
}

// Split on tabs. P6 writes a double quote inside a value as "" (P6 6.0, 7.0
// and 20.12 exports: every inner quote doubled, none single; MPXJ reads them
// back as one), so "" -> " in every value. A quoted multi-line value (P6
// Web's clndr_data) also loses its wrapping quotes. A lone " (hand-made and
// converter files, e.g. `6" drain`) is kept as written.
function splitRow(raw) {
  const parts = raw.split("\t");
  if (!raw.includes('"')) return parts;
  const out = [];
  for (let k = 0; k < parts.length; k++) {
    let v = parts[k];
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"') && v.includes("\n")) v = v.slice(1, -1);
    if (v.includes('""')) v = v.replace(/""/g, '"');
    out.push(v);
  }
  return out;
}

// "2021-03-12 08:00" -> minutes since 1970-01-01 00:00, read as wall-clock
// time (no time zone: P6 dates are local to the project). "" -> null.
export function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s.trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000;
}

export function formatDate(min) {
  if (min === null || min === undefined || !Number.isFinite(min)) return "";
  const d = new Date(min * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// A number field as a number, or null when it is blank or does not read as a
// finite number ("NaN", "inf", "1e999999", text): hand-made and converter files
// carry all of these, and a NaN lag or duration would otherwise run a date
// calculation forever.
export const num = (s) => {
  if (s === undefined || s === null || String(s).trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// xerText(xer) -> XER text: the inverse of parseXer for the tables it holds
// (fields in first-seen order, CRLF line ends, %E at the end), so a schedule
// built or statused in code (status.mjs) can be saved and read back by P6 or
// by this tool's CLI. A " in any value is written "", as P6 writes it, and a
// value holding a line break (P6 Web's clndr_data) is also wrapped in quotes,
// as P6 Web writes it; tabs are not escaped, as P6 itself does not.
export function xerText(xer) {
  const L = [`ERMHDR\t${xer.version || "20.12"}\t${xer.exportDate || "2026-01-01"}\tProject\tadmin\tadmin\tdbxDatabaseNoName\tProject Management\tUSD`];
  for (const [name, rows] of Object.entries(xer.tables)) {
    const fields = [];
    for (const r of rows) for (const k of Object.keys(r)) if (!fields.includes(k)) fields.push(k);
    L.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    const cell = (v) => {
      const t = v === null || v === undefined ? "" : String(v).replace(/"/g, '""');
      return /[\r\n]/.test(t) ? `"${t}"` : t;
    };
    for (const r of rows) L.push(`%R\t${fields.map((f) => cell(r[f])).join("\t")}`);
  }
  L.push("%E");
  return L.join("\r\n") + "\r\n";
}
