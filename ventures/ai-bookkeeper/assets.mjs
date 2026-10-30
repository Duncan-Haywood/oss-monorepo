// Fixed assets: equipment you bought that lasts more than a year. The purchase
// itself is a bank line you file to an asset account (1500); this register adds
// what the bank feed cannot: the depreciation, booked monthly, so the profit and
// loss shows the cost spread over the years it is used and the balance sheet shows
// the asset net of what has been used up.
//
// Books keep `books.assets`:
//   { id: "FA-1", name, date (placed in service), cents, salvage, lifeMonths,
//     method: "straight-line" | "expense", assetAccount, disposed?: { date, proceeds } }
// "expense" writes the whole cost off in the month placed in service (the
// small-purchase and Section 179 style election; whether you may is for you or your
// preparer). Integer cents: month k carries floor(base*k/life) less the months
// before it, so the last month closes the cost exactly. Pure functions.

import { parseCsv, parseCents, parseDate } from "./bank.mjs";

export const ASSET_ACCOUNT = "1500", ACCUM = "1590", DEPR_EXPENSE = "6950", GAIN_LOSS = "4150";
const METHODS = new Set(["straight-line", "expense"]);

const monthEnd = (y, m) => { const d = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
const ym = (date) => ({ y: +date.slice(0, 4), m: +date.slice(5, 7) });
const addMonths = ({ y, m }, n) => { const t = y * 12 + (m - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; };
const monthsBetween = (a, b) => (b.y - a.y) * 12 + (b.m - a.m);

// Month-by-month schedule: [{ date (month end), cents, accumulated }] from the
// month placed in service through `through` (a date), stopping at end of life or at
// the month of disposal.
export function schedule(asset, through) {
  const start = ym(asset.date);
  const life = asset.method === "expense" ? 1 : asset.lifeMonths;
  const base = asset.cents - (asset.method === "expense" ? 0 : asset.salvage ?? 0);
  const endM = asset.disposed ? ym(asset.disposed.date) : null;
  const last = Math.min(life, through ? monthsBetween(start, ym(through)) + 1 : life, endM ? monthsBetween(start, endM) + 1 : life);
  const out = [];
  let prev = 0;
  for (let k = 1; k <= last; k++) {
    const cum = Math.floor((base * k) / life);
    const at = addMonths(start, k - 1);
    out.push({ date: monthEnd(at.y, at.m), cents: cum - prev, accumulated: cum });
    prev = cum;
  }
  return out.filter((r) => r.cents !== 0);
}

// Latest date in the books: depreciation is booked through the end of that month.
export function booksThrough(books) {
  const dates = [...(books.transactions ?? []).map((t) => t.date), ...(books.documents ?? []).map((d) => d.date), ...(books.assets ?? []).flatMap((a) => a.disposed ? [a.date, a.disposed.date] : [a.date])];
  return dates.sort().at(-1) ?? null;
}

// Journal entries: one per asset per month (debit depreciation expense, credit
// accumulated depreciation), and for a disposed asset one entry that removes the
// cost and accumulated depreciation, books the proceeds to the checking-style
// account named at disposal and the difference to gain or loss.
export function assetEntries(books) {
  const through = booksThrough(books);
  const out = [];
  for (const a of books.assets ?? []) {
    for (const r of schedule(a, through)) out.push({ id: `${a.id}-${r.date.slice(0, 7)}`, date: r.date, memo: `Depreciation, ${a.name}`, source: "depreciation", lines: [{ account: DEPR_EXPENSE, debit: r.cents, credit: 0 }, { account: ACCUM, debit: 0, credit: r.cents }] });
    if (a.disposed) {
      const acc = schedule(a, a.disposed.date).at(-1)?.accumulated ?? 0;
      const proceeds = a.disposed.proceeds ?? 0;
      const diff = proceeds + acc - a.cents; // positive: gain
      const lines = [{ account: a.assetAccount, debit: 0, credit: a.cents }];
      if (acc) lines.push({ account: ACCUM, debit: acc, credit: 0 });
      if (proceeds) lines.push({ account: a.disposed.account, debit: proceeds, credit: 0 });
      if (diff) lines.push({ account: GAIN_LOSS, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0 });
      out.push({ id: `${a.id}-DISP`, date: a.disposed.date, memo: `Disposal, ${a.name}`, source: "disposal", lines });
    }
  }
  return out;
}

export function ensureAssetAccounts(books) {
  const have = new Set(books.accounts.map((a) => a.code));
  if (!have.has(ASSET_ACCOUNT)) books.accounts.push({ code: ASSET_ACCOUNT, name: "Equipment", type: "asset" });
  if (!have.has(ACCUM)) books.accounts.push({ code: ACCUM, name: "Accumulated depreciation", type: "asset" });
  if (!have.has(DEPR_EXPENSE)) books.accounts.push({ code: DEPR_EXPENSE, name: "Depreciation", type: "expense" });
  if (!have.has(GAIN_LOSS)) books.accounts.push({ code: GAIN_LOSS, name: "Gain or loss on asset sales", type: "income" });
  books.accounts.sort((a, b) => a.code.localeCompare(b.code));
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// addAsset(books, { name, date, cost (dollars text or number), lifeMonths, salvage, method, assetAccount })
// -> { books, asset } or throws.
export function addAsset(booksIn, { name, date, cost, lifeMonths = 60, salvage = 0, method = "straight-line", assetAccount = ASSET_ACCOUNT } = {}) {
  const books = clone(booksIn);
  const cents = typeof cost === "number" ? Math.round(cost * 100) : parseCents(String(cost ?? ""));
  const salv = typeof salvage === "number" ? Math.round(salvage * 100) : parseCents(String(salvage));
  if (!name?.trim()) throw new Error("An asset needs a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Cost must be a positive amount.");
  if (!Number.isFinite(salv) || salv < 0 || salv >= cents) throw new Error("Salvage value must be zero or more and less than the cost.");
  if (!METHODS.has(method)) throw new Error(`Method must be one of ${[...METHODS].join(", ")}.`);
  if (method === "straight-line" && (!Number.isInteger(lifeMonths) || lifeMonths < 2 || lifeMonths > 600)) throw new Error("Life must be a whole number of months, 2 to 600.");
  if (books.lockedThrough && date <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  books.assets ??= [];
  const id = `FA-${books.assets.length + 1}`;
  const asset = { id, name: name.trim(), date, cents, salvage: method === "expense" ? 0 : salv, lifeMonths: method === "expense" ? 1 : lifeMonths, method, assetAccount };
  books.assets.push(asset);
  ensureAssetAccounts(books);
  return { books, asset };
}

// Sell or scrap an asset on `date`; proceeds land in `account` (a bank account code).
export function disposeAsset(booksIn, id, { date, proceeds = 0, account = "1000" } = {}) {
  const books = clone(booksIn);
  const a = (books.assets ?? []).find((x) => x.id === id);
  if (!a) throw new Error(`No asset ${id}.`);
  if (a.disposed) throw new Error(`${id} was already disposed on ${a.disposed.date}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  if (date < a.date) throw new Error("Disposal cannot be before the asset was placed in service.");
  if (books.lockedThrough && date <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  const p = typeof proceeds === "number" ? Math.round(proceeds * 100) : parseCents(String(proceeds));
  if (!Number.isFinite(p) || p < 0) throw new Error("Proceeds must be zero or more.");
  a.disposed = { date, proceeds: p, account };
  ensureAssetAccounts(books);
  return { books, asset: a };
}

// The register as of a date: cost, accumulated depreciation, net book value.
export function register(books, asOf = null) {
  const at = asOf ?? booksThrough(books);
  const rows = (books.assets ?? []).map((a) => {
    const s = schedule(a, at);
    const accumulated = a.disposed && (!asOf || a.disposed.date <= asOf) ? 0 : (s.at(-1)?.accumulated ?? 0);
    const gone = !!a.disposed && (!asOf || a.disposed.date <= asOf);
    return { id: a.id, name: a.name, date: a.date, method: a.method, lifeMonths: a.lifeMonths, cost: a.cents, accumulated, netBookValue: gone ? 0 : a.cents - accumulated, disposed: gone ? a.disposed : null, fullyDepreciated: !gone && a.cents - accumulated === (a.salvage ?? 0) };
  });
  const live = rows.filter((r) => !r.disposed);
  return { asOf: at, rows, cost: live.reduce((s, r) => s + r.cost, 0), accumulated: live.reduce((s, r) => s + r.accumulated, 0), netBookValue: live.reduce((s, r) => s + r.netBookValue, 0) };
}

// Depreciation booked in a calendar year, per asset (for Schedule C line 13).
export function yearDepreciation(books, year) {
  const through = booksThrough(books);
  return (books.assets ?? []).map((a) => ({ id: a.id, name: a.name, cents: schedule(a, through).filter((r) => r.date.startsWith(String(year))).reduce((s, r) => s + r.cents, 0) })).filter((r) => r.cents);
}

// Assets as CSV (id,name,date,cost,salvage,life,method) -> { books, added, problems }
export function addAssetsCsv(booksIn, text, opts = {}) {
  const rows = parseCsv(text);
  const problems = [];
  if (rows.length < 2) return { books: booksIn, added: 0, problems: ["No asset rows found. Expected a header: name,date,cost,life_months[,salvage,method]."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...n) => head.findIndex((h) => n.includes(h));
  const c = { name: col("name", "asset"), date: col("date", "in service", "placed in service"), cost: col("cost", "amount"), life: col("life_months", "life", "months"), salvage: col("salvage"), method: col("method") };
  for (const k of ["name", "date", "cost"]) if (c[k] === -1) problems.push(`Missing column "${k}".`);
  if (problems.length) return { books: booksIn, added: 0, problems };
  let books = booksIn, added = 0;
  rows.slice(1).forEach((r, i) => {
    try {
      const date = parseDate(r[c.date], opts.dayFirst);
      const method = c.method >= 0 && r[c.method]?.trim() ? r[c.method].trim().toLowerCase().replace(/^straight.*/, "straight-line") : "straight-line";
      const dup = (books.assets ?? []).some((a) => a.name === r[c.name]?.trim() && a.date === date && a.cents === parseCents(r[c.cost], opts.decimalComma));
      if (dup) return;
      books = addAsset(books, { name: r[c.name], date, cost: String(r[c.cost]), lifeMonths: c.life >= 0 && r[c.life]?.trim() ? +r[c.life] : 60, salvage: c.salvage >= 0 && r[c.salvage]?.trim() ? String(r[c.salvage]) : 0, method }).books;
      added++;
    } catch (e) { problems.push(`Row ${i + 2}: ${e.message}`); }
  });
  return { books, added, problems };
}
