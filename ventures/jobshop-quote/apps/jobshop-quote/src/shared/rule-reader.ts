// The rule reader: reads an RFQ without an AI model, for a deployment with no Anthropic key (or a shop
// that wants no AI). It produces the same `LlmExtraction` the model does, so the same anti-fabrication
// check (`verifyExtraction`) runs on it, and every value it fills carries the RFQ line it was read
// from as its verbatim quote.
//
// What it reads, and nothing more:
//   - labelled lines ("Part number: BRK-1001 Rev B", "P/N", "Qty: 10, 50, 100", "Material:",
//     "Finish:", "Tolerances:", "Need by 2026-12-18", a drawing's "DWG NO:" and "MATERIAL:");
//   - tables with a header row (tab-separated rows pasted from Excel, Markdown pipe tables from a
//     converted PDF, or columns lined up with two or more spaces): Part / P/N, Rev, Description, Qty,
//     Material, Finish, Due;
//   - a line like "Please quote 25 pcs of BRK-1001 Rev B".
// Attachments (the "--- Attachment: name ---" sections of `rfqSourceText`) fill the blanks of the part
// whose number they carry. Anything else is left for the estimator: a blank field is a question, never
// a guess.
import { datesIn, integersIn, type LlmExtraction, normalize } from "./extraction";

type Field = { value: string | null; quote: string | null };
type Part = LlmExtraction["parts"][number];
type PartField = "partNumber" | "revision" | "description" | "material" | "tolerances" | "finish";

const MAX_QUOTE = 500;
const MAX_PARTS = 50;
const MAX_QTYS = 8;
const none = (): Field => ({ value: null, quote: null });

const field = (value: string | null | undefined, line: string): Field => {
  const v = value?.trim();
  const q = line.trim();
  if (!v || q.length > MAX_QUOTE) return none();
  return { value: v.slice(0, MAX_QUOTE), quote: q };
};

const emptyPart = (): Part => ({
  partNumber: none(),
  revision: none(),
  description: none(),
  material: none(),
  quantities: { values: [], quote: null },
  tolerances: none(),
  finish: none(),
  dueDate: none(),
});

// ---------------------------------------------------------------------------------------------
// Labels

const PN_LABEL = String.raw`(?:part\s*(?:number|num\.?|no\.?|#)|part|p\/n|pn|item\s*(?:number|no\.?|#))`;
const DWG_LABEL = String.raw`(?:dwg|drawing)\s*(?:number|no\.?|#)`;
/** A part number: starts with a letter or digit, carries at least one digit, no spaces. */
const PN_VALUE = String.raw`([A-Za-z0-9][\w\-./]*\d[\w\-./]*|[A-Za-z0-9][\w\-./]*)`;

const PN_LINE = new RegExp(String.raw`^\s*(?:\d+[.)]\s*)?${PN_LABEL}\s*[:#=-]\s*${PN_VALUE}`, "i");
const DWG_LINE = new RegExp(String.raw`^\s*${DWG_LABEL}\s*[:#=-]?\s*${PN_VALUE}`, "i");
const REV = /\brev(?:ision)?\b\.?\s*[:#]?\s*([A-Za-z0-9]{1,3})\b/i;

const LABELS: Record<Exclude<PartField, "partNumber" | "revision">, RegExp> = {
  description: /^\s*(?:description|desc\.?|title|part\s*name)\s*[:=-]\s*(.+)$/i,
  material: /^\s*(?:material|mat'?l\.?|matl\.?)\s*[:=-]\s*(.+)$/i,
  finish:
    /^\s*(?:finish|coating|plating|surface\s*treatment|heat\s*treat(?:ment)?)\s*[:=-]\s*(.+)$/i,
  tolerances: /^\s*(?:(?:general\s*)?tolerances?|unless\s+otherwise\s+specified)\s*[:=-]?\s*(.+)$/i,
};
const QTY_LINE =
  /^\s*(?:qty|qtys|quantity|quantities|qty\.?\s*req(?:uired)?|order\s*qty)\b\.?\s*[:=-]?\s*(.+)$/i;
const DUE_WORDS =
  /\b(?:due|need(?:ed)?\s+by|required\s+by|date\s+required|required\s+date|deliver(?:y|ed)?|ship\s+by|req(?:uired)?\.?\s+date)\b/i;
const INLINE_QTY =
  /\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:pcs?|pieces|ea|each|units)\.?\s+(?:of\s+)?(?:p\/n\s*|part\s*(?:number|no\.?|#)?\s*)?([A-Za-z0-9][\w\-./]*\d[\w\-./]*|[A-Za-z]+-[\w\-./]+)/i;

function quantitiesFrom(text: string): number[] {
  // "(EAU 1,200)" or "annual usage" is a forecast, not a quantity to price.
  const cut = text.split(/\b(?:eau|annual|per\s+year|\/\s*yr)\b/i)[0] ?? text;
  return [...integersIn(cut)].filter((n) => n >= 1 && n <= 1_000_000).slice(0, MAX_QTYS);
}

function dueFrom(line: string): string | null {
  const [first] = datesIn(line);
  return first ?? null;
}

// ---------------------------------------------------------------------------------------------
// Tables

type Column = PartField | "quantities" | "dueDate";

const HEADER_WORDS: [RegExp, Column][] = [
  [
    /^(?:part\s*(?:number|num\.?|no\.?|#)?|p\/?n|item\s*(?:number|no\.?|#)|dwg\s*(?:no\.?|#)?)$/i,
    "partNumber",
  ],
  [/^(?:rev\.?|revision)$/i, "revision"],
  [/^(?:description|desc\.?|part\s*name|title)$/i, "description"],
  [/^(?:qty|qtys|quantity|quantities|qty\.?\s*req(?:uired)?|order\s*qty)\.?$/i, "quantities"],
  [/^(?:material|mat'?l\.?|matl\.?)$/i, "material"],
  [/^(?:finish|coating|plating)$/i, "finish"],
  [/^(?:tolerances?)$/i, "tolerances"],
  [
    /^(?:due(?:\s*date)?|need\s*by|required\s*(?:by|date)|date\s*required|delivery(?:\s*date)?|ship\s*by)$/i,
    "dueDate",
  ],
];

/** Cells of a row, or null when the line is not a row: tabs, pipes, or runs of two-plus spaces. */
function cells(line: string): { cells: string[]; sep: "tab" | "pipe" | "space" } | null {
  if (line.includes("\t")) return { cells: line.split("\t").map((c) => c.trim()), sep: "tab" };
  if (/^\s*\|.*\|\s*$/.test(line) || (line.match(/\|/g)?.length ?? 0) >= 2) {
    const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return { cells: inner.split("|").map((c) => c.trim()), sep: "pipe" };
  }
  const parts = line.trim().split(/\s{2,}/);
  return parts.length >= 2 ? { cells: parts, sep: "space" } : null;
}

const isRule = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

function headerColumns(line: string): { cols: (Column | null)[]; sep: string } | null {
  const row = cells(line);
  if (!row) return null;
  const cols = row.cells.map((c) => HEADER_WORDS.find(([re]) => re.test(c))?.[1] ?? null);
  const known = cols.filter(Boolean);
  // A header names at least two columns, one of them the part or its description, and no twice.
  if (known.length < 2 || new Set(known).size !== known.length) return null;
  if (!cols.includes("partNumber") && !cols.includes("description")) return null;
  return { cols, sep: row.sep };
}

/** Parts read from every table in the lines; the lines a table used are marked in `used`. */
function readTables(lines: string[], used: Set<number>): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = headerColumns(lines[i] ?? "");
    if (!head) continue;
    used.add(i);
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j] ?? "";
      if (isRule(line)) {
        used.add(j);
        continue;
      }
      const row = cells(line);
      if (!row || row.sep !== head.sep) break;
      // Columns lined up with spaces are only trusted when every cell is there.
      if (row.sep === "space" && row.cells.length !== head.cols.length) break;
      if (row.cells.length < 2) break;
      used.add(j);
      const p = emptyPart();
      head.cols.forEach((col, k) => {
        const cell = row.cells[k]?.trim();
        if (!col || !cell) return;
        if (col === "quantities") {
          const values = quantitiesFrom(cell);
          if (values.length > 0 && line.trim().length <= MAX_QUOTE) {
            p.quantities = { values, quote: line.trim() };
          }
        } else if (col === "dueDate") {
          p.dueDate = field(dueFrom(cell), line);
        } else if (col === "partNumber") {
          const pn = /^[A-Za-z0-9][\w\-./]*/.exec(cell)?.[0];
          p.partNumber = field(pn, line);
          const rev = REV.exec(cell);
          if (rev?.[1] && !p.revision.value) p.revision = field(rev[1], line);
        } else {
          p[col] = field(cell, line);
        }
      });
      if (p.partNumber.value || p.description.value) parts.push(p);
    }
    i = j - 1;
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Labelled blocks

function partStart(line: string): { pn: string } | null {
  const m = PN_LINE.exec(line) ?? DWG_LINE.exec(line);
  if (!m?.[1]) return null;
  // "Part: the bracket below" is not a part number: one needs a digit or a dash.
  if (!/\d|-/.test(m[1])) return null;
  return { pn: m[1].replace(/[.,;]+$/, "") };
}

interface Shared {
  material: Field;
  finish: Field;
  tolerances: Field;
  dueDate: Field;
}

/** Fill a part's blank fields from one line. */
function readLine(p: Part, line: string) {
  for (const key of ["description", "material", "finish", "tolerances"] as const) {
    if (p[key].value) continue;
    const m = LABELS[key].exec(line);
    if (m?.[1]) p[key] = field(m[1].replace(/\s+$/, ""), line);
  }
  if (p.quantities.values.length === 0) {
    const q = QTY_LINE.exec(line);
    if (q?.[1]) {
      const values = quantitiesFrom(q[1]);
      if (values.length > 0 && line.trim().length <= MAX_QUOTE) {
        p.quantities = { values, quote: line.trim() };
      }
    }
  }
  if (!p.dueDate.value && DUE_WORDS.test(line)) p.dueDate = field(dueFrom(line), line);
  if (!p.revision.value && /^\s*rev(?:ision)?\b/i.test(line)) {
    const r = REV.exec(line);
    if (r?.[1]) p.revision = field(r[1], line);
  }
}

function readBlocks(
  lines: string[],
  used: Set<number>,
): { parts: Part[]; shared: Shared; loose: Part } {
  const parts: Part[] = [];
  // Lines outside every part block: "Material: 6061-T6 for all parts" above the list.
  const loose = emptyPart();
  let current: Part | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i] ?? "";
    const start = partStart(line);
    if (start) {
      current = emptyPart();
      current.partNumber = field(start.pn, line);
      const rev = REV.exec(line.slice(line.toLowerCase().indexOf(start.pn.toLowerCase())));
      if (rev?.[1]) current.revision = field(rev[1], line);
      parts.push(current);
      // "Part number: BRK-1001 Rev B, qty 25" on one line.
      readLine(current, line.replace(/^.*?\b(?=qty|quantity)/i, ""));
      continue;
    }
    readLine(current ?? loose, line);
  }
  const inline = parts.length === 0 ? inlineParts(lines, used) : [];
  return {
    parts: [...parts, ...inline],
    shared: {
      material: loose.material,
      finish: loose.finish,
      tolerances: loose.tolerances,
      dueDate: loose.dueDate,
    },
    loose,
  };
}

/** "Please quote 25 pcs of BRK-1001 Rev B" (and one such line per part). */
function inlineParts(lines: string[], used: Set<number>): Part[] {
  const out: Part[] = [];
  lines.forEach((line, i) => {
    if (used.has(i)) return;
    const m = INLINE_QTY.exec(line);
    if (!m?.[1] || !m[2]) return;
    const pn = m[2].replace(/[.,;]+$/, "");
    const p = emptyPart();
    p.partNumber = field(pn, line);
    const values = quantitiesFrom(line);
    if (values.length > 0 && line.trim().length <= MAX_QUOTE) {
      p.quantities = { values, quote: line.trim() };
    }
    const rev = REV.exec(line.slice((m.index ?? 0) + m[0].length - m[2].length));
    if (rev?.[1]) p.revision = field(rev[1], line);
    if (DUE_WORDS.test(line)) p.dueDate = field(dueFrom(line), line);
    out.push(p);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sections and merging

const ATTACHMENT = /^--- Attachment: (.*) ---$/;

function splitSections(text: string): string[][] {
  const sections: string[][] = [[]];
  for (const raw of text.split(/\r?\n/)) {
    if (ATTACHMENT.test(raw.trim())) {
      sections.push([]);
      continue;
    }
    if (raw.trim()) sections[sections.length - 1]?.push(raw);
  }
  return sections;
}

function readSection(lines: string[]) {
  const used = new Set<number>();
  const table = readTables(lines, used);
  const blocks = readBlocks(lines, used);
  return { parts: [...table, ...blocks.parts], shared: blocks.shared, loose: blocks.loose };
}

const key = (p: Part) => (p.partNumber.value ? normalize(p.partNumber.value) : null);

function fillBlanks(into: Part, from: Part | Shared) {
  for (const k of [
    "revision",
    "description",
    "material",
    "tolerances",
    "finish",
    "dueDate",
  ] as const) {
    const src = (from as unknown as Record<string, Field | undefined>)[k];
    if (!into[k].value && src?.value) into[k] = src;
  }
  if ("quantities" in from && into.quantities.values.length === 0) {
    if (from.quantities.values.length > 0) into.quantities = from.quantities;
  }
}

/** Read an RFQ (the text `rfqSourceText` builds) by rules. Deterministic; no network, no model. */
export function readRfqByRules(text: string): LlmExtraction {
  const sections = splitSections(text);
  const [body = [], ...attachments] = sections;
  const main = readSection(body);
  const parts: Part[] = [...main.parts];

  for (const lines of attachments) {
    const sec = readSection(lines);
    if (sec.parts.length === 0) {
      // A drawing with no part number of its own describes the RFQ's only part, if there is one.
      if (parts.length === 1 && parts[0]) fillBlanks(parts[0], sec.loose);
      else if (parts.length === 0 && hasContent(sec.loose)) parts.push(sec.loose);
      continue;
    }
    for (const p of sec.parts) {
      // A drawing's own material or finish belongs to the drawing's part.
      if (sec.parts.length === 1) fillBlanks(p, sec.shared);
      const k = key(p);
      const same = k ? parts.find((q) => key(q) === k) : undefined;
      if (same) fillBlanks(same, p);
      else parts.push(p);
    }
  }

  if (parts.length === 0 && hasContent(main.loose)) parts.push(main.loose);
  else for (const p of parts) fillBlanks(p, main.shared);

  const capped = parts.slice(0, MAX_PARTS);
  const missingInfo: string[] = [];
  capped.forEach((p, i) => {
    const label = p.partNumber.value ?? `part ${i + 1}`;
    if (!p.material.value) missingInfo.push(`Material for ${label}`);
    if (p.quantities.values.length === 0) missingInfo.push(`Quantity for ${label}`);
  });
  if (parts.length > MAX_PARTS) missingInfo.push(`Parts after the first ${MAX_PARTS}`);

  return {
    customer: readCustomer(body),
    parts: capped,
    missingInfo: missingInfo.slice(0, 20),
  };
}

function hasContent(p: Part): boolean {
  return (
    p.quantities.values.length > 0 ||
    !!p.material.value ||
    !!p.description.value ||
    !!p.finish.value
  );
}

function readCustomer(lines: string[]): LlmExtraction["customer"] {
  const find = (re: RegExp): Field => {
    for (const line of lines) {
      const m = re.exec(line);
      if (m?.[1]?.trim()) return field(m[1], line);
    }
    return none();
  };
  let email = none();
  for (const line of lines) {
    const m = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(line);
    if (m) {
      email = field(m[0], line);
      break;
    }
  }
  return {
    company: find(/^\s*(?:company|customer|organi[sz]ation)\s*(?:name)?\s*[:-]\s*(.+?)\s*$/i),
    contactName: find(
      /^\s*(?:contact|from|name|buyer|requested\s+by)\s*[:-]\s*([^<@\n]+?)\s*(?:<.*)?$/i,
    ),
    email,
  };
}
