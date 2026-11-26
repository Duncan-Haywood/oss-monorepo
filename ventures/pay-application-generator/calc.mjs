// Pay application generator: a schedule of values in, a progress-billing summary (contract sum, completed and stored,
// retainage, previous certificates, current payment due) and a line-by-line table out, with findings on lines that
// are over-billed, front-loaded or missing a retainage rate. All arithmetic is integer cents and basis points.

export const FORMAT_NOTE = "Summary lines follow the usual progress-billing layout (contract sum, change orders, completed and stored, retainage, previous certificates, payment due, balance to finish). It is not the AIA G702/G703 form and is not affiliated with the American Institute of Architects.";

export function parseCsv(text) {
  const rows = [];
  const src = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
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
  const n = /^\d+(\.\d+)?$|^\.\d+$/.test(t) ? Number(t) : NaN; // decimal only: "0x10" or "1e1" is not a percent
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null; // basis points
}

export const dollars = (c) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pctText = (bp) => `${(bp / 100).toFixed(2)}%`;
// Half a cent rounds away from zero, as Excel's and LibreOffice's ROUND do, so a deductive change order's retainage is
// the mirror of the same amount billed (Math.round would take -123.455 to -123.45 but 123.455 to 123.46) and the
// workbook's formulas give the page's numbers.
const roundCents = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
const mulBp = (cents, bp) => roundCents((cents * bp) / 10000);

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

// A change order by its number. The Item column takes a compact "CO5"; a description needs a separator after the CO
// ("CO-2", "CO 2", "C.O. 2") so a base-contract line like "CO2 sensors" is not read as change order 2.
export const CO_ITEM = /^(c\.?\s?o\.?[-\s#]*\d+|change order)/i;
export const CO_DESC = /^(c\.?\s?o(\.|[-\s#])[-\s#]*\d+|change order)/i;

// settings: { retainagePct, storedRetainagePct, reduceAtPct, reducedPct, reduceMode ("all" | "remaining"),
//             previousCertificates (dollars string or ""), project, applicationNo, periodTo, contractor, owner }
//
// Two ways a contract reduces retainage once the job reaches a percent complete:
//   "all" (default): the reduced rate applies to everything billed, so part of what was held is released.
//   "remaining": what was held stays held. The first reduceAtPct of the contract sum to date keeps the full rate and
//   only work billed past that point is held at the reduced rate ("no further retainage after 50%" is reducedPct 0).
//   The amount past the point is spread across the lines in proportion to their work billed, so a line's share is
//   work x min(1, threshold / total completed and stored). With no stored materials and no per-line rates the total is
//   exact: base rate x threshold + reduced rate x (work - threshold).
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
  const mode = settings.reduceMode === "remaining" ? "remaining" : "all";

  const raw = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : (row[idx[k]] ?? ""));
    const label = (get("desc") || get("item")).trim() || `Line ${r}`;
    const c = parseMoney(get("scheduled")), d = parseMoney(get("previous")), e = parseMoney(get("thisPeriod")), f = parseMoney(get("stored"));
    if ([c, d, e, f].some((v) => v == null)) { out.errors.push(`Row ${r + 1} (${label}): a money column is not a number.`); continue; }
    const own = get("retainage").trim() === "" ? null : parsePercent(get("retainage"));
    if (get("retainage").trim() !== "" && own == null) { out.errors.push(`Row ${r + 1} (${label}): retainage is not a percentage.`); continue; }
    const isCo = /^(co|change|change order)$/i.test(get("type").trim()) || CO_ITEM.test(get("item").trim()) || CO_DESC.test(label);
    raw.push({ item: get("item").trim(), desc: get("desc").trim() || label, c, d, e, f, own, isCo });
  }
  if (out.errors.length) return out;
  if (!raw.length) { out.errors.push("No lines found."); return out; }

  const sum = (k, filter = () => true) => raw.filter(filter).reduce((a, x) => a + x[k], 0);
  const totalC = sum("c");
  const totalG = sum("d") + sum("e") + sum("f");
  const completeBp = totalC > 0 ? Math.round((totalG * 10000) / totalC) : 0;
  const reduced = reduceAt != null && reducedRate != null && completeBp >= reduceAt;
  const prospective = reduced && mode === "remaining";
  const workRate = reduced && !prospective ? reducedRate : baseRate;
  const thresholdCents = prospective ? mulBp(totalC, reduceAt) : null;
  // Retainage on an amount of work for a default-rate line. In "remaining" mode the share of the work billed before the
  // threshold (in proportion, against the total it is measured on) keeps the base rate and the rest takes the reduced one.
  const workRet = (work, measuredTotal) => {
    if (!prospective || measuredTotal <= thresholdCents) return mulBp(work, workRate);
    const pre = roundCents((work * thresholdCents) / measuredTotal);
    return mulBp(pre, baseRate) + mulBp(work - pre, reducedRate);
  };

  for (const x of raw) {
    const g = x.d + x.e + x.f;
    const rate = x.own != null ? x.own : workRate;
    const srate = x.own != null ? x.own : storedRate;
    const retWork = x.own != null ? mulBp(x.d + x.e, x.own) : workRet(x.d + x.e, totalG);
    const ret = retWork + mulBp(x.f, srate);
    const pct = x.c !== 0 ? Math.round((g * 10000) / x.c) : null;
    out.lines.push({ ...x, g, pct, balance: x.c - g, ret, retWork, retStored: mulBp(x.f, srate), rate });
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
  const totalD = sum("d");
  const prevRetained = out.lines.reduce((a, l) => a + (l.own != null ? mulBp(l.d, l.own) : workRet(l.d, totalD)), 0);
  let previous = prevGiven ? parseMoney(settings.previousCertificates) : sum("d") - prevRetained;
  if (previous == null) { out.errors.push("Previous certificates is not a dollar amount."); return out; }
  if (!prevGiven) findings.push({ severity: "info", title: `Previous certificates for payment were estimated as previous work less retainage at today's rate (${dollars(previous)}). Enter the real figure from your last application if the rate or contract changed.` });
  const due = earnedLess - previous;
  if (due < 0) findings.push({ severity: "high", title: `Current payment due is negative (${dollars(due)}). Previous certificates exceed what is earned less retainage to date; check the previous figure.` });
  if (reduced && !prospective) findings.push({ severity: "info", title: `Work is ${pctText(completeBp)} complete, so retainage on work uses the reduced rate of ${pctText(reducedRate)} on everything billed. Many contracts reduce only on the remaining work; check yours and choose "only on work billed after that point" if so.` });
  if (prospective) findings.push({ severity: "info", title: `Work is ${pctText(completeBp)} complete. The first ${pctText(reduceAt)} of the contract sum (${dollars(thresholdCents)}) keeps ${pctText(baseRate)} retainage and the ${dollars(Math.max(totalG - thresholdCents, 0))} completed past it is held at ${pctText(reducedRate)}, spread across the lines in proportion. If your owner applied the reduction from a later application, enter the previous certificates from your last application so the payment due is exact.` });
  if (completeBp > 10000) findings.push({ severity: "high", title: `The whole application is ${pctText(completeBp)} of the contract sum. Total completed cannot exceed the contract sum to date.` });

  const early = out.lines.filter((l) => l.c > 0 && l.pct != null && l.pct >= 9000 && l.pct <= 10000 && l.e > 0);
  if (completeBp < 3000 && early.length) findings.push({ severity: "medium", title: `Front-loading flag: ${early.map((l) => l.desc).join(", ")} ${early.length === 1 ? "is" : "are"} 90%+ billed while the whole job is only ${pctText(completeBp)} done. Owners' reviewers look for this.` });

  out.summary = {
    original, changes, contractToDate, completed, completeBp, retWork, retStored, retainage, earnedLess, previous, due,
    balanceToFinish: contractToDate - earnedLess, retainageReleasable: retainage, finalDueIfReleased: due + retainage,
    workRateBp: workRate, reduced, reduceMode: prospective ? "remaining" : "all", reducedRateBp: reducedRate, reduceAtBp: reduceAt,
    thresholdCents, previousEstimated: !prevGiven,
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

// Next month's application from this one. On a progress-billing continuation sheet, next period's "previous"
// is this period's previous plus this period (work only; stored materials stay in their own column until they are
// installed), "this period" starts at zero, and next period's previous certificates equal this application's
// total earned less retainage (line 6). Carrying that figure forward exactly is what stops the estimate finding.
// Returns { csv, settings, notes } or null when there is no result to roll.
const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
export function nextPeriodEnd(periodTo) {
  const m = isoDate.exec(String(periodTo ?? "").trim());
  if (!m) return "";
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const lastDay = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // mm is 1-based here
  const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
  // A period that ended on the last day of its month rolls to the last day of the next; otherwise the same day,
  // clipped to the next month's length.
  const nd = d >= lastDay(y, mo) ? lastDay(ny, nm) : Math.min(d, lastDay(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function nextPeriod(result, s = {}) {
  if (!result || !result.summary || result.errors?.length) return null;
  const ownRates = result.lines.some((l) => l.own != null);
  const head = ["Item", "Description", "Type", "Scheduled value", "Previous", "This period", "Stored"].concat(ownRates ? ["Retainage"] : []);
  const rows = result.lines.map((l) => [l.item, l.desc, l.isCo ? "CO" : "", plain(l.c), plain(l.d + l.e), "0.00", plain(l.f)]
    .concat(ownRates ? [l.own == null ? "" : (l.own / 100).toFixed(2)] : []));
  const csv = [head, ...rows].map((r) => r.map(q).join(",")).join("\n");
  const appNo = String(s.applicationNo ?? "").trim();
  const settings = {
    ...s,
    previousCertificates: plain(result.summary.earnedLess),
    applicationNo: /^\d+$/.test(appNo) ? String(Number(appNo) + 1) : appNo,
    periodTo: nextPeriodEnd(s.periodTo),
  };
  const notes = [`Previous certificates set to ${dollars(result.summary.earnedLess)}: this application's total earned less retainage, which is what will have been certified once it is paid. If the owner certified a different amount, enter that instead.`];
  const stored = result.lines.filter((l) => l.f !== 0);
  if (stored.length) notes.push(`Stored materials carried forward as still stored on ${stored.length} line${stored.length === 1 ? "" : "s"} (${stored.map((l) => l.desc).join(", ")}). When they are installed, take them out of Stored and bill them in This period.`);
  const done = result.lines.filter((l) => l.c > 0 && l.balance <= 0).length;
  if (done) notes.push(`${done} line${done === 1 ? " is" : "s are"} fully billed; leave This period at zero on ${done === 1 ? "it" : "them"}.`);
  return { csv, settings, notes };
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
