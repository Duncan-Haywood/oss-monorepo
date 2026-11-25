// Schedule-of-values / continuation-sheet arithmetic for one pay application.
//
// Column logic follows the continuation-sheet layout that pay-app guides
// describe in general terms (it is not a copy of any copyrighted form):
//   C scheduled value
//   D work completed from previous applications
//   E work completed this period
//   F materials presently stored (not in D or E)
//   G total completed and stored to date = D + E + F
//   G / C percent complete
//   H balance to finish = C - G
//   retainage = (D + E) x work rate + F x stored rate, rounded per line
// Summary: contract sum to date = original + net change orders;
// earned less retainage = G - retainage held; current payment due =
// earned less retainage - previous certificates.
//
// Money is handled in integer cents so 0.1 + 0.2 never shows up on a bill.

// Commas are read by shape: "1,234.56" is thousands, "29,99" is a decimal
// comma (as an EU-locale sheet writes it), any other comma is not a number.
export const toCents = (v) => {
  if (v === null || v === undefined) return 0;
  let s = String(v).replace(/[$\s]/g, "");
  if (s === "") return 0;
  if (s.includes(",")) {
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.split(",").join("");
    else if (/^-?(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(s)) s = s.split(".").join("").replace(",", ".");
    else return NaN;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
};

// Percent typed as "10" or "10%" -> 0.10.
export const toRate = (v) => {
  const s = String(v ?? "").replace(/[%\s]/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : NaN;
};

// A change order is an item numbered CO-1, CO1, CO 2, C.O. 3 or CO#4, or a
// line typed "change order". "CO1" and "C.O. 3" used to read as base-contract
// lines (red team 2026-11-25).
export const isChangeOrder = (line) =>
  /^\s*(c\.?\s?o\.?\s*[-#]?\s*\d|co\b)|change\s+order/i.test(`${line.item ?? ""} ${line.type ?? ""}`);

export function fmt(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

export const pctText = (p) => (p === null ? "n/a" : `${(p * 100).toFixed(1)}%`);

export function compute(lines, settings = {}) {
  const workRate = toRate(settings.workRetainage ?? "10");
  const storedRate = toRate(settings.storedRetainage ?? settings.workRetainage ?? "10");
  const released = toCents(settings.retainageReleased);
  const previousCertificates = toCents(settings.previousCertificates);
  const findings = [];
  const bad = (msg) => findings.push({ level: "high", msg });

  if (!(workRate >= 0 && workRate <= 1)) bad("Retainage on completed work must be between 0% and 100%.");
  if (!(storedRate >= 0 && storedRate <= 1)) bad("Retainage on stored materials must be between 0% and 100%.");
  if (Number.isNaN(released) || released < 0) bad("Retainage released must be a positive amount or blank.");
  if (Number.isNaN(previousCertificates) || previousCertificates < 0) bad("Previous certificates must be a positive amount or blank.");
  const wr = workRate >= 0 && workRate <= 1 ? workRate : 0;
  const sr = storedRate >= 0 && storedRate <= 1 ? storedRate : 0;

  const rows = [];
  let original = 0;
  let changes = 0;
  for (const [i, line] of lines.entries()) {
    const label = line.item ? `Item ${line.item}` : `Row ${i + 1}`;
    const C = toCents(line.scheduled), D = toCents(line.previous), E = toCents(line.thisPeriod), F = toCents(line.stored);
    if ([C, D, E, F].some(Number.isNaN)) { bad(`${label}: a number could not be read.`); continue; }
    if (!line.description && !C && !D && !E && !F) continue; // blank row
    const co = isChangeOrder(line);
    if (co) changes += C; else original += C;
    const work = D + E;
    const G = work + F;
    const H = C - G;
    const retWork = Math.round(work * wr);
    const retStored = Math.round(F * sr);
    const pct = C !== 0 ? G / C : null;
    if (C >= 0 && G > C) bad(`${label}: billed ${fmt(G)} against a scheduled value of ${fmt(C)}. Over-billing a line is the first thing a reviewer marks down.`);
    if (!co && C < 0) bad(`${label}: a negative scheduled value on a base-contract line. Put a deductive change order on its own CO line.`);
    if (D < 0 || F < 0) bad(`${label}: previous work and stored materials cannot be negative.`);
    if (E < 0) findings.push({ level: "medium", msg: `${label}: a negative amount this period reverses earlier billing. Check the owner expects a credit.` });
    rows.push({ item: line.item ?? "", description: line.description ?? "", changeOrder: co, C, D, E, F, G, H, pct, retWork, retStored, retainage: retWork + retStored });
  }

  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  const completedStored = sum("G");
  const retainageGross = sum("retainage");
  const rel = Number.isNaN(released) ? 0 : released;
  const prev = Number.isNaN(previousCertificates) ? 0 : previousCertificates;
  if (rel > retainageGross) bad(`Retainage released (${fmt(rel)}) is more than the retainage calculated (${fmt(retainageGross)}).`);
  const retainageHeld = Math.max(0, retainageGross - rel);
  const earnedLessRetainage = completedStored - retainageHeld;
  const currentDue = earnedLessRetainage - prev;
  const contractSum = original + changes;
  if (rows.length && currentDue < 0) findings.push({ level: "medium", msg: `Previous certificates are more than earned less retainage, so this application is a credit of ${fmt(-currentDue)}. Check the previous-certificates figure.` });
  if (!rows.length) findings.push({ level: "info", msg: "Add at least one line to the schedule of values." });

  return {
    rows,
    totals: {
      originalContractSum: original,
      netChangeOrders: changes,
      contractSumToDate: contractSum,
      previous: sum("D"),
      thisPeriod: sum("E"),
      stored: sum("F"),
      completedStored,
      percentComplete: contractSum ? completedStored / contractSum : null,
      retainageOnWork: sum("retWork"),
      retainageOnStored: sum("retStored"),
      retainageGross,
      retainageReleased: rel,
      retainageHeld,
      earnedLessRetainage,
      previousCertificates: prev,
      currentPaymentDue: currentDue,
      balanceToFinish: contractSum - completedStored,
      balanceToFinishPlusRetainage: contractSum - earnedLessRetainage,
    },
    findings,
  };
}

// A cell starting =, +, - or @ runs as a formula when the CSV opens in Excel or
// Sheets (CSV injection), so text like that gets a leading apostrophe; plain
// numbers, negative ones included, are left alone.
export function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const plain = (c) => (c / 100).toFixed(2);

export function toCsv(result) {
  const head = ["Item", "Description", "Scheduled value", "From previous applications", "This period", "Materials presently stored", "Total completed and stored", "Percent", "Balance to finish", "Retainage"];
  const body = result.rows.map((r) => [r.item, r.description, plain(r.C), plain(r.D), plain(r.E), plain(r.F), plain(r.G), r.pct === null ? "" : (r.pct * 100).toFixed(1), plain(r.H), plain(r.retainage)]);
  const t = result.totals;
  body.push(["", "Totals", plain(t.contractSumToDate), plain(t.previous), plain(t.thisPeriod), plain(t.stored), plain(t.completedStored), t.percentComplete === null ? "" : (t.percentComplete * 100).toFixed(1), plain(t.balanceToFinish), plain(t.retainageGross)]);
  return [head, ...body].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function summaryText(result) {
  const t = result.totals;
  const line = (label, v) => `${label.padEnd(44, ".")} ${v}`;
  return [
    "PAY APPLICATION SUMMARY (worksheet, check before sending)",
    line("1. Original contract sum", fmt(t.originalContractSum)),
    line("2. Net change by change orders", fmt(t.netChangeOrders)),
    line("3. Contract sum to date (1 + 2)", fmt(t.contractSumToDate)),
    line("4. Total completed and stored to date", fmt(t.completedStored)),
    line("5a. Retainage on completed work", fmt(t.retainageOnWork)),
    line("5b. Retainage on stored materials", fmt(t.retainageOnStored)),
    line("5c. Less retainage released", fmt(t.retainageReleased)),
    line("5. Total retainage held", fmt(t.retainageHeld)),
    line("6. Total earned less retainage (4 - 5)", fmt(t.earnedLessRetainage)),
    line("7. Less previous certificates for payment", fmt(t.previousCertificates)),
    line("8. CURRENT PAYMENT DUE (6 - 7)", fmt(t.currentPaymentDue)),
    line("9. Balance to finish, incl. retainage (3 - 6)", fmt(t.balanceToFinishPlusRetainage)),
  ].join("\n") + "\n";
}

export const SAMPLE = {
  settings: { workRetainage: "10", storedRetainage: "10", retainageReleased: "", previousCertificates: "31500" },
  lines: [
    { item: "1", description: "Mobilization and general conditions", scheduled: "12000", previous: "6000", thisPeriod: "2000", stored: "0" },
    { item: "2", description: "Underground conduit", scheduled: "40000", previous: "20000", thisPeriod: "10000", stored: "0" },
    { item: "3", description: "Switchgear (stored on site)", scheduled: "60000", previous: "9000", thisPeriod: "6000", stored: "15000" },
    { item: "4", description: "Branch wiring and devices", scheduled: "38000", previous: "0", thisPeriod: "7600", stored: "0" },
    { item: "CO-1", description: "Added EV charger circuits", scheduled: "8500", previous: "0", thisPeriod: "4250", stored: "0" },
  ],
};

// QuickBooks has no retainage field on an invoice, so the usual workaround is
// a "Retainage" item mapped to a Retainage Receivable asset account: a
// negative line holds it back, a positive line on a later invoice bills it.
// Given one pay application's figures, return the invoice lines to type.
//   billed: work completed this period plus stored materials this period
//   rate: retainage percent ("10" or "10%"), or pass held directly
//   released: retainage being billed (released) on this invoice
export function quickbooksLines({ billed, rate = "10", held, released } = {}) {
  const errors = [];
  const b = toCents(billed);
  const r = toRate(rate);
  const rel = toCents(released);
  if (Number.isNaN(b)) errors.push("The amount billed this period could not be read.");
  if (Number.isNaN(r) || r < 0 || r > 1) errors.push("Retainage must be between 0% and 100%.");
  if (Number.isNaN(rel) || rel < 0) errors.push("Retainage released must be zero or a positive amount.");
  let h = held === undefined || held === "" ? null : toCents(held);
  if (Number.isNaN(h)) errors.push("The retainage held could not be read.");
  // QuickBooks wants the held line negative, so people type "-4000" here; the
  // sign is ours to add, and a negative held used to bill the retainage.
  else if (h !== null && h < 0) errors.push("Enter the retainage held as a positive amount; the invoice line below is made negative for you.");
  if (errors.length) return { errors, lines: [], total: 0 };
  if (h === null) h = Math.round(b * r);
  const lines = [];
  if (b) lines.push({ item: "Work billed this period", amount: b, account: "Income (your usual sales item)" });
  if (h) lines.push({ item: "Retainage", amount: -h, account: "Retainage Receivable (Other Current Assets)" });
  if (rel) lines.push({ item: "Retainage", amount: rel, account: "Retainage Receivable (Other Current Assets)" });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { errors, lines, total, retainageChange: h - rel };
}

// Prompt payment: when a contractor must pass the owner's payment down to a
// sub, and simple interest on what is late. Each row was read from the
// legislature's own text through search results on 2026-11-25 (see
// prompt-payment-laws.html). `rate` is null where the text we could read
// did not confirm a figure: the page says so instead of guessing.
export const PROMPT_PAY = {
  tx: { state: "Texas", law: "Property Code §28.002(b), §28.004", days: 7, rate: 0.015, per: "month", method: "prorata",
    url: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.28.htm" },
  ca: { state: "California", law: "Business and Professions Code §7108.5", days: 7, rate: null, per: "month", method: "prorata",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=7108.5" },
  il: { state: "Illinois", law: "Contractor Prompt Payment Act, 815 ILCS 603/10", days: 15, rate: 0.10, per: "year", method: "prorata",
    url: "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=2941&ChapterID=67" },
  nc: { state: "North Carolina", law: "G.S. 22C-2, 22C-5", days: 7, rate: 0.01, per: "month", method: "fraction",
    url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_22C.html" },
  pa: { state: "Pennsylvania", law: "Contractor and Subcontractor Payment Act (1994 Act 7, amended 2018 Act 27)", days: 14, rate: null, per: "month", method: "prorata",
    url: "https://www.legis.state.pa.us/WU01/LI/LI/US/HTM/1994/0/0007..HTM" },
  va: { state: "Virginia (public work)", law: "Code of Virginia §2.2-4354", days: 7, rate: 0.01, per: "month", method: "prorata",
    url: "https://law.lis.virginia.gov/vacode/title2.2/chapter43/section2.2-4354/" },
  fl: { state: "Florida (local government work)", law: "Florida Statutes §218.735(6)", days: 10, rate: null, per: "month", method: "prorata",
    url: "https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0200-0299%2F0218%2FSections%2F0218.735.html" },
};

const DAY = 86400000;
function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
const isoDate = (t) => new Date(t).toISOString().slice(0, 10);

// Simple interest, no compounding. A "month" is 30 days and a year 365:
// the statutes read do not define either, so the page states the assumption.
// method "fraction": each month or part of a month counts in full
// (North Carolina's "per month or a fraction thereof").
export function promptPayInterest({ amount, received, paid, days, rate, per = "month", method = "prorata" } = {}) {
  const errors = [];
  const a = toCents(amount);
  const r = toRate(rate);
  const rec = parseDate(received);
  const pd = parseDate(paid);
  const n = Number(String(days ?? "").trim());
  if (Number.isNaN(a) || a <= 0) errors.push("Enter the amount owed to you as a positive number.");
  if (Number.isNaN(rec)) errors.push("Enter the date the contractor was paid as YYYY-MM-DD.");
  if (Number.isNaN(pd)) errors.push("Enter the date you were paid (or today) as YYYY-MM-DD.");
  if (!Number.isInteger(n) || n < 0 || n > 365) errors.push("Days to pay must be a whole number from 0 to 365.");
  if (Number.isNaN(r) || r < 0 || r > 1) errors.push("The interest rate must be between 0% and 100%.");
  if (per !== "month" && per !== "year") errors.push("The rate must be per month or per year.");
  if (errors.length) return { errors };
  const due = rec + n * DAY;
  const late = Math.max(0, Math.round((pd - due) / DAY));
  let periods;
  if (per === "year") periods = late / 365;
  else periods = method === "fraction" ? Math.ceil(late / 30) : late / 30;
  const interest = Math.round(a * r * periods);
  return { errors, due: isoDate(due), daysLate: late, interest, total: a + interest };
}
