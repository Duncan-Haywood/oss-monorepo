// Wash-sale checker: a trade list in, per-loss-sale disallowed loss, allowed loss and adjusted replacement basis out.
// Rule modelled (IRC 1091): a loss on shares of a security is disallowed to the extent you bought substantially
// identical shares within 30 days before or after the sale. The disallowed loss is added to the basis of the
// replacement shares (holding period carries over). If the replacement was bought in an IRA the loss is gone for good
// (Rev. Rul. 2008-5). Matching here is by identical ticker only; "substantially identical" is a judgement it does not make.

export const RULES_REVIEWED = "2026-10-06";
export const WINDOW_DAYS = 30;

const DAY = 86400000;

export function parseDate(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else return null;
  const ms = Date.UTC(y, mo - 1, d);
  const chk = new Date(ms);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return ms;
}
export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const r2 = (x) => Math.round(x * 100) / 100;
const num = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return NaN;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const v = parseFloat(t.replace(/[^0-9.]/g, ""));
  return neg ? -v : v;
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

export function parseTrades(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: "No rows found." };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const head = splitLine(lines[0], delim).map((h) => h.toLowerCase());
  const col = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const c = {
    date: col(["date"]), sym: col(["symbol", "ticker", "security"]), side: col(["action", "side", "type", "buy/sell"]),
    qty: col(["quantity", "shares", "qty"]), price: col(["price"]), amount: col(["amount", "proceeds", "total"]),
    basis: col(["basis", "cost"]), acct: col(["account"]),
  };
  const miss = ["date", "sym", "side", "qty"].filter((k) => c[k] < 0);
  if (miss.length) return { error: `Need columns for: ${miss.map((k) => ({ date: "date", sym: "symbol", side: "action (buy/sell)", qty: "quantity" })[k]).join(", ")}.` };
  if (c.price < 0 && c.amount < 0) return { error: "Need a price or an amount column." };
  const trades = [], errors = [];
  lines.slice(1).forEach((line, n) => {
    const f = splitLine(line, delim);
    const ln = n + 2;
    const date = parseDate(f[c.date]);
    const sideRaw = (f[c.side] || "").toLowerCase();
    const side = /^(buy|bought|purchase|b\b|bto|btc)/.test(sideRaw) ? "buy" : /^(sell|sold|sale|s\b|sto|stc)/.test(sideRaw) ? "sell" : null;
    const qty = Math.abs(num(f[c.qty]));
    const sym = (f[c.sym] || "").toUpperCase().replace(/\s+/g, "");
    let price = c.price >= 0 ? Math.abs(num(f[c.price])) : NaN;
    const amount = c.amount >= 0 ? Math.abs(num(f[c.amount])) : NaN;
    if (!(price >= 0) && amount >= 0 && qty > 0) price = amount / qty;
    if (date == null) return errors.push(`Line ${ln}: date not readable (use YYYY-MM-DD or MM/DD/YYYY).`);
    if (!sym) return errors.push(`Line ${ln}: symbol missing.`);
    if (!side) return errors.push(`Line ${ln}: action must be buy or sell.`);
    if (!(qty > 0)) return errors.push(`Line ${ln}: quantity must be above zero.`);
    if (!(price >= 0)) return errors.push(`Line ${ln}: price or amount missing.`);
    const basis = c.basis >= 0 && side === "sell" && f[c.basis] !== "" ? Math.abs(num(f[c.basis])) : null;
    const ira = c.acct >= 0 && /ira|roth|401|403|sep|retire|hsa/i.test(f[c.acct] || "");
    trades.push({ line: ln, date, sym, side, qty, price, total: r2(price * qty), basis: Number.isFinite(basis) ? basis : null, ira });
  });
  return { trades, errors };
}

// Returns { sales: [...loss sales with matches], summary, notes }.
export function analyze(trades) {
  const sorted = [...trades].sort((a, b) => a.date - b.date || (a.side === "buy" ? -1 : 1) - (b.side === "buy" ? -1 : 1) || a.line - b.line);
  const lots = []; // taxable buy lots available to be sold, FIFO per symbol
  const buys = sorted.filter((t) => t.side === "buy").map((t) => ({ ...t, free: t.qty, soldFromTaxable: 0, added: 0 }));
  for (const b of buys) if (!b.ira) lots.push(b);
  const sales = [];
  const notes = [];
  for (const s of sorted.filter((t) => t.side === "sell")) {
    if (s.ira) { notes.push(`Line ${s.line}: a sale inside an IRA or retirement account has no deductible loss and was skipped.`); continue; }
    // FIFO consumption of taxable lots acquired on or before the sale date
    let need = s.qty, costFromLots = 0, consumed = [];
    for (const lot of lots) {
      if (need <= 1e-9) break;
      if (lot.sym !== s.sym || lot.date > s.date || lot.soldFromTaxable >= lot.qty - 1e-9) continue;
      const take = Math.min(need, lot.qty - lot.soldFromTaxable);
      lot.soldFromTaxable += take; need -= take; costFromLots += (lot.price * take) + (lot.addedBasisPerShare || 0) * take;
      consumed.push({ lot, take });
    }
    const unmatchedShares = need > 1e-9 ? need : 0;
    let basis = s.basis != null ? s.basis : costFromLots;
    if (s.basis == null && unmatchedShares) notes.push(`Line ${s.line}: ${unmatchedShares} ${s.sym} shares sold had no earlier purchase in the file; their basis is unknown, so this sale is treated as having zero basis for those shares. Add a basis column to fix it.`);
    // acquisition lots carry basis already increased by earlier washes
    const proceeds = s.total;
    const gain = r2(proceeds - basis);
    const sale = { line: s.line, date: s.date, sym: s.sym, qty: s.qty, proceeds, basis: r2(basis), gain, disallowed: 0, allowed: 0, replacements: [], permanent: 0 };
    if (gain < 0) {
      const loss = -gain;
      // replacement candidates: buys of same symbol within +/-30 days, not the shares sold, not already used
      let remaining = s.qty;
      const lo = s.date - WINDOW_DAYS * DAY, hi = s.date + WINDOW_DAYS * DAY;
      for (const b of buys) {
        if (remaining <= 1e-9) break;
        if (b.sym !== s.sym || b.date < lo || b.date > hi) continue;
        let avail = b.free;
        const lotUsedAsSold = consumed.find((x) => x.lot === b);
        if (lotUsedAsSold) avail -= lotUsedAsSold.take;
        // shares of this buy already sold in an earlier sale (not this one) are not replacement shares
        if (!b.ira) avail = Math.min(avail, b.qty - b.soldFromTaxable);
        if (avail <= 1e-9) continue;
        const use = Math.min(avail, remaining);
        b.free -= use; remaining -= use;
        sale.replacements.push({ date: b.date, qty: use, ira: b.ira, line: b.line, buy: b });
      }
      const matched = s.qty - remaining;
      const disallowed = r2(loss * (matched / s.qty));
      sale.disallowed = disallowed;
      sale.allowed = r2(loss - disallowed);
      if (matched > 0) {
        let left = disallowed;
        for (const rep of sale.replacements) {
          const share = r2(disallowed * (rep.qty / matched));
          rep.disallowedShare = share; left = r2(left - share);
          if (rep.ira) sale.permanent = r2(sale.permanent + share);
          else { rep.buy.added += share; rep.buy.addedBasisPerShare = (rep.buy.addedBasisPerShare || 0) + share / rep.qty; rep.adjustedBasisPerShare = rep.buy.price + rep.buy.addedBasisPerShare; }
        }
      }
    }
    sales.push(sale);
  }
  const losses = sales.filter((x) => x.gain < 0);
  const grossLoss = r2(losses.reduce((a, x) => a - x.gain, 0));
  const disallowed = r2(losses.reduce((a, x) => a + x.disallowed, 0));
  const permanent = r2(losses.reduce((a, x) => a + x.permanent, 0));
  const summary = {
    sales: sales.length, lossSales: losses.length, washed: losses.filter((x) => x.disallowed > 0).length,
    grossLoss, disallowed, allowed: r2(grossLoss - disallowed), permanent, deferred: r2(disallowed - permanent),
    netGain: r2(sales.reduce((a, x) => a + x.gain, 0)),
  };
  return { sales, summary, notes };
}

export function evaluate(text) {
  const p = parseTrades(text);
  if (p.error) return { error: p.error };
  if (!p.trades.length) return { error: p.errors[0] || "No readable trades." };
  const a = analyze(p.trades);
  return { ...a, errors: p.errors, trades: p.trades.length };
}

// Safe re-buy date: the day after the 30-day window closes.
export const safeRebuyDate = (saleMs) => saleMs + (WINDOW_DAYS + 1) * DAY;

export function sampleList() {
  return [
    "Date,Symbol,Action,Quantity,Price,Account",
    "2025-09-02,NVDA,buy,100,120.00,Taxable",
    "2025-11-14,NVDA,sell,100,95.00,Taxable",
    "2025-11-26,NVDA,buy,60,98.00,Roth IRA",
    "2025-10-01,TSLA,buy,50,250.00,Taxable",
    "2025-12-05,TSLA,sell,50,210.00,Taxable",
    "2025-12-20,TSLA,buy,30,215.00,Taxable",
    "2025-10-10,AAPL,buy,40,190.00,Taxable",
    "2025-12-10,AAPL,sell,40,175.00,Taxable",
  ].join("\n");
}

export function reportCsv(r) {
  const rows = ["sale date,symbol,shares,proceeds,basis,gain or loss,wash sale disallowed (Form 8949 code W),loss you can claim,replacement purchases"];
  for (const s of r.sales) {
    const reps = s.replacements.map((x) => `${isoDate(x.date)} x${+x.qty.toFixed(4)}${x.ira ? " (IRA: loss permanently lost)" : ""}`).join("; ");
    rows.push([isoDate(s.date), s.sym, s.qty, s.proceeds.toFixed(2), s.basis.toFixed(2), s.gain.toFixed(2), s.disallowed.toFixed(2), s.gain < 0 ? s.allowed.toFixed(2) : "", `"${reps}"`].join(","));
  }
  return rows.join("\n") + "\n";
}
