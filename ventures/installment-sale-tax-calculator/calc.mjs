// Installment sale tax worksheet (IRC section 453, Form 6252). Pure functions, no network, no DOM.
// Rule: when a business or investment asset is sold for a note, the gain is taxed as principal is collected, in the
// proportion gross profit / contract price, instead of all in the sale year. Depreciation recapture is the exception:
// it is recognised in full in the year of sale whatever is paid (IRC 453(i)), and it raises the basis used for the
// gross profit percentage. Interest on the note is ordinary income each year. Every rate is an input, because the
// right rate depends on the seller's other income, which is the whole point of spreading the gain.

export const SAMPLE = {
  price: 1200000,
  basis: 300000,
  expenses: 60000,
  depreciation: 150000,
  down: 240000,
  years: 10,
  rate: 6,
  recaptureRate: 25,
  lumpRate: 20,
  spreadRate: 15,
  extraRate: 8.8,
  discount: 4,
  afr: 4.5,
};

export const dollars = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n) => `${Math.round(n * 10) / 10}%`;

const num = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  return Number(String(v).replace(/[$,%\s]/g, ""));
};
const opt = (v, dflt = 0) => (v === "" || v === null || v === undefined ? dflt : num(v));

export function amortize(principal, ratePct, years) {
  if (principal <= 0 || years <= 0) return [];
  const r = ratePct / 100;
  const pmt = r === 0 ? principal / years : (principal * r) / (1 - Math.pow(1 + r, -years));
  const rows = [];
  let bal = principal;
  for (let i = 1; i <= years; i++) {
    const interest = bal * r;
    const prin = Math.min(bal, pmt - interest);
    bal -= prin;
    rows.push({ i, interest, principal: prin, balance: Math.max(bal, 0) });
  }
  return rows;
}

function schedule(x) {
  const gp = x.price - x.basis - x.expenses;
  const recapture = Math.min(Math.max(x.depreciation, 0), Math.max(gp, 0));
  const instGain = gp - recapture;
  const gpp = instGain / x.price;
  const note = x.price - x.down;
  const years = x.down >= x.price ? 0 : x.years;
  const loan = amortize(note, x.rate, years);
  const state = x.extraRate / 100;
  const rows = [];
  const y0Gain = x.down * gpp;
  rows.push({ label: "Sale year", year: 0, principal: x.down, interest: 0, recapture, gain: y0Gain, balance: note });
  for (const l of loan) rows.push({ label: `Year ${l.i}`, year: l.i, principal: l.principal, interest: l.interest, recapture: 0, gain: l.principal * gpp, balance: l.balance });
  for (const r of rows) {
    r.gainTax = r.recapture * (x.recaptureRate / 100) + r.gain * (x.spreadRate / 100) + (r.recapture + r.gain) * state;
    r.interestTax = r.interest * (x.ordinaryRate / 100 + state);
  }
  return { gp, recapture, instGain, gpp, note, rows };
}

export function compute(raw) {
  const errors = [];
  const x = {
    price: num(raw.price), basis: num(raw.basis), expenses: opt(raw.expenses), depreciation: opt(raw.depreciation),
    down: opt(raw.down), years: opt(raw.years, 5), rate: opt(raw.rate), recaptureRate: opt(raw.recaptureRate, 25),
    lumpRate: opt(raw.lumpRate, 20), spreadRate: opt(raw.spreadRate, 15), extraRate: opt(raw.extraRate),
    discount: opt(raw.discount), afr: opt(raw.afr, NaN),
  };
  x.ordinaryRate = x.recaptureRate;
  if (!(x.price > 0)) errors.push("Enter the selling price as a positive number.");
  if (!(x.basis >= 0)) errors.push("Enter your adjusted basis (original cost plus improvements minus depreciation) as zero or more.");
  for (const [k, label] of [["expenses", "selling expenses"], ["depreciation", "depreciation taken"], ["down", "payments in the sale year"], ["rate", "note interest rate"], ["discount", "discount rate"]]) {
    if (Number.isNaN(x[k]) || x[k] < 0) errors.push(`Enter ${label} as zero or more.`);
  }
  for (const k of ["recaptureRate", "lumpRate", "spreadRate", "extraRate"]) if (Number.isNaN(x[k]) || x[k] < 0 || x[k] > 100) errors.push("Tax rates must be between 0 and 100 percent.");
  if (x.rate > 30) errors.push("Note interest rate looks too high; enter it as a percent such as 6.");
  if (!errors.length && x.down > x.price) errors.push("Payments in the sale year cannot exceed the selling price.");
  if (!errors.length && x.down < x.price && !(Number.isInteger(x.years) && x.years >= 1 && x.years <= 40)) errors.push("Enter the number of yearly note payments as a whole number from 1 to 40.");
  if (errors.length) return { errors };
  const gp0 = x.price - x.basis - x.expenses;
  if (!(gp0 > 0)) return { errors: ["On these figures there is no gain (price minus basis and selling expenses is zero or negative), so there is nothing to spread."] };

  const s = schedule(x);
  const lumpTax = s.recapture * (x.recaptureRate / 100) + s.instGain * (x.lumpRate / 100) + s.gp * (x.extraRate / 100);
  const d = x.discount / 100;
  const pv = (rows, f) => rows.reduce((a, r) => a + f(r) / Math.pow(1 + d, r.year), 0);
  const spreadTax = s.rows.reduce((a, r) => a + r.gainTax, 0);
  const interest = s.rows.reduce((a, r) => a + r.interest, 0);
  const interestTax = s.rows.reduce((a, r) => a + r.interestTax, 0);
  const pvSpread = pv(s.rows, (r) => r.gainTax);
  const totals = {
    gp: s.gp, recapture: s.recapture, instGain: s.instGain, gpp: s.gpp, note: s.note,
    lumpTax, spreadTax, taxSaved: lumpTax - spreadTax, pvLump: lumpTax, pvSpread, pvSaved: lumpTax - pvSpread,
    interest, interestTax, interestNet: interest - interestTax,
    afterTaxSpread: x.price + interest - spreadTax - interestTax - x.expenses,
    afterTaxLump: x.price - lumpTax - x.expenses,
  };
  const y0 = s.rows[0];
  const findings = [];
  if (s.recapture > 0) findings.push({ severity: "high", title: `${dollars(s.recapture)} of depreciation recapture is taxed in the sale year however little you collect; only the other ${dollars(s.instGain)} of gain can be spread.` });
  const y0Cash = x.down - x.expenses;
  if (y0.gainTax > y0Cash) findings.push({ severity: "high", title: `The sale-year tax on the gain (${dollars(y0.gainTax)}) is more than the cash you collect that year after selling expenses (${dollars(y0Cash)}); you would pay it from other money.` });
  if (!Number.isNaN(x.afr) && x.rate < x.afr) findings.push({ severity: "medium", title: `Your note rate (${pct(x.rate)}) is below the interest rate you entered as the IRS minimum (${pct(x.afr)}); the IRS can treat part of the price as interest, which changes the gain.` });
  if (s.note > 5000000) findings.push({ severity: "medium", title: "Installment notes over $5 million can trigger an interest charge on the deferred tax (IRC 453A). This worksheet does not model it." });
  if (x.lumpRate <= x.spreadRate) findings.push({ severity: "info", title: "You entered the same or a lower rate for taking the gain all at once, so spreading saves no rate; the only gain is deferral." });
  findings.push({ severity: "info", title: `Gross profit percentage ${pct(s.gpp * 100)}: of each dollar of principal you collect, ${pct(s.gpp * 100)} is taxable gain.` });
  if (s.note > 0) findings.push({ severity: "info", title: `The tax you defer depends on the buyer paying. You keep ${dollars(s.note)} of price at risk of default, and a default does not undo the tax already paid.` });

  const sweep = [1, 3, 5, 7, 10, 15].map((n) => {
    const t = schedule({ ...x, years: n });
    const tax = t.rows.reduce((a, r) => a + r.gainTax, 0);
    const p = t.rows.reduce((a, r) => a + r.gainTax / Math.pow(1 + d, r.year), 0);
    return { years: n, tax, pvSaved: lumpTax - p, interest: t.rows.reduce((a, r) => a + r.interest, 0) };
  });
  return { errors: [], inputs: x, rows: s.rows, totals, findings, sweep };
}

export function summaryText(r) {
  const t = r.totals;
  const lines = [
    "INSTALLMENT SALE TAX WORKSHEET (an estimate, not tax advice)",
    `Gross profit: ${dollars(t.gp)} = price - basis - selling expenses`,
    `Depreciation recapture (taxed in the sale year): ${dollars(t.recapture)}`,
    `Gain spread over the note: ${dollars(t.instGain)} (gross profit percentage ${pct(t.gpp * 100)})`,
    `Tax on the gain if taken all in the sale year: ${dollars(t.lumpTax)}`,
    `Tax on the gain if spread as you collect: ${dollars(t.spreadTax)}  (saves ${dollars(t.taxSaved)}; ${dollars(t.pvSaved)} in today's dollars)`,
    `Interest on the note: ${dollars(t.interest)}, ${dollars(t.interestNet)} after tax`,
    "",
    "Year | Principal | Interest | Gain taxed | Tax on gain",
  ];
  for (const y of r.rows) lines.push(`${y.label} | ${dollars(y.principal)} | ${dollars(y.interest)} | ${dollars(y.gain + y.recapture)} | ${dollars(y.gainTax)}`);
  return lines.join("\n");
}

export function sweepCsv(r) {
  const out = ["years,tax_on_gain,pv_tax_saved_vs_lump_sum,interest_received"];
  for (const s of r.sweep) out.push([s.years, Math.round(s.tax), Math.round(s.pvSaved), Math.round(s.interest)].join(","));
  return out.join("\n") + "\n";
}
