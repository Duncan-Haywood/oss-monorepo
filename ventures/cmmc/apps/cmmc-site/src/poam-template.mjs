// Free CMMC Level 2 POA&M template (.xlsx), built with the site (nothing committed). One row per open
// item: the requirement, the weakness, the remediation plan, milestones, who is responsible, the
// scheduled completion date and Open/Closed, with the columns apps/cmmc's POA&M "Import spreadsheet"
// reads (src/shared/controls/poam-import.ts), so a shop that starts its POA&M in Excel moves into the
// workspace without retyping it.
//
// The sheet checks each item against 32 CFR 170.21(a)(2) as it is typed, from the same rules as the
// POA&M page and the SPRS calculator (poam-rules.mjs poamVerdict, sprs.mjs, both reading apps/cmmc's
// official-text.json): which requirements may sit on a POA&M, the points each open item costs
// (3.13.11 only on its 3-point partial credit), the 88-point floor and the 180-day close-out. The
// requirement lists live on the Rules sheet as "|3.1.1|3.1.2|" strings: no cell there starts with a
// requirement id, so the app's importer (which picks the sheet with the most ids) always picks the
// POA&M sheet. test/poam-template.test.mjs recalculates it in LibreOffice;
// apps/cmmc/test/unit/poam-template-import.test.ts imports it with the app's own reader.
import { cell, row, S, STYLES, sheetXml, xml, zip } from "./assessment-sheet.mjs";
import { POAM_PATH, poamCounts, poamVerdict } from "./poam-rules.mjs";
import { SHORT_NAME } from "./site.mjs";
import { CONDITIONAL_MIN_SCORE, MAX_SCORE, REQUIREMENTS } from "./sprs.mjs";

export const TEMPLATE_PATH = "/cmmc-poam-template";
export const TEMPLATE_FILE = "cmmc-poam-template.xlsx";
export const POAM_SHEET = "POA&M";
export const CLOSE_OUT_DAYS = 180;
/** Blank item rows in the published template (most a Level 2 POA&M can hold open is far fewer). */
export const ITEM_ROWS = 60;
export const FIRST = 2;
export const LAST = FIRST + ITEM_ROWS - 1;

/** Status list: both phrases are ones the app's importer reads (poam-import.ts STATUS). */
export const STATUSES = ["Open", "Closed"];

/**
 * Columns, in order. `imported`: the app's POA&M import reads it (the requirement column by its
 * contents, the rest by header). Headers of the other columns avoid every word the importer's header
 * hints look for, so each imported field lands on its own column.
 */
export const COLUMNS = [
  {
    key: "id",
    header: "Requirement",
    width: 16,
    imported: true,
    input: true,
    about:
      "The requirement left open: its CMMC id (AC.L2-3.1.8) or NIST SP 800-171 number (3.1.8). One requirement can have several rows, one per weakness.",
  },
  {
    key: "weakness",
    header: "Weakness",
    width: 44,
    imported: true,
    input: true,
    about:
      "What is not met yet, specifically: which assessment objective fails and where. Needed for the import.",
  },
  {
    key: "points",
    header: "Points while open",
    width: 10,
    imported: false,
    about:
      "Worked out: what the open item takes off 110. 3.13.11 counts 3, the only case in which it may sit on a POA&M (CUI encrypted, not FIPS-validated).",
  },
  {
    key: "rule",
    header: "On a POA&M?",
    width: 22,
    imported: false,
    about:
      "Worked out from 32 CFR 170.21(a)(2): Yes for the 1-point requirements, never for the six the rule names, and No for the 3- and 5-point ones, which must be met before the assessment.",
  },
  {
    key: "remediation",
    header: "Remediation plan",
    width: 44,
    imported: true,
    input: true,
    about: "How the shop will meet the requirement: the change, the tool or the written procedure.",
  },
  {
    key: "milestones",
    header: "Milestones",
    width: 36,
    imported: true,
    input: true,
    about: "The steps on the way, each with its date (ordered, quote received, installed, tested).",
  },
  {
    key: "responsible",
    header: "Responsible",
    width: 22,
    imported: true,
    input: true,
    about: "Who owns the item: a name or an email address.",
  },
  {
    key: "due",
    header: "Scheduled completion",
    width: 14,
    imported: true,
    input: true,
    about:
      "When the item will be met, as a date (2026-12-31 or 12/31/2026). Needed for the import. Must fall within 180 days of the conditional status date on the Summary sheet.",
  },
  {
    key: "status",
    header: "Status",
    width: 10,
    imported: true,
    input: true,
    about: `${STATUSES.join(" or ")}. A blank status counts as Open.`,
  },
  {
    key: "check",
    header: "Check",
    width: 34,
    imported: false,
    about:
      "Worked out: what is wrong with the row, if anything (not allowed on a POA&M, after the close-out date, a missing weakness or date).",
  },
];

const letter = (i) => String.fromCharCode(65 + i);
export const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, letter(i)]));

// ---- the rule lists (Rules sheet) ----

const pipe = (ids) => `|${ids.join("|")}|`;
const ids = (pred) => REQUIREMENTS.filter(pred).map((r) => r.nistId);

/** Rules sheet lines: [label, "|id|id|" or text]. Row numbers are fixed; formulas point at them. */
export function ruleLines() {
  const verdict = (s) => ids((r) => poamVerdict(r).status === s);
  return [
    ["Rules this template applies (do not edit)", ""],
    ["All 110 NIST SP 800-171 Rev. 2 requirements", pipe(ids(() => true))],
    ["Worth 5 points", pipe(ids((r) => r.weight === 5))],
    ["Worth 3 points", pipe(ids((r) => r.weight === 3))],
    ["No points (the system security plan)", pipe(ids((r) => r.weight === 0))],
    ["May go on a POA&M (1 point, not excluded)", pipe(verdict("yes"))],
    ["Only on partial credit, counting 3 points", pipe(verdict("partial"))],
    ["Never on a POA&M (32 CFR 170.21(a)(2)(iii))", pipe(verdict("never"))],
    ["Minimum score for Conditional Level 2 (Self)", CONDITIONAL_MIN_SCORE],
    ["Days to close out after the conditional status", CLOSE_OUT_DAYS],
  ];
}
const RULE_ROW = {
  all: 2,
  five: 3,
  three: 4,
  zero: 5,
  yes: 6,
  partial: 7,
  never: 8,
  floor: 9,
  days: 10,
};
const rule = (k) => `Rules!$B$${RULE_ROW[k]}`;

/** The worked-out "On a POA&M?" values; the Summary sheet counts them by exact text. */
export const RULE_TEXT = {
  yes: "Yes",
  partial: "Only on partial credit",
  no: "No: must be met first",
  never: "Never (named in the rule)",
  unknown: "Not a requirement id",
};
export const CHECK_TEXT = {
  notAllowed: "Not allowed on a POA&M",
  late: "After the close-out date",
  noWeakness: "Needs a weakness",
  noDate: "Needs a scheduled completion date",
};

// ---- the POA&M sheet ----

function itemFormulas(r) {
  const c = (k) => `${COL[k]}${r}`;
  const id = c("id");
  const key = `"|"&TRIM(IFERROR(MID(${id},FIND("-",${id})+1,20),${id}))&"|"`;
  const has = (k) => `ISNUMBER(FIND(${key},${rule(k)}))`;
  const points = `IF(TRIM(${id})="","",IF(${has("partial")},3,IF(${has("five")},5,IF(${has("three")},3,IF(${has("zero")},0,IF(${has("all")},1,""))))))`;
  const ruleF = `IF(TRIM(${id})="","",IF(${has("yes")},"${RULE_TEXT.yes}",IF(${has("partial")},"${RULE_TEXT.partial}",IF(${has("never")},"${RULE_TEXT.never}",IF(${has("all")},"${RULE_TEXT.no}","${RULE_TEXT.unknown}")))))`;
  const rc = c("rule");
  const due = c("due");
  const statusDate = "Summary!$B$3";
  const check = `IF(TRIM(${id})="","",IF(AND(${rc}<>"${RULE_TEXT.yes}",${rc}<>"${RULE_TEXT.partial}"),"${CHECK_TEXT.notAllowed}",IF(TRIM(${c("weakness")})="","${CHECK_TEXT.noWeakness}",IF(${due}="","${CHECK_TEXT.noDate}",IF(AND(ISNUMBER(${statusDate}),ISNUMBER(${due})),IF(${due}>${statusDate}+${rule("days")},"${CHECK_TEXT.late}",""),"")))))`;
  return { points, rule: ruleF, check };
}

function poamSheet(items = []) {
  const rows = [
    row(
      1,
      COLUMNS.map((c, i) => cell(`${letter(i)}1`, c.header, S.head)),
    ),
  ];
  for (let n = 0; n < ITEM_ROWS; n++) {
    const r = FIRST + n;
    const own = items[n] ?? {};
    const f = itemFormulas(r);
    rows.push(
      row(
        r,
        COLUMNS.map((col, i) => {
          const ref = `${letter(i)}${r}`;
          if (col.key === "points") return cell(ref, { f: f.points }, S.int);
          if (col.key === "rule") return cell(ref, { f: f.rule }, S.text);
          if (col.key === "check") return cell(ref, { f: f.check }, S.wrap);
          const v = own[col.key] ?? "";
          const style =
            col.key === "due"
              ? S.inputDate
              : col.key === "weakness" || col.key === "remediation" || col.key === "milestones"
                ? S.inputWrap
                : S.input;
          return cell(ref, v, style);
        }),
      ),
    );
  }
  const st = `${COL.status}${FIRST}:${COL.status}${LAST}`;
  const du = `${COL.due}${FIRST}:${COL.due}${LAST}`;
  const validation = `<dataValidations count="2"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Status" error="Open or Closed." sqref="${st}"><formula1>"${STATUSES.join(",")}"</formula1></dataValidation><dataValidation type="date" operator="greaterThan" allowBlank="1" showErrorMessage="1" errorTitle="Scheduled completion" error="Enter a date, such as 2026-12-31." sqref="${du}"><formula1>1</formula1></dataValidation></dataValidations>`;
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

// ---- the Summary sheet ----

const rng = (k) => `'${POAM_SHEET}'!$${COL[k]}$${FIRST}:$${COL[k]}$${LAST}`;

/** Summary lines: [label, value or formula, style]. Row numbers are fixed so tests can read them. */
export function summaryLines() {
  // Open = not Closed. Counted as all minus closed: "<>Closed" skips blank cells in LibreOffice,
  // and a blank status counts as Open (as the app's importer reads it).
  const closed = `${rng("status")},"Closed",${rng("id")},"?*"`;
  const openCount = (col, t) =>
    `COUNTIFS(${rng(col)},"${t}")-COUNTIFS(${rng(col)},"${t}",${closed})`;
  const openRule = (t) => openCount("rule", t);
  return [
    ["CMMC Level 2 POA&M: summary", "", S.title],
    ["", "", S.text],
    ["Conditional status date (from SPRS; type it in)", "", S.inputDate],
    [
      "Close-out deadline (180 days later)",
      { f: `IF(ISNUMBER(B3),B3+${rule("days")},"Type the conditional status date above")` },
      S.date,
    ],
    ["Items on the POA&M", { f: `COUNTIF(${rng("id")},"?*")` }, S.int],
    ["Open items", { f: `COUNTIF(${rng("id")},"?*")-COUNTIFS(${closed})` }, S.int],
    [
      "Points the open items cost",
      { f: `SUM(${rng("points")})-SUMIFS(${rng("points")},${closed})` },
      S.int,
    ],
    ["Score with these open and every other requirement met", { f: `${MAX_SCORE}-B7` }, S.big],
    [
      "Open items not allowed on a POA&M",
      {
        f: `${openRule(RULE_TEXT.no)}+${openRule(RULE_TEXT.never)}+${openRule(RULE_TEXT.unknown)}`,
      },
      S.int,
    ],
    [
      "Open items due after the close-out deadline",
      { f: openCount("check", CHECK_TEXT.late) },
      S.int,
    ],
    [
      "What the POA&M allows",
      {
        f: `IF(B6=0,"Nothing open: a Final Level 2 (Self) status if every other requirement is met",IF(B9>0,"Not a conditional status: close the items not allowed on a POA&M first",IF(B8<${rule("floor")},"Not a conditional status: the open items cost more than ${MAX_SCORE - CONDITIONAL_MIN_SCORE} points","Conditional Level 2 (Self) if every requirement not listed here is met; close every item within ${CLOSE_OUT_DAYS} days")))`,
      },
      S.bold,
    ],
    ["", "", S.text],
    [
      "The rules are 32 CFR 170.21 and the DoD Assessment Methodology. The score above assumes every requirement not on this sheet is met; the SPRS score calculator or the self-assessment spreadsheet works out the full score. Your senior official decides what is met and affirms it in SPRS; this sheet submits nothing. Not legal advice.",
      "",
      S.note,
    ],
  ];
}
export const SUMMARY = {
  statusDate: "B3",
  deadline: "B4",
  items: "B5",
  open: "B6",
  points: "B7",
  score: "B8",
  notAllowed: "B9",
  late: "B10",
  verdict: "B11",
};

function summarySheet(statusDate) {
  const rows = summaryLines().map(([label, value, style], i) => {
    const v = i === 2 && statusDate != null ? statusDate : value;
    return row(i + 1, [
      cell(`A${i + 1}`, label, i === 0 ? S.title : style === S.note ? S.note : S.bold),
      cell(`B${i + 1}`, v, style === S.note || i === 0 ? S.text : style),
    ]);
  });
  return sheetXml(
    rows,
    `<col min="1" max="1" width="58" customWidth="1"/><col min="2" max="2" width="80" customWidth="1"/>`,
    "",
    {},
  );
}

function rulesSheet() {
  const rows = ruleLines().map(([label, value], i) =>
    row(i + 1, [
      cell(`A${i + 1}`, label, i === 0 ? S.title : S.bold),
      cell(`B${i + 1}`, value, typeof value === "number" ? S.int : S.wrap),
    ]),
  );
  return sheetXml(
    rows,
    `<col min="1" max="1" width="48" customWidth="1"/><col min="2" max="2" width="110" customWidth="1"/>`,
    "",
    {},
  );
}

export const READ_ME = [
  "CMMC Level 2 POA&M template: how to use it",
  "A Plan of Action and Milestones lists the requirements a Conditional Level 2 (Self) status leaves open and how each will be met. Put one open item per row on the POA&M sheet; shaded cells are yours, and Points while open, On a POA&M? and Check are worked out as you type.",
  `Which requirements may be on it: only the 1-point ones, less the six 32 CFR 170.21(a)(2) names (3.1.20, 3.1.22, 3.10.3, 3.10.4, 3.10.5 and the system security plan, 3.12.4), plus 3.13.11 when CUI is encrypted but the encryption is not FIPS-validated. The score with the items open must be at least ${CONDITIONAL_MIN_SCORE} of ${MAX_SCORE}.`,
  `The close-out: every item must be met, and the close-out assessment passed, within ${CLOSE_OUT_DAYS} days of the conditional status date, or the status expires. Type that date on the Summary sheet and the Check column flags a later scheduled completion.`,
  "A good row names the gap, not the requirement: for example, for the session lock requirement, 'Shop-floor CAD PCs (3) have no screen lock; office PCs lock after 15 minutes' with the remediation 'Group policy: lock after 15 minutes on every CUI PC', a milestone per step and one person responsible. This example is ours, not from a rule.",
  "Moving to the Compliance Workspace: on its POA&M page choose Import spreadsheet and pick this file. It reads Requirement, Weakness, Remediation plan, Milestones, Responsible, Scheduled completion and Status from the POA&M sheet, shows each row as new or updated with its POA&M rule, and applies it only when you confirm. Rows without a weakness or a date are listed, not imported.",
  "This is general information, not legal advice. Your senior official decides what is met and affirms it in SPRS. Not affiliated with or endorsed by the DoD or the Cyber AB. Free template from https://marisstella.app/cmmc/cmmc-poam-template",
];

function readMeSheet() {
  const rows = READ_ME.map((t, i) =>
    row(i + 1, [cell(`A${i + 1}`, t, i === 0 ? S.title : S.wrap)]),
  );
  const at = READ_ME.length + 2;
  rows.push(row(at, [cell(`A${at}`, "Columns of the POA&M sheet", S.bold)]));
  COLUMNS.forEach((c, i) => {
    const r = at + 1 + i;
    rows.push(
      row(r, [cell(`A${r}`, `${c.header}${c.imported ? " (imported)" : ""}: ${c.about}`, S.wrap)]),
    );
  });
  return sheetXml(rows, `<col min="1" max="1" width="140" customWidth="1"/>`, "", {});
}

export const SHEETS = [POAM_SHEET, "Summary", "Read me", "Rules"];
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${SHEETS.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${SHEETS.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xml(`'${POAM_SHEET}'!$A$1:$${letter(COLUMNS.length - 1)}$${LAST}`)}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${SHEETS.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${SHEETS.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** Excel's serial day number for an ISO date (1900 date system). */
export function excelDate(iso) {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000) + 25_569;
}

/**
 * The workbook as bytes. `items` (tests): rows of { id, weakness, remediation, milestones,
 * responsible, due (a string, or a number for an Excel date), status }; `statusDate` an Excel date
 * number for Summary!B3. The published template is blank.
 */
export function buildPoamWorkbook({ items = [], statusDate = null } = {}) {
  if (items.length > ITEM_ROWS) throw new Error(`at most ${ITEM_ROWS} items`);
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", poamSheet(items)],
    ["xl/worksheets/sheet2.xml", summarySheet(statusDate)],
    ["xl/worksheets/sheet3.xml", readMeSheet()],
    ["xl/worksheets/sheet4.xml", rulesSheet()],
  ]);
}

// ---- the page ----

/**
 * @param {{ cite: (id: string, text?: string) => string, statusBox: () => string,
 *   sourcesList: (ids: string[]) => string, cta: string, paidOn: boolean }} h helpers from pages.mjs
 * @returns {import("./pages.mjs").Page}
 */
export function poamTemplatePage({ cite, statusBox, sourcesList, cta, paidOn }) {
  const c = poamCounts();
  const imported = COLUMNS.filter((x) => x.imported).map((x) => x.header);
  const faq = [
    {
      q: "Is there a free CMMC POA&M template?",
      a: `Yes: this Excel workbook is free and needs no sign-up. One row per open item (requirement, weakness, remediation plan, milestones, responsible, scheduled completion, status), with each row checked against the 32 CFR 170.21 rules as you type and a Summary sheet with the points the open items cost and the ${CLOSE_OUT_DAYS}-day close-out deadline.`,
    },
    {
      q: "What goes in a POA&M for NIST SP 800-171?",
      a: "For each requirement not yet met: what exactly is missing (the weakness), how it will be fixed (the remediation plan), the steps and their dates (milestones), who is responsible and when it will be done. NIST SP 800-171 requirement 3.12.2 asks for plans of action that correct deficiencies; CMMC then limits which requirements may stay open on one for a conditional status.",
    },
    {
      q: "How many items can a CMMC Level 2 POA&M have?",
      a: `As many rows as you need, but for a Conditional Level 2 (Self) status only 1-point requirements may be open (${c.yes} qualify, plus 3.13.11 on partial credit) and the score with them open must stay at ${CONDITIONAL_MIN_SCORE} or above, so at most ${c.maxOpenItems} requirements can be open. Several rows may cover one requirement when it has several gaps.`,
    },
    {
      q: "Can I use the POA&M template for Level 1?",
      a: "No. Level 1 allows no POA&M: all 15 requirements must be met (32 CFR 170.21). The template is for Level 2.",
    },
    {
      q: "Does it work in Google Sheets and LibreOffice?",
      a: "It is a plain .xlsx with ordinary formulas (IF, FIND, COUNTIFS, SUMIFS), so it opens in Excel, Google Sheets, LibreOffice and Numbers. Our tests recalculate it in LibreOffice.",
    },
  ];
  return {
    path: TEMPLATE_PATH,
    kind: "faq",
    title: `Free CMMC POA&M template (.xlsx) with the 170.21 rules built in · ${SHORT_NAME}`,
    description: `Free CMMC Level 2 POA&M template in Excel: each item checked against 32 CFR 170.21, the points open, the 180-day close-out date, ready to import.`,
    changefreq: "monthly",
    priority: 0.9,
    faq,
    body: `<h1>Free CMMC POA&amp;M template</h1>
<p class="lead">A Plan of Action and Milestones (POA&amp;M) workbook for a CMMC Level 2 self-assessment: one row per open item, each
checked as you type against the rules of ${cite("cfr-170-21", "32 CFR 170.21")} (may this requirement sit on a POA&amp;M, what it
costs the score, is it due inside the ${CLOSE_OUT_DAYS}-day close-out). No sign-up, no macros.</p>
<p class="cta"><a class="button" href="/${TEMPLATE_FILE}" download>Download the POA&amp;M template (.xlsx)</a>
<span class="muted">Excel, Google Sheets, LibreOffice or Numbers.</span></p>
${statusBox()}
<h2>What is in it</h2>
<ul>
  <li><strong>POA&amp;M sheet:</strong> ${ITEM_ROWS} item rows with your columns (Requirement, Weakness, Remediation plan, Milestones,
  Responsible, Scheduled completion, Status) and three worked out: the points the item costs while open, whether it may go on a
  POA&amp;M at all, and a Check that names what is wrong with the row.</li>
  <li><strong>Summary sheet:</strong> type the conditional status date and it gives the close-out deadline, the open items, the points
  they cost, the score with them open (every other requirement met), how many are not allowed or due too late, and what the
  POA&amp;M as written allows.</li>
  <li><strong>Read me</strong> and <strong>Rules</strong>: how to fill it in, and the requirement lists the formulas read.</li>
</ul>
<h2>The rules it checks</h2>
<ul>
  <li><strong>Only 1-point requirements may be open</strong>: ${c.yes} of the ${c.total}. The ${c.fivePoint} worth 5 and the ${c.threePoint}
  worth 3 must be met before the assessment. 3.13.11 may be open only when CUI is encrypted but the encryption is not
  FIPS-validated, and then counts 3 points.</li>
  <li><strong>Six are never allowed</strong>, whatever their points: 3.1.20, 3.1.22, 3.10.3, 3.10.4, 3.10.5 and the system security
  plan, 3.12.4.</li>
  <li><strong>At least ${CONDITIONAL_MIN_SCORE} of ${MAX_SCORE}</strong> with the items open, so at most ${MAX_SCORE - CONDITIONAL_MIN_SCORE} points open: at most
  ${c.maxOpenItems} requirements.</li>
  <li><strong>Closed within ${CLOSE_OUT_DAYS} days</strong> of the conditional status, by a close-out assessment, or the status expires.</li>
</ul>
<p>Every requirement with its verdict is on <a href="${POAM_PATH}">which CMMC requirements can go on a POA&amp;M</a>. The Summary's
score assumes every requirement not on the sheet is met; for the full score use the <a href="/sprs-score-calculator">SPRS score
calculator</a> or the <a href="/cmmc-self-assessment-spreadsheet">self-assessment spreadsheet</a>, which shows which open
requirements must be met first.</p>
<h2>Writing an item an assessor can follow</h2>
<p>Name the gap, not the requirement. "3.1.10 not met" says nothing; "Shop-floor CAD PCs (3) have no screen lock; office PCs lock
after 15 minutes" says what is left. Give the remediation as the change you will make, the milestones as dated steps, and one
person responsible. (That example is ours, not from a rule.) Each assessment objective under a requirement is listed on the
<a href="/cmmc-level-2-requirements">Level 2 requirements</a> page, and a requirement is met only when every one of them is.</p>
<h2>Moving it into the workspace</h2>
<p>${SHORT_NAME} keeps the POA&amp;M next to the score and the SSP, shows for each item whether it may sit on a POA&amp;M, and
emails the shop's owner and admins 60 and 7 days before the POA&amp;M close-out falls due. It reads this file: on the POA&amp;M page choose
<strong>Import spreadsheet</strong>, pick the workbook, check the preview (each row new or updated, with its rule) and apply. It reads
${imported.join(", ")}; a row without a weakness or a date is listed, not imported, and importing the same file again changes nothing.
Recording Level 2 items needs the Level 2 plan${paidOn ? "" : " (not on sale yet)"}.</p>
<h2>Common questions</h2>
${faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n")}
<p class="muted">General information, not legal advice. Your senior official decides what is met and affirms it in SPRS; the
workbook submits nothing. Not affiliated with or endorsed by the DoD or the Cyber AB.</p>
${sourcesList(["cfr-170-21", "cfr-170-24", "dod-methodology", "nist-800-171r2"])}
${cta}`,
  };
}
