// Spend by card: one statement per cardholder on a business card account.
//
// A business card account carries several cards, one per employee, all on one
// statement and one bill. Chase's business card download names the card on each
// row ("Card" column, the last four digits), Brex calls it "Card Last Four". The
// reader keeps those four digits on each bank line (`txn.card`); this report adds
// them up per card: what each card spent, what came back as refunds, where it was
// filed, what is still waiting for an account, and the merchants it spent most at.
// It is what an owner checks before signing off an employee's month, and what an
// expense report is built from.
//
// cardSpend(books, { from, to, account, card }) ->
//   { period, cards: [{ account, accountName, card, lines, spend, refunds, net,
//       filed: [{ code, name, cents }], waiting: { lines, cents, suggested: [{ code, name, cents }] }, merchants: [{ name, cents, lines }] }],
//     unassigned: [{ account, accountName, lines, cents }], warnings }
// Money is in cents. `spend` is money out (charges, fees), `refunds` money back
// that is not a payment of the card; transfers (paying the card off) are left out.
import { accountMap } from "./ledger.mjs";
// q() is the formula-injection guard: a description starting with = + - @ gets a leading apostrophe (csvq.mjs).
import { q } from "./csvq.mjs";

const isPayment = (t) => t.status === "transfer" || (t.cents > 0 && /\b(payment thank you|autopay|automatic payment|payment received|online payment)\b/i.test(t.desc));

export function cardSpend(books, { from = null, to = null, account = null, card = null } = {}) {
  const accts = accountMap(books.accounts);
  const inRange = (t) => (!from || t.date >= from) && (!to || t.date <= to) && (!account || t.account === account);
  const all = (books.transactions ?? []).filter(inRange);
  const withCard = new Set(all.filter((t) => t.card).map((t) => t.account));
  const groups = new Map(), unassigned = new Map();
  let payments = 0;
  for (const t of all) {
    if (!withCard.has(t.account)) continue;
    if (isPayment(t)) { payments++; continue; }
    if (!t.card) { const u = unassigned.get(t.account) ?? { account: t.account, accountName: accts.get(t.account)?.name ?? t.account, lines: 0, cents: 0 }; u.lines++; u.cents += -t.cents; unassigned.set(t.account, u); continue; }
    if (card && t.card !== card) continue;
    const key = `${t.account}|${t.card}`;
    if (!groups.has(key)) groups.set(key, { account: t.account, accountName: accts.get(t.account)?.name ?? t.account, card: t.card, lines: 0, spend: 0, refunds: 0, byCode: new Map(), bySuggested: new Map(), waiting: { lines: 0, cents: 0 }, byMerchant: new Map() });
    const g = groups.get(key);
    g.lines++;
    if (t.cents < 0) g.spend += -t.cents; else g.refunds += t.cents;
    const filed = t.status !== "review" && t.status !== "new";
    if (t.status === "split") for (const p of t.split ?? []) g.byCode.set(p.account, (g.byCode.get(p.account) ?? 0) + -p.cents);
    else if (filed && t.posted) g.byCode.set(t.posted, (g.byCode.get(t.posted) ?? 0) + -t.cents);
    else { g.waiting.lines++; g.waiting.cents += -t.cents; const sa = t.suggestion?.account ?? ""; g.bySuggested.set(sa, (g.bySuggested.get(sa) ?? 0) + -t.cents); }
    const m = merchantName(t.desc);
    const e = g.byMerchant.get(m) ?? { name: m, cents: 0, lines: 0 };
    e.cents += -t.cents; e.lines++;
    g.byMerchant.set(m, e);
  }
  const cards = [...groups.values()].map((g) => ({
    account: g.account, accountName: g.accountName, card: g.card, lines: g.lines, spend: g.spend, refunds: g.refunds, net: g.spend - g.refunds,
    filed: [...g.byCode].filter(([, c]) => c).map(([code, cents]) => ({ code, name: accts.get(code)?.name ?? code, cents })).sort((a, b) => b.cents - a.cents),
    waiting: { ...g.waiting, suggested: [...g.bySuggested].filter(([, c]) => c).map(([code, cents]) => ({ code: code || null, name: code ? accts.get(code)?.name ?? code : "no suggestion", cents })).sort((a, b) => b.cents - a.cents) },
    merchants: [...g.byMerchant.values()].sort((a, b) => b.cents - a.cents).slice(0, 5),
  })).sort((a, b) => a.account.localeCompare(b.account) || b.net - a.net);
  const warnings = [];
  if (!withCard.size) warnings.push("No bank line names a card. This report needs a business card download that has a card column (Chase business card \"Card\", Brex \"Card Last Four\").");
  for (const u of unassigned.values()) warnings.push(`${u.lines} line${u.lines === 1 ? "" : "s"} on ${u.accountName} name no card (${money(u.cents)}): account-level charges such as interest or the annual fee, or lines from a file without the card column.`);
  for (const c of cards) if (c.waiting.lines) warnings.push(`Card ${c.card}: ${c.waiting.lines} line${c.waiting.lines === 1 ? " is" : "s are"} still waiting for an account (${money(c.waiting.cents)}).`);
  return { period: { from, to }, cards, unassigned: [...unassigned.values()], payments, warnings };
}

// The merchant part of a card line: Chase writes "SQ *FLOW TEA LLC", "AMAZON MKTPL*5J45R8MC3",
// "UBER   *TRIP"; order numbers after the star and store numbers are dropped so one merchant is one row.
export function merchantName(desc) {
  let d = String(desc ?? "").replace(/\s+/g, " ").trim();
  const star = /^(sq|tst|pp|pypl|par|sp|dd|ec|ifd|pyl|dlocal|aitools)\s?\*\s?/i.exec(d);
  if (star) d = d.slice(star[0].length);
  else d = d.replace(/\s?\*.*$/, "");
  d = d.replace(/\s*#\s?\d+.*$/, "").replace(/\s+\d{3,}.*$/, "").replace(/[-\s]+$/, "").trim();
  return (d || String(desc ?? "").trim()).toUpperCase().slice(0, 40);
}

function money(c) { const v = Math.abs(c); return `${c < 0 ? "-" : ""}$${Math.floor(v / 100).toLocaleString("en-US")}.${String(v % 100).padStart(2, "0")}`; }

// One row per card line, for an expense report: card, date, description, amount (money out positive),
// the account it is filed to, or "waiting" when it has none yet.
export function cardLinesCsv(books, { from = null, to = null, account = null, card = null } = {}) {
  const accts = accountMap(books.accounts);
  const rows = ["Card,Date,Description,Amount,Filed to,Status"];
  const lines = (books.transactions ?? []).filter((t) => t.card && !isPayment(t) && (!from || t.date >= from) && (!to || t.date <= to) && (!account || t.account === account) && (!card || t.card === card))
    .sort((a, b) => a.card.localeCompare(b.card) || a.date.localeCompare(b.date));
  for (const t of lines) {
    const filed = t.status === "split" ? "split" : t.status !== "review" && t.status !== "new" && t.posted ? `${t.posted} ${accts.get(t.posted)?.name ?? ""}`.trim() : "";
    rows.push([q(t.card), t.date, q(t.desc), (-t.cents / 100).toFixed(2), q(filed), filed ? "filed" : "waiting"].join(","));
  }
  return rows.join("\n") + "\n";
}

export { money as cardMoney };
