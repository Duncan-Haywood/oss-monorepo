import { test } from "node:test";
import assert from "node:assert/strict";
import { check, readList, parseCsv, parseDate, parseMoney, normalizeCoverage, readRequirements, sampleList, sampleBrokenList, SAMPLE_AS_OF, findingsCsv, chaseListCsv, expiryCalendar, isoDay } from "./calc.mjs";

const AS_OF = parseDate(SAMPLE_AS_OF);
const HEAD = "Vendor,Coverage,Each occurrence,Aggregate,Effective,Expiration,Additional insured,Waiver of subrogation\n";
const run = (rows, req) => check(HEAD + rows.join("\n"), req, AS_OF);
const titles = (r) => r.findings.map((f) => f.title);

test("dates, money and coverage names are read the way a certificate writes them", () => {
  assert.equal(isoDay(parseDate("10/5/2026")), "2026-10-05");
  assert.equal(isoDay(parseDate("10/05/26")), "2026-10-05");
  assert.ok(Number.isNaN(parseDate("2026-02-30")));
  assert.equal(parseMoney("$1,000,000"), 1000000);
  assert.equal(parseMoney("1M"), 1000000);
  assert.equal(parseMoney("500k"), 500000);
  assert.equal(normalizeCoverage("Commercial General Liability (CGL)"), "GL");
  assert.equal(normalizeCoverage("Excess Liability"), "UMB");
  assert.equal(normalizeCoverage("Workers' Compensation"), "WC");
  assert.equal(normalizeCoverage("Business Automobile"), "AUTO");
});

test("csv parser handles quotes, embedded commas and newlines, and a BOM", () => {
  const rows = parseCsv('\uFEFFa,b\n"x, y","say ""hi"""\n"two\nlines",z\n');
  assert.deepEqual(rows.map((r) => r.cells), [["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  assert.equal(rows[2].line, 3);
});

test("a vendor with everything in force and endorsed is clear", () => {
  const r = run([
    "Ok Co,General liability,1000000,2000000,2026-01-01,2027-01-01,Yes,Yes",
    "Ok Co,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "Ok Co,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ]);
  assert.equal(r.vendors[0].status, "ok");
  assert.equal(r.findings.length, 0);
});

test("expired, not-yet-effective and missing coverages are errors", () => {
  const r = run([
    "A,General liability,1000000,2000000,2025-01-01,2026-01-01,Yes,Yes",
    "A,Auto,1000000,,2027-01-01,2028-01-01,Yes,Yes",
  ]);
  const t = titles(r).join("|");
  assert.match(t, /general liability: expired 2026-01-01/);
  assert.match(t, /Business auto liability: not in force until 2027-01-01/);
  assert.match(t, /Workers' compensation.*nothing on file/);
  assert.equal(r.vendors[0].status, "fail");
});

test("expiry exactly on the check date is still in force; the lead time boundary is inclusive", () => {
  const today = isoDay(AS_OF), edge = isoDay(AS_OF + 30), beyond = isoDay(AS_OF + 31);
  const r = run([
    `T,General liability,1000000,2000000,2025-01-01,${today},Yes,Yes`,
    `T,Auto,1000000,,2025-01-01,${edge},Yes,Yes`,
    `T,Workers comp,500000,,2025-01-01,${beyond},,Yes`,
  ]);
  const t = titles(r).join("|");
  assert.match(t, /general liability: expires .* \(0 days\)/);
  assert.match(t, /Business auto liability: expires .* \(30 days\)/);
  assert.doesNotMatch(t, /Workers.*expires/);
  assert.equal(r.findings.find((f) => /\(0 days\)/.test(f.title)).severity, "error");
  assert.equal(r.findings.find((f) => /\(30 days\)/.test(f.title)).severity, "warning");
});

test("a limit below the requirement is an error, an umbrella can make it up, and not when disallowed", () => {
  const rows = [
    "U,General liability,500000,1000000,2026-01-01,2027-01-01,Yes,Yes",
    "U,Umbrella,2000000,,2026-01-01,2027-01-01,Yes,Yes",
    "U,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "U,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ];
  const withU = run(rows);
  assert.equal(withU.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(withU.findings.filter((f) => f.severity === "info").length, 2);
  const without = run(rows, { umbrellaCounts: false });
  assert.match(titles(without).join("|"), /each occurrence \$500,000 is below the \$1,000,000 required/);
  assert.match(titles(without).join("|"), /aggregate \$1,000,000 is below the \$2,000,000 required/);
  // an expired umbrella makes up nothing
  const expired = run([rows[0], "U,Umbrella,2000000,,2024-01-01,2025-01-01,Yes,Yes", rows[2], rows[3]]);
  assert.match(titles(expired).join("|"), /each occurrence \$500,000 is below/);
});

test("a blank endorsement is a warning, an explicit no is an error, and workers comp is never asked for additional insured", () => {
  const r = run([
    "E,General liability,1000000,2000000,2026-01-01,2027-01-01,,No",
    "E,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "E,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ]);
  const ai = r.findings.find((f) => /additional insured/.test(f.title));
  const wv = r.findings.find((f) => /waiver/.test(f.title));
  assert.equal(ai.severity, "warning");
  assert.equal(wv.severity, "error");
  assert.equal(r.findings.filter((f) => /additional insured/.test(f.title) && f.coverage === "WC").length, 0);
});

test("other liability lines do not count as general liability", () => {
  for (const name of ["Contractors pollution liability", "Liquor liability", "Cyber liability", "Garage liability"]) assert.equal(normalizeCoverage(name), null, name);
  assert.equal(normalizeCoverage("Commercial general liability"), "GL");
  assert.equal(normalizeCoverage("Liability"), "GL");
});

test("a renewal gap is measured in whole days between the two policies", () => {
  const r = run([
    "G,General liability,1000000,2000000,2025-06-01,2026-06-01,Yes,Yes",
    "G,General liability,1000000,2000000,2026-06-20,2027-06-20,Yes,Yes",
    "G,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "G,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ]);
  // 12:01 a.m. to 12:01 a.m.: June 1 to June 19 inclusive is uncovered, 19 days.
  assert.match(titles(r).join("|"), /19-day gap/);
  const contiguous = run([
    "G,General liability,1000000,2000000,2025-06-01,2026-06-01,Yes,Yes",
    "G,General liability,1000000,2000000,2026-06-01,2027-06-20,Yes,Yes",
  ]);
  assert.doesNotMatch(titles(contiguous).join("|"), /gap/);
  const nextDay = run([
    "G,General liability,1000000,2000000,2025-06-01,2026-06-01,Yes,Yes",
    "G,General liability,1000000,2000000,2026-06-02,2027-06-20,Yes,Yes",
  ]);
  assert.match(titles(nextDay).join("|"), /1-day gap/);
});

test("a swapped date pair and an unreadable date are errors on the list itself, with line numbers", () => {
  const { findings } = readList(HEAD + "S,General liability,1000000,2000000,2026-10-01,2025-10-01,Yes,Yes\nS,Auto,1M,,01-02-03,2027-01-01,Yes,Yes\n");
  assert.match(findings[0].title, /Expires before it takes effect/);
  assert.equal(findings[0].line, 2);
  assert.match(findings[1].title, /Cannot read the effective date/);
  assert.equal(findings[1].line, 3);
});

test("missing columns and an empty paste say what is needed", () => {
  assert.match(readList("").findings[0].title, /Nothing to read/);
  const f = readList("Vendor,Notes\nA,B\n").findings;
  assert.ok(f.some((x) => /coverage/.test(x.title)));
  assert.ok(f.some((x) => /expiration/.test(x.title)));
});

test("vendors are grouped case-insensitively and listed worst first", () => {
  const r = run([
    "acme,General liability,1000000,2000000,2026-01-01,2027-01-01,Yes,Yes",
    "ACME,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "ACME,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
    "Zed,General liability,1000000,2000000,2026-01-01,2027-01-01,Yes,Yes",
  ]);
  assert.equal(r.summary.vendors, 2);
  assert.equal(r.vendors[0].vendor, "Zed");
  assert.equal(r.vendors[0].status, "fail");
  assert.equal(r.vendors[1].status, "ok");
});

test("exports neutralise spreadsheet formulas and quote commas", () => {
  const r = run(["=cmd|' /C calc'!A0,General liability,1000000,2000000,2025-01-01,2026-01-01,Yes,Yes"]);
  const out = findingsCsv(r);
  assert.ok(!/(^|,)=cmd/.test(out));
  assert.match(out, /'=cmd/);
  assert.match(chaseListCsv(r), /blocking/);
});

test("the calendar has one stable all-day event per policy still to expire, on the first day of the lead time", () => {
  const r = check(sampleList(), {}, AS_OF);
  const ics = expiryCalendar(r, "2026-10-05T00:00:00Z");
  const events = ics.match(/BEGIN:VEVENT/g).length;
  assert.equal(events, r.policies.length);
  assert.match(ics, /DTSTART;VALUE=DATE:20261005/); // Blue Line: 2026-10-20 minus 30 days is before today, so today
  assert.match(ics, /DTSTART;VALUE=DATE:20270130/); // Apex: expires 2027-03-01
  assert.equal(ics, expiryCalendar(r, "2026-10-05T00:00:00Z"));
  assert.match(ics, /\r\n/);
  const none = expiryCalendar(check(HEAD + "X,General liability,1,1,2020-01-01,2020-02-01,Yes,Yes", {}, AS_OF));
  assert.doesNotMatch(none, /VEVENT/);
});

test("both samples behave as the page says", () => {
  const ok = check(sampleList(), {}, AS_OF);
  assert.deepEqual(ok.summary, { vendors: 3, policies: 10, fail: 1, watch: 1, ok: 1 });
  const bad = check(sampleBrokenList(), {}, AS_OF);
  assert.equal(bad.summary.fail, 2);
  assert.match(titles(bad).join("|"), /19-day gap/);
  assert.match(titles(bad).join("|"), /Expires before it takes effect/);
});

// Re-audit 2026-11-28 (portfolio/quality/audits/2026-11-28-coi-expiry-gap-checker.json): the four
// boundaries the 2026-11-12 mutations showed untested, plus the defects closed in that round.
const WC_ONLY_REQ = { GL: { required: false }, AUTO: { required: false } };
test("an umbrella exactly equal to the shortfall makes it up; one dollar less does not", () => {
  const gl = "U,General liability,500000,2000000,2026-01-01,2027-01-01,Yes,Yes";
  const rest = ["U,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes", "U,Workers comp,500000,,2026-01-01,2027-01-01,,Yes"];
  const equal = run([gl, "U,Umbrella,500000,,2026-01-01,2027-01-01,Yes,Yes", ...rest]);
  assert.equal(equal.findings.filter((f) => f.severity === "error").length, 0);
  assert.match(titles(equal).join("|"), /\$500,000 short, made up by the umbrella/);
  const less = run([gl, "U,Umbrella,499999,,2026-01-01,2027-01-01,Yes,Yes", ...rest]);
  assert.match(titles(less).join("|"), /each occurrence \$500,000 is below the \$1,000,000 required/);
});

test("an umbrella never makes up an employers' liability shortfall", () => {
  const r = run(["W,Workers comp,100000,,2026-01-01,2027-01-01,,Yes", "W,Umbrella,5000000,,2026-01-01,2027-01-01,Yes,Yes"], WC_ONLY_REQ);
  const f = r.findings.find((x) => x.coverage === "WC" && /employers' liability/.test(x.title));
  assert.equal(f.severity, "error");
});

test("seven days left is an error, eight is a warning", () => {
  const r7 = run([`S,Workers comp,500000,,2025-01-01,${isoDay(AS_OF + 7)},,Yes`], WC_ONLY_REQ);
  const r8 = run([`S,Workers comp,500000,,2025-01-01,${isoDay(AS_OF + 8)},,Yes`], WC_ONLY_REQ);
  assert.equal(r7.findings.find((f) => /expires/.test(f.title)).severity, "error");
  assert.equal(r8.findings.find((f) => /expires/.test(f.title)).severity, "warning");
});

test("workers' comp is checked for waiver of subrogation", () => {
  const r = run(["S,Workers comp,500000,,2026-01-01,2027-01-01,,No"], WC_ONLY_REQ);
  assert.equal(r.findings.find((f) => f.coverage === "WC" && /waiver/.test(f.title)).severity, "error");
});

test("a renewal already on the list clears the lead-time warning, and one with a gap does not", () => {
  const exp = isoDay(AS_OF + 10), later = isoDay(AS_OF + 375);
  const ok = run([`R,Workers comp,500000,,2025-10-15,${exp},,Yes`, `R,Workers comp,500000,,${exp},${later},,Yes`], WC_ONLY_REQ);
  assert.equal(ok.vendors[0].status, "ok");
  assert.match(titles(ok).join("|"), /renewal on file/);
  assert.equal(chaseListCsv(ok), "vendor,status,ask_for\r\n");
  const gap = run([`R,Workers comp,500000,,2025-10-15,${exp},,Yes`, `R,Workers comp,500000,,${isoDay(AS_OF + 11)},${later},,Yes`], WC_ONLY_REQ);
  assert.equal(gap.vendors[0].status, "watch");
  assert.match(titles(gap).join("|"), /expires .* \(10 days\)/);
});

test("the column headings printed on an ACORD 25 are read", () => {
  const r = readList("INSURED,TYPE OF INSURANCE,ADDL INSD,SUBR WVD,POLICY NUMBER,POLICY EFF (MM/DD/YYYY),POLICY EXP (MM/DD/YYYY),EACH OCCURRENCE\nX,Commercial general liability,Y,Y,GL-1,01/01/2026,01/01/2027,1000000");
  assert.deepEqual(r.findings, []);
  const p = r.policies[0];
  assert.equal(p.coverage, "GL"); assert.equal(p.ai, true); assert.equal(p.waiver, true);
  assert.equal(isoDay(p.effective), "2026-01-01"); assert.equal(isoDay(p.expiry), "2027-01-01"); assert.equal(p.limit, 1000000);
});

test("'comp' and 'work' inside other words are not workers' compensation", () => {
  assert.equal(normalizeCoverage("GL incl. products-completed operations"), "GL");
  assert.equal(normalizeCoverage("Network security liability"), null);
  for (const wc of ["Workers comp", "Workers' compensation", "Worker's Compensation and Employers' Liability", "WC", "Employers liability"]) assert.equal(normalizeCoverage(wc), "WC", wc);
});

test("an unreadable requirement or lead time is reported, not turned into 0", () => {
  const base = { glOcc: "1000000", glAgg: "2M", autoCsl: "1M", wcEl: "500k", umb: "", pro: "0", lead: "30", waiver: true };
  const good = readRequirements(base);
  assert.deepEqual(good.problems, []);
  assert.equal(good.req.GL.aggregate, 2000000); assert.equal(good.req.WC.limit, 500000); assert.equal(good.req.UMB.limit, 0); assert.equal(good.req.leadDays, 30);
  assert.match(readRequirements({ ...base, glOcc: "1 million" }).problems.join(), /each occurrence: cannot read "1 million"/);
  assert.match(readRequirements({ ...base, glOcc: "" }).problems.join(), /each occurrence/);
  assert.match(readRequirements({ ...base, lead: "" }).problems.join(), /Lead time/);
  assert.match(readRequirements({ ...base, lead: "thirty" }).problems.join(), /Lead time/);
});
