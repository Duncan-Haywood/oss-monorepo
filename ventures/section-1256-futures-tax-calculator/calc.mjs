// Section 1256 (60/40) calculator: Form 1099-B boxes 8-11 in, blended-rate tax and the saving against short-term out.
// Rule modelled (IRC 1256): regulated futures, broad-based index options (SPX, NDX, VIX), and some foreign currency
// contracts are marked to market at year end. Net gain or loss is treated 60% long-term and 40% short-term no matter
// how long the position was held. Form 1099-B box 11 = realized (8) + this year-end unrealized (10) - last year-end
// unrealized (9). A net loss may be carried back three years against earlier 1256 gains (Form 6781 Part II election).

export const RULES_REVIEWED = "2026-10-08";
export const LONG_TERM_SHARE = 0.6;
export const SHORT_TERM_SHARE = 0.4;
export const NIIT_RATE = 0.038;

export const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const r2 = (x) => Math.round(x * 100) / 100;
const num = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const v = parseFloat(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) ? (neg ? -v : v) : NaN;
};

function splitLine(line, delim) {
  const out = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

// Rows: label, realized (box 8), prior-year unrealized (box 9), current-year unrealized (box 10). Header optional.
export function parseRows(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: "No rows found." };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  let start = 0;
  const first = splitLine(lines[0], delim);
  if (first.slice(1).every((x) => x === "" || Number.isNaN(num(x)) || /[a-z]{3,}/i.test(x))) start = 1;
  const rows = [], errors = [];
  for (let i = start; i < lines.length; i++) {
    const f = splitLine(lines[i], delim);
    const v = [num(f[1]), num(f[2]), num(f[3])];
    if (f.length < 2 || v.some(Number.isNaN)) { errors.push(`Row ${i + 1} could not be read: ${lines[i].slice(0, 60)}`); continue; }
    const [realized, prior, current] = v;
    rows.push({ label: f[0] || `Row ${i + 1}`, realized, prior, current, aggregate: r2(realized - prior + current) });
  }
  if (!rows.length) return { error: errors[0] || "No readable rows." };
  return { rows, errors };
}

export function taxOn(net, { ordinary, longTerm, niit = false }) {
  const o = ordinary + (niit ? NIIT_RATE : 0), l = longTerm + (niit ? NIIT_RATE : 0);
  const blended = LONG_TERM_SHARE * l + SHORT_TERM_SHARE * o;
  return { blended, as1256: r2(net * blended), asShortTerm: r2(net * o), saving: r2(net * (o - blended)) };
}

export function evaluate(text, rates = {}) {
  const p = parseRows(text);
  if (p.error) return { error: p.error };
  const ordinary = (rates.ordinary ?? 32) / 100, longTerm = (rates.longTerm ?? 15) / 100, niit = Boolean(rates.niit);
  const net = r2(p.rows.reduce((s, r) => s + r.aggregate, 0));
  const lt = r2(net * LONG_TERM_SHARE), st = r2(net - lt);
  const t = taxOn(net, { ordinary, longTerm, niit });
  const notes = [];
  if (net < 0) notes.push(`Net 1256 loss of ${money(-net)}. Form 6781 Part II lets you elect to carry it back up to three years against earlier net 1256 gains instead of carrying it forward. The election is made on the return for the loss year; ask a preparer whether it pays for you.`);
  if (net > 0) notes.push(`Against taxing the same gain as short-term, the 60/40 split saves about ${money(t.saving)} at the rates you entered. Rates are your marginal rates, not a bracket calculation.`);
  notes.push("Form 1099-B box 11 should equal realized (box 8) minus prior year-end unrealized (box 9) plus current year-end unrealized (box 10). Compare the total here with box 11 on your form.");
  return { rows: p.rows, errors: p.errors, summary: { net, lt, st, ...t, ordinary, longTerm, niit }, notes };
}

export function sampleList() {
  return ["Account,Realized (box 8),Prior year-end unrealized (box 9),Current year-end unrealized (box 10)",
    "Broker A - ES futures,18250.00,-1200.00,3400.00",
    "Broker A - SPX options,-6400.00,0,850.00",
    "Broker B - crude oil futures,4100.00,900.00,-2250.00"].join("\n");
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["Account,Realized,Prior unrealized,Current unrealized,Aggregate (box 11)"];
  for (const x of r.rows) lines.push([q(x.label), x.realized, x.prior, x.current, x.aggregate].join(","));
  const s = r.summary;
  lines.push(["Total", "", "", "", s.net].join(","), `Long-term 60%,${s.lt}`, `Short-term 40%,${s.st}`,
    `Tax at 60/40,${s.as1256}`, `Tax if all short-term,${s.asShortTerm}`, `Saving,${s.saving}`);
  return lines.join("\n");
}
