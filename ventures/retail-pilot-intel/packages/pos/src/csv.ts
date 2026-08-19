/**
 * Minimal RFC 4180-ish CSV parser: handles quoted fields (with embedded
 * commas, escaped "" quotes, and embedded newlines) without a dependency.
 * Not a full CSV spec implementation — enough for POS export files, which
 * are simple flat tables.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // swallow; \r\n line endings are handled by the following \n
    } else {
      field += char;
    }
  }

  // Trailing field/row without a final newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parses a CSV with a header row into an array of header->value records. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }
  const [header, ...rest] = rows;
  return rest.map((cols) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key.trim()] = (cols[index] ?? "").trim();
    });
    return record;
  });
}
