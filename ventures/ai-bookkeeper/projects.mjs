// Projects (QuickBooks "classes", "jobs"): tag bank lines and invoices or bills
// with the project they belong to, then read a profit and loss for each one.
// Revenue less cost is the project's margin before overhead; whatever carries no
// tag is shown as "Unassigned" so the columns add up to the books' own profit.
// Split lines carry their own tag (falling back to the bank line's). Entries
// that have no tag to give (depreciation, payroll runs, inventory, prepaid) are
// unassigned. A management report, not a tax form.

import { accountMap } from "./ledger.mjs";
import { journal } from "./engine.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));

// addProject(books, { id, name }) -> new books; a second add of the same id renames.
export function addProject(booksIn, { id, name = "" } = {}) {
  const key = String(id ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key)) throw new Error("A project id is letters, digits, dot, dash or underscore, for example kitchen-reno or acme-2026.");
  const books = clone(booksIn);
  books.projects ??= [];
  const found = books.projects.find((p) => p.id === key);
  if (found) found.name = name || found.name;
  else books.projects.push({ id: key, name: name || key });
  return books;
}

// tagProject(books, project, { ids, match, account, docs }) -> { books, tagged }
// Bank lines (confirmed, transfers excluded) are chosen by id, by a case-insensitive
// text in the description, or by the account they were filed to; `docs` are invoice
// or bill ids or numbers. Tagging replaces an earlier tag; `project: null` removes it.
export function tagProject(booksIn, project, { ids = null, match = null, account = null, docs = null } = {}) {
  const books = clone(booksIn);
  if (project !== null && !(books.projects ?? []).some((p) => p.id === project)) throw new Error(`No project "${project}". Add it first.`);
  if (!ids && !match && !account && !docs) throw new Error("Say which lines: ids, a text to match, an account code, or documents.");
  let tagged = 0;
  const set = (o) => {
    if (project === null) { if (o.project) { delete o.project; tagged++; } } else if (o.project !== project) { o.project = project; tagged++; }
  };
  if (docs) {
    const want = new Set(docs);
    for (const d of books.documents ?? []) if (want.has(d.id) || want.has(d.number)) set(d);
    if (!tagged && project !== null && !(books.documents ?? []).some((d) => want.has(d.id) || want.has(d.number))) throw new Error(`No document ${docs.join(", ")}.`);
  }
  if (ids || match || account) {
    const want = ids ? new Set(ids) : null;
    const m = match ? String(match).toLowerCase() : null;
    for (const t of books.transactions) {
      if (!t.posted || t.status === "transfer" || t.status === "review" || t.status === "new") continue;
      if (want && !want.has(t.id)) continue;
      if (m && !t.desc.toLowerCase().includes(m)) continue;
      if (account && t.posted !== account && !(t.split ?? []).some((p) => p.account === account)) continue;
      set(t);
    }
  }
  return { books, tagged };
}

// projectReport(books, { from, to }) ->
//   { period, projects: [{ id, name, income: [{ code, name, cents }], costs: [...], revenue, cost, net, margin }],
//     total: { revenue, cost, net }, warnings }
// `margin` is net over revenue (null with no revenue). Costs are every expense
// account, cost of goods sold included; the uncategorized account is left off and warned about.
export function projectReport(books, { from = null, to = null } = {}) {
  const accts = accountMap(books.accounts);
  const projs = books.projects ?? [];
  const buckets = new Map(projs.map((p) => [p.id, new Map()]));
  const unassigned = new Map();
  const txn = new Map(books.transactions.map((t) => [t.id, t]));
  const doc = new Map((books.documents ?? []).map((d) => [d.id, d]));
  const add = (bucket, code, cents) => bucket.set(code, (bucket.get(code) ?? 0) + cents);
  let suspense = 0;
  for (const e of journal(books)) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    const t = txn.get(e.id), d = doc.get(e.id);
    e.lines.forEach((l, i) => {
      const a = accts.get(l.account);
      if (!a || (a.type !== "income" && a.type !== "expense")) return;
      if (a.suspense) { suspense += l.debit - l.credit; return; }
      const cents = a.type === "income" ? l.credit - l.debit : l.debit - l.credit;
      let pid = t?.status === "split" ? (t.split[i - 1]?.project ?? t.project) : (t?.project ?? d?.project);
      if (!pid || !buckets.has(pid)) pid = null;
      add(pid ? buckets.get(pid) : unassigned, l.account, cents);
    });
  }
  const build = (id, name, byCode) => {
    const income = [], costs = [];
    for (const [code, cents] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
      if (!cents) continue;
      const a = accts.get(code);
      (a.type === "income" ? income : costs).push({ code, name: a.name, cents });
    }
    const revenue = income.reduce((s, r) => s + r.cents, 0), cost = costs.reduce((s, r) => s + r.cents, 0);
    return { id, name, income, costs, revenue, cost, net: revenue - cost, margin: revenue ? (revenue - cost) / revenue : null };
  };
  const out = projs.map((p) => build(p.id, p.name, buckets.get(p.id)));
  const un = build("(unassigned)", "Unassigned", unassigned);
  const warnings = [];
  if (un.income.length || un.costs.length) {
    out.push(un);
    if (projs.length) warnings.push(`${money(un.revenue)} of income and ${money(un.cost)} of expense is not tagged to a project (overhead, or lines still to tag).`);
  }
  if (!projs.length) warnings.push("No projects are set up. Add one (project add) and tag its bank lines and invoices; everything is shown as unassigned.");
  if (suspense) warnings.push(`${money(Math.abs(suspense))} sits in an uncategorized account; file those lines first, they are left off.`);
  const pending = (books.transactions ?? []).filter((t) => t.status === "review").length;
  if (pending) warnings.push(`${pending} bank line${pending === 1 ? " is" : "s are"} still waiting for an account and ${pending === 1 ? "is" : "are"} not in these totals.`);
  for (const p of out) if (p.id !== "(unassigned)" && p.net < 0 && p.revenue > 0) warnings.push(`${p.name} is losing money: ${money(p.cost)} of cost against ${money(p.revenue)} of revenue.`);
  const total = { revenue: out.reduce((s, p) => s + p.revenue, 0), cost: out.reduce((s, p) => s + p.cost, 0) };
  total.net = total.revenue - total.cost;
  return { period: { from, to }, projects: out, total, warnings };
}

function money(c) { const v = Math.abs(c); return `${c < 0 ? "-" : ""}$${Math.floor(v / 100).toLocaleString("en-US")}.${String(v % 100).padStart(2, "0")}`; }

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
// One row per project and account, then each project's revenue, cost and net.
export function projectCsv(r) {
  const d = (c) => (c / 100).toFixed(2);
  const rows = ["Project,Kind,Account,Amount"];
  for (const p of r.projects) {
    for (const a of p.income) rows.push([q(p.name), "income", q(`${a.code} ${a.name}`), d(a.cents)].join(","));
    for (const a of p.costs) rows.push([q(p.name), "cost", q(`${a.code} ${a.name}`), d(a.cents)].join(","));
    rows.push([q(p.name), "revenue", "", d(p.revenue)].join(","), [q(p.name), "total cost", "", d(p.cost)].join(","), [q(p.name), "net", "", d(p.net)].join(","));
  }
  return rows.join("\n") + "\n";
}

export { money as projectMoney };
