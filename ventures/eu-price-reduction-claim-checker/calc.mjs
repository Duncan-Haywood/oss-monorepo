// EU price reduction claims: given a product's price history, what "was" price may a
// shop show next to a reduced price, and is the discount percentage it advertises true.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// The rule was written from memory of Article 6a of Directive 98/6/EC (Price Indication
// Directive, inserted by the Omnibus Directive (EU) 2019/2161) WITHOUT network access in
// the building session: the prior price is the lowest price applied in the 30 days before
// the reduction. Member States may set different rules for goods on the market under 30
// days, perishable goods and progressive reductions, so every result names a source to
// verify. A price list is evidence, not a legal conclusion.

export const WINDOW_DAYS = 30;
export const VERIFY = "Article 6a of Directive 98/6/EC (Price Indication Directive) as inserted by Directive (EU) 2019/2161 (Omnibus), the Commission's 2021 guidance notice on Article 6a, and your Member State's transposition law";
const DAY = 86400000;

export const MODES = [
  { id: "standard", label: "Normal price reduction (30-day rule)" },
  { id: "progressive", label: "Progressive reduction (the price keeps dropping in steps)" },
];

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10) === s ? t : null;
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

// One "YYYY-MM-DD, price" line per price change; the price applies from that date.
export function parseHistory(text) {
  const errors = [];
  const rows = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) errors.push("Paste the price history: one line per price change, date then price, for example 2026-09-01, 59.90.");
  lines.forEach((line, i) => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s*[,;\t ]\s*([0-9]+(?:[.,][0-9]+)?)$/);
    if (!m) { errors.push(`History line ${i + 1} ("${line.slice(0, 30)}") is not a date followed by a price. Use 2026-09-01, 59.90.`); return; }
    const t = parseDate(m[1]);
    const price = Number(m[2].replace(",", "."));
    if (t === null) { errors.push(`History line ${i + 1}: ${m[1]} is not a real date.`); return; }
    if (!(price > 0)) { errors.push(`History line ${i + 1}: the price must be more than zero.`); return; }
    rows.push({ t, price });
  });
  if (errors.length) return { errors, rows: [] };
  rows.sort((a, b) => a.t - b.t);
  for (let i = 1; i < rows.length; i++) if (rows[i].t === rows[i - 1].t) return { errors: [`Two prices are listed for ${iso(rows[i].t)}. Keep one per date.`], rows: [] };
  return { errors: [], rows };
}

function priceOn(rows, t) {
  let p = null;
  for (const r of rows) { if (r.t <= t) p = r.price; else break; }
  return p;
}

// Lowest price in force on any day from `from` to `to` inclusive.
function lowestBetween(rows, from, to) {
  let low = null;
  for (let t = from; t <= to; t += DAY) {
    const p = priceOn(rows, t);
    if (p !== null && (low === null || p < low)) low = p;
  }
  return low;
}

function optNumber(v, name, errors, max) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || (max && n > max)) { errors.push(`${name} must be a number above zero${max ? ` and at most ${max}` : ""}, or left empty.`); return null; }
  return n;
}

export function parse(input) {
  const i = input || {};
  const h = parseHistory(i.history);
  const errors = [...h.errors];
  const mode = MODES.some((m) => m.id === i.mode) ? i.mode : "standard";
  const startT = parseDate(String(i.reductionDate || ""));
  if (startT === null) errors.push("Enter the date the reduced price starts, as YYYY-MM-DD.");
  const salePrice = optNumber(i.salePrice, "The reduced price", errors);
  if (salePrice === null && !errors.some((e) => e.startsWith("The reduced price"))) errors.push("Enter the reduced price.");
  const claimedWas = optNumber(i.claimedWas, "The crossed-out price", errors);
  const claimedPct = optNumber(i.claimedPct, "The advertised discount percentage", errors, 100);
  let firstT = null;
  if (mode === "progressive") {
    firstT = parseDate(String(i.firstReductionDate || ""));
    if (firstT === null) errors.push("For a progressive reduction enter the date of the first reduction, as YYYY-MM-DD.");
    else if (startT !== null && firstT > startT) errors.push("The first reduction cannot be after the current reduction.");
  }
  if (!errors.length) {
    if (h.rows[0].t > startT) errors.push(`The history starts on ${iso(h.rows[0].t)}, after the reduction date. Add the price that applied before.`);
  }
  return { errors: errors.filter(Boolean), rows: h.rows, mode, startT, salePrice, claimedWas, claimedPct, firstT };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const anchor = p.mode === "progressive" ? p.firstT : p.startT;
  const winFrom = anchor - WINDOW_DAYS * DAY;
  const winTo = anchor - DAY;
  const covered = p.rows[0].t <= winFrom;
  const fromEff = Math.max(winFrom, p.rows[0].t);
  const prior = lowestBetween(p.rows, fromEff, winTo);
  const findings = [];
  if (prior === null) return { errors: [`There is no price on record in the ${WINDOW_DAYS} days before ${iso(anchor)}. Add the earlier prices.`] };

  const trueDiscount = prior > 0 ? ((prior - p.salePrice) / prior) * 100 : 0;
  const isReduction = p.salePrice < prior;
  let verdict = "ok";

  findings.push({ severity: "info", title: p.mode === "progressive"
    ? `Progressive reduction: the prior price is the lowest price in the ${WINDOW_DAYS} days before the first reduction (${iso(p.firstT)}) - EUR ${money(prior)} - if your Member State applies that rule.`
    : `Prior price: the lowest price applied in the ${WINDOW_DAYS} days from ${iso(winFrom)} to ${iso(winTo)} was EUR ${money(prior)}.` });

  if (!covered) findings.push({ severity: "medium", title: `The history only goes back to ${iso(p.rows[0].t)}, less than ${WINDOW_DAYS} days before the reduction. That is fine only if the product has genuinely been on sale for under ${WINDOW_DAYS} days and your Member State allows a shorter period for new goods; otherwise add the earlier prices.` });

  if (!isReduction) {
    verdict = "no-reduction";
    findings.push({ severity: "info", title: `EUR ${money(p.salePrice)} is not below the prior price of EUR ${money(prior)}, so showing it as a reduction or "sale" would not be supported by this price history.` });
  } else {
    findings.push({ severity: "info", title: `Highest honest reduction: EUR ${money(prior)} down to EUR ${money(p.salePrice)} is ${trueDiscount.toFixed(1)} percent off (EUR ${money(prior - p.salePrice)}).` });
  }

  if (p.claimedWas !== null) {
    if (p.claimedWas > prior + 0.005) {
      verdict = "misleading";
      findings.push({ severity: "high", title: `The crossed-out price of EUR ${money(p.claimedWas)} is higher than the prior price of EUR ${money(prior)}. Showing it as the previous price is likely to breach the 30-day rule. Show EUR ${money(prior)} instead, or do not show a reduction.` });
    } else if (p.claimedWas < prior - 0.005) {
      findings.push({ severity: "info", title: `The crossed-out price of EUR ${money(p.claimedWas)} is below the prior price of EUR ${money(prior)}. That understates the discount and is not a problem under this rule, but it is not the figure the rule requires.` });
    } else {
      findings.push({ severity: "info", title: `The crossed-out price of EUR ${money(p.claimedWas)} matches the prior price.` });
    }
  }
  if (p.claimedPct !== null) {
    if (isReduction && p.claimedPct > trueDiscount + 0.5) {
      verdict = "misleading";
      findings.push({ severity: "high", title: `The advertised ${p.claimedPct} percent off is more than the ${trueDiscount.toFixed(1)} percent the price history supports. The percentage has to be calculated against the prior price.` });
    } else if (!isReduction) {
      verdict = "misleading";
      findings.push({ severity: "high", title: `The advertised ${p.claimedPct} percent off has no price reduction behind it in this history.` });
    } else {
      findings.push({ severity: "info", title: `The advertised ${p.claimedPct} percent is within what the history supports (${trueDiscount.toFixed(1)} percent).` });
    }
  }

  const dipped = p.rows.filter((r) => r.t >= winFrom && r.t <= winTo && r.price > prior + 0.005);
  if (dipped.length && p.claimedWas === null) findings.push({ severity: "info", title: `Prices in the window went up to EUR ${money(Math.max(...dipped.map((r) => r.price)))}; raising a price just before a "sale" does not move the prior price, which stays the lowest in the window.` });

  findings.push({ severity: "medium", title: "Applies to a reduction announced to consumers for goods or services. The rule does not cover a price you simply show as normal, and Member States set their own fines (the Directive requires penalties that can reach at least 4 percent of annual turnover for widespread infringements). Check your national rule and keep the price log as evidence." });

  return { errors: [], input: p, prior, trueDiscount, isReduction, verdict, window: { from: iso(winFrom), to: iso(winTo), covered }, findings };
}

export const SAMPLE = {
  history: "2026-08-01, 89.00\n2026-09-05, 69.00\n2026-09-20, 89.00\n2026-10-10, 59.00",
  reductionDate: "2026-10-10",
  mode: "standard",
  firstReductionDate: "",
  salePrice: 59,
  claimedWas: 89,
  claimedPct: 34,
};

export function summaryText(r) {
  const verdict = { ok: "Supported by the price history", misleading: "Not supported by the price history", "no-reduction": "No reduction to announce" }[r.verdict];
  return [
    "EU price reduction check (first read, not legal advice)",
    `Result: ${verdict}`,
    `Prior price (lowest in ${r.window.from} to ${r.window.to}): EUR ${money(r.prior)}`,
    `Reduced price: EUR ${money(r.input.salePrice)}${r.isReduction ? ` (${r.trueDiscount.toFixed(1)} percent off)` : ""}`,
    "",
    ...r.findings.map((f) => `- ${f.title}`),
    "",
    `Verify against: ${VERIFY}`,
    "Confirm with your national authority or counsel.",
  ].join("\n");
}
