// EU Pay Transparency Directive (Directive (EU) 2023/970, transposition deadline 7 June 2026)
// first read for an employer: which duties reach you at your headcount, which of the
// always-on duties are still open, and (optionally) a pay-gap table checked against the
// 5% joint-pay-assessment trigger. Pure functions, no I/O. Bad input is rejected with a
// message, never clamped. Member States transpose the Directive differently and may go
// further; the answer is a first read. Article numbers and dates were written from the
// published text without network access in the building session and must be checked
// against the Directive (CELEX 32023L0970) and your national law before being quoted.

export const DEADLINE = "7 June 2026";

export const DUTIES = [
  { id: "range", label: "Job ads or pre-interview contact give the pay or pay range, based on objective gender-neutral criteria", article: "Art 5(1)" },
  { id: "history", label: "You never ask applicants about their current or past pay", article: "Art 5(2)" },
  { id: "neutralTitles", label: "Vacancy notices and job titles are gender-neutral and the hiring process is non-discriminatory", article: "Art 5(3)" },
  { id: "criteria", label: "Written, gender-neutral criteria for setting pay and pay progression exist and workers can see them", article: "Art 6" },
  { id: "request", label: "A process exists to answer a worker's request for their pay level and the average pay by sex for equal work within two months", article: "Art 7" },
  { id: "secrecy", label: "No contract term or policy stops workers from disclosing their pay", article: "Art 7(5)" },
  { id: "jobEval", label: "Pay structures rest on a documented gender-neutral job evaluation or classification", article: "Art 4" },
];

// Reporting by employer size: Art 9. `first` is the first report due date.
export function reporting(headcount) {
  if (headcount >= 250) return { tier: "250+", cadence: "every year", first: "7 June 2027 (data for 2026)", article: "Art 9(1)(a)" };
  if (headcount >= 150) return { tier: "150-249", cadence: "every three years", first: "7 June 2027 (data for 2026)", article: "Art 9(1)(b)" };
  if (headcount >= 100) return { tier: "100-149", cadence: "every three years", first: "7 June 2031 (data for 2030)", article: "Art 9(1)(c)" };
  return { tier: "under 100", cadence: "none under the Directive", first: "no report required by the Directive (a Member State may require one)", article: "Art 9" };
}

// "Category,women_avg,men_avg" rows. Returns the rows with gap %, and the rows at or over 5%.
export function parsePayTable(text) {
  const rows = [];
  const errors = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const cells = line.split(/[,;\t]/).map((c) => c.trim());
    if (idx === 0 && cells.length >= 3 && Number.isNaN(Number(cells[1]))) return; // header
    if (cells.length < 3) { errors.push(`Line ${idx + 1}: expected category, women average, men average.`); return; }
    const w = Number(cells[1]);
    const m = Number(cells[2]);
    if (!cells[0] || !Number.isFinite(w) || !Number.isFinite(m) || w <= 0 || m <= 0) { errors.push(`Line ${idx + 1}: pay figures must be positive numbers.`); return; }
    // Gap as the Directive's indicator: (men - women) / men, positive when women earn less.
    const gap = ((m - w) / m) * 100;
    rows.push({ category: cells[0], women: w, men: m, gap: Math.round(gap * 10) / 10, over: Math.abs(gap) >= 5 });
  });
  return { rows, errors };
}

function yn(raw, fallback) {
  return ["yes", "no", "unsure"].includes(raw) ? raw : fallback;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const headcount = Number(i.headcount);
  if (i.headcount === "" || i.headcount == null || !Number.isInteger(headcount) || headcount < 1 || headcount > 5000000) errors.push("Enter your number of employees as a whole number of 1 or more.");
  const hiring = yn(i.hiring, "yes");
  const done = {};
  for (const d of DUTIES) done[d.id] = Boolean(i[d.id]) && i[d.id] !== "0";
  const table = parsePayTable(i.payTable);
  errors.push(...table.errors);
  return { errors, headcount, hiring, done, table: table.rows };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const rep = reporting(p.headcount);
  const reports = p.headcount >= 100;
  const applicable = DUTIES.filter((d) => p.hiring !== "no" || !["range", "history", "neutralTitles"].includes(d.id));
  const open = applicable.filter((d) => !p.done[d.id]);
  const flagged = p.table.filter((r) => r.over);
  const findings = [];
  findings.push({ severity: "info", title: `The Directive's transposition deadline was ${DEADLINE}. Your national law, not the Directive itself, binds you; check how your Member State has transposed it.` });
  if (reports) findings.push({ severity: "high", title: `Gender pay gap reporting applies at ${rep.tier} employees: ${rep.cadence}, first report ${rep.first} (${rep.article}).` });
  else findings.push({ severity: "info", title: "Below 100 employees you have no reporting duty under the Directive, but the recruitment, pay-criteria and right-to-information duties still apply to every employer." });
  for (const d of open) findings.push({ severity: "medium", title: `Open: ${d.label} (${d.article}).` });
  if (reports && p.table.length === 0) findings.push({ severity: "medium", title: "Add your average pay by sex for each category of workers doing equal or equal-value work to test the 5% trigger for a joint pay assessment (Art 10)." });
  if (flagged.length) findings.push({ severity: "high", title: `${flagged.length} categor${flagged.length === 1 ? "y has" : "ies have"} a gap of 5% or more. If it is not justified by objective, gender-neutral factors and not fixed within six months of the report, a joint pay assessment with worker representatives is required (Art 10).` });
  if (reports && p.table.length && !flagged.length) findings.push({ severity: "info", title: "No category in your table reaches a 5% gap. The 5% test applies to the average pay level within a category, so check that the categories reflect equal or equal-value work." });
  if (open.length === 0 && !flagged.length) findings.push({ severity: "info", title: "All the always-on duties are marked done. Keep the evidence; a worker can claim and the burden of proof is on the employer (Art 18)." });
  return { input: p, reporting: rep, reports, open, table: p.table, flagged, findings };
}

export const SAMPLE = {
  headcount: "180", hiring: "yes", range: "", history: "1", neutralTitles: "1", criteria: "", request: "", secrecy: "", jobEval: "",
  payTable: "category,women_avg,men_avg\nSoftware engineer,71000,76500\nCustomer support,38200,38900\nSales,52000,61000",
};

export function summaryText(r) {
  const lines = [
    "EU Pay Transparency Directive check (first read, not legal advice)",
    `Employees: ${r.input.headcount}`,
    r.reports ? `Reporting: ${r.reporting.cadence}, first ${r.reporting.first} [${r.reporting.article}]` : `Reporting: ${r.reporting.first}`,
  ];
  if (r.open.length) lines.push("", "Open duties:", ...r.open.map((d) => `  - ${d.label} (${d.article})`));
  if (r.table.length) lines.push("", "Pay gap by category (men minus women, % of men):", ...r.table.map((t) => `  ${t.category}: ${t.gap}%${t.over ? "  <-- 5% or more (Art 10)" : ""}`));
  lines.push("", "Confirm with your national authority, works council or counsel.");
  return lines.join("\n");
}

export function gapCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["category,women_avg,men_avg,gap_percent,at_or_over_5_percent", ...r.table.map((t) => [t.category, t.women, t.men, t.gap, t.over ? "yes" : "no"].map(q).join(","))].join("\n");
}
