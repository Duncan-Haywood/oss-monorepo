// Mortgage escrow analysis checker: the arithmetic of 12 CFR 1024.17 on the
// numbers a homeowner types in from an annual escrow statement. Pure
// functions, whole cents, no I/O.
//
// The model (aggregate accounting, Regulation X 1024.17(c)(4)):
//   * monthly escrow payment = 1/12 of the year's disbursements
//   * a cushion of at most 1/6 of the year's disbursements may be kept
//   * project the balance month by month; the lowest point after any
//     disbursement should not fall below the cushion
//   * the balance needed at the start of the year is the cushion minus the
//     lowest cumulative net (deposits less disbursements) over the year
//   * short of that -> shortage (spread over at least 12 months, or one month's
//     payment repaid within 30 days when smaller); short of the zero-cushion
//     figure -> deficiency (a negative balance; two or more payments)
//   * over it -> surplus ($50 or more refunded within 30 days if current)
//
// It cannot see the servicer's own worksheet, so every result is a question to
// put to the servicer, never a finding that the servicer erred.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const CITATIONS = {
  cushion: "12 CFR 1024.17(c)(1) and (c)(5): cushion no greater than one-sixth of estimated total annual disbursements",
  aggregate: "12 CFR 1024.17(c)(4): aggregate accounting required",
  shortage: "12 CFR 1024.17(f)(3): shortage repaid over at least 12 months (or within 30 days if under one month's payment)",
  deficiency: "12 CFR 1024.17(f)(4): deficiency repaid in two or more equal monthly payments",
  surplus: "12 CFR 1024.17(f)(2): surplus of $50 or more refunded within 30 days when the borrower is current",
  statement: "12 CFR 1024.17(i): annual escrow account statement",
};

const cents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => c / 100;

export function money(n) {
  return (Math.round(Number(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "$1,234.50", "1.234,50" style are not guessed at: one decimal point, commas
// as thousands separators, optional $ and parentheses for negatives.
export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// Month a disbursement lands in, counted from the first month of the escrow
// year (1..12). startMonth and dueMonth are calendar months 1..12.
export function monthOffset(startMonth, dueMonth) {
  return ((dueMonth - startMonth + 12) % 12) + 1;
}

export function normalizeInput(raw) {
  const errors = [];
  const startMonth = Number(raw.startMonth);
  if (!(startMonth >= 1 && startMonth <= 12)) errors.push("Choose the month the new escrow year starts.");
  const items = [];
  for (const it of raw.items || []) {
    const amount = parseMoney(it.amount);
    if (amount === null && String(it.amount ?? "").trim() === "") continue;
    const name = String(it.name || "").trim() || "Escrow item";
    if (amount === null || amount < 0) { errors.push(`“${name}”: the annual amount is not a number.`); continue; }
    const dueMonth = Number(it.month);
    if (!(dueMonth >= 1 && dueMonth <= 12)) { errors.push(`“${name}”: choose the month it is paid.`); continue; }
    items.push({ name, amountCents: cents(amount), dueMonth });
  }
  if (!items.length && !errors.length) errors.push("Enter at least one yearly escrow item (property tax, homeowners insurance) and the month it is paid.");
  const balance = parseMoney(raw.startBalance);
  if (balance === null) errors.push("Enter the projected escrow balance at the start of the new escrow year (on your statement).");
  const opt = (v, label, { min = null } = {}) => {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = parseMoney(v);
    if (n === null || (min !== null && n < min)) { errors.push(`${label} is not a number.`); return null; }
    return n;
  };
  const stated = {
    newPayment: opt(raw.statedPayment, "The new escrow payment on the statement", { min: 0 }),
    oldPayment: opt(raw.oldPayment, "The current escrow payment", { min: 0 }),
    shortage: opt(raw.statedShortage, "The shortage on the statement", { min: 0 }),
    shortageMonthly: opt(raw.statedShortageMonthly, "The monthly shortage amount on the statement", { min: 0 }),
    surplus: opt(raw.statedSurplus, "The surplus on the statement", { min: 0 }),
    cushion: opt(raw.statedCushion, "The cushion on the statement", { min: 0 }),
    annual: opt(raw.statedAnnual, "The servicer's projected yearly disbursements", { min: 0 }),
  };
  if (errors.length) return { error: errors.join(" "), errors };
  return {
    startMonth,
    items,
    startBalanceCents: cents(balance),
    stated,
    current: raw.current !== false && raw.current !== "no",
  };
}

// The month-by-month projection. Deposit lands before that month's
// disbursements, which is the order the CFPB's own worked example uses; the
// servicer's worksheet is authoritative where it differs.
export function projectYear(items, monthlyCents, startBalanceCents, startMonth) {
  const disb = Array(12).fill(0);
  const names = Array.from({ length: 12 }, () => []);
  for (const it of items) {
    const m = monthOffset(startMonth, it.dueMonth) - 1;
    disb[m] += it.amountCents;
    names[m].push(it.name);
  }
  const rows = [];
  let bal = startBalanceCents;
  let cum = 0;
  let minCum = Infinity;
  for (let i = 0; i < 12; i++) {
    const opening = bal;
    bal += monthlyCents - disb[i];
    cum += monthlyCents - disb[i];
    if (cum < minCum) minCum = cum;
    rows.push({ month: MONTHS[(startMonth - 1 + i) % 12], n: i + 1, opening: fromCents(opening), deposit: fromCents(monthlyCents), disbursement: fromCents(disb[i]), items: names[i].join(", "), closing: fromCents(bal) });
  }
  return { rows, minCumCents: minCum, endCents: bal };
}

export function analyze(input) {
  const n = normalizeInput(input);
  if (n.error) return n;
  const annualCents = n.items.reduce((s, x) => s + x.amountCents, 0);
  const monthlyCents = Math.round(annualCents / 12);
  const cushionMaxCents = Math.round(annualCents / 6);
  const proj = projectYear(n.items, monthlyCents, n.startBalanceCents, n.startMonth);
  // Balance needed on day one so the lowest point after any disbursement is
  // the cushion (max) or zero (no cushion).
  const neededMax = cushionMaxCents - proj.minCumCents;
  const neededZero = -proj.minCumCents;
  const shortageCents = Math.max(0, neededMax - n.startBalanceCents);
  const deficiencyCents = Math.max(0, neededZero - n.startBalanceCents);
  const surplusCents = Math.max(0, n.startBalanceCents - neededMax);
  const shortageOnlyCents = shortageCents - deficiencyCents;
  const spread12 = Math.round(shortageCents / 12);
  const expectedPaymentCents = monthlyCents + spread12;
  const st = n.stated;
  const findings = [];
  const add = (f) => findings.push({ lines: [], ...f });

  // 1. Cushion over one-sixth.
  if (st.cushion !== null && cents(st.cushion) > cushionMaxCents + 50) {
    const over = cents(st.cushion) - cushionMaxCents;
    add({ id: "cushion", severity: "high", title: `Cushion of $${money(st.cushion)} is above one-sixth of the year's bills`, amountCents: over,
      detail: `Your entered bills total $${money(fromCents(annualCents))}, so the most a servicer may hold as a cushion is $${money(fromCents(cushionMaxCents))} (one-sixth). The statement shows $${money(st.cushion)}. If the servicer projects larger bills than you entered, this can be a difference in inputs rather than in the rule. Ask which yearly amounts it used.`,
      cite: CITATIONS.cushion });
  }

  // 2. Servicer's projected disbursements above the bills entered.
  if (st.annual !== null && cents(st.annual) > annualCents + 100) {
    const diff = cents(st.annual) - annualCents;
    add({ id: "annual", severity: diff / 12 >= 1000 ? "high" : "medium", title: `Servicer projects $${money(fromCents(diff))} more in yearly bills than you entered`, amountCents: diff,
      detail: `The statement projects $${money(st.annual)} of yearly disbursements; the bills you entered total $${money(fromCents(annualCents))}. Every extra $100 of projected bills adds about $${money(100 / 12)} to the monthly payment. Servicers may estimate from last year's charge plus the recent rate of change when they do not yet know the new amount, so compare against your actual tax bill and insurance declarations page and ask them to update if the real bills are lower.`,
      cite: CITATIONS.statement });
  }

  // 3. New payment above what the inputs support.
  if (st.newPayment !== null && cents(st.newPayment) > expectedPaymentCents + 100) {
    const monthlyOver = cents(st.newPayment) - expectedPaymentCents;
    add({ id: "payment", severity: monthlyOver >= 1000 ? "high" : "medium", title: `New escrow payment is $${money(fromCents(monthlyOver))} a month above what these numbers produce`, amountCents: monthlyOver * 12,
      detail: `With the bills and start balance you entered, one-twelfth of the year is $${money(fromCents(monthlyCents))}${shortageCents ? ` and a $${money(fromCents(shortageCents))} shortage spread over 12 months adds $${money(fromCents(spread12))}` : ""}, about $${money(fromCents(expectedPaymentCents))} a month. The statement asks for $${money(st.newPayment)}. Over twelve months that is $${money(fromCents(monthlyOver * 12))} in question. Common reasons: different bill amounts or payment months, a lower starting balance, a shortage spread over fewer months, or an item you did not enter.`,
      cite: CITATIONS.aggregate });
  }

  // 4. Shortage larger than the inputs produce.
  if (st.shortage !== null && cents(st.shortage) > shortageCents + 100) {
    const diff = cents(st.shortage) - shortageCents;
    add({ id: "shortage", severity: "medium", title: `Stated shortage is $${money(fromCents(diff))} larger than these numbers produce`, amountCents: diff,
      detail: `Your numbers give a shortage of $${money(fromCents(shortageCents))} against the largest allowed cushion; the statement shows $${money(st.shortage)}. Ask for the month-by-month projection (the escrow account analysis worksheet) to see the disbursement amounts, dates and starting balance the servicer used.`,
      cite: CITATIONS.aggregate });
  }

  // 5. Shortage spread over fewer than 12 months.
  if (st.shortage !== null && st.shortage > 0 && st.shortageMonthly !== null && st.shortageMonthly > 0) {
    const months = st.shortage / st.shortageMonthly;
    const oneMonthLimit = monthlyCents;
    if (months < 11.5 && cents(st.shortage) >= oneMonthLimit && deficiencyCents === 0) {
      add({ id: "spread", severity: "high", title: `Shortage is being recovered over about ${months.toFixed(1)} months, not 12 or more`, amountCents: 0,
        detail: `The statement shows a $${money(st.shortage)} shortage collected at $${money(st.shortageMonthly)} a month, about ${months.toFixed(1)} months. For a shortage of one month's payment or more, Regulation X lets a servicer require repayment over at least 12 months. This does not apply to a deficiency (a negative projected balance), which may be repaid faster, and only applies while the account is current. Ask which one the statement describes.`,
        cite: CITATIONS.shortage });
    } else if (deficiencyCents > 0 && months < 1.5) {
      add({ id: "spread-def", severity: "info", title: "Deficiency recovered in fewer than two payments", amountCents: 0,
        detail: `A negative projected balance may be repaid in two or more equal monthly payments; your numbers show a deficiency of $${money(fromCents(deficiencyCents))}. The statement collects $${money(st.shortage)} at $${money(st.shortageMonthly)} a month.`,
        cite: CITATIONS.deficiency });
    }
  }

  // 6. Surplus to be refunded.
  if (surplusCents >= 5000 || (st.surplus !== null && st.surplus >= 50)) {
    const amt = Math.max(surplusCents, st.surplus !== null ? cents(st.surplus) : 0);
    if (n.current) {
      add({ id: "surplus", severity: st.surplus !== null && st.surplus >= 50 ? "info" : "medium", title: `Surplus of about $${money(fromCents(amt))}: should come back as a refund`, amountCents: st.surplus !== null && st.surplus >= 50 ? 0 : amt,
        detail: `A surplus of $50 or more should be refunded within 30 days of the analysis when the account is current${st.surplus === null ? ", and your numbers show one but the statement lists none" : ""}. Check that the refund arrived and that the payment has not been set as if the money were still needed.`,
        cite: CITATIONS.surplus });
    }
  }

  // 7. Lender payment moves the wrong way.
  if (st.oldPayment !== null && st.newPayment !== null && st.newPayment > st.oldPayment) {
    add({ id: "change", severity: "info", title: `Payment goes up $${money(st.newPayment - st.oldPayment)} a month`, amountCents: 0,
      detail: `From $${money(st.oldPayment)} to $${money(st.newPayment)} a month, or $${money((st.newPayment - st.oldPayment) * 12)} a year. Of the new figure, $${money(fromCents(monthlyCents))} is the yearly bills divided by twelve${shortageCents ? ` and about $${money(fromCents(spread12))} recovers a shortage that ends after 12 months, so the payment should fall then` : ""}.` });
  }

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const questionedCents = findings.filter((f) => f.severity !== "info").reduce((s, f) => s + f.amountCents, 0);

  return {
    summary: {
      annual: fromCents(annualCents),
      monthly: fromCents(monthlyCents),
      cushionMax: fromCents(cushionMaxCents),
      needed: fromCents(neededMax),
      startBalance: fromCents(n.startBalanceCents),
      lowPoint: fromCents(Math.min(...proj.rows.map((r) => Math.round(r.closing * 100)))),
      shortage: fromCents(shortageCents),
      shortageOnly: fromCents(shortageOnlyCents),
      deficiency: fromCents(deficiencyCents),
      surplus: fromCents(surplusCents),
      expectedPayment: fromCents(expectedPaymentCents),
      paymentAfterShortage: fromCents(monthlyCents),
      shortageMonthlyAt12: fromCents(spread12),
      questioned: fromCents(questionedCents),
      statedPayment: st.newPayment,
    },
    rows: proj.rows,
    findings,
    stated: st,
    items: n.items.map((i) => ({ name: i.name, amount: fromCents(i.amountCents), month: MONTHS[i.dueMonth - 1] })),
  };
}

// What one bill changing does to the monthly payment and to the balance the
// account needs. Used for "what if I shop my insurance" and "what if the tax
// bill drops on appeal".
export function whatIf(input, itemName, newAmount) {
  const base = analyze(input);
  if (base.error) return base;
  const items = (input.items || []).map((i) => (String(i.name || "").trim() === itemName ? { ...i, amount: newAmount } : i));
  const alt = analyze({ ...input, items });
  if (alt.error) return alt;
  return {
    itemName,
    monthlyBefore: base.summary.monthly,
    monthlyAfter: alt.summary.monthly,
    monthlyChange: Math.round((alt.summary.monthly - base.summary.monthly) * 100) / 100,
    yearlyChange: Math.round((alt.summary.monthly - base.summary.monthly) * 1200) / 100,
    shortageBefore: base.summary.shortage,
    shortageAfter: alt.summary.shortage,
  };
}

export function requestLetter(a, who = {}) {
  const s = a.summary;
  const name = who.name || "[your name]";
  const loan = who.loan || "[loan number]";
  const servicer = who.servicer || "[servicer name]";
  const lines = [];
  lines.push(name, "", `Date: ${who.date || "[date]"}`, `To: ${servicer}, at the address the servicer designates for notices of error and information requests`, `Re: Loan ${loan} — request for escrow account analysis worksheet and review`, "");
  lines.push(`I received the annual escrow account statement for my loan${a.stated.newPayment !== null ? `, which sets a new monthly escrow payment of $${money(a.stated.newPayment)}` : ""}. I am asking for information and a review of how that figure was calculated.`, "");
  lines.push("Please send me:", "1. The escrow account analysis worksheet, showing the projected month-by-month deposits, disbursements and balance for the coming year, the disbursement amount and date the servicer used for each item, and the starting balance.", "2. The cushion, if any, included in the projection, and how it was set.", "3. For any shortage or deficiency, the amount, the period over which it is being collected, and whether it is treated as a shortage or a deficiency.", "4. The source of each projected disbursement amount (the tax bill or insurance declaration relied on, or the estimate method if the actual bill was not yet known).", "");
  lines.push("My own figures, from the documents I hold:");
  for (const it of a.items) lines.push(`- ${it.name}: $${money(it.amount)}, paid in ${it.month}`);
  lines.push(`Those bills total $${money(s.annual)} a year, one-twelfth of which is $${money(s.monthly)} a month.`, "");
  const asks = a.findings.filter((f) => f.severity !== "info");
  if (asks.length) {
    lines.push("Specifically, I would like the servicer to explain:");
    for (const f of asks) lines.push(`- ${f.title}${f.cite ? ` (${f.cite.split(":")[0]})` : ""}.`);
    lines.push("");
  }
  lines.push("If the review finds that a figure on the statement is wrong, please correct the payment and tell me in writing what changed. To the extent this letter identifies a possible error, please treat it as a notice of error, and as a request for information, under Regulation X.", "", "Thank you,", name);
  return lines.join("\n");
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(a) {
  const out = [["month", "opening_balance", "deposit", "disbursement", "items", "closing_balance"].join(",")];
  for (const r of a.rows) out.push([r.month, r.opening.toFixed(2), r.deposit.toFixed(2), r.disbursement.toFixed(2), csvCell(r.items), r.closing.toFixed(2)].join(","));
  out.push("", ["severity", "finding", "amount_in_question"].join(","));
  for (const f of a.findings) out.push([f.severity, csvCell(f.title), fromCents(f.amountCents).toFixed(2)].join(","));
  return out.join("\n");
}

export function sampleInput() {
  return {
    startMonth: 12,
    items: [
      { name: "Property tax", amount: "5,400", month: 11 },
      { name: "Homeowners insurance", amount: "3,000", month: 4 },
    ],
    startBalance: "600",
    oldPayment: "620",
    statedPayment: "890",
    statedShortage: "1,400",
    statedShortageMonthly: "200",
    statedCushion: "1,900",
    statedAnnual: "9,000",
    current: true,
  };
}
