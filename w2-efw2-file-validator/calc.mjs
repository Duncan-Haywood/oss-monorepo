// EFW2 (SSA W-2 electronic wage file) checks. Pure functions, no DOM, no network.
//
// The layout is read by position from memory of the public SSA EFW2
// specification; only fields whose positions are well known are checked, and
// everything else is left alone rather than guessed. Positions below are
// 1-based and inclusive, as the specification writes them.

export const RECORD_LENGTH = 512;

// Social Security wage base by tax year (public SSA figures).
export const SS_WAGE_BASE = {
  2019: 132900, 2020: 137700, 2021: 142800, 2022: 147000, 2023: 160200,
  2024: 168600, 2025: 176100, 2026: 184500,
};

// IRS-assigned EIN prefixes (from memory of the published campus list).
const EIN_PREFIXES = new Set([
  ..."01 02 03 04 05 06 10 11 12 13 14 15 16 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 71 72 73 74 75 76 77 80 81 82 83 84 85 86 87 88 90 91 92 93 94 95 98 99".split(" "),
]);

// RW and RT money boxes in specification order: field name, RW start (1-based, 11 wide), RT start (15 wide).
export const BOXES = [
  { key: "wages", label: "Box 1 wages, tips, other", rw: 188, rt: 10 },
  { key: "fed", label: "Box 2 federal income tax withheld", rw: 199, rt: 25 },
  { key: "ssWages", label: "Box 3 social security wages", rw: 210, rt: 40 },
  { key: "ssTax", label: "Box 4 social security tax withheld", rw: 221, rt: 55 },
  { key: "medWages", label: "Box 5 Medicare wages and tips", rw: 232, rt: 70 },
  { key: "medTax", label: "Box 6 Medicare tax withheld", rw: 243, rt: 85 },
  { key: "ssTips", label: "Box 7 social security tips", rw: 254, rt: 100 },
];

const cents = (n) => {
  const neg = n < 0;
  const s = String(Math.abs(Math.round(n))).padStart(3, "0");
  return `${neg ? "-" : ""}$${s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${s.slice(-2)}`;
};
export { cents };

const field = (rec, from, to) => rec.slice(from - 1, to);
const isDigits = (s) => /^[0-9]+$/.test(s);
const maskSsn = (s) => (isDigits(s) && s.length === 9 ? `***-**-${s.slice(5)}` : "(unreadable)");

export function splitRecords(text) {
  const raw = String(text).replace(/\u0000/g, "");
  const lines = raw.split(/\r\n|\n|\r/);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  // One unbroken string whose length is a multiple of 512 is a file without line ends.
  if (lines.length === 1 && lines[0].length > RECORD_LENGTH && lines[0].length % RECORD_LENGTH === 0) {
    const one = lines[0];
    const out = [];
    for (let i = 0; i < one.length; i += RECORD_LENGTH) out.push(one.slice(i, i + RECORD_LENGTH));
    return { records: out, unbroken: true };
  }
  return { records: lines, unbroken: false };
}

export function ssnProblem(s) {
  if (!/^[0-9]{9}$/.test(s)) return "is not nine digits";
  const area = s.slice(0, 3), group = s.slice(3, 5), serial = s.slice(5);
  if (area === "000" || area === "666" || area[0] === "9") return `starts with ${area}, an area number SSA does not issue`;
  if (group === "00") return "has group number 00";
  if (serial === "0000") return "has serial number 0000";
  if (/^(\d)\1{8}$/.test(s)) return "is one digit repeated nine times";
  if (s === "123456789" || s === "078051120" || s === "219099999") return "is a well-known sample SSN";
  return null;
}

export function validate(text, opts = {}) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  const { records, unbroken } = splitRecords(text);
  const summary = {
    records: records.length, employers: 0, employees: 0, taxYear: null,
    groups: [], totals: {}, rfCount: null,
  };
  if (!records.length) {
    add("error", "empty", 0, "The file is empty", "There are no records to check.");
    return { findings, summary };
  }
  if (unbroken) add("info", "no-line-ends", 0, "File has no line breaks", "It was split every 512 characters. Some filers expect line breaks and some reject them; check which yours wants.");

  let group = null;
  let sawRA = false, sawRF = false, sawRT = true, prev = null;
  const years = new Set();
  const base = (y) => SS_WAGE_BASE[y];

  const closeGroup = () => { group = null; };

  records.forEach((rec, i) => {
    const line = i + 1;
    const id = field(rec, 1, 2);
    if (rec.length !== RECORD_LENGTH) {
      add("error", "length", line, `Record is ${rec.length} characters, not 512`, rec.length < RECORD_LENGTH ? "Trailing spaces were probably trimmed (an editor or Excel does this). Pad the record back to exactly 512 characters." : "The record is too long; a field has spilled over or two records joined.");
    }
    // eslint-disable-next-line no-control-regex
    if (/[^\x20-\x7e]/.test(rec)) add("error", "chars", line, "Record contains a non-printable or non-ASCII character", "EFW2 files are plain ASCII. Tabs, accented letters and smart quotes are rejected.");
    else if (/[a-z]/.test(rec)) add("warning", "lowercase", line, "Record contains lowercase letters", "EFW2 text fields are upper case. Some filers fold case and some reject the file.");

    if (!["RA", "RE", "RW", "RO", "RS", "RT", "RU", "RF"].includes(id)) {
      add("error", "id", line, `Unknown record identifier "${id}"`, "Each record starts with RA, RE, RW, RO, RS, RT, RU or RF.");
      return;
    }

    // Order
    if (i === 0 && id !== "RA") add("error", "order", line, "File does not start with an RA submitter record", `The first record is ${id}.`);
    if (id === "RA") {
      if (i !== 0) add("error", "order", line, "RA record is not first", "There must be exactly one submitter record, at the top.");
      if (sawRA) add("error", "order", line, "More than one RA record", "A file has one submitter.");
      sawRA = true;
    } else if (id === "RE") {
      if (group && !sawRT) add("error", "order", line, "New RE before the RT of the previous employer", `Employer starting at line ${group.line} has no RT total record.`);
      sawRT = false;
      closeGroup();
      group = { line, ein: field(rec, 8, 16), year: field(rec, 3, 6), rw: 0, sums: Object.fromEntries(BOXES.map((b) => [b.key, 0])), ssns: new Map() };
      summary.employers++;
    } else if (id === "RW" || id === "RO" || id === "RS") {
      if (!group || sawRT) add("error", "order", line, `${id} record outside an employer`, "Employee records belong between an RE and its RT.");
    } else if (id === "RT") {
      if (!group || sawRT) add("error", "order", line, "RT without a preceding RE", "A total record closes an employer group.");
    } else if (id === "RU" ) {
      if (prev !== "RT" && prev !== "RU") add("warning", "order", line, "RU does not follow an RT", "The optional RU total goes right after RT.");
    } else if (id === "RF") {
      if (i !== records.length - 1) add("error", "order", line, "RF is not the last record", "The final record closes the file.");
      sawRF = true;
    }
    if (id === "RA") {
      const ein = field(rec, 3, 11);
      if (!/^[0-9]{9}$/.test(ein)) add("error", "ra-ein", line, "Submitter EIN is not nine digits", `Positions 3-11 hold "${ein.trim()}".`);
      const resub = field(rec, 29, 29), wfid = field(rec, 30, 35);
      if (resub !== "0" && resub !== "1") add("warning", "ra-resub", line, "Resub indicator (position 29) is not 0 or 1", `It holds "${resub}".`);
      if (resub === "1" && !wfid.trim()) add("error", "ra-wfid", line, "Resubmission without a WFID", "Positions 30-35 must hold the wage file identifier of the rejected file.");
      if (resub === "0" && wfid.trim()) add("warning", "ra-wfid", line, "WFID given but resub indicator is 0", "Set the indicator to 1 or blank the WFID.");
    }

    if (id === "RE" && group) {
      const y = group.year;
      if (!/^[0-9]{4}$/.test(y)) add("error", "re-year", line, "Tax year is not four digits", `Positions 3-6 hold "${y}".`);
      else { years.add(y); summary.taxYear = Number(y); }
      if (!/^[0-9]{9}$/.test(group.ein)) add("error", "re-ein", line, "Employer EIN is not nine digits", `Positions 8-16 hold "${group.ein.trim()}".`);
      else if (/^0{9}$/.test(group.ein)) add("error", "re-ein", line, "Employer EIN is all zeros", "Use the EIN on your Form 941.");
      else if (!EIN_PREFIXES.has(group.ein.slice(0, 2))) add("warning", "re-ein-prefix", line, `EIN prefix ${group.ein.slice(0, 2)} is not one IRS assigns`, "Read from memory of the published prefix list; check the number against your IRS notice.");
    }

    if (id === "RW" && group) {
      summary.employees++;
      group.rw++;
      const ssn = field(rec, 3, 11);
      const p = ssnProblem(ssn);
      if (p) add("error", "ssn", line, `SSN ${maskSsn(ssn)} ${p}`, "Check the employee's number against their Social Security card; SSA rejects the whole wage line.");
      else if (group.ssns.has(ssn)) add("warning", "ssn-dup", line, `SSN ${maskSsn(ssn)} also appears at line ${group.ssns.get(ssn)}`, "Two RW records for one person is legitimate only for separate jobs under the same EIN; otherwise merge them.");
      else group.ssns.set(ssn, line);
      if (!field(rec, 12, 26).trim() && !field(rec, 42, 61).trim()) add("error", "name", line, "Employee has no first or last name", "Positions 12-26 and 42-61 are both blank.");
      else if (!field(rec, 42, 61).trim()) add("error", "name", line, "Employee last name is blank", "Positions 42-61.");
      const v = {};
      for (const b of BOXES) {
        const raw = field(rec, b.rw, b.rw + 10);
        if (!/^[0-9]{11}$/.test(raw)) {
          add("error", "money", line, `${b.label} is not eleven digits`, `Positions ${b.rw}-${b.rw + 10} hold "${raw.trim()}". Amounts are whole cents with no decimal point or sign, zero-filled.`);
          v[b.key] = null;
        } else { v[b.key] = Number(raw); group.sums[b.key] += Number(raw); }
      }
      const who = maskSsn(ssn);
      if (v.fed != null && v.wages != null && v.fed > v.wages) add("warning", "fed-gt-wages", line, `${who}: federal withholding exceeds Box 1 wages`, `${cents(v.fed)} withheld against ${cents(v.wages)} wages. Fine when pre-tax deferrals zero out Box 1, otherwise a keying error.`);
      const wb = base(Number(group.year));
      if (v.ssWages != null && v.ssTips != null && wb) {
        if (v.ssWages + v.ssTips > wb * 100 + 1) add("error", "ss-base", line, `${who}: social security wages and tips exceed the ${group.year} wage base`, `${cents(v.ssWages + v.ssTips)} against a base of ${cents(wb * 100)}.`);
      } else if (!wb && /^[0-9]{4}$/.test(group.year) && !group._baseNoted) { group._baseNoted = true; add("info", "no-base", line, `No social security wage base on file for ${group.year}`, "The wage-base and rate checks are skipped for this year."); }
      if (v.ssTax != null && v.ssWages != null && v.ssTips != null && wb) {
        const exp = Math.round((v.ssWages + v.ssTips) * 0.062);
        if (Math.abs(v.ssTax - exp) > Math.max(100, Math.round(exp * 0.005))) add("warning", "ss-rate", line, `${who}: social security tax is not 6.2% of Box 3 plus Box 7`, `${cents(v.ssTax)} withheld; 6.2% would be ${cents(exp)}. Rounding across pay periods explains a few dollars, not more.`);
      }
      if (v.medTax != null && v.medWages != null && wb) {
        const lo = Math.round(v.medWages * 0.0145), hi = Math.round(v.medWages * 0.0145 + Math.max(0, v.medWages - 20000000) * 0.009);
        const tol = Math.max(100, Math.round(hi * 0.005));
        if (v.medTax < lo - tol || v.medTax > hi + tol) add("warning", "med-rate", line, `${who}: Medicare tax is outside 1.45% (plus 0.9% above $200,000) of Box 5`, `${cents(v.medTax)} withheld; expected between ${cents(lo)} and ${cents(hi)}.`);
      }
      if (v.ssWages != null && v.medWages != null && v.medWages < v.ssWages) add("warning", "med-lt-ss", line, `${who}: Box 5 is below Box 3`, "Medicare wages have no cap and are normally at least the social security wages.");
    }

    if (id === "RT" && group && !sawRT) {
      sawRT = true;
      const count = field(rec, 3, 9);
      if (!isDigits(count)) add("error", "rt-count", line, "RT employee count is not numeric", `Positions 3-9 hold "${count.trim()}".`);
      else if (Number(count) !== group.rw) add("error", "rt-count", line, `RT counts ${Number(count)} RW records but the employer has ${group.rw}`, "Rebuild the total record, or look for an RW that was deleted or pasted in.");
      const tot = {};
      for (const b of BOXES) {
        const raw = field(rec, b.rt, b.rt + 14);
        if (!isDigits(raw)) { add("error", "rt-money", line, `RT ${b.label} is not fifteen digits`, `Positions ${b.rt}-${b.rt + 14} hold "${raw.trim()}".`); continue; }
        tot[b.key] = Number(raw);
        if (Number(raw) !== group.sums[b.key]) add("error", "rt-total", line, `RT ${b.label} is ${cents(Number(raw))}, the RW records sum to ${cents(group.sums[b.key])}`, `Off by ${cents(Number(raw) - group.sums[b.key])}. This is what a hand-edited wage line leaves behind.`);
      }
      summary.groups.push({ line: group.line, ein: group.ein, year: group.year, employees: group.rw, sums: { ...group.sums }, rt: tot });
      for (const b of BOXES) summary.totals[b.key] = (summary.totals[b.key] || 0) + group.sums[b.key];
    }

    if (id === "RF") {
      const n = field(rec, 8, 16);
      summary.rfCount = isDigits(n) ? Number(n) : null;
      if (!isDigits(n)) add("error", "rf-count", line, "RF employee count is not numeric", `Positions 8-16 hold "${n.trim()}".`);
      else if (Number(n) !== summary.employees) add("error", "rf-count", line, `RF counts ${Number(n)} RW records but the file has ${summary.employees}`, "Rebuild the final record.");
    }
    prev = id;
  });

  if (!sawRF) add("error", "no-rf", 0, "No RF final record", "The file must end with an RF record.");
  if (group && !sawRT) add("error", "no-rt", group.line, "Last employer has no RT total record", "Add an RT after its last RW or RO.");
  if (years.size > 1) add("error", "year-mix", 0, `Tax years differ across employers (${[...years].join(", ")})`, "One file carries one tax year.");
  if (!summary.employers && records.length > 1) add("error", "no-re", 0, "No RE employer record", "Wage records need an employer to belong to.");
  findings.sort((a, b) => (a.line || 0) - (b.line || 0));
  return { findings, summary };
}

const num = (n, w) => String(n).padStart(w, "0");
const put = (rec, from, text) => rec.slice(0, from - 1) + text + rec.slice(from - 1 + text.length);

// Rebuild RT and RF from the RW records. Never touches an RW, RE, RO or RS.
export function repair(text) {
  const { records } = splitRecords(text);
  if (!records.length) return { text: "", changes: [], error: "Nothing to rebuild." };
  if (records.some((r) => r.length !== RECORD_LENGTH)) return { text: null, changes: [], error: "Fix the record lengths first; a rebuild cannot guess where a short record's fields were." };
  const out = records.slice();
  const changes = [];
  let cur = null, rw = 0;
  records.forEach((r, i) => {
    const id = r.slice(0, 2);
    if (id === "RE") cur = { n: 0, sums: Object.fromEntries(BOXES.map((b) => [b.key, 0])) };
    else if (id === "RW" && cur) {
      cur.n++; rw++;
      for (const b of BOXES) { const v = field(r, b.rw, b.rw + 10); if (isDigits(v)) cur.sums[b.key] += Number(v); }
    } else if (id === "RT" && cur) {
      let nr = put(r, 3, num(cur.n, 7));
      for (const b of BOXES) nr = put(nr, b.rt, num(cur.sums[b.key], 15));
      if (nr !== r) { out[i] = nr; changes.push(`Line ${i + 1}: RT rebuilt to ${cur.n} employee(s) and the sums of the RW records.`); }
      cur = null;
    } else if (id === "RF") {
      const nr = put(r, 8, num(rw, 9));
      if (nr !== r) { out[i] = nr; changes.push(`Line ${i + 1}: RF rebuilt to ${rw} employee(s).`); }
    }
  });
  return { text: out.join("\r\n") + "\r\n", changes, error: null };
}

// ---- Synthetic samples (made-up employer, invented SSNs) ----

const pad = (s, n) => String(s).slice(0, n).padEnd(n, " ");
const mk = (id, parts) => {
  let r = pad(id, 2).padEnd(RECORD_LENGTH, " ");
  for (const [from, v] of parts) r = put(r, from, v);
  return r;
};

export function buildFile({ year = 2025, ein = "123456000", employees }) {
  const ra = mk("RA", [[3, "123456000"], [12, "SAMPLEUS"], [29, "0"], [36, "99"], [38, pad("SAMPLE PAYROLL SERVICE", 57)]]);
  const re = mk("RE", [[3, String(year)], [8, ein], [40, pad("NORTHWIND SAMPLE CO", 57)]]);
  const sums = Object.fromEntries(BOXES.map((b) => [b.key, 0]));
  const rws = employees.map((e) => {
    const ssWages = Math.min(e.wages, SS_WAGE_BASE[year] * 100);
    const v = {
      wages: e.wages, fed: e.fed, ssWages, ssTax: Math.round(ssWages * 0.062),
      medWages: e.wages, medTax: Math.round(e.wages * 0.0145 + Math.max(0, e.wages - 20000000) * 0.009), ssTips: 0,
    };
    for (const b of BOXES) sums[b.key] += v[b.key];
    const parts = [[3, e.ssn], [12, pad(e.first, 15)], [42, pad(e.last, 20)]];
    for (const b of BOXES) parts.push([b.rw, num(v[b.key], 11)]);
    return mk("RW", parts);
  });
  const rt = mk("RT", [[3, num(employees.length, 7)], ...BOXES.map((b) => [b.rt, num(sums[b.key], 15)])]);
  const rf = mk("RF", [[8, num(employees.length, 9)]]);
  return [ra, re, ...rws, rt, rf].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return buildFile({
    employees: [
      { ssn: "512340001", first: "AVA", last: "MARLOW", wages: 5200000, fed: 480000 },
      { ssn: "512340002", first: "NOAH", last: "BRIGHT", wages: 7850000, fed: 910000 },
      { ssn: "512340003", first: "ELENA", last: "ORTIZ", wages: 3100000, fed: 215000 },
    ],
  });
}

export function sampleBrokenFile() {
  const lines = sampleFile().split("\r\n").filter(Boolean);
  // A payroll clerk bumps one wage by hand, and the file picks up a bad SSN.
  lines[3] = put(lines[3], 188, num(7950000, 11));
  lines[4] = put(lines[4], 3, "000340003");
  return lines.join("\r\n") + "\r\n";
}

export function maskedFindingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["severity", "code", "line", "title", "detail"].join(",")];
  for (const x of result.findings) rows.push([x.severity, x.code, x.line || "", q(x.title), q(x.detail)].join(","));
  return rows.join("\n") + "\n";
}

export function decodeBuffer(buf) {
  return new TextDecoder("latin1").decode(buf);
}
