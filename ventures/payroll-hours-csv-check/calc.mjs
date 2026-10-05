// Payroll hours sheet CSV checker. Pure functions, no DOM, no network.
// This is a pre-flight for the spreadsheet of hours a small employer keys or imports into a payroll
// service: it checks the sheet itself (identifiers, dates, hour formats, arithmetic), not any one
// vendor's importer, whose exact column names this tool does not claim to know. Nothing here is
// wage-and-hour advice: overtime and break rules depend on jurisdiction, so they are only noted.

export const ROLES = {
  employee: ["Employee", "Employee Name", "Employee ID", "Name"],
  date: ["Date", "Work Date"],
  regular: ["Regular Hours", "Hours"],
  overtime: ["Overtime Hours", "OT Hours"],
  pto: ["PTO Hours", "Sick Hours", "Vacation Hours"],
  start: ["Start", "Time In", "Clock In"],
  end: ["End", "Time Out", "Clock Out"],
  break: ["Break", "Break Minutes"],
};
export const COLUMNS = ["Employee", "Date", "Start", "End", "Break Minutes", "Regular Hours", "Overtime Hours"];
export const SEVERITIES = ["error", "warning", "info"];

const canon = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const ROLE_OF = new Map(), KNOWN = new Map();
for (const [role, names] of Object.entries(ROLES)) for (const n of names) { ROLE_OF.set(canon(n), role); KNOWN.set(canon(n), n); }
const ALL_NAMES = [...KNOWN.values()];
// Spellings people use that are close enough to be read by eye and not by a mapping step.
const NEAR = { emp: "employee", staff: "employee", worker: "employee", empid: "employee", employeeid: "employee", day: "date", workdate: "date", shiftdate: "date", hrs: "regular", hoursworked: "regular", totalhours: "regular", reghours: "regular", reg: "regular", ot: "overtime", othours: "overtime", overtime: "overtime", pto: "pto", sick: "pto", vacation: "pto", timein: "start", clockin: "start", in: "start", timeout: "end", clockout: "end", out: "end", lunch: "break", breaks: "break", breakmins: "break" };
const NEAR_LABEL = { employee: "Employee", date: "Date", regular: "Regular Hours", overtime: "Overtime Hours", pto: "PTO Hours", start: "Start", end: "End", break: "Break Minutes" };
const trunc = (s, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

const SCI = /^[-+]?\d(\.\d+)?e[-+]?\d+$/i;
const EXCEL_ERR = /^(#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)|#{3,})$/i;


export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. Tracks the
// physical line each record starts on so findings can name it.
export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], cell = "", q = false, line = 1, start = 1, i = 0, quoteLine = 0, sawAny = false;
  const push = () => { row.push(cell); cell = ""; };
  const endRow = () => { push(); rows.push({ cells: row, line: start }); row = []; sawAny = false; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      if (ch === "\n") line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { q = true; quoteLine = line; sawAny = true; i++; continue; }
    if (ch === delim) { push(); sawAny = true; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRow(); line++; start = line; i++; continue; }
    cell += ch; sawAny = true; i++;
  }
  if (q) return { rows, unterminated: quoteLine };
  if (sawAny || cell !== "" || row.length) endRow();
  return { rows, unterminated: 0 };
}

export function toCsv(rows, delim = ",") {
  const esc = (v) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(delim)).join("\r\n") + "\r\n";
}

function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function closestColumn(name) {
  const n = canon(name).replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of ALL_NAMES) {
    const d = distance(n, canon(c).replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}



const HM = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/;
const DEC = /^\d+(\.\d+)?$/;
const CLOCK = /^(\d{1,2}):([0-5]\d)\s*([ap]m)?$/i;
const dateShape = (v) => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return "iso";
  if (/^\d{5}$/.test(t) && Number(t) > 30000 && Number(t) < 70000) return "serial";
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) return Number(m[1]) <= 12 && Number(m[2]) <= 12 ? "ambiguous" : "slash";
  return "";
};
const isoOf = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "");
const minutesOf = (v) => {
  const m = CLOCK.exec(v.trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (h < 1 || h > 12) return null; h = (h % 12) + (pm ? 12 : 0); }
  return h > 23 ? null : h * 60 + Number(m[2]);
};
// "8.5" -> 8.5, "8:30" -> 8.5, anything else -> NaN. The kind is reported so a column that mixes the
// two readings can be flagged: 8:30 pasted into a decimal column is 8.3 hours to a human and 8 to many importers.
const hoursOf = (v) => {
  const t = v.trim();
  if (DEC.test(t)) return { n: Number(t), kind: "decimal" };
  const m = HM.exec(t);
  if (m) return { n: Number(m[1]) + Number(m[2]) / 60, kind: "clock" };
  return { n: NaN, kind: "bad" };
};

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, columns: 0, delimiter: ",", employees: 0, totalHours: 0, dateRange: "", customColumns: [], flagged: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a CSV of hours."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accented names will be damaged.");
  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'A CSV import expects commas. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell.`);
    return { findings, summary };
  }
  const header = parsed.rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {}, seen = new Map();
  header.forEach((h, i) => {
    const c = canon(h);
    if (!h) { add("warning", "blank-header", 1, `Column ${i + 1} has no header`, "A column with no name cannot be mapped, so its data is ignored."); return; }
    if (seen.has(c)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(c) + 1} and ${i + 1} are the same once capitals and punctuation are ignored. Only one can be mapped; delete or rename one.`);
    else seen.set(c, i);
    const role = ROLE_OF.get(c);
    if (role) { if (idx[role] === undefined) idx[role] = i; return; }
    const near = NEAR[c];
    if (near && idx[near] === undefined) { idx[near] = i; return; }
    summary.customColumns.push(h);
  });
  if (idx.employee === undefined) { add("error", "missing-column", 1, "No Employee column is present", "Every row of hours has to say whose hours they are. Check the header row, the delimiter and the encoding."); return { findings, summary }; }
  if (idx.date === undefined) add("warning", "missing-date", 1, "No Date column is present", "Without a date, hours cannot be assigned to a pay period or a workweek; this tool cannot check duplicates or weekly totals.");
  if (idx.regular === undefined && idx.start === undefined) { add("error", "missing-column", 1, "No hours column and no Start/End columns", "Add a Regular Hours column, or Start and End times."); return { findings, summary }; }

  const get = (r, role) => (idx[role] === undefined ? "" : (r[idx[role]] ?? "").trim());
  const people = new Map(), perDay = new Map(), perWeek = new Map();
  const dshapes = new Map(), hkinds = new Map();
  let blank = 0, minDate = "", maxDate = "";
  for (let ri = 1; ri < parsed.rows.length; ri++) {
    const { cells: r, line: L } = parsed.rows[ri];
    if (r.every((c) => c.trim() === "")) { blank++; continue; }
    summary.rows++;
    const before = findings.length;
    if (r.length > header.length) add("error", "extra-cells", L, `Row has ${r.length} cells but the header has ${header.length}`, "An unquoted comma inside a name (Smith, Jo) shifts every later cell one column to the right. Wrap the name in double quotes.");
    else if (r.length < header.length) add("warning", "short-row", L, `Row has ${r.length} cells but the header has ${header.length}`, "The missing trailing cells are read as empty.");

    const emp = get(r, "employee"), date = get(r, "date");
    if (!emp) add("error", "no-employee", L, "Row has no employee", "Hours with no employee cannot be matched to anyone.");
    else if (EXCEL_ERR.test(emp)) add("error", "excel-error", L, `Employee is the spreadsheet error "${emp}"`, "A broken formula was exported as text. Fix the source cell.");
    else if (SCI.test(emp)) add("error", "id-excel", L, `Employee "${emp}" was turned into scientific notation`, "Excel stored a long ID as a number and the original digits are lost. Re-enter it and format the column as Text.");
    const ekey = emp.toLowerCase().replace(/\s+/g, " ");
    if (emp) people.set(ekey, (people.get(ekey) || 0) + 1);

    let iso = "";
    if (idx.date !== undefined) {
      if (!date) add("error", "no-date", L, "Row has no date", "Hours with no date cannot be placed in a pay period.");
      else {
        const sh = dateShape(date);
        dshapes.set(sh || "other", (dshapes.get(sh || "other") || 0) + 1);
        if (sh === "serial") add("error", "date-serial", L, `Date "${date}" is an Excel serial number`, "The cell holds the number Excel uses internally for a date. Format the column as a date, or as YYYY-MM-DD text, before saving.");
        else if (!sh) add("error", "date", L, `Date "${trunc(date)}" is not a date this tool can read`, "Use YYYY-MM-DD, or a numeric day/month/year.");
        iso = isoOf(date);
        if (iso) {
          const dt = new Date(iso + "T00:00:00Z");
          if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) add("error", "date-real", L, `Date "${date}" does not exist`, "The month or day is out of range.");
          else { if (!minDate || iso < minDate) minDate = iso; if (!maxDate || iso > maxDate) maxDate = iso; }
        }
      }
    }

    // Hours: explicit columns, or computed from start/end.
    const cols = ["regular", "overtime", "pto"];
    const vals = {};
    for (const k of cols) {
      const raw = get(r, k);
      if (!raw) continue;
      const h = hoursOf(raw);
      if (h.kind === "bad") {
        if (EXCEL_ERR.test(raw)) add("error", "excel-error", L, `${NEAR_LABEL[k]} is the spreadsheet error "${raw}"`, "A broken formula was exported as text.");
        else add("error", "hours-format", L, `${NEAR_LABEL[k]} "${trunc(raw)}" is not a number of hours`, /h|m|[a-z]/i.test(raw) ? "Remove the unit text (8h, 8 hrs) and use 8.5 or 8:30." : "Use a decimal such as 8.5, or h:mm such as 8:30.");
        continue;
      }
      hkinds.set(k + ":" + h.kind, (hkinds.get(k + ":" + h.kind) || 0) + 1);
      vals[k] = h.n;
      if (h.n > 24) add("error", "hours-over-24", L, `${NEAR_LABEL[k]} is ${raw}, more than 24`, "No one works more than 24 hours in a day. Likely a total for the week or a typo; or minutes entered as hours.");
      else if (h.n > 16 && k === "regular") add("warning", "hours-long", L, `Regular hours are ${raw}`, "More than 16 hours in one row. Check it is one shift and not a day's total plus a typo.");
    }
    if (get(r, "regular").startsWith("-") || get(r, "overtime").startsWith("-")) add("error", "negative", L, "Hours are negative", "A negative figure is read as a correction by some systems and rejected by others. Enter corrections explicitly in the payroll service.");

    let computed = null;
    const s = get(r, "start"), e = get(r, "end");
    if (s || e) {
      const sm = s ? minutesOf(s) : null, em = e ? minutesOf(e) : null;
      if ((s && sm === null) || (e && em === null)) add("error", "time-format", L, `Start/End "${trunc(s)}" / "${trunc(e)}" are not times`, "Use 24-hour 08:30 or 8:30 AM. Text like '8.30' or 'morning' cannot be read.");
      else if (s && e) {
        let span = em - sm;
        if (span < 0) { span += 1440; add("info", "overnight", L, `End ${e} is before start ${s}`, "Treated as an overnight shift crossing midnight; the hours belong to the start date on most systems, which is a policy for you to confirm."); }
        const brk = Number(get(r, "break") || 0);
        if (get(r, "break") && !DEC.test(get(r, "break"))) add("error", "break-format", L, `Break "${trunc(get(r, "break"))}" is not a number of minutes`, "Use whole minutes such as 30.");
        else computed = (span - (Number.isFinite(brk) ? brk : 0)) / 60;
        if (computed !== null && computed < 0) add("error", "span-negative", L, "Break is longer than the shift", "Start, End and Break leave negative hours.");
      } else add("warning", "half-times", L, "Only one of Start and End is filled in", "A shift needs both to compute hours.");
    }
    const stated = (vals.regular ?? 0) + (vals.overtime ?? 0);
    if (computed !== null && computed >= 0 && vals.regular !== undefined && Math.abs(computed - stated) > 0.1) add("warning", "hours-mismatch", L, `Start/End give ${computed.toFixed(2)} h but the sheet says ${stated.toFixed(2)} h`, "Either the times or the typed hours are wrong, or a break was counted differently. This tool never decides which to believe.");
    const total = stated + (vals.pto ?? 0);
    summary.totalHours += total;

    if (emp && iso && Number.isFinite(total)) {
      const dk = ekey + "|" + iso;
      if (perDay.has(dk)) add("warning", "dup-day", L, `${trunc(emp)} already has hours on ${iso} (line ${perDay.get(dk).line})`, "Two rows for one person and day may be a split shift, or a duplicated paste. Rows are never merged for you.");
      else perDay.set(dk, { line: L, hours: total });
      const d = new Date(iso + "T00:00:00Z");
      if (!Number.isNaN(d.getTime())) {
        const wk = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
        const k = ekey + "|" + wk;
        const w = perWeek.get(k) || { name: emp, week: wk, hours: 0, ot: 0, line: L };
        w.hours += stated; w.ot += vals.overtime ?? 0; perWeek.set(k, w);
      }
    }
    if (findings.length > before) summary.flagged.push({ line: L, who: emp || "(no employee)", issues: findings.length - before });
  }

  summary.employees = people.size;
  summary.dateRange = minDate ? (minDate === maxDate ? minDate : `${minDate} to ${maxDate}`) : "";
  summary.totalHours = Math.round(summary.totalHours * 100) / 100;
  if ((dshapes.get("iso") || dshapes.get("slash") || dshapes.get("ambiguous")) && [...dshapes.keys()].filter((k) => k !== "other").length > 1) add("warning", "date-mixed", 0, "The Date column mixes formats", `Found ${[...dshapes.entries()].map(([k, v]) => `${v} ${k}`).join(", ")}. A mixed column makes day-first and month-first impossible to tell apart; use YYYY-MM-DD throughout.`);
  else if (dshapes.get("ambiguous") && !dshapes.get("slash") && !dshapes.get("iso")) add("info", "date-ambiguous", 0, "Dates like 03/04/2026 can be read two ways", "3 April or March 4 depending on the reader. This tool will not reorder dates for you; use YYYY-MM-DD to remove the doubt.");
  for (const k of cols0()) if (hkinds.get(k + ":decimal") && hkinds.get(k + ":clock")) add("error", "hours-mixed", 0, `${NEAR_LABEL[k]} mixes decimal and h:mm values`, `${hkinds.get(k + ":decimal")} decimal (8.5) and ${hkinds.get(k + ":clock")} clock-style (8:30) values. Many importers read 8:30 as 8 or reject it; 8.5 and 8:30 are the same time but not the same text. Pick one style.`);
  const over = [...perWeek.values()].filter((w) => w.hours > 40 && w.ot === 0 && idx.overtime !== undefined);
  for (const w of over.slice(0, 20)) add("info", "weekly-over-40", w.line, `${trunc(w.name)} has ${w.hours.toFixed(1)} regular hours in the week of ${w.week} and no overtime`, "Many places require overtime pay above a weekly or daily threshold. This tool does not know yours and will not enter overtime for you; check the rule that applies.");
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  add("info", "scope-note", 0, "This is a sheet check, not a wage check", "The tool tests the file's formatting and arithmetic. It does not know the minimum wage, overtime, break or record-keeping rules that apply to you, and a clean result is not evidence that anyone was paid correctly.");
  return { findings, summary };
}
const cols0 = () => ["regular", "overtime", "pto"];

export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return { text: "", changes: [], error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes: [], error: "A quoted cell is never closed; fix that before applying safe fixes." };
  const changes = [];
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  rows[0].forEach((h, i) => {
    const c = canon(h), role = ROLE_OF.get(c) ?? NEAR[c];
    if (role && c !== canon(NEAR_LABEL[role]) && !ROLES[role].includes(h.trim())) { changes.push(`Header "${h}" renamed to "${NEAR_LABEL[role]}".`); rows[0][i] = NEAR_LABEL[role]; }
  });
  const head = rows[0].map((h) => h.trim());
  const empCol = head.findIndex((h) => ROLE_OF.get(canon(h)) === "employee");
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (empCol >= 0 && r[empCol] !== undefined && r[empCol] !== r[empCol].trim() && r[empCol].trim()) {
      changes.push(`Line ${parsed.rows[ri].line}, ${head[empCol]}: "${r[empCol]}" → "${r[empCol].trim()}" (stray spaces).`);
      r[empCol] = r[empCol].trim();
    }
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { Employee: "Ada Example", Date: "2026-09-28", Start: "08:00", End: "16:30", "Break Minutes": "30", "Regular Hours": "8", "Overtime Hours": "" },
    { Employee: "Ada Example", Date: "2026-09-29", Start: "08:00", End: "17:00", "Break Minutes": "30", "Regular Hours": "8.5", "Overtime Hours": "" },
    { Employee: "Ben Sample", Date: "2026-09-28", Start: "09:00", End: "17:00", "Break Minutes": "60", "Regular Hours": "7", "Overtime Hours": "" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { Employee: "Ada Example", Date: "2026-09-28", Start: "08:00", End: "16:30", "Break Minutes": "30", "Regular Hours": "8" },
    { Employee: "Ada Example", Date: "2026-09-28", Start: "08:00", End: "17:00", "Break Minutes": "30", "Regular Hours": "10" },
    { Employee: "Ben Sample", Date: "09/29/2026", "Regular Hours": "8:30" },
    { Employee: "Ben Sample", Date: "46294", "Regular Hours": "8h" },
    { Employee: "", Date: "2026-09-30", "Regular Hours": "28" },
    { Employee: "Cleo Demo", Date: "2026-09-30", Start: "22:00", End: "06:00", "Break Minutes": "30", "Regular Hours": "7.5" },
  ]);
}
