// Double-entry core: a chart of accounts, journal entries whose debits equal
// their credits, and the reports read off them (trial balance, profit and
// loss, balance sheet). Amounts are integer cents throughout, so totals never
// drift by a rounding cent. Pure functions, no DOM, no network.

export const TYPES = ["asset", "liability", "equity", "income", "expense"];
// Debit-normal types grow with a debit; the rest grow with a credit.
export const DEBIT_NORMAL = new Set(["asset", "expense"]);

// A small-business chart of accounts. `bank: true` marks an account a statement
// can be imported into (a checking, savings or card account). Codes follow the
// common 1xxx assets ... 6xxx expenses layout, so an accountant can map them.
export const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Checking", type: "asset", bank: true },
  { code: "1010", name: "Savings", type: "asset", bank: true },
  { code: "1100", name: "Accounts receivable", type: "asset" },
  { code: "1200", name: "Payment processor clearing", type: "asset" },
  { code: "1300", name: "VAT / input tax recoverable", type: "asset" },
  { code: "1400", name: "Prepaid expenses", type: "asset" },
  { code: "1450", name: "Inventory", type: "asset" },
  { code: "1500", name: "Equipment", type: "asset" },
  { code: "2000", name: "Credit card", type: "liability", bank: true },
  { code: "2100", name: "Sales tax payable", type: "liability" },
  { code: "2200", name: "Loan payable", type: "liability" },
  { code: "2300", name: "Payroll liabilities", type: "liability" },
  { code: "3000", name: "Opening balance equity", type: "equity" },
  { code: "3010", name: "Owner contributions", type: "equity" },
  { code: "3100", name: "Owner draws", type: "equity" },
  { code: "3900", name: "Retained earnings", type: "equity" },
  { code: "4000", name: "Sales", type: "income" },
  { code: "4100", name: "Other income", type: "income" },
  { code: "4200", name: "Interest income", type: "income" },
  { code: "5000", name: "Cost of goods sold", type: "expense" },
  { code: "6000", name: "Advertising and marketing", type: "expense" },
  { code: "6010", name: "Bank and merchant fees", type: "expense" },
  { code: "6020", name: "Contract labor", type: "expense" },
  { code: "6030", name: "Insurance", type: "expense" },
  { code: "6040", name: "Interest expense", type: "expense" },
  { code: "6050", name: "Legal and professional fees", type: "expense" },
  { code: "6060", name: "Software and subscriptions", type: "expense" },
  { code: "6070", name: "Office supplies and postage", type: "expense" },
  { code: "6080", name: "Rent", type: "expense" },
  { code: "6090", name: "Repairs and maintenance", type: "expense" },
  { code: "6100", name: "Supplies and materials", type: "expense" },
  { code: "6110", name: "Taxes and licenses", type: "expense" },
  { code: "6120", name: "Travel", type: "expense" },
  { code: "6130", name: "Meals", type: "expense" },
  { code: "6140", name: "Utilities and phone", type: "expense" },
  { code: "6150", name: "Wages", type: "expense" },
  { code: "6160", name: "Vehicle and fuel", type: "expense" },
  { code: "6170", name: "Education and dues", type: "expense" },
  { code: "6180", name: "Shipping", type: "expense" },
  { code: "9999", name: "Uncategorized (ask my accountant)", type: "expense", suspense: true },
];

// "code,name,type[,bank]" lines, or a header row with those names. Unknown
// types are reported, not guessed.
export function parseAccounts(text) {
  const accounts = [], problems = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [code, name, type, bank] = line.split(/\s*[,\t;]\s*/);
    if (/^code$/i.test(code)) continue;
    const t = String(type ?? "").toLowerCase();
    if (!code || !name || !TYPES.includes(t)) { problems.push(`Line ${i + 1}: needs code, name and a type (${TYPES.join(", ")}).`); continue; }
    accounts.push({ code, name, type: t, ...(/^(y|yes|true|bank|1)$/i.test(bank ?? "") ? { bank: true } : {}) });
  }
  return { accounts, problems };
}

export const accountMap = (accounts) => new Map(accounts.map((a) => [a.code, a]));

// An entry is { id, date, memo, lines: [{ account, debit, credit }], source }.
// -> list of problems; empty means it can be posted.
export function validateEntry(entry, accounts) {
  const map = accounts instanceof Map ? accounts : accountMap(accounts);
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? "")) problems.push("no date");
  if (!entry.lines?.length || entry.lines.length < 2) problems.push("an entry needs at least two lines");
  let dr = 0, cr = 0;
  for (const l of entry.lines ?? []) {
    if (!map.has(l.account)) problems.push(`unknown account ${l.account}`);
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0) problems.push("amounts must be whole cents, not negative");
    dr += l.debit; cr += l.credit;
  }
  if (dr !== cr) problems.push(`debits ${fmt(dr)} do not equal credits ${fmt(cr)}`);
  return problems;
}

// Balances by account code, in cents, signed so that a debit is positive.
export function balances(entries, { from = null, to = null } = {}) {
  const b = new Map();
  for (const e of entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) b.set(l.account, (b.get(l.account) ?? 0) + l.debit - l.credit);
  }
  return b;
}

// The natural-sign balance: positive when the account holds what its type
// says (an asset you own, a liability you owe, income earned, cost incurred).
export const natural = (acct, debitPositive) => (DEBIT_NORMAL.has(acct.type) ? debitPositive : -debitPositive);

export function trialBalance(entries, accounts, opts = {}) {
  const map = accountMap(accounts);
  const b = balances(entries, opts);
  const rows = [...b].filter(([, v]) => v !== 0).map(([code, v]) => ({ code, name: map.get(code)?.name ?? code, type: map.get(code)?.type ?? "?", debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 })).sort((x, y) => x.code.localeCompare(y.code));
  const debit = rows.reduce((a, r) => a + r.debit, 0), credit = rows.reduce((a, r) => a + r.credit, 0);
  return { rows, debit, credit, balanced: debit === credit };
}

// Profit and loss between two dates, with one column per month.
export function profitAndLoss(entries, accounts, { from = null, to = null } = {}) {
  const map = accountMap(accounts);
  const months = new Set();
  const cell = new Map(); // code -> Map(month -> natural cents)
  for (const e of entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    const m = e.date.slice(0, 7);
    for (const l of e.lines) {
      const a = map.get(l.account);
      if (!a || (a.type !== "income" && a.type !== "expense")) continue;
      months.add(m);
      if (!cell.has(a.code)) cell.set(a.code, new Map());
      const row = cell.get(a.code);
      row.set(m, (row.get(m) ?? 0) + natural(a, l.debit - l.credit));
    }
  }
  const cols = [...months].sort();
  const lines = (type) => [...cell].filter(([c]) => map.get(c).type === type).map(([code, row]) => ({ code, name: map.get(code).name, months: cols.map((m) => row.get(m) ?? 0), total: [...row.values()].reduce((a, v) => a + v, 0) })).sort((x, y) => x.code.localeCompare(y.code));
  const income = lines("income"), expense = lines("expense");
  const sum = (ls) => cols.map((_, i) => ls.reduce((a, l) => a + l.months[i], 0));
  const incomeByMonth = sum(income), expenseByMonth = sum(expense);
  const totalIncome = income.reduce((a, l) => a + l.total, 0), totalExpense = expense.reduce((a, l) => a + l.total, 0);
  return { months: cols, income, expense, incomeByMonth, expenseByMonth, netByMonth: cols.map((_, i) => incomeByMonth[i] - expenseByMonth[i]), totalIncome, totalExpense, net: totalIncome - totalExpense };
}

// Balance sheet at a date. Profit not yet closed to retained earnings is shown
// as "Current earnings", so assets always equal liabilities plus equity.
export function balanceSheet(entries, accounts, { to = null } = {}) {
  const map = accountMap(accounts);
  const b = balances(entries, { to });
  const section = (type) => [...b].filter(([c, v]) => v !== 0 && map.get(c)?.type === type).map(([code, v]) => ({ code, name: map.get(code).name, amount: natural(map.get(code), v) })).sort((x, y) => x.code.localeCompare(y.code));
  const assets = section("asset"), liabilities = section("liability"), equity = section("equity");
  let earnings = 0;
  for (const [c, v] of b) { const a = map.get(c); if (a?.type === "income" || a?.type === "expense") earnings -= v; }
  const total = (s) => s.reduce((a, r) => a + r.amount, 0);
  const totalAssets = total(assets), totalLiabilities = total(liabilities), totalEquity = total(equity) + earnings;
  return { to, assets, liabilities, equity, currentEarnings: earnings, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
}

// Statement of cash flows, indirect method, between two dates. "Cash" is the
// asset accounts marked `bank` (a card is a liability, so card spending shows
// as operating until the card is paid). Every other balance-sheet account is
// sorted by what it is: equity and loans are financing, fixed assets (codes
// 1500 and up) are investing, the rest (receivables, clearing, sales tax,
// payroll, cards) are operating working capital. The sections add up to the
// change in cash, and `ties` says so.
export function cashFlow(entries, accounts, { from = null, to = null } = {}) {
  const map = accountMap(accounts);
  const cash = (a) => a.type === "asset" && a.bank;
  const period = balances(entries, { from, to });
  const opening = from ? balances(entries, { to: new Date(Date.parse(from) - 864e5).toISOString().slice(0, 10) }) : new Map();
  const sum = (m, pred) => [...m].filter(([c]) => map.has(c) && pred(map.get(c))).reduce((a, [, v]) => a + v, 0);
  const net = -sum(period, (a) => a.type === "income" || a.type === "expense");
  const sectionOf = (a) => (a.type === "equity" || /^22/.test(a.code) ? "financing" : a.type === "asset" && a.code >= "1500" ? "investing" : "operating");
  const items = { operating: [], investing: [], financing: [] };
  // Indirect method: book depreciation is added back and a disposal's gain (loss)
  // taken out of operating; the proceeds, not the net book value, are investing.
  const dep = period.get("6950") ?? 0, gl = period.get("4150") ?? 0;
  for (const [code, v] of period) {
    const a = map.get(code);
    if (!a || (!v && !(code === "1590" && (dep || gl))) || cash(a) || a.type === "income" || a.type === "expense") continue;
    // an asset growing uses cash; a liability growing supplies it
    items[sectionOf(a)].push({ code, name: a.name, amount: code === "1590" ? -v - dep - gl : -v });
  }
  if (dep) items.operating.push({ code: "6950", name: "Depreciation (added back)", amount: dep });
  if (gl) items.operating.push({ code: "4150", name: "Loss (gain) on asset disposals", amount: gl });
  items.investing = items.investing.filter((i) => i.amount);
  for (const k in items) items[k].sort((x, y) => x.code.localeCompare(y.code));
  const total = (l) => l.reduce((a, r) => a + r.amount, 0);
  const operating = net + total(items.operating), investing = total(items.investing), financing = total(items.financing);
  const openingCash = sum(opening, cash), change = sum(period, cash);
  // Free cash flow: operating cash less purchases of fixed assets (investing outflows). Disposal proceeds are not netted.
  const capex = -items.investing.filter((i) => i.amount < 0).reduce((a, r) => a + r.amount, 0);
  // Burn and runway: the monthly cash used by operations and investing (financing is the lifeline, not the business), over the months the period spans (at least one); runway is closing cash over that burn, null when the business is not burning cash or has none left.
  const dates = entries.map((e) => e.date).filter((d) => (!from || d >= from) && (!to || d <= to)).sort();
  const start = from ?? dates[0], end = to ?? dates.at(-1);
  const months = start && end ? Math.max(1, (Date.parse(end) - Date.parse(start) + 864e5) / (864e5 * 30.4375)) : 1;
  const burn = operating + investing < 0 ? Math.round(-(operating + investing) / months) : 0;
  const runwayMonths = burn > 0 && openingCash + change > 0 ? Math.round(((openingCash + change) / burn) * 10) / 10 : null;
  return { from, to, netProfit: net, capex, freeCashFlow: operating - capex, monthlyBurn: burn, runwayMonths, operatingItems: items.operating, investingItems: items.investing, financingItems: items.financing, operating, investing, financing, change: operating + investing + financing, openingCash, closingCash: openingCash + change, ties: operating + investing + financing === change };
}

// Cash flow one month at a time, so a business that is burning faster (or slower) than its whole-period average shows it. Each row is that month's statement; `recentBurn` and `recentRunwayMonths` use the last three months, which is what a lender or investor asks about.
export function cashFlowByMonth(entries, accounts, { from = null, to = null } = {}) {
  const dates = entries.map((e) => e.date).filter((d) => (!from || d >= from) && (!to || d <= to)).sort();
  if (!dates.length) return { months: [], recentBurn: 0, recentRunwayMonths: null };
  let [y, m] = (from ?? dates[0]).slice(0, 7).split("-").map(Number);
  const last = (to ?? dates.at(-1)).slice(0, 7);
  const months = [];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > last) break;
    const start = `${key}-01`, end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const c = cashFlow(entries, accounts, { from: from && from > start ? from : start, to: to && to < end ? to : end });
    months.push({ month: key, operating: c.operating, investing: c.investing, financing: c.financing, change: c.change, freeCashFlow: c.freeCashFlow, closingCash: c.closingCash });
    if (++m > 12) { m = 1; y++; }
  }
  const tail = months.slice(-3);
  const used = -tail.reduce((a, r) => a + r.operating + r.investing, 0);
  const recentBurn = used > 0 ? Math.round(used / tail.length) : 0;
  const cash = months.at(-1).closingCash;
  return { months, recentBurn, recentRunwayMonths: recentBurn > 0 && cash > 0 ? Math.round((cash / recentBurn) * 10) / 10 : null };
}

// The ratios a lender or investor reads off the statements. Current assets are
// the asset accounts below 1500 (cash, receivables, clearing, prepaid,
// inventory); the quick ratio leaves out prepaid and inventory. Current
// liabilities are every liability except the loan (2200), which is treated as
// long term: a loan with a payment due this year is understated here. Each ratio
// is null when its denominator is zero or negative, never a made-up number.
export function ratios(pnl, bs) {
  const sum = (list, pred) => list.filter(pred).reduce((a, r) => a + r.amount, 0);
  const cur = sum(bs.assets, (r) => r.code < "1500"), quick = cur - sum(bs.assets, (r) => r.code === "1400" || r.code === "1450");
  const curLiab = sum(bs.liabilities, (r) => r.code !== "2200");
  const cogs = pnl.expense.filter((l) => l.code === "5000").reduce((a, l) => a + l.total, 0);
  const rate = (n, d, k) => (d > 0 ? Math.round((n / d) * k) / k : null);
  return {
    grossMargin: rate(pnl.totalIncome - cogs, pnl.totalIncome, 1000), netMargin: rate(pnl.net, pnl.totalIncome, 1000),
    currentAssets: cur, currentLiabilities: curLiab, workingCapital: cur - curLiab,
    currentRatio: rate(cur, curLiab, 100), quickRatio: rate(quick, curLiab, 100),
    debtToEquity: rate(bs.totalLiabilities, bs.totalEquity, 100),
  };
}

// Days sales outstanding and days payable: the receivable (1100) over the
// period's income, the payable (2050) over its expenses, times the days the
// period spans (months with activity at 30.4375 days). Null when there is no
// income or expense to divide by or nothing is open; a period of less than a
// month is a rough read.
export function daysOutstanding(pnl, bs) {
  const days = pnl.months.length * 30.4375;
  const open = (code) => bs.assets.concat(bs.liabilities).filter((r) => r.code === code).reduce((a, r) => a + r.amount, 0);
  const per = (bal, flow) => (days > 0 && flow > 0 && bal > 0 ? Math.round((bal / flow) * days * 10) / 10 : null);
  return { receivableDays: per(open("1100"), pnl.totalIncome), payableDays: per(open("2050"), pnl.totalExpense) };
}

// Break-even from the profit and loss: costs that move with sales (cost of
// goods, card and merchant fees, shipping by default; pass `variable` codes to
// change) against everything else, taken as fixed. Monthly figures are the
// period's totals over its months. Null rather than invented when there is no
// income or each sale leaves nothing after its own costs.
export function breakEven(pnl, { variable = ["5000", "6010", "6180"] } = {}) {
  const months = pnl.months.length;
  if (!months || pnl.totalIncome <= 0) return null;
  const set = new Set(variable);
  const varCost = pnl.expense.filter((l) => set.has(l.code)).reduce((a, l) => a + l.total, 0);
  const fixed = pnl.totalExpense - varCost;
  const cm = (pnl.totalIncome - varCost) / pnl.totalIncome;
  const monthlyIncome = Math.round(pnl.totalIncome / months), monthlyFixed = Math.round(fixed / months);
  if (cm <= 0) return { months, variableCosts: varCost, fixedCosts: fixed, monthlyIncome, monthlyFixed, contributionMargin: Math.round(cm * 1000) / 1000, breakEvenMonthly: null, marginOfSafety: null };
  const be = Math.round(monthlyFixed / cm);
  return { months, variableCosts: varCost, fixedCosts: fixed, monthlyIncome, monthlyFixed, contributionMargin: Math.round(cm * 1000) / 1000, breakEvenMonthly: be, marginOfSafety: Math.round(((monthlyIncome - be) / monthlyIncome) * 1000) / 1000 };
}

// The ledger for one account: every line, with a running natural balance.
export function accountLedger(entries, accounts, code) {
  const a = accountMap(accounts).get(code);
  if (!a) return [];
  let run = 0;
  return entries.filter((e) => e.lines.some((l) => l.account === code)).sort((x, y) => x.date.localeCompare(y.date) || String(x.id).localeCompare(String(y.id))).map((e) => {
    const d = e.lines.filter((l) => l.account === code).reduce((s, l) => s + l.debit - l.credit, 0);
    run += natural(a, d);
    return { date: e.date, id: e.id, memo: e.memo, amount: natural(a, d), balance: run };
  });
}

export function fmt(cents, currency = "") {
  const neg = cents < 0, v = Math.abs(cents);
  const s = `${Math.floor(v / 100).toLocaleString("en-US")}.${String(v % 100).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${currency}${s}`;
}

export const dollars = (cents) => (cents / 100).toFixed(2);
