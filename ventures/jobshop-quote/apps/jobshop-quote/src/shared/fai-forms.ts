// First article, part 2b: drafts of AS9102 Form 1 (part number accountability) and Form 2 (product
// accountability: raw material, special processes, functional testing), filled from what the shop
// already has: the RFQ's part, the shop's name, the won quote's PO number and the drawing's text.
//
// Why: Form 3 is where the measuring happens, but a first article report the customer accepts also
// carries Form 1's header (part, revision, drawing, PO, full or partial) and Form 2's list of every
// material and special process the drawing calls up, each with its specification and the
// certificate that proves it. Missing a process from Form 2 (a passivation in note 6, a penetrant
// inspection in the title block) is a common reason a report comes back. The drawing text is
// already read for the quote; this lists each called-up specification so the quality person
// checks the list instead of re-reading the drawing for it.
//
// It reads, never decides. Fields the shop's records cannot know are left blank and say who fills
// them: the serial number, the FAI report number, the supplier code the customer assigned, the
// special process supplier's approval code, the certificate numbers and the signatures. A material
// line with no specification on the drawing is flagged, never given a guessed specification
// (6061-T6 can be bought to several). Classification of a specification as material or process is
// by its family (AMS 2xxx processes, AMS 4xxx-7xxx materials, MIL-A-8625 anodize, ...) and the words
// on its line; a person checks it against the drawing.

import type { Characteristic } from "./fai-characteristics";

export type Form2Kind = "material" | "special process" | "functional test";

export interface Form2Row {
  /** 1, 2, ... in drawing order (material rows first, then processes, then functional tests). */
  no: number;
  kind: Form2Kind;
  /** "6061-T6 Aluminum", "Anodize", "Penetrant inspection". */
  name: string;
  /** The specification as written, normalised: "MIL-A-8625", "AMS 2700", "ASTM B209"; null when the line names none. */
  spec: string | null;
  /** Type, class, grade, condition or method read after the specification: "Type II, Class 2". */
  code: string | null;
  /** The drawing line as written, or the RFQ part field it came from. */
  source: string;
  /** 1-based drawing text line; null for a row from the RFQ part. */
  line: number | null;
  /** What still needs a person, e.g. "no specification on the drawing". */
  check: string | null;
}

export interface Form1Field {
  label: string;
  value: string;
  /** Where the value came from, or who fills it. */
  from: string;
}

export interface FormsDraft {
  form1: Form1Field[];
  form2: Form2Row[];
  /** Drawing standards seen (ASME Y14.5, ISO 2768): not Form 2 rows, listed so nothing looks dropped. */
  standards: string[];
}

export interface FormsInput {
  text: string | null | undefined;
  fileName: string;
  part?: {
    partNumber: string | null;
    revision: string | null;
    description: string | null;
    materialText: string | null;
    finishText: string | null;
  } | null;
  organizationName?: string | null;
  poNumber?: string | null;
  /** The quote the PO came from, e.g. "Q-1042", for the "from" column. */
  quoteLabel?: string | null;
}

const MAX_TEXT = 200_000;
const MAX_ROWS = 200;

// Specification references. Each pattern's match is normalised by `normSpec`.
const SPEC = new RegExp(
  [
    String.raw`\b(?:SAE[\s-]+)?AMS[\s-]?(?:(?:QQ|STD|[A-Z])-[A-Z]?-?\d{2,5}[A-Z]?|\d{4}[A-Z]?)(?:\/\d{1,3})?`,
    String.raw`\bMIL-(?:PRF|DTL|STD|SPEC|HDBK|[A-Z])-\d{2,6}[A-Z]?(?:\/\d{1,3})?`,
    String.raw`\bQQ-[A-Z]-\d{2,4}[A-Z]?`,
    String.raw`\bASTM[\s-]?[A-G]\s?\d{1,4}M?(?:\/[A-G]\d{1,4}M?)?(?![\d.])`,
    String.raw`\bAWS[\s-]?[A-D]\d{1,2}\.\d{1,2}M?`,
    String.raw`\bNAS[\s-]?410\b`,
    String.raw`\b(?:ASME|ANSI)[\s-]?Y14\.\d{1,3}M?(?:[\s-]\d{4})?`,
    String.raw`\bISO[\s-]?(?:2768|1101|8015|286)(?:-\d)?`,
  ].join("|"),
  "gi",
);

/** "ams2700" → "AMS 2700", "mil-a-8625" → "MIL-A-8625", "ASTM-B209" → "ASTM B209". */
export function normSpec(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, " ").trim();
  return s
    .replace(/^SAE[\s-]+/, "")
    .replace(/^AMS[\s-]?(\d)/, "AMS $1")
    .replace(/^AMS[\s-]?(?=[A-Z]{1,3}-)/, "AMS-")
    .replace(/^ASTM[\s-]?([A-G])\s?/, "ASTM $1")
    .replace(/^AWS[\s-]?/, "AWS ")
    .replace(/^NAS[\s-]?/, "NAS ")
    .replace(/^(ASME|ANSI)[\s-]?Y/, "$1 Y")
    .replace(/^ISO[\s-]?/, "ISO ");
}

const isStandard = (spec: string) => /^(?:ASME|ANSI) Y14|^ISO (?:2768|1101|8015|286)/.test(spec);

interface Process {
  name: string;
  words: RegExp;
}

// Process words, the most specific first. "Functional" processes are tests, listed on Form 2's
// functional testing section.
const PROCESSES: Process[] = [
  {
    name: "Penetrant inspection",
    words: /\b(?:FLUORESCENT\s+)?(?:LIQUID\s+)?PENETRANT\b|\bFPI\b/i,
  },
  { name: "Magnetic particle inspection", words: /\bMAG(?:NETIC)?\s*PARTICLE\b|\bMPI\b/i },
  { name: "Radiographic inspection", words: /\bRADIOGRAPH|\bX-RAY\b/i },
  { name: "Ultrasonic inspection", words: /\bULTRASONIC\b/i },
  { name: "Hard anodize", words: /\bHARD\s*(?:COAT|ANODI[ZS])/i },
  { name: "Anodize", words: /\bANODI[ZS]/i },
  {
    name: "Chemical conversion coating",
    words: /\bCHEM(?:ICAL)?\s*FILM\b|\bCONVERSION\s+COAT|\bALODINE\b|\bIRIDITE\b/i,
  },
  { name: "Passivate", words: /\bPASSIVAT/i },
  { name: "Cadmium plate", words: /\bCAD(?:MIUM)?\s+PLAT/i },
  { name: "Electroless nickel plate", words: /\bELECTROLESS\s+NICKEL\b|\bEN\s+PLAT/i },
  { name: "Nickel plate", words: /\bNICKEL\s+PLAT/i },
  { name: "Zinc plate", words: /\bZINC\s+PLAT/i },
  { name: "Chrome plate", words: /\bCHROM(?:E|IUM)\s+PLAT/i },
  { name: "Black oxide", words: /\bBLACK\s+OXIDE\b/i },
  { name: "Shot peen", words: /\bSHOT\s*PEEN/i },
  { name: "Nitride", words: /\bNITRID/i },
  { name: "Carburize", words: /\bCARBURI[ZS]/i },
  {
    name: "Heat treat",
    words: /\bHEAT\s*TREAT|\bH\/T\b|\bSOLUTION\s+TREAT|\bAGE\s+TO\b|\bSTRESS\s+RELIEVE/i,
  },
  { name: "Weld", words: /\bWELD/i },
  { name: "Braze", words: /\bBRAZ(?:E|ING)\b/i },
  { name: "Paint", words: /\bPAINT\b|\bPRIME(?:R)?\b|\bTOPCOAT\b|\bPOWDER\s+COAT/i },
  { name: "Dry film lubricant", words: /\bDRY\s+FILM\s+LUB/i },
  { name: "Plate", words: /\bPLAT(?:E|ED|ING)\b/i },
];

const TESTS: Process[] = [
  { name: "Pressure test", words: /\b(?:HYDRO(?:STATIC)?|PNEUMATIC|PRESSURE)\s+TEST/i },
  { name: "Leak test", words: /\bLEAK\s+TEST|\bHELIUM\s+LEAK/i },
  { name: "Proof test", words: /\bPROOF\s+(?:TEST|LOAD)/i },
  { name: "Torque test", words: /\bTORQUE\s+TEST/i },
  { name: "Hardness test", words: /\bHARDNESS\s+TEST|\bTEST\s+HARDNESS/i },
  { name: "Salt spray test", words: /\bSALT\s+(?:SPRAY|FOG)/i },
  {
    name: "Functional test",
    words: /\bFUNCTIONAL\s+TEST|\bACCEPTANCE\s+TEST\s+PROCEDURE|\bATP\b/i,
  },
];

// What a specification family says when its line has no process word.
const SPEC_PROCESS: [RegExp, string][] = [
  [/^MIL-(?:A|PRF)-8625/, "Anodize"],
  [/^MIL-(?:C|DTL)-5541/, "Chemical conversion coating"],
  [/^AMS 2700|^ASTM A967|^ASTM A380|^QQ-P-35/, "Passivate"],
  [/^(?:AMS-)?QQ-P-416|^AMS 2400|^AMS 2401/, "Cadmium plate"],
  [/^AMS 2404|^AMS 2405|^MIL-(?:C|DTL)-26074|^ASTM B733/, "Electroless nickel plate"],
  [/^(?:AMS-)?QQ-N-290|^AMS 2403/, "Nickel plate"],
  [/^ASTM B633|^(?:AMS-)?QQ-Z-325/, "Zinc plate"],
  [/^(?:AMS-)?QQ-C-320|^AMS 2406|^AMS 2460/, "Chrome plate"],
  [/^MIL-(?:C|DTL)-13924|^AMS 2485/, "Black oxide"],
  [/^AMS 2430|^AMS 2432|^AMS-S-13165|^MIL-S-13165/, "Shot peen"],
  [/^AMS 2759|^AMS-H-6875|^MIL-H-6875|^AMS 2770|^AMS-H-6088|^AMS 2774/, "Heat treat"],
  [/^ASTM E1417|^AMS 2644|^MIL-STD-6866/, "Penetrant inspection"],
  [/^ASTM E1444|^ASTM E709|^MIL-STD-1949/, "Magnetic particle inspection"],
  [/^ASTM E1742|^ASTM E94/, "Radiographic inspection"],
  [/^AMS-STD-2154|^MIL-STD-2154|^ASTM E2375|^AMS 2631/, "Ultrasonic inspection"],
  [/^AWS D17\.1|^AMS-STD-1595|^AWS D1\./, "Weld"],
  [/^AWS C3\.|^AMS 2664|^AMS 2665/, "Braze"],
  [/^MIL-PRF-23377|^MIL-PRF-85582|^MIL-PRF-85285|^MIL-DTL-53039|^MIL-PRF-22750/, "Paint"],
  [/^MIL-PRF-46010|^AS5272|^MIL-L-46010/, "Dry film lubricant"],
  [/^ASTM B117/, "Salt spray test"],
  [/^ASTM E18|^ASTM E10\b|^ASTM E384/, "Hardness test"],
  [/^NAS 410|^MIL-STD-410/, "NDT personnel qualification"],
];

/** Material specs: AMS 3xxx non-metallics, AMS 4xxx-7xxx metals, ASTM A/B products, QQ-A/QQ-S. */
function isMaterialSpec(spec: string): boolean {
  if (/^AMS [3-7]\d{3}/.test(spec)) return true;
  if (/^(?:AMS-)?QQ-[AS]-/.test(spec)) return true;
  if (/^ASTM [AB]/.test(spec)) return !SPEC_PROCESS.some(([re]) => re.test(spec));
  return false;
}

const CODE =
  /\b(TYPE|TY|CLASS|CL|GRADE|GR|COND(?:ITION)?|METHOD|LEVEL|FORM|COMPOSITION|SENSITIVITY)\b(?:\s*[.:]\s*|\s+)(I{1,3}|IV|VI{0,3}|IX|X|[A-Z]?\d{1,3}[A-Z]?|[A-Z])\b/gi;
const CODE_WORD: Record<string, string> = {
  TY: "Type",
  CL: "Class",
  GR: "Grade",
  COND: "Condition",
};

/** Type, class, grade ... read after `from` on the line: "TYPE II CLASS 2" → "Type II, Class 2". */
export function readCode(line: string, from = 0, to = line.length): string | null {
  const out: string[] = [];
  for (const m of line.slice(from, to).matchAll(CODE)) {
    const w = (m[1] ?? "").toUpperCase();
    const word = CODE_WORD[w] ?? w.charAt(0) + w.slice(1).toLowerCase();
    out.push(`${word} ${(m[2] ?? "").toUpperCase()}`);
    if (out.length >= 4) break;
  }
  return out.length ? out.join(", ") : null;
}

const MATERIAL_LINE = /^\s*(?:MAT(?:ERIA)?L|MATERIAL|STOCK)\b\.?\s*[:-]\s*(\S.*)$/i;
const NOTE_PREFIX = /^\s*(?:NOTE\s*)?\d{1,2}\s*[.)]\s+/i;

const tidy = (s: string) =>
  s
    .replace(/[−‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)([a-z])\b/gi, (_, d, l) => `${d}${l.toUpperCase()}`);
}

/** The material's name from a MATERIAL line, with the specification and "PER" removed. */
function materialName(rest: string): string {
  const s = tidy(rest.replace(SPEC, " ").replace(CODE, " "))
    .replace(/\b(?:PER|TO|IAW|IN ACCORDANCE WITH|SPEC(?:IFICATION)?)\b\.?/gi, " ")
    .replace(/[,;:/\s]+$/g, "")
    .replace(/^[,;:/\s]+/g, "")
    .replace(/\s+/g, " ");
  return s ? titleCase(s).slice(0, 120) : "Material";
}

function firstMatch(list: Process[], line: string): string | null {
  for (const p of list) if (p.words.test(line)) return p.name;
  return null;
}

/** Every process a spec-less line names ("BLACK ANODIZE, THEN PASSIVATE"), the general name dropped
 * when a specific one matched (Hard anodize over Anodize, Zinc plate over Plate). */
function allMatches(list: Process[], line: string): string[] {
  const names = list.filter((p) => p.words.test(line)).map((p) => p.name);
  const has = (n: string) => names.includes(n);
  return names.filter(
    (n) =>
      !(n === "Anodize" && has("Hard anodize")) &&
      !(n === "Nickel plate" && has("Electroless nickel plate")) &&
      !(n === "Plate" && names.some((x) => x !== "Plate" && x.endsWith(" plate"))),
  );
}

function processForSpec(spec: string): string | null {
  for (const [re, name] of SPEC_PROCESS) if (re.test(spec)) return name;
  return null;
}

const stockFree = (name: string | null) => (name === "Plate" ? null : name);

const TEST_NAMES = new Set(TESTS.map((t) => t.name));

/** The drawing number and revision written in the title block ("DWG NO: BRK-1001 REV B"). */
export function readDrawingNumber(text: string): {
  number: string | null;
  revision: string | null;
} {
  let number: string | null = null;
  let revision: string | null = null;
  for (const raw of text.slice(0, MAX_TEXT).split(/\r?\n/)) {
    const line = tidy(raw);
    if (!number) {
      const m =
        /\b(?:DWG|DRAWING)\s*(?:NO|NUMBER|#)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{1,40})/i.exec(line);
      if (m?.[1] && /\d/.test(m[1])) {
        number = m[1].toUpperCase();
        const r = /\bREV(?:ISION)?\.?\s*[:#]?\s*([A-Z]{1,2}|\d{1,3}|[A-Z]\d{1,2})\b/i.exec(
          line.slice((m.index ?? 0) + m[0].length),
        );
        if (r?.[1]) revision = r[1].toUpperCase();
      }
    }
    if (!revision) {
      const r =
        /^\s*REV(?:ISION)?(?:\s+LEVEL)?\.?\s*[:#]\s*([A-Z]{1,2}|\d{1,3}|[A-Z]\d{1,2})\s*$/i.exec(
          line,
        );
      if (r?.[1]) revision = r[1].toUpperCase();
    }
    if (number && revision) break;
  }
  return { number, revision };
}

/** The Form 2 rows a drawing's text calls up, in drawing order. */
export function readForm2(text: string | null | undefined): {
  rows: Omit<Form2Row, "no">[];
  standards: string[];
} {
  const rows: Omit<Form2Row, "no">[] = [];
  const standards = new Set<string>();
  const seen = new Set<string>();
  const push = (r: Omit<Form2Row, "no">) => {
    const key = `${r.kind}|${r.name}|${r.spec ?? ""}|${r.code ?? ""}`;
    if (seen.has(key) || rows.length >= MAX_ROWS) return;
    seen.add(key);
    rows.push(r);
  };
  const lines = (text ?? "").slice(0, MAX_TEXT).split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = tidy(raw);
    if (!line) return;
    const lineNo = i + 1;
    const specs = [...line.matchAll(SPEC)].map((m) => ({
      spec: normSpec(m[0]),
      at: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    }));
    for (const s of specs) if (isStandard(s.spec)) standards.add(s.spec);
    const called = specs
      .filter((s) => !isStandard(s.spec))
      .map((s) => ({ ...s, to: specs.find((x) => x.at > s.at)?.at ?? line.length }));

    const mat = MATERIAL_LINE.exec(line);
    if (mat?.[1]) {
      const name = materialName(mat[1]);
      const matSpecs = called.filter((s) => !processForSpec(s.spec) || isMaterialSpec(s.spec));
      if (!matSpecs.length) {
        push({
          kind: "material",
          name,
          spec: null,
          code: null,
          source: line,
          line: lineNo,
          check: "no specification on the drawing: take it from the PO or the mill certificate",
        });
      }
      for (const s of matSpecs) {
        push({
          kind: "material",
          name,
          spec: s.spec,
          code: readCode(line, s.end, s.to),
          source: line,
          line: lineNo,
          check: null,
        });
      }
      // A process called up on the material line ("6061-T6 PER AMS 4027, ANODIZE PER MIL-A-8625")
      // falls through to the process reading below with only those specs.
      const rest = called.filter((s) => !matSpecs.includes(s));
      if (!rest.length && !stockFree(firstMatch(PROCESSES, mat[1].replace(SPEC, " ")))) return;
      readProcesses(line, lineNo, rest, line, push, true);
      return;
    }
    readProcesses(line, lineNo, called, line, push, false);
  });
  // Materials first, then processes, then tests, each in drawing order (Form 2's own order).
  const order: Form2Kind[] = ["material", "special process", "functional test"];
  rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return { rows, standards: [...standards] };
}

function readProcesses(
  line: string,
  lineNo: number,
  specs: { spec: string; at: number; end: number; to: number }[],
  source: string,
  push: (r: Omit<Form2Row, "no">) => void,
  onMaterialLine: boolean,
) {
  const bare = line.replace(SPEC, " ");
  // "ALUMINUM PLATE" on the material line is the stock's form, not plating.
  const word = onMaterialLine
    ? stockFree(firstMatch(PROCESSES, bare))
    : firstMatch(PROCESSES, bare);
  const test = firstMatch(TESTS, bare);
  const kindOf = (name: string): Form2Kind =>
    TEST_NAMES.has(name) ? "functional test" : "special process";
  if (!specs.length) {
    // A process word with no specification is listed only from a finish, process or note line
    // ("FINISH: BLACK ANODIZE", "4. PASSIVATE"): a bare "PLATE" in a title is not a call-up.
    const callUp =
      onMaterialLine ||
      NOTE_PREFIX.test(line) ||
      /^\s*(?:FINISH|HEAT\s*TREAT(?:MENT)?|PLATING|PLATE|COATING|PAINT|PROCESS|INSPECTION|TEST(?:ING)?)\b\s*[:-]/i.test(
        line,
      ) ||
      Boolean(test);
    if (!callUp) return;
    const names = [...allMatches(TESTS, bare), ...allMatches(PROCESSES, bare)].filter(
      (n) => !onMaterialLine || n !== "Plate",
    );
    for (const name of names) {
      push({
        kind: kindOf(name),
        name,
        spec: null,
        code: readCode(line),
        source,
        line: lineNo,
        check:
          kindOf(name) === "functional test"
            ? "no procedure number on the drawing: ask the customer for it"
            : "no specification on the drawing: ask the customer which one applies",
      });
    }
    return;
  }
  for (const s of specs) {
    if (isMaterialSpec(s.spec) && !onMaterialLine && !word && !test) {
      // A material specification outside the MATERIAL line ("STOCK PER AMS 4027" in a note).
      push({
        kind: "material",
        name: "Material",
        spec: s.spec,
        code: readCode(line, s.end, s.to),
        source,
        line: lineNo,
        check: "named outside the material line: check it is the part's material",
      });
      continue;
    }
    const fromSpec = processForSpec(s.spec);
    // The spec's family wins over the line's first word when both name a process (a line can call
    // up two: "ANODIZE PER MIL-A-8625, SEAL PER ..."); a spec of no known family takes the word.
    const name = fromSpec ?? test ?? word;
    if (!name) {
      push({
        kind: "special process",
        name: "Specification",
        spec: s.spec,
        code: readCode(line, s.end, s.to),
        source,
        line: lineNo,
        check: "named on the drawing without a process word: say what it is",
      });
      continue;
    }
    push({
      kind: kindOf(name),
      name,
      spec: s.spec,
      code: readCode(line, s.end, s.to),
      source,
      line: lineNo,
      check: null,
    });
  }
}

/** Drafts Forms 1 and 2 for one drawing. */
export function draftForms(input: FormsInput): FormsDraft {
  const text = input.text ?? "";
  const part = input.part ?? null;
  const dwg = readDrawingNumber(text);
  const { rows, standards } = readForm2(text);

  // The RFQ part's material and finish fill in what the drawing's text did not call up.
  const extra: Omit<Form2Row, "no">[] = [];
  const mt = part?.materialText?.trim();
  if (mt && !rows.some((r) => r.kind === "material")) {
    const specs = [...mt.matchAll(SPEC)].map((m) => normSpec(m[0]));
    extra.push({
      kind: "material",
      name: materialName(mt),
      spec: specs[0] ?? null,
      code: null,
      source: `RFQ part material: ${tidy(mt).slice(0, 200)}`,
      line: null,
      check: specs.length
        ? "from the RFQ, not the drawing: check it against the drawing"
        : "no specification given: take it from the PO or the mill certificate",
    });
  }
  const ft = part?.finishText?.trim();
  if (ft) {
    const r = readForm2(`FINISH: ${ft}`).rows;
    for (const row of r) {
      if (rows.some((x) => x.name === row.name && (x.spec === row.spec || !row.spec))) continue;
      extra.push({
        ...row,
        source: `RFQ part finish: ${tidy(ft).slice(0, 200)}`,
        line: null,
        check: row.check ?? "from the RFQ, not the drawing: check it against the drawing",
      });
    }
  }
  const order: Form2Kind[] = ["material", "special process", "functional test"];
  const all = [...rows, ...extra].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const form2: Form2Row[] = all.slice(0, MAX_ROWS).map((r, i) => ({ ...r, no: i + 1 }));

  const fill = (value: string | null | undefined, from: string, blank: string): [string, string] =>
    value?.trim() ? [value.trim(), from] : ["", blank];
  const f = (label: string, [value, from]: [string, string]): Form1Field => ({
    label,
    value,
    from,
  });
  const partNo = part?.partNumber ?? null;
  const form1: Form1Field[] = [
    f("Part Number", fill(partNo, "RFQ part", "not matched to an RFQ part: enter it")),
    f("Part Name", fill(part?.description, "RFQ part description", "enter the drawing title")),
    f("Serial Number", ["", "enter the first article's serial or lot number"]),
    f("FAI Report Number", ["", "your report numbering"]),
    f(
      "Part Revision Level",
      fill(
        part?.revision ?? dwg.revision,
        part?.revision ? "RFQ part" : "drawing text",
        "enter it",
      ),
    ),
    f(
      "Drawing Number",
      fill(dwg.number ?? partNo, dwg.number ? "drawing text" : "RFQ part number", "enter it"),
    ),
    f(
      "Drawing Revision Level",
      fill(dwg.revision ?? part?.revision, dwg.revision ? "drawing text" : "RFQ part", "enter it"),
    ),
    f("Additional Changes", ["", "engineering changes not yet on the drawing, if any"]),
    f("Manufacturing Process Reference", ["", "your router or traveler number"]),
    f("Organization Name", fill(input.organizationName, "shop settings", "enter it")),
    f("Supplier Code", ["", "the code the customer assigned you"]),
    f(
      "PO Number",
      fill(
        input.poNumber,
        input.quoteLabel ? `won quote ${input.quoteLabel}` : "won quote",
        "no won quote with a PO number yet",
      ),
    ),
    f("Detail FAI / Assembly FAI", [
      "Detail",
      "one machined part; an assembly lists each part's FAI",
    ]),
    f("Full FAI / Partial FAI", ["Full", "a partial FAI names the baseline part and the reason"]),
    f("Prepared By / Date", ["", "signed by the shop"]),
    f("Reviewed By / Date", ["", "signed by the shop"]),
    f("Customer Approval / Date", ["", "signed by the customer, if required"]),
  ];
  return { form1, form2, standards };
}

function cell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  // Quote every cell that needs it, and defuse spreadsheet formulas (=, +, -, @ at the start).
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const FORM2_COLUMNS = [
  "No.",
  "Material or Process Name",
  "Specification Number",
  "Code",
  "Special Process Supplier Code",
  "Customer Approval Verification",
  "Certificate of Conformance Number",
  "Type",
  "From",
  "Drawing Text Line",
  "Check",
] as const;

export const FORM2_TEST_COLUMNS = [
  "No.",
  "Functional Test",
  "Functional Test Procedure Number",
  "Acceptance Report Number",
  "From",
  "Drawing Text Line",
  "Check",
] as const;

/** Forms 1 and 2 as one CSV: Form 1's fields as rows, then Form 2's material and process table, then its functional tests. */
export function formsCsv(
  d: FormsDraft,
  fileName: string,
  characteristics?: Characteristic[],
): string {
  const out: string[] = [];
  const row = (cells: (string | number | null)[]) => out.push(cells.map(cell).join(","));
  row(["AS9102 Forms 1 and 2 draft"]);
  row(["Read from", fileName]);
  row([
    "Draft",
    "Filled by Job Shop Quote from the RFQ, the shop's settings, the won quote and the drawing's text. Blank fields are ones these records cannot know. Check every Form 2 row against the drawing and its notes, and attach each certificate.",
  ]);
  if (characteristics) {
    const mats = characteristics.filter((c) => c.kind === "material").length;
    row([
      "Form 3",
      `${characteristics.length} characteristics listed (${mats} material or process lines among them)`,
    ]);
  }
  out.push("");
  row(["Form 1: part number accountability"]);
  row(["Field", "Value", "From"]);
  for (const f of d.form1) row([f.label, f.value, f.from]);
  out.push("");
  row(["Form 2: product accountability (raw material, special processes)"]);
  row([...FORM2_COLUMNS]);
  const procs = d.form2.filter((r) => r.kind !== "functional test");
  if (!procs.length) row(["", "None read from the drawing's text: list them from the drawing"]);
  for (const r of procs) {
    row([
      r.no,
      r.name,
      r.spec,
      r.code,
      "",
      "",
      "",
      r.kind === "material" ? "Material" : "Special process",
      r.source,
      r.line,
      r.check,
    ]);
  }
  out.push("");
  row(["Form 2: functional testing"]);
  row([...FORM2_TEST_COLUMNS]);
  const tests = d.form2.filter((r) => r.kind === "functional test");
  if (!tests.length) row(["", "None read from the drawing's text"]);
  for (const r of tests) row([r.no, r.name, r.spec, "", r.source, r.line, r.check]);
  if (d.standards.length) {
    out.push("");
    row(["Drawing standards (not Form 2 rows)", d.standards.join("; ")]);
  }
  return `${out.join("\r\n")}\r\n`;
}
