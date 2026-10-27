// Perpetual inventory: stock bought for resale is filed from the bank to Inventory
// (1450), a current asset; each sale or write-off here moves its cost to Cost of
// goods sold (5000), so gross margin on the profit and loss is real, not a guess.
//
// Books keep `books.inventory`:
//   { method: "fifo" | "avg", moves: [{ id, date, sku, name?, kind: "buy"|"sell"|"adjust", qty (milli-units), cents }] }
// Quantities are stored in thousandths so 2.5 metres of cable is exact. A buy carries
// its total cost in cents; a sale or write-off has its cost worked out by the method.
// FIFO takes the oldest layers first (a part layer is pro-rated, half up);
// "avg" is a moving average over what is on hand. Pure functions.

import { parseCents, parseDate } from "./bank.mjs";

export const INVENTORY_ACCOUNT = "1450", COGS_ACCOUNT = "5000";

const clone = (x) => JSON.parse(JSON.stringify(x));
const milli = (q) => { const n = Math.round(Number(q) * 1000); return Number.isFinite(n) ? n : NaN; };
const prorate = (cents, num, den) => Math.floor((cents * num * 2 + den) / (den * 2)); // round half up, non-negative

// Replays the moves in date order (input order within a day, buys before sales on the same date).
// Returns { rows (one per sku), costs: Map(moveId -> cents), error? }.
export function replay(inv) {
  const method = inv?.method ?? "fifo";
  const order = (inv?.moves ?? []).map((m, i) => ({ m, i })).sort((a, b) => a.m.date.localeCompare(b.m.date) || (a.m.kind === "buy" ? 0 : 1) - (b.m.kind === "buy" ? 0 : 1) || a.i - b.i).map((x) => x.m);
  const stock = new Map(), costs = new Map();
  let error = null;
  for (const m of order) {
    if (m.kind === "landed") {
      // Freight or duty paid for bought stock: the share for units still on hand joins their
      // cost; the share for units already gone is cost of goods sold now.
      let expensed = 0;
      for (const a of m.alloc) {
        const t = stock.get(a.sku), l = t?.layers.find((x) => x.id === a.id);
        const onHand = !t ? 0 : method === "avg" ? Math.min(t.qty, l ? l.orig : 0) : l ? l.qty : 0, bought = l ? l.orig : 1;
        const keep = onHand >= bought ? a.cents : prorate(a.cents, onHand, bought);
        if (l && method !== "avg") l.cents += keep;
        if (t) { t.value += keep; t.cogs += a.cents - keep; }
        expensed += a.cents - keep;
      }
      costs.set(m.id, expensed);
      continue;
    }
    if (m.kind === "writedown") {
      // Lower of cost and net realizable value: what is on hand is cut to the selling price
      // less the cost to sell, per unit. A new cost basis; it is never written back up.
      const t = stock.get(m.sku);
      let loss = 0;
      if (t && t.qty > 0) {
        if (method === "avg") loss = Math.max(0, t.value - Math.round(m.nrv * t.qty / 1000));
        else for (const l of t.layers) { const cap = Math.round(m.nrv * l.qty / 1000), cut = Math.max(0, l.cents - cap); l.cents -= cut; loss += cut; }
        t.value -= loss; t.cogs += loss; t.writtenDown += loss;
      }
      costs.set(m.id, loss);
      continue;
    }
    const s = stock.get(m.sku) ?? { sku: m.sku, name: m.name ?? m.sku, layers: [], qty: 0, value: 0, bought: 0, returned: 0, sold: 0, cogs: 0, writtenDown: 0 };
    stock.set(m.sku, s);
    if (m.name) s.name = m.name;
    if (m.kind === "buy") {
      s.layers.push({ id: m.id, qty: m.qty, orig: m.qty, cents: m.cents });
      s.qty += m.qty; s.value += m.cents; s.bought += m.qty;
      continue;
    }
    if (m.qty > s.qty) { error ??= `${m.sku}: ${m.kind === "sell" ? "sold" : m.kind === "return" ? "returned to the supplier" : "written off"} ${m.qty / 1000} on ${m.date} with only ${s.qty / 1000} on hand.`; costs.set(m.id, 0); continue; }
    let cost = 0;
    if (method === "avg") {
      cost = m.qty === s.qty ? s.value : prorate(s.value, m.qty, s.qty);
    } else {
      // A sale or write-off takes the oldest layer first; a return goes back to the supplier from the newest.
      const back = m.kind === "return";
      let left = m.qty;
      while (left > 0) {
        const l = back ? s.layers.at(-1) : s.layers[0], take = Math.min(l.qty, left);
        const c = take === l.qty ? l.cents : prorate(l.cents, take, l.qty);
        cost += c; l.cents -= c; l.qty -= take; left -= take;
        if (l.qty === 0) back ? s.layers.pop() : s.layers.shift();
      }
    }
    s.qty -= m.qty; s.value -= cost;
    if (m.kind === "return") s.returned += m.qty; else { s.sold += m.qty; s.cogs += cost; }
    costs.set(m.id, cost);
  }
  const rows = [...stock.values()].map((s) => ({ sku: s.sku, name: s.name, onHand: s.qty / 1000, value: s.value, unitCost: s.qty ? Math.round(s.value / (s.qty / 1000)) : 0, bought: s.bought / 1000, returned: s.returned / 1000, sold: s.sold / 1000, cogs: s.cogs, writtenDown: s.writtenDown })).sort((a, b) => a.sku.localeCompare(b.sku));
  return { method, rows, costs, error, value: rows.reduce((t, r) => t + r.value, 0), cogs: rows.reduce((t, r) => t + r.cogs, 0) };
}

export function inventoryEntries(books) {
  const inv = books.inventory;
  if (!inv?.moves?.length) return [];
  const { costs } = replay(inv);
  const out = [];
  for (const m of inv.moves) {
    const cents = costs.get(m.id);
    if (m.kind === "buy" || m.kind === "return" || !cents) continue; // a return books no cost: the supplier's refund, filed to 1450, credits Inventory
    out.push({ id: m.id, date: m.date, memo: m.kind === "writedown" ? `Inventory written down to net realizable value, ${m.sku}` : m.kind === "landed" ? `Freight and duty on stock already sold, ${m.alloc.map((a) => a.sku).join(", ")}` : `${m.kind === "sell" ? "Cost of goods sold" : "Stock written off"}, ${m.sku}`, source: "inventory", lines: [{ account: COGS_ACCOUNT, debit: cents, credit: 0 }, { account: INVENTORY_ACCOUNT, debit: 0, credit: cents }] });
  }
  return out;
}

// addInventoryMove(books, { kind, sku, date, qty, amount?, name? }) -> { books, move } or throws.
// A buy needs `amount` (total paid for the whole quantity); sell and adjust must not have one.
export function addInventoryMove(booksIn, { kind = "buy", sku, date, qty, amount, name } = {}) {
  const books = clone(booksIn);
  if (!["buy", "sell", "adjust", "return"].includes(kind)) throw new Error(`Kind ${kind} is not buy, sell, adjust or return.`);
  sku = String(sku ?? "").trim();
  if (!sku) throw new Error("An inventory move needs a SKU or item name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  const q = milli(qty);
  if (!Number.isInteger(q) || q <= 0) throw new Error("Quantity must be a positive number (up to 3 decimals).");
  let cents = 0;
  if (kind === "buy") {
    cents = typeof amount === "number" ? Math.round(amount * 100) : parseCents(String(amount ?? ""));
    if (!Number.isFinite(cents) || cents <= 0) throw new Error("A purchase needs the total amount paid, above zero.");
  } else if (amount !== undefined && amount !== null && amount !== "") throw new Error("Only a purchase has an amount; the cost of a sale is worked out from the stock.");
  if (books.lockedThrough && date <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  books.inventory ??= { method: "fifo", moves: [] };
  const move = { id: `INV-${books.inventory.moves.length + 1}`, date, sku, kind, qty: q, cents };
  if (name?.trim()) move.name = name.trim();
  books.inventory.moves.push(move);
  const r = replay(books.inventory);
  if (r.error) throw new Error(r.error);
  for (const [code, nm, type] of [[INVENTORY_ACCOUNT, "Inventory", "asset"], [COGS_ACCOUNT, "Cost of goods sold", "expense"]])
    if (!books.accounts.some((a) => a.code === code)) books.accounts.push({ code, name: nm, type });
  books.accounts.sort((a, b) => a.code.localeCompare(b.code));
  return { books, move };
}

// addLandedCost(books, { amount, date, to: ["INV-1", ...], by: "value"|"qty" }) -> { books, move } or throws.
// Freight, duty or insurance paid for stock already bought: spread over the named purchases by
// their cost (default) or quantity, remainder cents to the largest share. File the payment to 1450.
export function addLandedCost(booksIn, { amount, date, to, by = "value" } = {}) {
  const books = clone(booksIn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  const cents = typeof amount === "number" ? Math.round(amount * 100) : parseCents(String(amount ?? ""));
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Landed cost needs an amount above zero.");
  if (!["value", "qty"].includes(by)) throw new Error(`Apportion by value or qty, not ${by}.`);
  const ids = (Array.isArray(to) ? to : String(to ?? "").split(",")).map((x) => x.trim()).filter(Boolean);
  if (!ids.length) throw new Error("Name the purchases the cost belongs to, e.g. --on INV-1,INV-2.");
  if (new Set(ids).size !== ids.length) throw new Error("A purchase is named twice.");
  const buys = ids.map((id) => {
    const b = (books.inventory?.moves ?? []).find((m) => m.id === id);
    if (!b || b.kind !== "buy") throw new Error(`${id} is not a recorded purchase.`);
    if (date < b.date) throw new Error(`${id} was bought ${b.date}, after ${date}.`);
    return b;
  });
  if (books.lockedThrough && date <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  const w = buys.map((b) => (by === "qty" ? b.qty : b.cents)), tot = w.reduce((t, x) => t + x, 0);
  const shares = w.map((x) => Math.floor((cents * x) / tot));
  shares[w.indexOf(Math.max(...w))] += cents - shares.reduce((t, x) => t + x, 0);
  const move = { id: `INV-${books.inventory.moves.length + 1}`, date, kind: "landed", qty: 0, cents, alloc: buys.map((b, i) => ({ id: b.id, sku: b.sku, cents: shares[i] })) };
  books.inventory.moves.push(move);
  return { books, move };
}

// addInventoryWritedown(books, { sku, date, nrv }) -> { books, move, loss } or throws.
// `nrv` is the net realizable value per unit (expected selling price less cost to sell). Stock on
// hand costing more than that is cut to it; Dr Cost of goods sold, Cr Inventory. Never written back up.
export function addInventoryWritedown(booksIn, { sku, date, nrv } = {}) {
  const books = clone(booksIn);
  sku = String(sku ?? "").trim();
  if (!sku) throw new Error("A write-down needs a SKU or item name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  const unit = typeof nrv === "number" ? Math.round(nrv * 100) : parseCents(String(nrv ?? ""));
  if (!Number.isFinite(unit) || unit < 0) throw new Error("Net realizable value per unit must be zero or more.");
  if (books.lockedThrough && date <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  if (!(books.inventory?.moves ?? []).some((m) => m.sku === sku && m.kind === "buy")) throw new Error(`No stock of ${sku} was bought.`);
  const move = { id: `INV-${books.inventory.moves.length + 1}`, date, sku, kind: "writedown", qty: 0, cents: 0, nrv: unit };
  books.inventory.moves.push(move);
  const r = replay(books.inventory);
  if (r.error) throw new Error(r.error);
  return { books, move, loss: r.costs.get(move.id) };
}

export function setInventoryMethod(booksIn, method) {
  if (!["fifo", "avg"].includes(method)) throw new Error(`Method ${method} is not fifo or avg.`);
  const books = clone(booksIn);
  books.inventory ??= { method, moves: [] };
  if (books.lockedThrough && books.inventory.moves.some((m) => m.date <= books.lockedThrough)) throw new Error(`Moves exist in the period locked through ${books.lockedThrough}; changing the method would restate it.`);
  books.inventory.method = method;
  return books;
}

// Stock on hand by SKU, valued; the total is what account 1450 should hold.
export function inventoryRegister(books) {
  const r = replay(books.inventory ?? { moves: [] });
  return { method: r.method, rows: r.rows, value: r.value, cogs: r.cogs };
}
