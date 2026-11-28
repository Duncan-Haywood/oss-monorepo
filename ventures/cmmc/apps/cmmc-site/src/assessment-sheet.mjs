// Free CMMC Level 2 self-assessment workbook (.xlsx), built with the site (nothing committed): one row
// per NIST SP 800-171 Rev. 2 requirement with its points and POA&M rule, a Status list, the SPRS score
// worked out live on the Score sheet, and the columns apps/cmmc's "Import from a spreadsheet" reads
// (requirement id, Status, Owner, Implementation statement, Notes), so a shop that starts in Excel
// moves into the workspace without retyping 110 rows.
//
// Data and rules come from the same code the SPRS calculator and the POA&M page use (sprs.mjs,
// poam-rules.mjs, both reading apps/cmmc's official-text.json): start at 110, subtract each open
// requirement's points; 3.5.3 and 3.13.11 subtract 3 on their partial credit; no score without
// 3.12.4; Conditional Level 2 (Self) needs at least 88 with only POA&M-eligible items open
// (32 CFR 170.21(a)(2)). test/assessment-sheet.test.mjs recalculates the workbook in LibreOffice and
// checks it against sprs.mjs's score(); apps/cmmc/test/unit/assessment-sheet-import.test.ts reads it
// with the app's own importer.
import { crc32, deflateRawSync } from "node:zlib";
import { level2Requirements } from "./level2-requirements.mjs";
import { SHORT_NAME } from "./site.mjs";
import { CONDITIONAL_MIN_SCORE, FAMILIES, MAX_SCORE, PARTIAL, SSP_ID } from "./sprs.mjs";

export const SHEET_PATH = "/cmmc-self-assessment-spreadsheet";
export const SHEET_FILE = "cmmc-level-2-self-assessment.xlsx";

/** The Status list. Every phrase is one apps/cmmc's importer reads (csv-import.ts STATUS_PHRASES). */
export const STATUSES = ["Not assessed", "Met", "Not met", "Partially met", "Not applicable"];
/** Status phrase -> the app's ImplementationStatus, for the import test and the Read me. */
export const STATUS_TO_APP = {
  "Not assessed": "not_assessed",
  Met: "implemented",
  "Not met": "not_implemented",
  "Partially met": "partially_implemented",
  "Not applicable": "not_applicable",
};

/**
 * Columns, in order. `imported`: the app's import reads it. Headers avoid the words the importer's
 * header hints look for (status, owner, notes, statement and their synonyms) except on the column
 * meant for that field, so each lands where it should.
 */
export const COLUMNS = [
  {
    key: "id",
    header: "CMMC ID",
    width: 16,
    imported: true,
    about:
      "The requirement's CMMC identifier (family, level, NIST SP 800-171 number). The import finds the requirements by this column.",
  },
  {
    key: "family",
    header: "Family",
    width: 9,
    imported: false,
    about: "The family code (AC, AT, AU and so on); the Score sheet adds points lost by family.",
  },
  {
    key: "text",
    header: "Security requirement",
    width: 60,
    imported: false,
    about: "The requirement word for word from NIST SP 800-171 Rev. 2.",
  },
  {
    key: "kind",
    header: "Type",
    width: 9,
    imported: false,
    about: "Basic or derived, as NIST SP 800-171 classes it.",
  },
  {
    key: "points",
    header: "Points",
    width: 8,
    imported: false,
    about:
      "What the requirement subtracts from 110 when it is not met (DoD Assessment Methodology). 3.12.4 has none, but without it no score exists.",
  },
  {
    key: "poam",
    header: "POA&M rule",
    width: 30,
    imported: false,
    about:
      "Whether an open requirement may sit on a POA&M for Conditional Level 2 (Self), 32 CFR 170.21(a)(2).",
  },
  {
    key: "status",
    header: "Status",
    width: 15,
    imported: true,
    input: true,
    about: `Pick one: ${STATUSES.join(", ")}. A requirement is Met only when every one of its assessment objectives is met (32 CFR 170.24(b)). A blank or Not assessed row counts as not met in the score, as it would in an assessment.`,
  },
  {
    key: "partial",
    header: "Partial credit",
    width: 12,
    imported: false,
    input: true,
    about: `Only for 3.5.3 and 3.13.11, with Status "Partially met": Yes when ${PARTIAL["3.5.3"]} (3.5.3) or ${PARTIAL["3.13.11"]} (3.13.11). It then subtracts 3 instead of 5. Set it in the workspace after an import; the import does not read it.`,
  },
  {
    key: "lost",
    header: "Points lost",
    width: 10,
    imported: false,
    about: "Worked out: 0 when Met or Not applicable, 3 on a partial credit, else the full points.",
  },
  {
    key: "block",
    header: "Must close first",
    width: 13,
    imported: false,
    about:
      "Worked out: Yes when the requirement is open and may not sit on a POA&M, so it has to be met before a Conditional Level 2 (Self) status.",
  },
  {
    key: "owner",
    header: "Owner",
    width: 26,
    imported: true,
    input: true,
    about:
      "Who is responsible, as an email address. The import assigns the requirement to the workspace member with that address.",
  },
  {
    key: "statement",
    header: "Implementation statement",
    width: 50,
    imported: true,
    input: true,
    about:
      "How your shop meets the requirement, in your own words. This is what the system security plan says for it.",
  },
  {
    key: "notes",
    header: "Notes",
    width: 40,
    imported: true,
    input: true,
    about: "Anything else: what is left to do, where the evidence is kept.",
  },
];

const letter = (i) => String.fromCharCode(65 + i);
export const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, letter(i)]));
export const FIRST = 2; // row 1 is the header, so the sheet saves as a clean CSV
const ASSESS = "Assessment";

const POAM_TEXT = {
  yes: "Yes, 1 point",
  partial: "Only on partial credit (not FIPS-validated)",
  no: "No: must be met",
  never: "Never (32 CFR 170.21(a)(2)(iii))",
};

export const xml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// Style ids, in cellXfs order (STYLES below).
export const S = {
  text: 0,
  title: 1,
  head: 2,
  wrap: 3,
  input: 4,
  inputWrap: 5,
  int: 6,
  bold: 7,
  big: 8,
  note: 9,
  date: 10,
  inputDate: 11,
};

export function cell(ref, v, style = S.text) {
  if (v == null || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === "object" && v.f) return `<c r="${ref}" s="${style}"><f>${xml(v.f)}</f></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
export const row = (r, cells) => `<row r="${r}">${cells.join("")}</row>`;

/** Requirements in sheet order, each with its row number. */
export function sheetRows() {
  return level2Requirements().map((r, i) => ({ ...r, row: FIRST + i }));
}
export const LAST = FIRST + sheetRows().length - 1;
const rng = (key) => `${ASSESS}!$${COL[key]}$${FIRST}:$${COL[key]}$${LAST}`;

function rowFormulas(r) {
  const c = (k) => `${COL[k]}${r.row}`;
  const met = `OR(${c("status")}="Met",${c("status")}="Not applicable")`;
  const partialOk = `AND(${c("status")}="Partially met",${c("partial")}="Yes")`;
  const hasPartial = Object.hasOwn(PARTIAL, r.nistId);
  const lost = hasPartial
    ? `IF(${met},0,IF(${partialOk},MIN(3,${c("points")}),${c("points")}))`
    : `IF(${met},0,${c("points")})`;
  let block;
  if (r.poam.status === "yes") block = `""`;
  else if (r.poam.status === "partial") block = `IF(OR(${met},${partialOk}),"","Yes")`;
  else block = `IF(${met},"","Yes")`;
  return { lost, block: block === `""` ? null : block };
}

function assessmentSheet(filled = {}) {
  const rows = [
    row(
      1,
      COLUMNS.map((c, i) => cell(`${letter(i)}1`, c.header, S.head)),
    ),
  ];
  for (const r of sheetRows()) {
    const f = rowFormulas(r);
    const own = Object.hasOwn(filled, r.nistId) ? filled[r.nistId] : {};
    const v = {
      id: r.code,
      family: r.family,
      text: r.text,
      kind: r.kind === "basic" ? "Basic" : "Derived",
      points: r.weight,
      poam: POAM_TEXT[r.poam.status] ?? "",
      status: own.status ?? "",
      partial: own.partial ?? "",
      lost: { f: f.lost },
      block: f.block ? { f: f.block } : "",
      owner: own.owner ?? "",
      statement: own.statement ?? "",
      notes: own.notes ?? "",
    };
    rows.push(
      row(
        r.row,
        COLUMNS.map((col, i) => {
          const style =
            col.key === "text"
              ? S.wrap
              : col.key === "statement" || col.key === "notes"
                ? S.inputWrap
                : col.key === "partial" && !Object.hasOwn(PARTIAL, r.nistId)
                  ? S.text
                  : col.input
                    ? S.input
                    : col.key === "points" || col.key === "lost"
                      ? S.int
                      : S.text;
          return cell(`${letter(i)}${r.row}`, v[col.key], style);
        }),
      ),
    );
  }
  const partialRows = sheetRows()
    .filter((r) => Object.hasOwn(PARTIAL, r.nistId))
    .map((r) => `${COL.partial}${r.row}`)
    .join(" ");
  const validation = `<dataValidations count="2"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Status" error="Pick one from the list: ${STATUSES.join(", ")}." sqref="${COL.status}${FIRST}:${COL.status}${LAST}"><formula1>"${STATUSES.join(",")}"</formula1></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Partial credit" error="Yes or blank." sqref="${partialRows}"><formula1>"Yes"</formula1></dataValidation></dataValidations>`;
  const cols = COLUMNS.map(
    (c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`,
  ).join("");
  return sheetXml(
    rows,
    cols,
    `<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>`,
    { autoFilter: `A1:${letter(COLUMNS.length - 1)}${LAST}`, validation },
  );
}

/** Score sheet lines: [label, formula or value, style]. Row numbers are fixed so tests can read them. */
export function scoreLines() {
  const st = rng("status");
  const sspRow = sheetRows().find((r) => r.nistId === SSP_ID)?.row;
  const ssp = `${ASSESS}!$${COL.status}$${sspRow}`;
  const total = sheetRows().length;
  const lines = [
    ["CMMC Level 2 self-assessment: score", "", S.title],
    ["", "", S.text],
    [
      "SPRS score (out of 110)",
      {
        f: `IF(OR(${ssp}="Met",${ssp}="Not applicable"),${MAX_SCORE}-SUM(${rng("lost")}),"No score: ${SSP_ID} (system security plan) is not met")`,
      },
      S.big,
    ],
    ["Requirements", total, S.int],
    ["Met", { f: `COUNTIF(${st},"Met")` }, S.int],
    ["Not applicable", { f: `COUNTIF(${st},"Not applicable")` }, S.int],
    ["Not met", { f: `COUNTIF(${st},"Not met")` }, S.int],
    ["Partially met", { f: `COUNTIF(${st},"Partially met")` }, S.int],
    [
      "Not assessed yet (scored as not met)",
      {
        f: `${total}-COUNTIF(${st},"Met")-COUNTIF(${st},"Not applicable")-COUNTIF(${st},"Not met")-COUNTIF(${st},"Partially met")`,
      },
      S.int,
    ],
    [
      "Open requirements that must be met first (not POA&M-eligible)",
      { f: `COUNTIF(${rng("block")},"Yes")` },
      S.int,
    ],
    [
      "Status this would support",
      {
        f: `IF(NOT(ISNUMBER(B3)),"None yet: no score without ${SSP_ID}",IF(B3=${MAX_SCORE},"Final Level 2 (Self): every requirement met",IF(AND(B3>=${CONDITIONAL_MIN_SCORE},B10=0),"Conditional Level 2 (Self): put the open items on a POA&M and close them within 180 days","Neither yet: needs a score of at least ${CONDITIONAL_MIN_SCORE} and every open item POA&M-eligible")))`,
      },
      S.bold,
    ],
    ["", "", S.text],
    ["Points lost by family", "", S.bold],
  ];
  for (const [, code, name] of FAMILIES)
    lines.push([
      `${name} (${code})`,
      { f: `SUMIF(${rng("family")},"${code}",${rng("lost")})` },
      S.int,
    ]);
  lines.push(
    ["", "", S.text],
    [
      "The score and status follow the DoD Assessment Methodology and 32 CFR 170.21 and 170.24. Your senior official decides what is met and affirms it in SPRS; this sheet does not submit anything. Not legal advice.",
      "",
      S.note,
    ],
  );
  return lines;
}
export const SCORE_CELL = "B3";
export const STATUS_CELL = "B11";
export const MUST_CLOSE_CELL = "B10";

function scoreSheet() {
  const rows = scoreLines().map(([label, value, style], i) =>
    row(i + 1, [
      cell(`A${i + 1}`, label, i === 0 ? S.title : style === S.note ? S.note : S.bold),
      cell(`B${i + 1}`, value, style === S.note || i === 0 ? S.text : style),
    ]),
  );
  return sheetXml(
    rows,
    `<col min="1" max="1" width="62" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/>`,
    "",
    {},
  );
}

export const READ_ME = [
  "CMMC Level 2 self-assessment spreadsheet: how to use it",
  "One row per NIST SP 800-171 Rev. 2 requirement, all 110. Shaded cells are yours to fill in; Points lost and Must close first are worked out, and the Score sheet keeps the SPRS score current.",
  "Status: Met only when every assessment objective under the requirement is met, with evidence in final form (32 CFR 170.24(b)). The objectives are listed at https://marisstella.app/cmmc/cmmc-level-2-requirements. Not applicable counts as met.",
  "Partial credit: only 3.5.3 (multi-factor authentication) and 3.13.11 (FIPS-validated encryption) have one. Set Status to Partially met and Partial credit to Yes when it applies; the requirement then subtracts 3 instead of 5.",
  "The score: 110 minus the points lost. Without the system security plan (3.12.4) met there is no score. A Conditional Level 2 (Self) status needs at least 88 with every open item allowed on a POA&M, closed out within 180 days (32 CFR 170.21).",
  "Moving to the Compliance Workspace: on its Controls page choose Import from a spreadsheet and pick this file. It reads CMMC ID, Status, Owner (an email address of a workspace member), Implementation statement and Notes from the Assessment sheet, shows a preview of what changes, and only then applies it. Partial credit is set in the workspace.",
  "This is general information, not legal advice. Your senior official decides what is met and affirms it in SPRS. Not affiliated with or endorsed by the DoD or the Cyber AB. Free template from https://marisstella.app/cmmc/cmmc-self-assessment-spreadsheet",
];

function readMeSheet() {
  const rows = READ_ME.map((t, i) =>
    row(i + 1, [cell(`A${i + 1}`, t, i === 0 ? S.title : S.wrap)]),
  );
  const at = READ_ME.length + 2;
  rows.push(row(at, [cell(`A${at}`, "Columns of the Assessment sheet", S.bold)]));
  COLUMNS.forEach((c, i) => {
    const r = at + 1 + i;
    rows.push(
      row(r, [cell(`A${r}`, `${c.header}${c.imported ? " (imported)" : ""}: ${c.about}`, S.wrap)]),
    );
  });
  return sheetXml(rows, `<col min="1" max="1" width="140" customWidth="1"/>`, "", {});
}

export function sheetXml(rows, cols, pane, { autoFilter, validation } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ""}${validation ?? ""}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

export const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF4A4F5C"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4E9F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D4DC"/></left><right style="thin"><color rgb="FFD0D4DC"/></right><top style="thin"><color rgb="FFD0D4DC"/></top><bottom style="thin"><color rgb="FFD0D4DC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left"/></xf><xf numFmtId="14" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export const SHEETS = [ASSESS, "Score", "Read me"];
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${SHEETS.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${SHEETS.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${ASSESS}!$A$1:$${letter(COLUMNS.length - 1)}$${LAST}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${SHEETS.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${SHEETS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Minimal zip writer (the same as seller-books-site's): deflated entries, DOS date 1980-01-01 00:00.
export function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw, { level: 9 });
    const fname = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(fname.length, 26);
    local.push(h, fname, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(fname.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

/**
 * The workbook as bytes. `filled` (tests): NIST id -> { status, partial, owner, statement, notes };
 * the published template is blank.
 */
export function buildWorkbook({ filled = {} } = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", assessmentSheet(filled)],
    ["xl/worksheets/sheet2.xml", scoreSheet()],
    ["xl/worksheets/sheet3.xml", readMeSheet()],
  ]);
}

// ---- the page ----

/**
 * @param {{ cite: (id: string, text?: string) => string, statusBox: () => string,
 *   sourcesList: (ids: string[]) => string, cta: string, paidOn: boolean }} h helpers from pages.mjs
 * @returns {import("./pages.mjs").Page}
 */
export function assessmentSheetPage({ cite, statusBox, sourcesList, cta, paidOn }) {
  const rows = sheetRows();
  const never = rows.filter((r) => r.poam.status === "never").length;
  const onePoint = rows.filter((r) => r.poam.status === "yes").length;
  const imported = COLUMNS.filter((c) => c.imported).map((c) => c.header);
  const faq = [
    {
      q: "Is there a free NIST SP 800-171 self-assessment template?",
      a: `Yes: this workbook has all ${rows.length} NIST SP 800-171 Rev. 2 requirements, the point values of the DoD Assessment Methodology and the CMMC POA&M rule for each, and works out your SPRS score as you fill in the Status column. It is free and needs no sign-up.`,
    },
    {
      q: "Does the spreadsheet work in Google Sheets and LibreOffice?",
      a: "It is a plain .xlsx with ordinary formulas (IF, SUM, COUNTIF, SUMIF), so it opens in Excel, Google Sheets, LibreOffice and Numbers. We test it by recalculating it in LibreOffice against the free SPRS calculator.",
    },
    {
      q: "What does a blank row count as?",
      a: "Not met. A requirement you have not assessed yet scores as not met, as it would in an assessment, so the score only rises as you check requirements. The Score sheet counts how many are still not assessed.",
    },
    {
      q: "Is this the System Security Plan?",
      a: "No. It is the self-assessment worksheet. The Implementation statement column holds the words an SSP gives for each requirement, but an SSP also describes the system boundary, the environment and how systems connect (NIST SP 800-171 3.12.4). The workspace builds the SSP from these statements and your answers about the shop.",
    },
    {
      q: "Can I move the sheet into the workspace later?",
      a: `Yes. Its Import from a spreadsheet reads ${imported.join(", ")} from the Assessment sheet, shows what would change and applies it only when you confirm. Recording Level 2 requirements needs the Level 2 plan${paidOn ? "" : ", which is not on sale yet; the free Level 1 plan can read all 110 meanwhile"}.`,
    },
  ];
  return {
    path: SHEET_PATH,
    kind: "faq",
    title: `Free CMMC Level 2 self-assessment spreadsheet (.xlsx) · ${SHORT_NAME}`,
    description: `Free Excel workbook: all ${rows.length} NIST SP 800-171 requirements with points and POA&M rule, an SPRS score that updates as you go, ready to import.`,
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>Free CMMC Level 2 self-assessment spreadsheet</h1>
<p class="lead">One workbook for a NIST SP 800-171 self-assessment: all ${rows.length} requirements word for word, each with its point
value from the ${cite("dod-methodology", "DoD Assessment Methodology")} and whether an open one may go on a POA&amp;M
(${cite("cfr-170-21", "32 CFR 170.21")}). Mark each requirement and the Score sheet keeps your SPRS score and the status it
supports current. No sign-up, no macros.</p>
<p class="cta"><a class="button" href="/${SHEET_FILE}" download>Download the spreadsheet (.xlsx)</a>
<span class="muted">Excel, Google Sheets, LibreOffice or Numbers.</span></p>
${statusBox()}
<h2>What is in it</h2>
<ul>
  <li><strong>Assessment sheet:</strong> ${rows.length} rows, one per requirement (CMMC ID, family, requirement text, basic or derived,
  points, POA&amp;M rule), and your columns: Status (${STATUSES.join(", ")}), Partial credit for 3.5.3 and 3.13.11, Owner,
  Implementation statement and Notes. Points lost and "Must close first" are worked out per row.</li>
  <li><strong>Score sheet:</strong> the SPRS score out of 110, counts by status, how many open requirements must be met before a
  conditional status, the status the score would support (Final, Conditional or neither) and the points lost in each of the
  ${FAMILIES.length} families.</li>
  <li><strong>Read me:</strong> how to fill it in and what every column means.</li>
</ul>
<h2>The rules it applies</h2>
<ul>
  <li>Start at 110 and subtract 5, 3 or 1 for each requirement not fully met. Not applicable counts as met; a blank or
  Not assessed row counts as not met (${cite("cfr-170-24", "32 CFR 170.24")}).</li>
  <li>Two requirements have partial credit, 3 points instead of 5: 3.5.3 when ${PARTIAL["3.5.3"]}, and 3.13.11 when
  ${PARTIAL["3.13.11"]}.</li>
  <li>No score without the system security plan, ${SSP_ID}: it has no points, but without it the assessment cannot be completed.</li>
  <li>Conditional Level 2 (Self) needs a score of at least ${CONDITIONAL_MIN_SCORE} with every open requirement allowed on a POA&amp;M:
  the ${onePoint} one-point requirements and 3.13.11 on its partial credit, never the ${never} the rule excludes, closed out within
  180 days (<a href="/cmmc-poam-eligible-requirements">which requirements can go on a POA&amp;M</a>; list them in the free
  <a href="/cmmc-poam-template">POA&amp;M template</a>).</li>
</ul>
<p>These are the same rules as the free <a href="/sprs-score-calculator">SPRS score calculator</a>; our tests recalculate the
workbook and check it gives the calculator's score. A requirement is Met only when every assessment objective under it is met,
and the objectives are on the <a href="/cmmc-level-2-requirements">Level 2 requirements page</a>. Level 1 has its own
<a href="/cmmc-level-1-requirements">15 requirements</a>, which the free plan tracks.</p>
<h2>When a spreadsheet stops being enough</h2>
<p>A sheet holds statuses well. It does not keep evidence next to each objective, write the SSP and POA&amp;M, remind you of the
180-day close-out and the annual affirmation, or show who changed what. ${SHORT_NAME} does, and it reads this file: on the
Controls page choose <strong>Import from a spreadsheet</strong>, pick the workbook, check the preview and apply. It reads
${imported.join(", ")}; the Owner is matched to a member by email address. Partial credit is set in the workspace after the import.
Recording Level 2 needs the Level 2 plan${paidOn ? "" : " (not on sale yet; the free Level 1 plan can read all 110 meanwhile)"}.</p>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<p class="muted">General information, not legal advice. Your senior official decides what is met and affirms it in SPRS; the
workbook submits nothing. Not affiliated with or endorsed by the DoD or the Cyber AB.</p>
${sourcesList(["dod-methodology", "cfr-170-21", "cfr-170-24", "nist-800-171r2", "nist-800-171a"])}
${cta}`,
  };
}
