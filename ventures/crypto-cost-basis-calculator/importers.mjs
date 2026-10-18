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
  if (findHeader(grid, ["transaction id", "transaction type", "asset type", "asset amount", "net amount"]) >= 0) return "cashapp";
  if (findHeader(grid, ["sent amount", "sent currency", "received amount", "received currency"]) >= 0) return "koinly";
  if (findHeader(grid, ["timestamp utc", "transaction kind", "native amount in usd"]) >= 0) return "cryptocom";
  if (findHeader(grid, ["date", "time utc", "type", "symbol", "usd amount usd"]) >= 0) return "gemini";
  if (findHeader(grid, ["timestamp", "transaction type", "asset"]) >= 0) return "coinbase";
  if (findHeader(grid, ["trade id", "product", "side", "created at", "size", "price", "fee"]) >= 0) return "coinbasepro";
  if (findHeader(grid, ["txid", "refid", "time", "type", "asset", "amount", "fee"]) >= 0) return "kraken";
  if (findHeader(grid, ["time", "operation", "primary asset"]) >= 0) return "binanceus";
  if (findHeader(grid, ["type", "datetime", "account", "amount", "value", "rate", "fee", "sub type"]) >= 0) return "bitstamp";
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

// ---- Crypto.com App (transaction history) ----------------------------------

const CDC_BUY = /purchase|buy/;
const CDC_SELL = /viban_exchange|sell|crypto_to_fiat/;
const CDC_SWAP = /crypto_exchange|dust_conversion|swap|convert/;
const CDC_INCOME = /reward|interest|cashback|referral|airdrop|rebate|bonus/;
const CDC_MOVE = /deposit|withdraw|transfer|lockup|stake|lock|card_top_up|admin/;

function importCryptoCom(grid) {
  const h = findHeader(grid, ["timestamp utc", "transaction kind", "native amount in usd"]);
  const names = grid[h].map(norm);
  const ix = (n) => names.indexOf(n);
  const c = {
    ts: ix("timestamp utc"), cur: ix("currency"), amt: ix("amount"), toCur: ix("to currency"), toAmt: ix("to amount"),
    usd: ix("native amount in usd"), kind: ix("transaction kind"),
  };
  const out = [], notes = [];
  let moves = 0, unpriced = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const g = (k) => (c[k] < 0 ? "" : r[c[k]] ?? "");
    const kind = String(g("kind")).toLowerCase().trim();
    if (!kind || !g("ts")) continue;
    const date = g("ts").slice(0, 10);
    const cur = g("cur").toUpperCase();
    const qty = Math.abs(num(g("amt")) ?? 0);
    const usd = num(g("usd"));
    const total = usd === null ? null : Math.abs(usd);
    const row = (type, asset, q) => {
      if (total === null) unpriced++;
      out.push([date, type, asset, fmt(q), fmt(total), "0", "Crypto.com"]);
    };
    if (CDC_SELL.test(kind)) row("sell", cur, qty);
    else if (CDC_BUY.test(kind)) row("buy", cur, qty);
    else if (CDC_SWAP.test(kind) && g("toCur")) {
      row("sell", cur, qty);
      row("buy", g("toCur").toUpperCase(), Math.abs(num(g("toAmt")) ?? 0));
    } else if (CDC_INCOME.test(kind) && (num(g("amt")) ?? 0) > 0) row("income", cur, qty);
    else if (CDC_MOVE.test(kind)) moves++;
    else notes.push(`Line ${i + 1}: Crypto.com transaction kind "${g("kind")}" was skipped.`);
  }
  if (unpriced) notes.push(`${unpriced} Crypto.com row${unpriced > 1 ? "s" : ""} had no USD value in the export and were left with an empty total. Fill each in from that day's price.`);
  if (moves) notes.push(`${moves} deposit, withdrawal, transfer and staking-lock rows ignored as non-taxable movements. A withdrawal that paid someone is a sale; enter it by hand.`);
  notes.push("The export has no fee column, so fees are 0; the Native Amount (in USD) on App trades already includes the spread.");
  out.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { format: "cryptocom", rows: out, notes };
}

// ---- Gemini (transaction history) -----------------------------------------

const GEM_INCOME = /interest|reward|earn|staking|airdrop|bonus|rebate/;
const GEM_MOVE = /credit|debit|deposit|withdraw|transfer/;
// Gemini writes amounts as "$1,000.00", "(100.00)" or "0.01 BTC".
const gemNum = (raw) => num(String(raw ?? "").replace(/[A-Za-z]+/g, ""));

function importGemini(grid) {
  const h = findHeader(grid, ["date", "time utc", "type", "symbol", "usd amount usd"]);
  const names = grid[h].map(norm);
  const ix = (n) => names.indexOf(n);
  const c = { date: ix("date"), type: ix("type"), sym: ix("symbol"), usd: ix("usd amount usd"), fee: ix("trading fee usd usd") };
  const out = [], notes = [];
  let moves = 0, unpriced = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const g = (k) => (c[k] < 0 ? "" : r[c[k]] ?? "");
    const type = norm(g("type"));
    if (!type || !g("date")) continue;
    const date = g("date").slice(0, 10);
    const sym = g("sym").toUpperCase().trim();
    if (type === "buy" || type === "sell") {
      const base = sym.endsWith("USD") ? sym.slice(0, -3) : "";
      const qcol = base ? ix(`${base.toLowerCase()} amount ${base.toLowerCase()}`) : -1;
      const qty = qcol < 0 ? null : Math.abs(gemNum(r[qcol]) ?? 0);
      if (!base || qty === null) {
        notes.push(`Line ${i + 1}: Gemini ${type} of "${g("sym")}" was skipped (only USD pairs with a matching amount column are read).`);
        continue;
      }
      const usd = gemNum(g("usd"));
      const total = usd === null ? null : Math.abs(usd);
      if (total === null) unpriced++;
      out.push([date, type, base, fmt(qty), fmt(total), fmt(Math.abs(gemNum(g("fee")) ?? 0)), "Gemini"]);
    } else if (GEM_INCOME.test(type)) {
      const col = ix(`${sym.toLowerCase()} amount ${sym.toLowerCase()}`);
      const qty = col < 0 ? null : Math.abs(gemNum(r[col]) ?? 0);
      if (!sym || qty === null) { notes.push(`Line ${i + 1}: Gemini "${g("type")}" for "${g("sym")}" was skipped.`); continue; }
      unpriced++;
      out.push([date, "income", sym, fmt(qty), "", "0", "Gemini"]);
    } else if (GEM_MOVE.test(type)) moves++;
    else notes.push(`Line ${i + 1}: Gemini transaction type "${g("type")}" was skipped.`);
  }
  if (unpriced) notes.push(`${unpriced} Gemini row${unpriced > 1 ? "s" : ""} had no USD value in the export and were left with an empty total. Fill each in from that day's price.`);
  if (moves) notes.push(`${moves} credit, debit, deposit and withdrawal rows ignored as non-taxable movements. A withdrawal that paid someone is a sale; enter it by hand.`);
  return { format: "gemini", rows: out, notes };
}

// ---- Bitstamp ------------------------------------------------------------
//
// Bitstamp's transaction export is one row per trade with the amounts spelled
// as "0.5 BTC" / "10000 USD" and a date such as "Jan. 10, 2023, 10:00 AM".
// Only USD-valued Market buys and sells are read; a trade valued in another
// currency is skipped with a note rather than converted at a rate nobody typed.

const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
function bitstampDate(raw) {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/);
  return m && MONTHS[m[1].toLowerCase()] ? `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}` : "";
}
// "0.5 BTC" -> { n: 0.5, cur: "BTC" }
const bitstampAmount = (raw) => {
  const m = String(raw ?? "").trim().match(/^(.*?)\s*([A-Za-z]{2,10})$/);
  return m ? { n: num(m[1]), cur: m[2].toUpperCase() } : { n: num(raw), cur: "" };
};

function importBitstamp(grid) {
  const h = findHeader(grid, ["type", "datetime", "account", "amount", "value", "rate", "fee", "sub type"]);
  const names = grid[h].map(norm);
  const c = { type: names.indexOf("type"), date: names.indexOf("datetime"), amount: names.indexOf("amount"), value: names.indexOf("value"), fee: names.indexOf("fee"), sub: names.indexOf("sub type") };
  const out = [], notes = [];
  let moves = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const type = norm(r[c.type] ?? "");
    if (!type) continue;
    if (type !== "market") {
      if (/deposit|withdrawal|sub account transfer/.test(type)) moves++;
      else notes.push(`Line ${i + 1}: Bitstamp row type "${r[c.type]}" was skipped.`);
      continue;
    }
    const side = norm(r[c.sub] ?? "");
    const date = bitstampDate(r[c.date]);
    const amt = bitstampAmount(r[c.amount]);
    const val = bitstampAmount(r[c.value]);
    const fee = bitstampAmount(r[c.fee]);
    if ((side !== "buy" && side !== "sell") || !date || amt.n === null || !amt.cur) {
      notes.push(`Line ${i + 1}: Bitstamp ${side || "trade"} could not be read and was skipped.`);
      continue;
    }
    if (val.cur !== "USD") {
      notes.push(`Line ${i + 1}: Bitstamp ${side} of ${amt.cur} is valued in ${val.cur || "an unknown currency"}, not USD, and was skipped. Enter it by hand at that day's USD value.`);
      continue;
    }
    out.push([date, side, amt.cur, fmt(Math.abs(amt.n)), fmt(val.n === null ? null : Math.abs(val.n)), fmt(fee.cur === "USD" && fee.n !== null ? Math.abs(fee.n) : 0), "Bitstamp"]);
    if (fee.n && fee.cur !== "USD") notes.push(`Line ${i + 1}: Bitstamp fee in ${fee.cur || "another currency"} was not counted; add it to the fee by hand.`);
  }
  if (moves) notes.push(`${moves} deposit and withdrawal rows ignored as non-taxable movements. A withdrawal that paid someone is a sale; enter it by hand.`);
  return { format: "bitstamp", rows: out, notes };
}

// ---- Coinbase Pro / Advanced Trade fills ----------------------------------

// The fills report is one row per fill: `product` is BASE-QUOTE (BTC-USD), `size`
// is in base coins, `price` is per coin in the quote currency and `fee` is in the
// quote currency. Only USD-quoted products are read; a coin-for-coin or
// stablecoin-quoted fill is skipped with a note rather than priced at a rate
// nobody typed.

function importCoinbasePro(grid) {
  const h = findHeader(grid, ["trade id", "product", "side", "created at", "size", "price", "fee"]);
  const names = grid[h].map(norm);
  const c = Object.fromEntries(["product", "side", "created at", "size", "price", "fee"].map((k) => [k, names.indexOf(k)]));
  const out = [], notes = [];
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const product = String(r[c.product] ?? "").trim().toUpperCase();
    if (!product) continue;
    const side = norm(r[c.side] ?? "");
    const date = String(r[c["created at"]] ?? "").slice(0, 10);
    const qty = num(r[c.size]), price = num(r[c.price]), fee = num(r[c.fee]);
    const [base, quote] = product.split("-");
    if ((side !== "buy" && side !== "sell") || !/^\d{4}-\d{2}-\d{2}$/.test(date) || qty === null || price === null || !base) {
      notes.push(`Line ${i + 1}: a Coinbase fill could not be read and was skipped.`);
      continue;
    }
    if (quote !== "USD") {
      notes.push(`Line ${i + 1}: ${product} ${side} is quoted in ${quote || "an unknown currency"}, not USD, and was skipped. Enter it by hand as a sale and a buy at that day's USD value.`);
      continue;
    }
    out.push([date, side, base, fmt(Math.abs(qty)), fmt(Math.abs(qty * price)), fmt(fee === null ? 0 : Math.abs(fee)), "Coinbase"]);
  }
  return { format: "coinbasepro", rows: out, notes };
}

// ---- Koinly universal format ---------------------------------------------
//
// Koinly's "universal" CSV (also what several other tax tools accept) has one
// row per movement: Sent and Received amount/currency, an optional fee and a
// Net Worth value, plus a Label. Reading it lets someone who exported their
// history from a paid service run the five-method comparison on it locally.
// Only USD values are used; the Net Worth figure is Koinly's own estimate of
// the value of the movement, taken as given.

const KL_INCOME = /reward|staking|mining|airdrop|income|interest|cashback|fork|lending|liquidity/;
const KL_FIAT = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "NZD", "SEK", "NOK", "DKK", "PLN", "INR", "BRL", "MXN", "SGD", "HKD"]);

function importKoinly(grid) {
  const h = findHeader(grid, ["sent amount", "sent currency", "received amount", "received currency"]);
  const names = grid[h].map(norm);
  const ix = (n) => names.indexOf(n);
  const c = {
    date: ix("date"), sa: ix("sent amount"), sc: ix("sent currency"), ra: ix("received amount"), rc: ix("received currency"),
    fa: ix("fee amount"), fc: ix("fee currency"), nw: ix("net worth amount"), nc: ix("net worth currency"), label: ix("label"),
  };
  const out = [], notes = [];
  let moves = 0, unpriced = 0, otherFiat = 0, feeSkipped = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const g = (k) => (c[k] < 0 ? "" : r[c[k]] ?? "");
    if (!g("date")) continue;
    const date = g("date").trim().slice(0, 10);
    const sent = Math.abs(num(g("sa")) ?? 0), recv = Math.abs(num(g("ra")) ?? 0);
    const sc = g("sc").toUpperCase().trim(), rc = g("rc").toUpperCase().trim();
    const label = String(g("label")).toLowerCase().trim();
    const nwUsd = g("nc").toUpperCase().trim() === "USD" ? num(g("nw")) : null;
    let fee = 0;
    if (num(g("fa"))) {
      if (g("fc").toUpperCase().trim() === "USD") fee = Math.abs(num(g("fa")));
      else feeSkipped++;
    }
    if ((sent && KL_FIAT.has(sc) && sc !== "USD") || (recv && KL_FIAT.has(rc) && rc !== "USD")) { otherFiat++; continue; }
    const sentCoin = sent && sc && !KL_FIAT.has(sc), recvCoin = recv && rc && !KL_FIAT.has(rc);
    const sentUsd = sent && sc === "USD", recvUsd = recv && rc === "USD";
    if (recvCoin && sentUsd) out.push([date, "buy", rc, fmt(recv), fmt(sent), fmt(fee), "Koinly"]);
    else if (sentCoin && recvUsd) out.push([date, "sell", sc, fmt(sent), fmt(recv), fmt(fee), "Koinly"]);
    else if (sentCoin && recvCoin) {
      if (nwUsd === null) unpriced++;
      const total = nwUsd === null ? null : Math.abs(nwUsd);
      out.push([date, "sell", sc, fmt(sent), fmt(total), fmt(fee), "Koinly"]);
      out.push([date, "buy", rc, fmt(recv), fmt(total), "0", "Koinly"]);
    } else if (recvCoin && !sent && KL_INCOME.test(label)) {
      if (nwUsd === null) unpriced++;
      out.push([date, "income", rc, fmt(recv), fmt(nwUsd === null ? null : Math.abs(nwUsd)), "0", "Koinly"]);
    } else if (sentCoin && !recv && /gift|donation|payment|cost/.test(label)) {
      if (nwUsd === null) unpriced++;
      out.push([date, "sell", sc, fmt(sent), fmt(nwUsd === null ? null : Math.abs(nwUsd)), fmt(fee), "Koinly"]);
    } else moves++;
  }
  if (unpriced) notes.push(`${unpriced} Koinly row${unpriced > 1 ? "s" : ""} had no USD Net Worth value and were left with an empty total. Fill each in from that day's price.`);
  if (moves) notes.push(`${moves} unlabelled deposit, withdrawal and transfer rows ignored as movements between your own wallets. A withdrawal that paid someone is a sale; enter it by hand.`);
  if (otherFiat) notes.push(`${otherFiat} row${otherFiat > 1 ? "s" : ""} paid in a non-USD currency were skipped, not converted at a rate nobody typed.`);
  if (feeSkipped) notes.push(`${feeSkipped} fee${feeSkipped > 1 ? "s" : ""} paid in a coin or non-USD currency were left out.`);
  notes.push("Koinly's own cost-basis method and Net Worth estimates are not carried over; the figures here come from the amounts in the file.");
  return { format: "koinly", rows: out, notes };
}

// ---- Cash App ------------------------------------------------------------
//
// Cash App's account-activity export has one row per transaction with the
// asset in `Asset Type`, the coin quantity in `Asset Amount` and the dollars in
// `Amount` ("-$10,000.00" on a buy) and `Fee`. Only Bitcoin Buy / Sale rows
// are taxable trades here; Boost, bonus and reward rows are income at no
// recorded value; sends, receives and plain cash movements are ignored.

const CA_INCOME = /boost|bonus|reward|bitcoin rewards|round up|giveaway|referral/;
const CA_MOVE = /deposit|withdraw|cash out|add cash|p2p|payment|card|send|receive|transfer|paycheck/;

function importCashApp(grid) {
  const h = findHeader(grid, ["transaction id", "transaction type", "asset type", "asset amount", "net amount"]);
  const names = grid[h].map(norm);
  const ix = (n) => names.indexOf(n);
  const c = { date: ix("date"), type: ix("transaction type"), amt: ix("amount"), fee: ix("fee"), asset: ix("asset type"), qty: ix("asset amount"), status: ix("status") };
  const out = [], notes = [];
  let moves = 0, unpriced = 0, failed = 0;
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i];
    const g = (k) => (c[k] < 0 ? "" : r[c[k]] ?? "");
    const type = norm(g("type"));
    if (!type || !g("date")) continue;
    const status = norm(g("status"));
    if (status && status !== "complete" && status !== "completed") { failed++; continue; }
    const date = g("date").slice(0, 10);
    const asset = g("asset").toUpperCase().trim();
    const qty = num(g("qty"));
    const isBuy = /\bbuy\b|\bpurchase\b/.test(type) && asset, isSell = /\bsale\b|\bsell\b/.test(type) && asset;
    if (isBuy || isSell) {
      if (qty === null || qty === 0) { notes.push(`Line ${i + 1}: Cash App ${g("type")} had no Asset Amount and was skipped.`); continue; }
      const usd = num(g("amt"));
      if (usd === null) unpriced++;
      out.push([date, isBuy ? "buy" : "sell", asset, fmt(Math.abs(qty)), fmt(usd === null ? null : Math.abs(usd)), fmt(Math.abs(num(g("fee")) ?? 0)), "Cash App"]);
    } else if (asset && qty && CA_INCOME.test(type)) {
      unpriced++;
      out.push([date, "income", asset, fmt(Math.abs(qty)), "", "0", "Cash App"]);
    } else if (CA_MOVE.test(type) || !asset) moves++;
    else notes.push(`Line ${i + 1}: Cash App transaction type "${g("type")}" was skipped.`);
  }
  if (unpriced) notes.push(`${unpriced} Cash App row${unpriced > 1 ? "s" : ""} had no USD value in the export and were left with an empty total. Fill each in from that day's price.`);
  if (failed) notes.push(`${failed} Cash App row${failed > 1 ? "s" : ""} with a status other than complete (failed, pending, cancelled) ignored.`);
  if (moves) notes.push(`${moves} deposit, withdrawal, payment and cash rows ignored as non-taxable movements. Sending bitcoin to someone as payment is a sale; enter it by hand.`);
  notes.push("Cash App: the export's Amount is read as the dollars traded and Fee as separate; check one row against the app before relying on the basis.");
  return { format: "cashapp", rows: out, notes };
}

// ---- entry points ---------------------------------------------------------

export const FORMAT_LABELS = { coinbase: "Coinbase transaction history", coinbasepro: "Coinbase Pro / Advanced Trade fills", kraken: "Kraken ledger", binanceus: "Binance.US transaction history", koinly: "Koinly universal CSV", cryptocom: "Crypto.com App transaction history", gemini: "Gemini transaction history", bitstamp: "Bitstamp transaction export", cashapp: "Cash App account activity", generic: "plain CSV" };

// Returns { format, csv, notes }. A generic file comes back unchanged.
export function convertExchangeCsv(text) {
  const format = detectFormat(text);
  if (format === "generic") return { format, csv: String(text ?? ""), notes: [] };
  const grid = parseCsv(text);
  const r = format === "coinbase" ? importCoinbase(grid) : format === "coinbasepro" ? importCoinbasePro(grid) : format === "binanceus" ? importBinanceUs(grid) : format === "koinly" ? importKoinly(grid) : format === "cryptocom" ? importCryptoCom(grid) : format === "gemini" ? importGemini(grid) : format === "bitstamp" ? importBitstamp(grid) : format === "cashapp" ? importCashApp(grid) : importKraken(grid);
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
