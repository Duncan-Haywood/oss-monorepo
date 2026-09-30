// Section 83(b) election calculator: restricted stock that vests over time,
// taxed at grant (election filed) or at each vest date (no election). Pure
// arithmetic on numbers the visitor types with flat tax rates the visitor
// chooses; no network, no tax tables, no valuation data.

export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Per-share value at month m, moving steadily from the grant value to the
// sale value. Geometric when both are positive, straight line otherwise.
export function valueAt(fmvGrant, fmvSale, m, saleMonths) {
  const t = Math.min(1, Math.max(0, m / saleMonths));
  if (fmvGrant > 0 && fmvSale > 0) return fmvGrant * Math.pow(fmvSale / fmvGrant, t);
  return fmvGrant + (fmvSale - fmvGrant) * t;
}

// Tax at the sale on a gain (losses are not credited: conservative).
function saleTax(gainPerShare, shares, heldMonths, p) {
  if (gainPerShare <= 0) return 0;
  return gainPerShare * shares * (heldMonths > 12 ? p.cgRate : p.ordRate);
}

// Total federal-style tax under each path if the visitor keeps `kept` of the
// `vestMonths` monthly tranches (all of them when nothing is forfeited) and
// sells at `saleMonths` for `saleFmv` a share. Flat rates, no state tax.
export function taxes(p, saleFmv, kept = p.vestMonths) {
  const M = p.vestMonths;
  const perTranche = p.shares / M;
  const spread0 = Math.max(0, p.fmvGrant - p.price);
  const basis0 = Math.max(p.price, p.fmvGrant);
  // With the election: ordinary tax on the grant-day spread for ALL shares
  // (paid now, never refunded), then capital gain from the grant date.
  const grantTax = spread0 * p.shares * p.ordRate;
  let elSale = 0;
  let noVest = 0;
  let noSale = 0;
  for (let m = 1; m <= kept; m++) {
    elSale += saleTax(saleFmv - basis0, perTranche, p.saleMonths, p);
    const v = valueAt(p.fmvGrant, saleFmv, m, p.saleMonths);
    noVest += Math.max(0, v - p.price) * perTranche * p.ordRate;
    noSale += saleTax(saleFmv - Math.max(p.price, v), perTranche, p.saleMonths - m, p);
  }
  return {
    grantTax,
    elSale,
    elTotal: grantTax + elSale,
    noVest,
    noSale,
    noTotal: noVest + noSale,
    saving: noVest + noSale - (grantTax + elSale),
  };
}

// Smallest sale-value multiple (of the base case) at which electing is no
// worse than not electing, or null when it never is / always is.
export function breakEvenMultiple(p) {
  const at = (mult) => taxes(p, p.fmvSale * mult).saving;
  if (at(0.0001) >= 0) return { always: true, multiple: null };
  let lo = 0.0001;
  for (let mult = 0.01; mult <= 1000; mult *= 1.05) {
    if (at(mult) >= 0) {
      let a = lo, b = mult;
      for (let i = 0; i < 60; i++) {
        const mid = (a + b) / 2;
        if (at(mid) >= 0) b = mid; else a = mid;
      }
      return { always: false, multiple: b };
    }
    lo = mult;
  }
  return { always: false, multiple: null };
}

export function deadline(grantDate) {
  if (!grantDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(grantDate);
  if (!m) return NaN;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return NaN;
  d.setUTCDate(d.getUTCDate() + 30);
  return d;
}

export function parseInput(raw) {
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity, def = null, int = false } = {}) => {
    let v = parseNum(raw[k]);
    if (v === null) v = def;
    if (v === null || Number.isNaN(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      errors.push(`${label} must be ${int ? "a whole number" : "a number"} between ${min} and ${max === Infinity ? "any size" : max}.`);
      return 0;
    }
    return v;
  };
  const p = {
    shares: num("shares", "Shares", { min: 1 }),
    price: num("price", "Price paid per share", { def: 0 }),
    fmvGrant: num("fmvGrant", "Value per share at grant", { def: null }),
    fmvSale: num("fmvSale", "Value per share when you sell", { def: null }),
    vestMonths: num("vestMonths", "Vesting months", { min: 1, max: 120, def: 48, int: true }),
    saleMonths: 0,
    ordRate: num("ordRate", "Ordinary income tax rate", { max: 60, def: 32 }) / 100,
    cgRate: num("cgRate", "Long-term capital gains rate", { max: 40, def: 20 }) / 100,
    leaveMonths: parseNum(raw.leaveMonths),
    grantDate: (raw.grantDate || "").trim() || null,
  };
  p.saleMonths = num("saleMonths", "Months from grant until you sell", { min: p.vestMonths, max: 360, def: Math.max(p.vestMonths, 72) });
  if (Number.isNaN(p.leaveMonths) || (p.leaveMonths !== null && (p.leaveMonths < 0 || p.leaveMonths >= p.vestMonths))) {
    errors.push("Months until you might leave must be below the vesting months (or left blank).");
    p.leaveMonths = null;
  }
  if (p.grantDate && Number.isNaN(deadline(p.grantDate))) errors.push("Grant date must be a real date, year-month-day.");
  return { p, errors };
}

export function analyze(raw, today = null) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const base = taxes(p, p.fmvSale);
  const sched = [[0, "Shares end up worthless"], [0.5, "Half the value you expect"], [1, "The value you expect"], [3, "3x the value you expect"], [10, "10x the value you expect"]];
  const scenarios = sched.map(([mult, label]) => ({ label, saleFmv: p.fmvSale * mult, ...taxes(p, p.fmvSale * mult) }));
  const be = breakEvenMultiple(p);
  const spread = Math.max(0, p.fmvGrant - p.price);
  const cashNow = spread * p.shares * p.ordRate;
  const paidForShares = p.price * p.shares;
  const findings = [];

  if (spread === 0) {
    findings.push({ severity: "info", title: "Electing costs $0 in tax at grant", detail: `You pay at least the grant-day value ($${p.price} paid vs $${p.fmvGrant} value), so there is no spread to tax. The election then costs a filing and nothing else, and it starts your capital gains clock at grant and fixes your basis at $${Math.max(p.price, p.fmvGrant)} a share. The usual mistake is missing the 30-day deadline, not filing.` });
  } else {
    findings.push({ severity: "medium", title: `Electing means about $${money(cashNow)} of tax due for this year`, detail: `The spread is $${(p.fmvGrant - p.price).toFixed(4).replace(/\.?0+$/, "")} a share on ${money(p.shares)} shares = $${money(spread * p.shares)} of ordinary income at grant, at ${(p.ordRate * 100).toFixed(1)}%. You owe this even though you cannot sell the shares.` });
  }

  const full = base;
  if (spread > 0) {
    const verb = full.saving >= 0 ? "saves" : "costs";
    findings.push({ severity: "info", title: `Over the full path, electing ${verb} about $${money(Math.abs(full.saving))} if the shares reach your expected value`, detail: `With the election: $${money(full.grantTax)} at grant + $${money(full.elSale)} at sale = $${money(full.elTotal)}. Without: $${money(full.noVest)} as the shares vest + $${money(full.noSale)} at sale = $${money(full.noTotal)}. Positive savings mean the election wins.` });
    if (be.multiple !== null) {
      findings.push({ severity: "info", title: `Electing pays off above about ${(be.multiple * 100).toFixed(0)}% of your expected sale value`, detail: `That is about $${(p.fmvSale * be.multiple).toFixed(2)} a share at sale, against $${p.fmvSale} in your base case. Below it, taxes paid at grant on value that never arrives are the bigger cost.` });
    } else if (be.always) {
      findings.push({ severity: "info", title: "Electing is no worse at every sale value we tested", detail: "The grant-day tax is small next to the tax deferred until vest." });
    }
  } else {
    findings.push({ severity: "info", title: `Without an election you pay ordinary tax as shares vest: about $${money(full.noVest)}`, detail: `Each monthly tranche is taxed on its value on the vest date less what you paid, at ${(p.ordRate * 100).toFixed(1)}%. Under the election that ordinary tax is $0, and the appreciation is taxed as capital gain at sale. Total tax with the election: $${money(full.elTotal)}; without: $${money(full.noTotal)}.` });
  }

  if (p.leaveMonths !== null) {
    const kept = Math.floor(p.leaveMonths);
    const t = taxes(p, p.fmvSale, kept);
    const forfeited = p.shares * (p.vestMonths - kept) / p.vestMonths;
    const wasted = spread * forfeited * p.ordRate;
    findings.push({ severity: forfeited > 0 && wasted > 0 ? "medium" : "info", title: `If you leave after ${kept} months you forfeit ${money(forfeited)} shares${wasted > 0 ? ` and about $${money(wasted)} of grant tax is not refunded` : ""}`, detail: `Unvested shares go back to the company (usually at what you paid, ${money(p.price * forfeited)} here). Tax paid on them under an election is not refunded, and the loss is limited to what you actually paid for them. Total tax on the ${money(p.shares - forfeited)} shares you keep: $${money(t.elTotal)} with the election (including the wasted amount) vs $${money(t.noTotal)} without.` });
  }

  const dl = deadline(p.grantDate);
  let daysLeft = null;
  if (dl) {
    if (today) daysLeft = Math.round((dl.getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000);
    findings.push({ severity: daysLeft !== null && daysLeft < 0 ? "medium" : "info", title: `The election is due within 30 days of the grant: ${dl.toISOString().slice(0, 10)}`, detail: `Counted 30 calendar days after ${p.grantDate}. The IRS must receive it by then (mailing with proof of delivery is the safe method), and the deadline cannot be extended. A weekend or holiday deadline may roll to the next business day, but do not plan on it.${daysLeft !== null ? (daysLeft < 0 ? ` That date has passed.` : ` About ${daysLeft} day(s) remain.`) : ""}` });
  }

  return { p, base, scenarios, breakEven: be, cashNow, paidForShares, deadlineDate: dl, daysLeft, findings, error: null };
}

export function sampleInput() {
  return { shares: "1000000", price: "0.0001", fmvGrant: "0.0001", fmvSale: "2", vestMonths: "48", saleMonths: "84", ordRate: "35", cgRate: "20", leaveMonths: "18", grantDate: "" };
}

export function reportCsv(a) {
  const rows = [["scenario", "value_per_share_at_sale", "tax_with_election", "tax_without_election", "election_saves"]];
  for (const s of a.scenarios) rows.push([s.label, s.saleFmv, Math.round(s.elTotal), Math.round(s.noTotal), Math.round(s.saving)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
