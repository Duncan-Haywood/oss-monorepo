// Section 1256 (60/40) calculator: Form 1099-B boxes 8-11 in, blended-rate tax and the saving against short-term out.
// Rule modelled (IRC 1256): regulated futures, broad-based index options (SPX, NDX, VIX), and some foreign currency
// contracts are marked to market at year end. Net gain or loss is treated 60% long-term and 40% short-term no matter
// how long the position was held. Form 1099-B box 11 = realized (8) + this year-end unrealized (10) - last year-end
// unrealized (9). A net loss may be carried back three years against earlier net 1256 gains by checking box D on
// Form 6781 (IRC 1212(c)); only the part not absorbed by other capital gains and the $3,000 allowance qualifies.

export const RULES_REVIEWED = "2026-10-08";
export const LONG_TERM_SHARE = 0.6;
export const SHORT_TERM_SHARE = 0.4;
export const NIIT_RATE = 0.038;

export const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const r2 = (x) => Math.round(x * 100) / 100;
// One amount: "$1,200.00", "(1,200)", "-$1,200", "$-1,200", "USD -500", "1200-", "1.5E+04". Anything that is not
// exactly one number ("12-34", "1.2.3") is NaN, so the row is refused rather than read as a different amount.
const num = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  if (/\d\s+[\d.]/.test(t)) return NaN;
  const paren = /^\(.*\)$/.test(t);
  let b = (paren ? t.slice(1, -1) : t).replace(/\u2212/g, "-").replace(/\b(?:USD|US\$)/gi, "").replace(/[$\s,]/g, "");
  let neg = paren;
  if (/^[-+]/.test(b)) { neg = neg || b[0] === "-"; b = b.slice(1); }
  else if (/-$/.test(b)) { neg = true; b = b.slice(0, -1); }
  if (!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(b)) return NaN;
  const v = Number(b);
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
    if (f.length > 4) { errors.push(`Row ${i + 1} has ${f.length} fields, not 4: ${lines[i].slice(0, 60)}. If amounts have thousands separators, put them in quotes or remove the commas.`); continue; }
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
  const pct = (x, d) => (Number.isFinite(x) ? x : d) / 100;
  const ordinary = pct(rates.ordinary, 32), longTerm = pct(rates.longTerm, 15), niit = Boolean(rates.niit);
  if (![ordinary, longTerm].every((x) => x >= 0 && x <= 1)) return { error: "Tax rates must be between 0 and 100 percent." };
  const net = r2(p.rows.reduce((s, r) => s + r.aggregate, 0));
  const lt = r2(net * LONG_TERM_SHARE), st = r2(net - lt);
  const t = taxOn(net, { ordinary, longTerm, niit });
  // A net loss is not "negative tax": only $3,000 ($1,500 married filing separately) of net capital loss is
  // deductible against other income this year (IRC 1211(b)), so the 60/40 tax comparison does not apply.
  if (net < 0) { t.as1256 = null; t.asShortTerm = null; t.saving = null; }
  const notes = [];
  if (net < 0) notes.push(`Net 1256 loss of ${money(-net)}. It first offsets your other capital gains, then up to $3,000 ($1,500 if married filing separately) of other income this year. Checking box D on Form 6781 (amount on Part I line 6) elects to carry the rest back three years against earlier net 1256 gains, earliest year first and no more than each year's net 1256 gain; it is claimed with Form 1045 or an amended return, and estates and trusts cannot elect it. Ask a preparer whether it pays for you.`);
  if (net > 0 && t.saving >= 0) notes.push(`Against taxing the same gain as short-term, the 60/40 split saves about ${money(t.saving)} at the rates you entered. Rates are your marginal rates, not a bracket calculation.`);
  if (net > 0 && t.saving < 0) notes.push(`At the rates you entered the 60/40 split costs about ${money(-t.saving)} more than taxing the gain as short-term, because the long-term rate is above the ordinary rate. Long-term rates are at or below the ordinary rate in every federal bracket, so check the rates.`);
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
    ...(s.net < 0 ? [] : [`Tax at 60/40,${s.as1256}`, `Tax if all short-term,${s.asShortTerm}`, `Saving,${s.saving}`]));
  return lines.join("\n");
}
