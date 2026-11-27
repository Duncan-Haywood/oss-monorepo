// Primavera P6 XER reader, ported from the MIT-future xer-schedule-check tool (same author). An XER
// file is tab-separated text: one ERMHDR line, then for each table a `%T name` line, a `%F field...`
// line and `%R value...` rows, ending with `%E`. P6 writes it in the Windows code page of the
// exporting machine (usually Windows-1252), with CRLF line ends.

export interface XerFile {
  version: string | null;
  exportDate: string | null;
  tables: Record<string, Record<string, string>[]>;
  warnings: string[];
}

/** UTF-8 when the bytes are valid UTF-8, else Windows-1252 (what P6 writes on Western machines). */
export function decodeXer(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function quoteCount(s: string): number {
  let n = 0;
  for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 34) n++;
  return n;
}

// P6 writes a double quote inside a value as "", so "" -> " in every value; a quoted multi-line
// value (P6 Web's clndr_data) loses its wrapping quotes; a lone " (`6" drain`) is kept as written.
function splitRow(raw: string): string[] {
  const parts = raw.split("\t");
  if (!raw.includes('"')) return parts;
  return parts.map((part) => {
    let v = part;
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"') && v.includes("\n")) {
      v = v.slice(1, -1);
    }
    return v.includes('""') ? v.replace(/""/g, '"') : v;
  });
}

/** Reads XER text into its tables. Throws when the text has neither an ERMHDR line nor a table. */
export function parseXer(input: string): XerFile {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const lines = text.split(/\r?\n/);
  const out: XerFile = { version: null, exportDate: null, tables: {}, warnings: [] };
  let table: string | null = null;
  let fields: string[] | null = null;
  let sawHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (!line) continue;
    if (line.startsWith("ERMHDR")) {
      const p = line.split("\t");
      out.version = p[1] || null;
      out.exportDate = p[2] || null;
      sawHeader = true;
      continue;
    }
    const tag = line.slice(0, 2);
    if (tag === "%T") {
      table = line.split("\t")[1]?.trim() || null;
      fields = null;
      if (table && !out.tables[table]) out.tables[table] = [];
    } else if (tag === "%F") {
      fields = line
        .split("\t")
        .slice(1)
        .map((f) => f.trim());
    } else if (tag === "%R") {
      if (!table || !fields) {
        out.warnings.push(`line ${i + 1}: a row before its table's field list`);
        continue;
      }
      let raw = line;
      // Only a last value that opens with a quote can run over several lines.
      const tail = raw.slice(raw.lastIndexOf("\t") + 1);
      if (tail.startsWith('"')) {
        let open = quoteCount(tail) % 2 === 1;
        while (open && i + 1 < lines.length && !/^%[TFRE]\t/.test(lines[i + 1] as string)) {
          const next = lines[++i] as string;
          raw += `\n${next}`;
          if (quoteCount(next) % 2 === 1) open = false;
        }
      }
      const vals = splitRow(raw).slice(1);
      const row: Record<string, string> = {};
      for (let k = 0; k < fields.length; k++) row[fields[k] as string] = vals[k] ?? "";
      (out.tables[table] as Record<string, string>[]).push(row);
    } else if (tag === "%E") {
      break;
    }
  }
  if (!sawHeader && Object.keys(out.tables).length === 0) {
    throw new Error("Not a P6 XER file: no ERMHDR line and no %T tables");
  }
  return out;
}
