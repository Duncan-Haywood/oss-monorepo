// Exchange-export importers. Pure functions, no I/O, no dependencies.
//
// Turns a raw export from an exchange into the plain CSV that calc.mjs reads
// (date,type,asset,quantity,total,fee,wallet), so a person can drop in the file
// they already have instead of reshaping it by hand. Nothing is priced or
// fetched: a row whose USD value the export does not carry (a coin-for-coin
// trade on Kraken, a staking reward) is written with an empty `total` and
// reported in `notes`, so it shows up as a line to fill in rather than as a
// silent zero.
//
// Formats are written from the column layouts the exchanges publish and have
// not been checked against a real account; the notes say so where it matters.

import { parseCsv } from "./calc.mjs";

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const num = (raw) => {
  const s = String(raw ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const cell = (v) => (/[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const fmt = (n) => (n === null || n === undefined ? "" : String(+Number(n).toFixed(10)));

export const OUT_HEADER = "date,type,asset,quantity,total,fee,wallet";
const toCsv = (rows) => [OUT_HEADER, ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n";

// ---- format detection ----------------------------------------------------

function findHeader(grid, needles) {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const names = grid[i].map(norm);
    if (needles.every((n) => names.includes(n))) return i;
  }
  return -1;
}

export function detectFormat(text) {
  const grid = parseCsv(text);
  if (findHeader(grid, ["timestamp", "transaction type", "asset"]) >= 0) return "coinbase";
  if (findHeader(grid, ["txid", "refid", "time", "type", "asset", "amount", "fee"]) >= 0) return "kraken";
  if (findHeader(grid, ["time", "operation", "primary asset"]) >= 0) return "binanceus";
  return "generic";
}

// ---- Coinbase ------------------------------------------------------------

const CB_BUY = ["buy", "advanced trade buy"];
const CB_SELL = ["sell", "advanced trade sell"];
const CB_INCOME = ["rewards income", "staking income", "coinbase earn", "learning reward", "inflation reward", "reward income", "airdrop"];
const CB_MOVE = ["send", "receive", "deposit", "withdrawal"];

function importCoinbase(grid) {
  const h = findHeader(grid, ["timestamp", "transaction type", "asset"]);
  const names = grid[h].map(norm);
  const col = (...opts) => { for (const o of opts) { const i = names.indexOf(o); if (i >= 0) return i; } return -1; };
  const c = {
    ts: col("timestamp"), type: col("transaction type"), asset: col("asset"),
    qty: col("quantity transacted"), cur: col("spot price currency"),
    sub: col("subtotal", "usd subtotal"), total: col("total inclusive of fees and or spread", "total inclusive of fees", "usd total inclusive of fees"),
    fee: col("fees and or spread", "usd fees", "fees"), notes: col("notes"),
  };
  const out = [], notes = [];
  let sends = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const g = (k) => (c[k] < 0 ? "" : r[c[k]] ?? "");
    const type = norm(g("type"));
    if (!type || !g("ts")) continue;
    const date = g("ts").slice(0, 10);
    const asset = g("asset").toUpperCase();
    const qty = Math.abs(num(g("qty")) ?? 0);
    const cur = g("cur").toUpperCase();
    if (cur && cur !== "USD") { notes.push(`Line ${i + 1}: priced in ${cur}, not USD, so it was skipped.`); continue; }
    const fee = Math.abs(num(g("fee")) ?? 0);
    const sub = num(g("sub"));
    const total = num(g("total"));
    // Subtotal is the value before fees; fall back to total minus fee on a buy.
    const usd = sub !== null ? Math.abs(sub) : total !== null ? Math.abs(total) : null;
    if (CB_BUY.includes(type)) out.push([date, "buy", asset, fmt(qty), fmt(usd), fmt(fee), "Coinbase"]);
    else if (CB_SELL.includes(type)) out.push([date, "sell", asset, fmt(qty), fmt(usd), fmt(fee), "Coinbase"]);
    else if (CB_INCOME.includes(type)) out.push([date, "income", asset, fmt(qty), fmt(usd), "0", "Coinbase"]);
    else if (type === "convert") {
      const m = g("notes").match(/converted\s+([\d.,]+)\s+(\S+)\s+to\s+([\d.,]+)\s+(\S+)/i);
      if (!m) { notes.push(`Line ${i + 1}: a Convert row whose Notes could not be read, so it was skipped. Enter it as a sale and a buy.`); continue; }
      const [, q1, a1, q2, a2] = m;
      out.push([date, "sell", a1.toUpperCase(), fmt(num(q1)), fmt(usd), fmt(fee), "Coinbase"]);
      out.push([date, "buy", a2.toUpperCase(), fmt(num(q2)), fmt(usd), "0", "Coinbase"]);
    } else if (CB_MOVE.includes(type)) {
      if (type === "send") sends++;
    } else notes.push(`Line ${i + 1}: unknown Coinbase type "${g("type")}", so it was skipped.`);
  }
  if (sends) notes.push(`${sends} Send row${sends > 1 ? "s" : ""} treated as transfers between your own wallets (not taxable). If any was a payment or a gift, enter it as a sale at its USD value.`);
  return { format: "coinbase", rows: out, notes };
}

// ---- Kraken (ledgers.csv) -------------------------------------------------

const OTHER_FIAT = new Set(["EUR", "GBP", "CAD", "AUD", "JPY", "CHF"]);
const STABLE = new Set(["USDT", "USDC", "DAI"]);
const ALIAS = { XBT: "BTC", XXBT: "BTC", XETH: "ETH", XXDG: "DOGE", XDG: "DOGE", XLTC: "LTC", XXRP: "XRP", XXLM: "XLM", XETC: "ETC", XXMR: "XMR", XZEC: "ZEC", ETH2: "ETH" };

export function krakenAsset(raw) {
  let a = String(raw).toUpperCase().replace(/\.(S|M|F|B|P)$/, "").replace(/\.(S|M|F|B|P)$/, "");
  if (ALIAS[a]) return ALIAS[a];
  if (a.length === 4 && a[0] === "Z" && (a === "ZUSD" || OTHER_FIAT.has(a.slice(1)))) return a.slice(1);
  return a;
}

function importKraken(grid) {
  const h = findHeader(grid, ["txid", "refid", "time", "type", "asset", "amount", "fee"]);
  const names = grid[h].map(norm);
  const ix = (n) => names.indexOf(n);
  const c = { refid: ix("refid"), time: ix("time"), type: ix("type"), sub: ix("subtype"), asset: ix("asset"), amount: ix("amount"), fee: ix("fee") };
  const out = [], notes = [];
  const trades = new Map();
  let staking = 0, fiatOther = 0, moves = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const type = norm(r[c.type] ?? "");
    const asset = krakenAsset(r[c.asset] ?? "");
    const amount = num(r[c.amount]);
    const fee = num(r[c.fee]) ?? 0;
    const date = String(r[c.time] ?? "").slice(0, 10);
    if (!type || amount === null) continue;
    if (["trade", "spend", "receive"].includes(type)) {
      const k = r[c.refid];
      if (!trades.has(k)) trades.set(k, { date, legs: [] });
      trades.get(k).legs.push({ asset, amount, fee });
    } else if (type === "staking" || (type === "earn" && norm(r[c.sub] ?? "") === "reward")) {
      staking++;
      if (amount > 0) out.push([date, "income", asset, fmt(amount - fee), "", "0", "Kraken"]);
    } else if (["deposit", "withdrawal", "transfer", "margin", "rollover", "settled", "adjustment", "earn", "sale", "dividend"].includes(type)) {
      moves++;
    } else notes.push(`Line ${i + 1}: Kraken type "${r[c.type]}" was skipped.`);
  }
  for (const { date, legs } of trades.values()) {
    const usd = legs.find((l) => l.asset === "USD");
    const crypto = legs.filter((l) => l.asset !== "USD");
    if (crypto.some((l) => OTHER_FIAT.has(l.asset))) { fiatOther++; continue; }
    if (usd && crypto.length === 1) {
      const x = crypto[0];
      const total = Math.abs(usd.amount);
      if (x.amount > 0) out.push([date, "buy", x.asset, fmt(x.amount - x.fee), fmt(total), fmt(usd.fee), "Kraken"]);
      else out.push([date, "sell", x.asset, fmt(Math.abs(x.amount) + x.fee), fmt(total), fmt(usd.fee), "Kraken"]);
    } else if (crypto.length === 2) {
      const [a, b] = crypto[0].amount < 0 ? crypto : [crypto[1], crypto[0]];
      const st = [a, b].find((l) => STABLE.has(l.asset));
      const known = st ? fmt(Math.abs(st.amount)) : ""; // a stablecoin leg is a USD figure the export does carry
      out.push([date, "sell", a.asset, fmt(Math.abs(a.amount) + a.fee), known, "0", "Kraken"]);
      out.push([date, "buy", b.asset, fmt(b.amount - b.fee), known, "0", "Kraken"]);
      if (!st) notes.push(`${date}: ${a.asset} to ${b.asset} swap has no USD value in the export. Fill in the empty total on its two rows.`);
      else notes.push(`${date}: ${a.asset} to ${b.asset} swap priced from the ${st.asset} leg at $1 per coin; check it against the day's price if the stablecoin was off its peg.`);
    } else notes.push(`${date}: a Kraken trade with ${legs.length} legs could not be read, so it was skipped.`);
  }
  if (staking) notes.push(`${staking} staking reward row${staking > 1 ? "s" : ""} imported as income with an empty USD total. Fill in each reward's USD value on the day received.`);
  if (fiatOther) notes.push(`${fiatOther} trade${fiatOther > 1 ? "s" : ""} against a non-USD currency skipped; enter them with a USD value.`);
  if (moves) notes.push(`${moves} deposit, withdrawal and transfer rows ignored as non-taxable movements.`);
  out.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { format: "kraken", rows: out, notes };
}

// ---- Binance.US (transaction history) --------------------------------------

const BN_INCOME = /reward|distribution|airdrop|referral|cashback|interest/;
const BN_MOVE = /deposit|withdraw|transfer|stake|unstake|subscri|redeem/;

function importBinanceUs(grid) {
  const h = findHeader(grid, ["time", "operation", "primary asset"]);
  const names = grid[h].map(norm);
  const ix = (n) => names.indexOf(n);
  const c = {
    time: ix("time"), cat: ix("category"), op: ix("operation"), asset: ix("primary asset"),
    qty: ix("realized amount for primary asset"), usd: ix("realized amount for primary asset in usd value"),
    qusd: ix("realized amount for quote asset in usd value"), fusd: ix("realized amount for fee asset in usd value"),
  };
  const out = [], notes = [];
  let moves = 0, unpriced = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const g = (k) => (c[k] < 0 ? "" : r[c[k]] ?? "");
    const op = norm(g("op"));
    if (!op || !g("time")) continue;
    const date = g("time").slice(0, 10);
    const asset = g("asset").toUpperCase();
    const qty = Math.abs(num(g("qty")) ?? 0);
    const usd = num(g("usd")) ?? num(g("qusd"));
    const total = usd === null ? null : Math.abs(usd);
    const fee = Math.abs(num(g("fusd")) ?? 0);
    if (/^buy\b/.test(op) || /^sell\b/.test(op)) {
      if (total === null) unpriced++;
      out.push([date, op.startsWith("buy") ? "buy" : "sell", asset, fmt(qty), fmt(total), fmt(fee), "Binance.US"]);
    } else if (BN_INCOME.test(op) || BN_INCOME.test(norm(g("cat")))) {
      if (total === null) unpriced++;
      out.push([date, "income", asset, fmt(qty), fmt(total), "0", "Binance.US"]);
    } else if (BN_MOVE.test(op)) moves++;
    else notes.push(`Line ${i + 1}: Binance.US operation "${g("op")}" was skipped.`);
  }
  if (unpriced) notes.push(`${unpriced} Binance.US row${unpriced > 1 ? "s" : ""} had no USD value in the export and were left with an empty total. Fill each in from that day's price.`);
  if (moves) notes.push(`${moves} deposit, withdrawal and staking-transfer rows ignored as non-taxable movements.`);
  return { format: "binanceus", rows: out, notes };
}

// ---- entry points ---------------------------------------------------------

export const FORMAT_LABELS = { coinbase: "Coinbase transaction history", kraken: "Kraken ledger", binanceus: "Binance.US transaction history", generic: "plain CSV" };

// Returns { format, csv, notes }. A generic file comes back unchanged.
export function convertExchangeCsv(text) {
  const format = detectFormat(text);
  if (format === "generic") return { format, csv: String(text ?? ""), notes: [] };
  const grid = parseCsv(text);
  const r = format === "coinbase" ? importCoinbase(grid) : format === "binanceus" ? importBinanceUs(grid) : importKraken(grid);
  return { format, csv: toCsv(r.rows), notes: r.notes, count: r.rows.length };
}

// Several files at once (e.g. two exchanges, or one per year): one CSV, one header.
export function convertMany(files) {
  const lines = [], notes = [], formats = [];
  for (const f of files) {
    const r = convertExchangeCsv(f.text);
    formats.push(r.format);
    for (const n of r.notes) notes.push(files.length > 1 ? `${f.name}: ${n}` : n);
    const body = r.csv.split(/\r?\n/);
    if (lines.length === 0) lines.push(...body.filter((l) => l.trim()));
    else {
      if (r.format === "generic" && norm(body[0]) !== norm(OUT_HEADER)) notes.push(`${f.name}: header differs from the first file's; check that the columns line up.`);
      lines.push(...body.slice(1).filter((l) => l.trim()));
    }
  }
  return { formats, csv: lines.join("\n") + "\n", notes };
}
