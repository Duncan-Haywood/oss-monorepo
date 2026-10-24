// Rental properties: tag bank lines with the property they belong to and read
// the books onto the lines of IRS Form 1040 Schedule E, Part I (Income or Loss
// From Rental Real Estate), one column per property (the form has three).
// A worksheet for you or your preparer, not a filing: it does not know about
// passive-loss limits, the $25,000 allowance, personal-use days, vacation-home
// rules, the qualified-business-income deduction or state rules. Depreciation is
// whatever is booked to 6950 (from the asset register or by hand); the form's
// 27.5-year schedule for a residential building is for you or your preparer.
// Line numbers and labels are from the form's layout as the author knows it,
// not checked against this year's instructions.

import { accountMap } from "./ledger.mjs";
import { journal } from "./engine.mjs";

export const SCHEDULE_E_LINES = {
  "3": "Rents received", "4": "Royalties received", "5": "Advertising", "6": "Auto and travel", "7": "Cleaning and maintenance",
  "8": "Commissions", "9": "Insurance", "10": "Legal and other professional fees", "11": "Management fees",
  "12": "Mortgage interest paid to banks", "13": "Other interest", "14": "Repairs", "15": "Supplies", "16": "Taxes",
  "17": "Utilities", "18": "Depreciation expense or depletion", "19": "Other expenses",
};
const EXPENSE_ORDER = ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"];

// Chart code -> Schedule E line. Codes not named here (and any the user adds)
// go to 19 and are listed as `unmapped`. Pass `map` to move one.
export const SCHEDULE_E_MAP = {
  "4000": "3", "4300": "3", "4100": "3", "4200": "3",
  "6000": "5", "6120": "6", "6160": "6", "6230": "7", "6020": "7", "6030": "9", "6050": "10", "6200": "11", "6210": "12", "6040": "13",
  "6090": "14", "6100": "15", "6070": "15", "6110": "16", "6220": "16", "6140": "17", "6950": "18",
  "6010": "19", "6060": "19", "6080": "19", "6130": "19", "6150": "19", "6170": "19", "6180": "19", "6900": "19",
};

// Accounts a landlord usually wants beyond the default chart.
export const RENTAL_ACCOUNTS = [
  { code: "4300", name: "Rental income", type: "income" },
  { code: "6200", name: "Property management fees", type: "expense" },
  { code: "6210", name: "Mortgage interest", type: "expense" },
  { code: "6220", name: "Property taxes", type: "expense" },
  { code: "6230", name: "Cleaning and maintenance", type: "expense" },
  { code: "2400", name: "Tenant security deposits held", type: "liability" },
];

const clone = (x) => JSON.parse(JSON.stringify(x));

// addRentalAccounts(books) -> new books with the rental accounts the chart lacks.
export function addRentalAccounts(booksIn) {
  const books = clone(booksIn);
  for (const a of RENTAL_ACCOUNTS) if (!books.accounts.some((x) => x.code === a.code)) books.accounts.push({ ...a });
  return books;
}

// addProperty(books, { id, name, address }) -> new books. `id` is the short
// label used when tagging ("oak", "12-elm"); a second add of the same id renames.
export function addProperty(booksIn, { id, name, address = "" } = {}) {
  const key = String(id ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key)) throw new Error("A property id is letters, digits, dot, dash or underscore, for example oak or 12-elm.");
  const books = clone(booksIn);
  books.properties ??= [];
  const found = books.properties.find((p) => p.id === key);
  if (found) { found.name = name || found.name; found.address = address || found.address; }
  else books.properties.push({ id: key, name: name || key, address });
  return books;
}

// tagProperty(books, property, { ids, match, account }) -> { books, tagged }
// Tags bank lines (confirmed, transfers excluded) by id, by a case-insensitive
// text found in the description, or by the account they were filed to. Tagging
// replaces an earlier tag. `property: null` removes the tag.
export function tagProperty(booksIn, property, { ids = null, match = null, account = null } = {}) {
  const books = clone(booksIn);
  if (property !== null && !(books.properties ?? []).some((p) => p.id === property)) throw new Error(`No property "${property}". Add it first.`);
  if (!ids && !match && !account) throw new Error("Say which lines: ids, a text to match, or an account code.");
  const want = ids ? new Set(ids) : null;
  const m = match ? String(match).toLowerCase() : null;
  let tagged = 0;
  for (const t of books.transactions) {
    if (!t.posted || t.status === "transfer" || t.status === "review" || t.status === "new") continue;
    if (want && !want.has(t.id)) continue;
    if (m && !t.desc.toLowerCase().includes(m)) continue;
    if (account && t.posted !== account && !(t.split ?? []).some((p) => p.account === account)) continue;
    if (property === null) { if (t.property) { delete t.property; tagged++; } } else if (t.property !== property) { t.property = property; tagged++; }
  }
  return { books, tagged };
}

// scheduleE(books, { from, to, map }) ->
//   { period, properties: [{ id, name, address, lines: [{ line, label, cents, accounts }], rents (3), totalExpenses (20), net (21), other (19 rows) }],
//     total: { rents, totalExpenses, net }, unmapped, warnings }
// Each posted line carries its property through its bank line; with exactly one
// property, untagged income and expense (invoices, asset depreciation) belongs to
// it; with several, those amounts are reported as "Unassigned" and warned about.
export function scheduleE(books, { from = null, to = null, map = {} } = {}) {
  const accts = accountMap(books.accounts);
  const route = { ...SCHEDULE_E_MAP, ...map };
  const props = books.properties ?? [];
  const warnings = [], unmapped = [];
  const buckets = new Map(props.map((p) => [p.id, new Map()]));
  const unassigned = new Map();
  const txn = new Map(books.transactions.map((t) => [t.id, t]));
  const sole = props.length === 1 ? props[0].id : null;
  const add = (bucket, code, cents) => bucket.set(code, (bucket.get(code) ?? 0) + cents);
  let suspense = 0;
  for (const e of journal(books)) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    const t = txn.get(e.id);
    e.lines.forEach((l, i) => {
      const a = accts.get(l.account);
      if (!a || (a.type !== "income" && a.type !== "expense")) return;
      if (a.suspense) { suspense += l.debit - l.credit; return; }
      const cents = a.type === "income" ? l.credit - l.debit : l.debit - l.credit;
      let pid = t?.status === "split" ? (t.split[i - 1]?.property ?? t.property) : t?.property;
      if (!pid || !buckets.has(pid)) pid = sole;
      add(pid ? buckets.get(pid) : unassigned, l.account, cents);
    });
  }
  const build = (id, name, address, byCode) => {
    const byLine = new Map();
    for (const [code, cents] of byCode) {
      if (!cents) continue;
      const a = accts.get(code);
      let line = route[code];
      if (!line) { line = a.type === "income" ? "3" : "19"; if (!unmapped.some((u) => u.code === code)) unmapped.push({ code, name: a.name, cents }); }
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push({ code, name: a.name, cents });
    }
    const sum = (k) => (byLine.get(k) ?? []).reduce((s, r) => s + r.cents, 0);
    const lines = ["3", "4", ...EXPENSE_ORDER].filter((k) => byLine.has(k)).map((k) => ({ line: k, label: SCHEDULE_E_LINES[k], cents: sum(k), accounts: byLine.get(k) }));
    const rents = sum("3") + sum("4"), totalExpenses = EXPENSE_ORDER.reduce((s, k) => s + sum(k), 0);
    return { id, name, address, lines, rents, totalExpenses, net: rents - totalExpenses, other: byLine.get("19") ?? [] };
  };
  const out = props.map((p) => build(p.id, p.name, p.address, buckets.get(p.id)));
  const un = build("(unassigned)", "Unassigned", "", unassigned);
  if (un.lines.length) { out.push(un); warnings.push(`${money(un.rents)} of rent and ${money(un.totalExpenses)} of expense is not tagged to a property. Tag the lines (rental tag) so each property's column is right.`); }
  if (!props.length) warnings.push("No properties are set up. Add one (rental add) and tag its bank lines; everything is shown as unassigned.");
  if (props.length > 3) warnings.push("The form has three property columns; copy each property's column onto its own page.");
  if (suspense) warnings.push(`${money(Math.abs(suspense))} sits in an uncategorized account; file those lines first, they are left off.`);
  const pending = (books.transactions ?? []).filter((t) => t.status === "review").length;
  if (pending) warnings.push(`${pending} bank line${pending === 1 ? " is" : "s are"} still waiting for an account and ${pending === 1 ? "is" : "are"} not in these totals.`);
  if (unmapped.length) warnings.push(`${unmapped.map((u) => `${u.name} (${u.code})`).join(", ")} ${unmapped.length === 1 ? "has" : "have"} no Schedule E line of its own and went to ${unmapped.some((u) => accts.get(u.code)?.type === "income") ? "line 3 or " : ""}19. Pass a map to move ${unmapped.length === 1 ? "it" : "them"}.`);
  const dep = out.filter((p) => p.lines.some((l) => l.line === "18")).length;
  if (props.length && !dep) warnings.push("No depreciation is booked (account 6950). A rental building is normally depreciated over 27.5 years (residential) from the date it is placed in service, land excluded; ask your preparer.");
  if (accts.has("2400") === false) warnings.push("No security-deposit liability account (2400): a deposit you hold is not rent until you keep it. Add the rental accounts (rental accounts) and book deposits there.");
  const real = out.filter((p) => p.id !== "(unassigned)");
  const total = { rents: out.reduce((s, p) => s + p.rents, 0), totalExpenses: out.reduce((s, p) => s + p.totalExpenses, 0) };
  total.net = total.rents - total.totalExpenses;
  return { period: { from, to }, properties: out, total, unmapped, warnings, propertyCount: real.length };
}

function money(c) { const v = Math.abs(c); return `$${Math.floor(v / 100).toLocaleString("en-US")}.${String(v % 100).padStart(2, "0")}`; }

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
// One row per property, line and account, then each property's lines 3, 20 and 21.
export function scheduleECsv(se) {
  const d = (c) => (c / 100).toFixed(2);
  const rows = ["Property,Line,Description,Account,Amount"];
  for (const p of se.properties) {
    for (const l of p.lines) for (const a of l.accounts) rows.push([q(p.name), l.line, q(l.label), q(`${a.code} ${a.name}`), d(a.cents)].join(","));
    rows.push([q(p.name), "3+4", "Rents and royalties", "", d(p.rents)].join(","), [q(p.name), "20", "Total expenses", "", d(p.totalExpenses)].join(","), [q(p.name), "21", "Income or (loss)", "", d(p.net)].join(","));
  }
  return rows.join("\n") + "\n";
}
