// Pay application check: this month's draft against last month's approved application.
//
// A reviewer at the GC opens last month's approved continuation sheet next to
// the new one. Most send-backs are mismatches between the two, which the
// draft's own arithmetic cannot show:
//   - "from previous applications" on a line is not last month's previous +
//     this period on that line (the approved figures, not the submitted ones);
//   - a scheduled value changed, or a base-contract line appeared or went
//     missing, without a change order;
//   - "previous certificates" is not last month's earned less retainage;
//   - stored materials went down by more than was billed as installed;
//   - the retainage rate changed without a note (a reduction is fine if agreed).
// The draft's own checks (over-billing, negative lines) come from compute().
// Pure functions, no I/O. Money is integer cents.

import { compute, fmt, toCents } from "./calc.mjs";
import { parseCsv } from "./colog.mjs";

// Header words to the line field they fill. Matches the calculator's own CSV
// export ("From previous applications", "This period", ...) and common
// spreadsheet headings.
const HEADERS = [
  ["item", /^(item|item\s*(no\.?|#|number)|line|no\.?|#)$/],
  ["description", /^(description|description of work|work|scope)$/],
  ["scheduled", /^(scheduled value|scheduled|sov|value|budget|contract value)$/],
  ["previous", /^(from previous applications?|previous|previously billed|work completed: from previous application|from previous|prior)$/],
  ["thisPeriod", /^(this period|work completed: this period|this application|current|this month|current period)$/],
  ["stored", /^(materials presently stored|stored|stored materials|materials stored)$/],
];

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*\(.*\)$/, "");

// CSV or tab-separated text with a header row -> { lines, errors }.
// A row whose description is "Totals" or "Total" (the calculator's export) is skipped.
export function parseSov(text) {
  const rows = parseCsv(text);
  const errors = [];
  if (!rows.length) return { lines: [], errors: ["Paste a schedule of values with a header row."] };
  const cols = {};
  rows[0].forEach((h, i) => {
    const n = norm(h);
    for (const [key, re] of HEADERS) if (cols[key] === undefined && re.test(n)) cols[key] = i;
  });
  for (const key of ["item", "scheduled", "previous", "thisPeriod"]) {
    if (cols[key] === undefined) errors.push(`No "${key === "thisPeriod" ? "this period" : key === "scheduled" ? "scheduled value" : key}" column found in the header row.`);
  }
  if (errors.length) return { lines: [], errors };
  const lines = [];
  for (const r of rows.slice(1)) {
    const get = (k) => (cols[k] === undefined ? "" : (r[cols[k]] ?? "").trim());
    if (/^totals?$/i.test(get("description")) || /^totals?$/i.test(get("item"))) continue;
    lines.push({ item: get("item"), description: get("description"), scheduled: get("scheduled"), previous: get("previous"), thisPeriod: get("thisPeriod"), stored: get("stored") });
  }
  return { lines, errors };
}

const key = (item) => String(item ?? "").trim().toLowerCase().replace(/\s+/g, "");

// last, draft: { lines, settings } as compute() takes them.
// Returns { last, draft (compute results), findings, expected } where expected
// holds the previous-certificates figure the draft should carry.
export function checkPayApp(last, draft) {
  const findings = [];
  const add = (level, msg) => findings.push({ level, msg });
  const L = compute(last.lines, last.settings);
  const D = compute(draft.lines, draft.settings);
  for (const f of L.findings) if (f.level === "high") add("info", `Last month's application: ${f.msg}`);
  for (const f of D.findings) add(f.level, `This draft: ${f.msg}`);

  const seen = new Map();
  for (const r of L.rows) {
    if (!r.item) { add("medium", `Last month's application has a line with no item number ("${r.description}"); it cannot be matched.`); continue; }
    if (seen.has(key(r.item))) add("medium", `Last month's application uses item ${r.item} twice; lines are matched by item number.`);
    seen.set(key(r.item), r);
  }
  const matched = new Set();
  for (const r of D.rows) {
    const label = r.item ? `Item ${r.item}` : `"${r.description}"`;
    const p = r.item ? seen.get(key(r.item)) : undefined;
    if (!r.item) { add("medium", `${label} has no item number, so it cannot be matched to last month.`); continue; }
    if (matched.has(key(r.item))) { add("high", `Item ${r.item} appears twice in this draft.`); continue; }
    matched.add(key(r.item));
    if (!p) {
      if (r.changeOrder) add("info", `${label} is new this month as a change order (${fmt(r.C)}). Attach the signed change order.`);
      else add("high", `${label} is new this month but is not numbered as a change order. A base-contract line that was not on last month's schedule is usually sent back; number added work as a change order (CO-1, CO-2...).`);
      if (r.D !== 0) add("high", `${label} is new this month but shows ${fmt(r.D)} from previous applications. Nothing was billed on it before.`);
      continue;
    }
    if (r.C !== p.C) add("high", `${label}: scheduled value changed from ${fmt(p.C)} to ${fmt(r.C)}. The schedule of values only changes through an approved change order on its own line; put the old value back.`);
    const wantPrev = p.D + p.E;
    if (r.D !== wantPrev) add("high", `${label}: "from previous applications" is ${fmt(r.D)}; last month's previous plus this period was ${fmt(wantPrev)}. Off by ${fmt(r.D - wantPrev)}. If the GC approved a different amount last month, use the approved figures for last month.`);
    const storedDrop = p.F - r.F;
    if (storedDrop > 0 && storedDrop > r.E) add("medium", `${label}: stored materials went down by ${fmt(storedDrop)} but only ${fmt(r.E)} was billed as work this period. Materials leave the stored column when they are installed and billed as work; check where the other ${fmt(storedDrop - r.E)} went.`);
    if (r.F > 0 && p.F === 0) add("info", `${label}: ${fmt(r.F)} of materials stored for the first time. Reviewers usually ask for the invoice and proof of storage (and insurance, if stored off site).`);
  }
  for (const r of L.rows) {
    if (r.item && !matched.has(key(r.item))) add("high", `Item ${r.item} ("${r.description}") was on last month's application and is missing from this draft. Lines stay on the schedule until the job is closed, even at 100%.`);
  }

  const lt = L.totals, dt = D.totals;
  if (dt.previousCertificates !== lt.earnedLessRetainage) add("high", `Previous certificates is ${fmt(dt.previousCertificates)}; last month's total earned less retainage was ${fmt(lt.earnedLessRetainage)}. They should match unless the GC certified a different amount (then use the certified figure and keep the reason on file).`);
  const lw = String(last.settings?.workRetainage ?? "10"), dw = String(draft.settings?.workRetainage ?? "10");
  if (toCents(lw) !== toCents(dw)) add("medium", `Retainage on work changed from ${lw}% to ${dw}%. Fine if a reduction was agreed in writing; attach it. Note that a lower rate this month also changes retainage on all earlier work.`);
  if (dt.retainageReleased < lt.retainageReleased) add("medium", `Retainage released went down from ${fmt(lt.retainageReleased)} to ${fmt(dt.retainageReleased)}. Release is cumulative to date.`);
  if (dt.thisPeriod === 0 && dt.stored <= lt.stored) add("info", "No work billed this period. Check that is intended.");

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return { last: L, draft: D, findings, expected: { previousCertificates: lt.earnedLessRetainage } };
}

// Plain-text list for an email or a note to the office.
export function checkText(result, s = {}) {
  const t = result.draft.totals;
  const head = [
    `PAY APPLICATION CHECK${s.project ? `: ${s.project}` : ""} (worksheet, check before sending)`,
    `Current payment due on this draft: ${fmt(t.currentPaymentDue)}`,
    `Previous certificates should be: ${fmt(result.expected.previousCertificates)}`,
    "",
  ];
  const body = result.findings.length ? result.findings.map((f) => `[${f.level}] ${f.msg}`) : ["No mismatches found between the two applications."];
  return [...head, ...body].join("\n") + "\n";
}

export const SAMPLE_LAST = `Item,Description,Scheduled value,From previous applications,This period,Materials presently stored
1,Mobilization and general conditions,12000,4000,2000,0
2,Underground conduit,40000,8000,12000,0
3,Switchgear,60000,0,9000,20000
4,Branch wiring and devices,38000,0,0,0
`;
export const SAMPLE_DRAFT = `Item,Description,Scheduled value,From previous applications,This period,Materials presently stored
1,Mobilization and general conditions,12000,6000,2000,0
2,Underground conduit,42000,20000,10000,0
3,Switchgear,60000,9000,6000,8000
4,Branch wiring and devices,38000,0,7600,0
5,Added EV charger circuits,8500,0,4250,0
`;
export const SAMPLE_SETTINGS = {
  last: { workRetainage: "10", storedRetainage: "10", retainageReleased: "", previousCertificates: "5400" },
  draft: { workRetainage: "10", storedRetainage: "10", retainageReleased: "", previousCertificates: "31500" },
};
