// Pay application generator: a schedule of values in, a progress-billing summary (contract sum, completed and stored,
// retainage, previous certificates, current payment due) and a line-by-line table out, with findings on lines that
// are over-billed, front-loaded or missing a retainage rate. All arithmetic is integer cents and basis points.

export const FORMAT_NOTE = "Summary lines follow the usual progress-billing layout (contract sum, change orders, completed and stored, retainage, previous certificates, payment due, balance to finish). It is not the AIA G702/G703 form and is not affiliated with the American Institute of Architects.";

export function parseCsv(text) {
  const rows = [];
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delim = src.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// Money in cents. Accepts $1,234.50, (1,234.50) and -1234.5 so a deductive change order can be entered; blank is 0.
export function parseMoney(s) {
  let t = String(s ?? "").trim();
  if (t === "") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [d, c = ""] = t.split(".");
  const v = parseInt(d, 10) * 100 + parseInt((c + "00").slice(0, 2), 10);
  return neg ? -v : v;
}

// "10", "10%" or "0.1" are not all the same thing; a bare number is percent, so 10 means ten percent.
export function parsePercent(s) {
  const t = String(s ?? "").trim().replace(/%$/, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null; // basis points
}

export const dollars = (c) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pctText = (bp) => `${(bp / 100).toFixed(2)}%`;
const mulBp = (cents, bp) => Math.round((cents * bp) / 10000);

const ALIASES = {
  item: ["item", "item no", "item number", "no", "line", "code", "cost code"],
  desc: ["description", "description of work", "desc", "work", "name"],
  scheduled: ["scheduled value", "contract value", "value", "amount", "contract amount", "sov", "c"],
  previous: ["previous", "previous applications", "from previous application", "work completed previous", "previous billed", "d"],
  thisPeriod: ["this period", "work completed this period", "current", "this application", "e"],
  stored: ["stored", "materials stored", "stored materials", "materials presently stored", "f"],
  type: ["type", "kind"],
  retainage: ["retainage", "retainage percent", "retainage %", "retention"],
};
const norm = (h) => String(h).trim().toLowerCase().replace(/[_%]/g, (m) => (m === "%" ? " %" : " ")).replace(/\s+/g, " ").replace(/ %$/, "%").trim();

function mapHeaders(header) {
  const idx = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [k, names] of Object.entries(ALIASES)) if (idx[k] == null && names.includes(n)) idx[k] = i;
  });
  return idx;
}

// settings: { retainagePct, storedRetainagePct, reduceAtPct, reducedPct, previousCertificates (dollars string or ""),
//             project, applicationNo, periodTo, contractor, owner }
export function compute(text, settings = {}) {
  const grid = parseCsv(text);
  const findings = [];
  const out = { lines: [], summary: null, findings, errors: [] };
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one line."); return out; }
  const idx = mapHeaders(grid[0]);
  if (idx.scheduled == null) { out.errors.push("No scheduled value column. Name a column 'Scheduled value'."); return out; }
  if (idx.desc == null && idx.item == null) { out.errors.push("No description column. Name a column 'Description'."); return out; }

  const baseRate = parsePercent(settings.retainagePct ?? "10");
  const storedRate = settings.storedRetainagePct === "" || settings.storedRetainagePct == null ? baseRate : parsePercent(settings.storedRetainagePct);
  if (baseRate == null || storedRate == null) { out.errors.push("Retainage must be a percentage from 0 to 100."); return out; }
  const reduceAt = settings.reduceAtPct === "" || settings.reduceAtPct == null ? null : parsePercent(settings.reduceAtPct);
  const reducedRate = settings.reducedPct === "" || settings.reducedPct == null ? null : parsePercent(settings.reducedPct);

  const raw = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : (row[idx[k]] ?? ""));
    const label = (get("desc") || get("item")).trim() || `Line ${r}`;
    const c = parseMoney(get("scheduled")), d = parseMoney(get("previous")), e = parseMoney(get("thisPeriod")), f = parseMoney(get("stored"));
    if ([c, d, e, f].some((v) => v == null)) { out.errors.push(`Row ${r + 1} (${label}): a money column is not a number.`); continue; }
    const own = get("retainage").trim() === "" ? null : parsePercent(get("retainage"));
    if (get("retainage").trim() !== "" && own == null) { out.errors.push(`Row ${r + 1} (${label}): retainage is not a percentage.`); continue; }
    const isCo = /^(co|change|change order)$/i.test(get("type").trim()) || /^(co[-\s#]*\d+|change order)/i.test(get("item").trim()) || /^(co[-\s#]*\d+|change order)/i.test(label);
    raw.push({ item: get("item").trim(), desc: get("desc").trim() || label, c, d, e, f, own, isCo });
  }
  if (out.errors.length) return out;
  if (!raw.length) { out.errors.push("No lines found."); return out; }

  const sum = (k, filter = () => true) => raw.filter(filter).reduce((a, x) => a + x[k], 0);
  const totalC = sum("c");
  const totalG = sum("d") + sum("e") + sum("f");
  const completeBp = totalC > 0 ? Math.round((totalG * 10000) / totalC) : 0;
  const reduced = reduceAt != null && reducedRate != null && completeBp >= reduceAt;
  const workRate = reduced ? reducedRate : baseRate;

  for (const x of raw) {
    const g = x.d + x.e + x.f;
    const rate = x.own != null ? x.own : workRate;
    const srate = x.own != null ? x.own : storedRate;
    const ret = mulBp(x.d + x.e, rate) + mulBp(x.f, srate);
    const pct = x.c !== 0 ? Math.round((g * 10000) / x.c) : null;
    out.lines.push({ ...x, g, pct, balance: x.c - g, ret, retWork: mulBp(x.d + x.e, rate), retStored: mulBp(x.f, srate), rate });
    if (x.c > 0 && g > x.c) findings.push({ severity: "high", title: `${x.desc}: billed ${dollars(g)} against a scheduled value of ${dollars(x.c)}, ${dollars(g - x.c)} over. Fix the line or add a change order.` });
    if (x.c <= 0 && g > 0 && !x.isCo) findings.push({ severity: "high", title: `${x.desc}: work is billed on a line with no scheduled value.` });
    if (x.e < 0 && x.c >= 0) findings.push({ severity: "medium", title: `${x.desc}: this period is negative (${dollars(x.e)}). That reverses earlier billing; the owner may question it.` });
    if (x.f > 0 && x.own == null && storedRate === 0) findings.push({ severity: "info", title: `${x.desc}: materials are stored but retainage is 0%. Check what your contract says about stored materials.` });
  }

  const original = sum("c", (x) => !x.isCo), changes = sum("c", (x) => x.isCo);
  const contractToDate = original + changes;
  const completed = totalG;
  const retWork = out.lines.reduce((a, l) => a + l.retWork, 0), retStored = out.lines.reduce((a, l) => a + l.retStored, 0);
  const retainage = retWork + retStored;
  const earnedLess = completed - retainage;
  const prevGiven = String(settings.previousCertificates ?? "").trim() !== "";
  const prevRetained = out.lines.reduce((a, l) => a + mulBp(l.d, l.rate), 0);
  let previous = prevGiven ? parseMoney(settings.previousCertificates) : sum("d") - prevRetained;
  if (previous == null) { out.errors.push("Previous certificates is not a dollar amount."); return out; }
  if (!prevGiven) findings.push({ severity: "info", title: `Previous certificates for payment were estimated as previous work less retainage at today's rate (${dollars(previous)}). Enter the real figure from your last application if the rate or contract changed.` });
  const due = earnedLess - previous;
  if (due < 0) findings.push({ severity: "high", title: `Current payment due is negative (${dollars(due)}). Previous certificates exceed what is earned less retainage to date; check the previous figure.` });
  if (reduced) findings.push({ severity: "info", title: `Work is ${pctText(completeBp)} complete, so retainage on work uses the reduced rate of ${pctText(reducedRate)} on everything billed. Many contracts reduce only on the remaining work; check yours.` });
  if (completeBp > 10000) findings.push({ severity: "high", title: `The whole application is ${pctText(completeBp)} of the contract sum. Total completed cannot exceed the contract sum to date.` });

  const early = out.lines.filter((l) => l.c > 0 && l.pct != null && l.pct >= 9000 && l.pct <= 10000 && l.e > 0);
  if (completeBp < 3000 && early.length) findings.push({ severity: "medium", title: `Front-loading flag: ${early.map((l) => l.desc).join(", ")} ${early.length === 1 ? "is" : "are"} 90%+ billed while the whole job is only ${pctText(completeBp)} done. Owners' reviewers look for this.` });

  out.summary = {
    original, changes, contractToDate, completed, completeBp, retWork, retStored, retainage, earnedLess, previous, due,
    balanceToFinish: contractToDate - earnedLess, retainageReleasable: retainage, finalDueIfReleased: due + retainage,
    workRateBp: workRate, reduced, previousEstimated: !prevGiven,
  };
  return out;
}

export function summaryText(result, s = {}) {
  const m = result.summary, L = (n, label, v) => `${String(n).padEnd(4)}${label.padEnd(44)}${dollars(v).padStart(16)}`;
  return [
    `PAYMENT APPLICATION${s.applicationNo ? ` NO. ${s.applicationNo}` : ""}`,
    s.project ? `Project: ${s.project}` : "", s.contractor ? `Contractor: ${s.contractor}` : "", s.owner ? `To: ${s.owner}` : "", s.periodTo ? `Period to: ${s.periodTo}` : "",
    "",
    L("1.", "Original contract sum", m.original),
    L("2.", "Net change by change orders", m.changes),
    L("3.", "Contract sum to date (1 + 2)", m.contractToDate),
    L("4.", "Total completed and stored to date", m.completed),
    L("5.", `Retainage (work ${dollars(m.retWork)}, stored ${dollars(m.retStored)})`, m.retainage),
    L("6.", "Total earned less retainage (4 - 5)", m.earnedLess),
    L("7.", "Less previous certificates for payment", m.previous),
    L("8.", "CURRENT PAYMENT DUE (6 - 7)", m.due),
    L("9.", "Balance to finish, including retainage (3 - 6)", m.balanceToFinish),
    "", FORMAT_NOTE,
  ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
}

const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const plain = (c) => (c / 100).toFixed(2);
export function scheduleCsv(result) {
  const head = ["Item", "Description", "Scheduled value", "Previous", "This period", "Stored", "Total completed and stored", "Percent", "Balance to finish", "Retainage"];
  const rows = result.lines.map((l) => [l.item, l.desc, plain(l.c), plain(l.d), plain(l.e), plain(l.f), plain(l.g), l.pct == null ? "" : (l.pct / 100).toFixed(2), plain(l.balance), plain(l.ret)]);
  const m = result.summary;
  rows.push(["", "TOTAL", plain(m.contractToDate), plain(result.lines.reduce((a, l) => a + l.d, 0)), plain(result.lines.reduce((a, l) => a + l.e, 0)), plain(result.lines.reduce((a, l) => a + l.f, 0)), plain(m.completed), (m.completeBp / 100).toFixed(2), plain(m.contractToDate - m.completed), plain(m.retainage)]);
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n");
}

export function sampleList() {
  return [
    "Item,Description,Scheduled value,Previous,This period,Stored",
    "1,General conditions,48000,24000,6000,0",
    "2,Demolition,22000,22000,0,0",
    "3,Framing,86000,60000,20000,0",
    "4,Electrical rough-in,64000,20000,16000,8000",
    "5,Plumbing rough-in,52000,15000,10000,0",
    "6,HVAC,95000,10000,0,30000",
    "7,Drywall,41000,0,0,0",
    "8,Finishes,120000,0,0,0",
    "CO-1,Added egress window (change order 1),7800,0,7800,0",
    "CO-2,Deduct owner-supplied fixtures (change order 2),-3500,0,-3500,0",
  ].join("\n");
}
export const SAMPLE_SETTINGS = { retainagePct: "10", storedRetainagePct: "", reduceAtPct: "", reducedPct: "", previousCertificates: "", project: "Example Office Renovation", applicationNo: "4", periodTo: "2026-10-31", contractor: "Example Builders LLC", owner: "Example Owner Inc." };
