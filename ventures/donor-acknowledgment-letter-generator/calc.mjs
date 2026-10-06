// Year-end donor acknowledgment letters: reads a list of gifts (one row per gift) and writes
// one letter per donor that carries the wording a US charity needs for a donor to deduct a
// gift of $250 or more (IRC 170(f)(8)) and the quid pro quo disclosure for a gift over $75
// where the donor got something back (IRC 6115). It also lists the gifts that cannot be
// written up as they stand: a missing date, a missing donor, a quid pro quo gift with no
// value for what was provided, a pledge, a vehicle, a gift in a different tax year.
//
// What it decides: which gifts need a written acknowledgment, what each letter must state,
// and what is wrong with the list. What it does not decide: whether a gift is deductible,
// what non-cash property is worth, the fair market value of a benefit, state rules, or
// whether the organisation is a qualified charity. The wording follows IRS Publication 1771
// and Publication 526; the organisation signs the letter and owns what it says.
// Nothing in this module touches the network or the DOM.

const DAY = 86400000;

export const ACK_THRESHOLD = 250; // 170(f)(8): a single contribution of $250 or more
export const QPQ_THRESHOLD = 75; // 6115: payment over $75 that is partly a gift

const ALIASES = {
  donor: ["donor", "donor name", "name", "contributor", "full name", "supporter", "member"],
  address: ["address", "mailing address", "street address", "street"],
  email: ["email", "e-mail", "email address"],
  date: ["date", "gift date", "donation date", "received", "date received", "transaction date", "paid"],
  amount: ["amount", "gift amount", "donation", "donation amount", "total", "payment", "gross amount"],
  type: ["type", "gift type", "payment method", "method", "kind", "form of gift"],
  description: ["description", "item", "non cash description", "property", "in kind description", "item donated"],
  benefit: ["goods or services", "benefit", "goods and services", "benefit received", "premium", "what donor received", "quid pro quo"],
  benefitValue: ["benefit value", "value of goods or services", "fair market value", "fmv", "goods value", "value of benefit", "good faith estimate"],
  fund: ["fund", "campaign", "designation", "appeal", "purpose"],
  id: ["gift id", "id", "receipt number", "receipt no", "receipt", "transaction id", "reference"],
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9#&]+/g, " ").trim();

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false, line = 1, rowLine = 1;
  const src = String(text).replace(/^﻿/, "");
  const push = () => { row.push(cur); cur = ""; };
  const endRow = () => { push(); if (row.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells: row }); row = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; cur += c; }
    } else if (c === '"' && cur === "") q = true;
    else if (c === "," || c === "\t") push();
    else if (c === "\n") { endRow(); line++; rowLine = line; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) endRow();
  return rows;
}

// Money in cents so letters and totals never carry float error. Parentheses and a leading
// minus are negative. Returns null when blank and NaN when unreadable.
export function parseMoney(s) {
  let t = String(s ?? "").trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const cents = Math.round(Number(t) * 100);
  return neg ? -cents : cents;
}

// ISO, M/D/YYYY (US order) or M/D/YY. Returns a UTC day number, null when blank, NaN when unreadable.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
  else return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return Math.round(dt.getTime() / DAY);
}
export const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const yearOf = (n) => new Date(n * DAY).getUTCFullYear();
const LONG = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" };
export const longDay = (n) => new Date(n * DAY).toLocaleDateString("en-US", LONG);
export const dollars = (cents) => (cents < 0 ? "-" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cash, check, card, ACH and the like are money; anything that names property is non-cash.
// A vehicle is non-cash with its own form; stock is non-cash. A pledge is not a gift yet.
export function classifyType(typeText, descText) {
  const t = norm(typeText), d = norm(descText);
  if (/pledge|promise|commitment/.test(t)) return "pledge";
  if (/\b(vehicles?|cars?|trucks?|boats?|motorcycles?|rvs?|aircraft|airplanes?)\b/.test(t) || /\b(vehicle|car|truck|boat|motorcycle|aircraft)\b/.test(d)) return "vehicle";
  if (/\b(volunteer|services?|time|labor|hours)\b/.test(t)) return "services";
  if (/\b(non cash|noncash|in kind|inkind|property|stocks?|securit\w*|goods|items?|equipment|art|donated)\b/.test(t)) return "noncash";
  if (!t && d) return "noncash";
  return "cash";
}

function yn(s) {
  const t = norm(s);
  if (!t) return null;
  if (/^(y|yes|true|x|1)\b/.test(t)) return true;
  if (/^(n|no|none|false|0|nothing|n a|na)\b/.test(t)) return false;
  return null;
}

function mapHeader(cells) {
  const idx = {};
  const heads = cells.map(norm);
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const i = heads.indexOf(norm(n));
      if (i >= 0 && !(field in idx)) { idx[field] = i; break; }
    }
  }
  return idx;
}

export const DEFAULT_ORG = {
  name: "Example Community Fund",
  ein: "",
  address: "",
  signer: "Treasurer",
  signerTitle: "",
  year: new Date().getUTCFullYear() - 1,
  religious: false, // only intangible religious benefits were provided
  note: "",
};

const donorKey = (name, address) => norm(name) + "|" + norm(address);

// readGifts(): gifts from the list, plus findings about the list itself.
export function readGifts(text, org = {}) {
  const o = { ...DEFAULT_ORG, ...org };
  const findings = [];
  const raw = parseCsv(text);
  if (!raw.length) return { gifts: [], findings: [{ severity: "error", line: 0, title: "Nothing to read", detail: "Paste or choose a list with a header row, then one row per gift." }] };
  const idx = mapHeader(raw[0].cells);
  for (const need of ["donor", "date", "amount"]) {
    if (!(need in idx)) findings.push({ severity: "error", line: raw[0].line, title: `No "${need}" column`, detail: `The header row needs a column named ${ALIASES[need].slice(0, 4).join(", ")} (or similar). Found: ${raw[0].cells.map((c) => c.trim()).filter(Boolean).join(", ") || "nothing"}.` });
  }
  if (findings.length) return { gifts: [], findings };
  const get = (cells, f) => (f in idx ? String(cells[idx[f]] ?? "").trim() : "");
  const gifts = [];
  for (const { line, cells } of raw.slice(1)) {
    const donor = get(cells, "donor");
    const dateRaw = get(cells, "date"), amountRaw = get(cells, "amount");
    const date = parseDate(dateRaw), amount = parseMoney(amountRaw);
    const type = classifyType(get(cells, "type"), get(cells, "description"));
    const benefitText = get(cells, "benefit");
    const benefitFlag = yn(benefitText);
    const bvRaw = get(cells, "benefitValue");
    let benefitCents = parseMoney(bvRaw);
    if (benefitFlag === false) benefitCents = benefitCents || 0;
    const gift = {
      line, donor, address: get(cells, "address"), email: get(cells, "email"), date, dateRaw, amount, amountRaw, type,
      description: get(cells, "description"), benefitText, benefitFlag, benefitCents, benefitRaw: bvRaw, fund: get(cells, "fund"), id: get(cells, "id"),
    };
    gifts.push(gift);
  }
  return { gifts, findings };
}

const mk = (severity, gift, title, detail) => ({ severity, line: gift?.line ?? 0, donor: gift?.donor || "", title, detail });

// check(): the full report. `org.year` is the tax year the letters are for.
export function check(text, org = {}) {
  const o = { ...DEFAULT_ORG, ...org };
  const { gifts, findings: listFindings } = readGifts(text, o);
  const findings = [...listFindings];
  const usable = [];
  const seen = new Map();
  for (const g of gifts) {
    const bad = (title, detail) => { findings.push(mk("error", g, title, detail)); return true; };
    let skip = false;
    if (!g.donor) skip = bad("No donor name", `Line ${g.line} has no donor, so it cannot be put in a letter.`);
    if (g.date == null) skip = bad("No gift date", `Line ${g.line} has no date. The acknowledgment must say when the gift was received.`);
    else if (Number.isNaN(g.date)) skip = bad("Unreadable date", `Line ${g.line}: "${g.dateRaw}" is not a date this page reads. Use 2026-03-14 or 3/14/2026.`);
    const property = g.type === "noncash" || g.type === "vehicle";
    if (g.amount == null && property) g.amount = 0; // property is described, not valued
    else if (g.amount == null) skip = bad("No amount", `Line ${g.line} has no amount.`);
    else if (Number.isNaN(g.amount)) skip = bad("Unreadable amount", `Line ${g.line}: "${g.amountRaw}" is not an amount. Use 250 or 250.00.`);
    else if (g.amount < 0 && !property) skip = bad("Negative amount", `Line ${g.line} is a refund or reversal (${dollars(g.amount)}). Remove the original gift or leave both rows out; a refunded gift is not a contribution.`);
    else if (g.amount === 0 && !property && g.type !== "services") skip = bad("Zero amount", `Line ${g.line} has an amount of $0.00.`);
    if (g.type === "pledge") { findings.push(mk("warning", g, "A pledge is not a gift yet", `Line ${g.line} is marked as a pledge. It is left out of the letter until it is paid; acknowledge payments, not promises.`)); skip = true; }
    if (g.type === "services") { findings.push(mk("warning", g, "Donated services are not deductible", `Line ${g.line} looks like volunteer time or services. The value of services is not a deductible contribution, so it is left out of the dollar letter (a thank-you note is still welcome).`)); skip = true; }
    if (!skip && Number.isFinite(g.date) && yearOf(g.date) !== Number(o.year)) { findings.push(mk("warning", g, `Gift is in ${yearOf(g.date)}, not ${o.year}`, `Line ${g.line} is dated ${isoDay(g.date)}. It is left out of the ${o.year} letters; run it with ${yearOf(g.date)} as the tax year.`)); skip = true; }
    if (skip) continue;
    // Quid pro quo.
    const goods = g.benefitFlag === true || (g.benefitFlag == null && g.benefitText && !/^(n|no|none|nothing|n\/a)$/i.test(g.benefitText));
    if (property && g.amount > 0) findings.push(mk("info", g, "Value on a property gift is not used", `Line ${g.line}: the amount ${dollars(g.amount)} is left out of the letter. A charity describes donated property and does not value it; the donor does.`));
    if (g.type === "noncash") {
      if (g.benefitCents) findings.push(mk("info", g, "Value of non-cash gift is not stated", `Line ${g.line}: the letter describes the property and states no value; the donor sets the value and the organisation does not.`));
      if (!g.description) { findings.push(mk("error", g, "Non-cash gift has no description", `Line ${g.line} is non-cash but names no property. The letter must describe what was given.`)); continue; }
    }
    if (goods && !(g.benefitCents > 0) && g.benefitFlag !== false) {
      findings.push(mk("error", g, "Goods or services given with no value", `Line ${g.line} says "${g.benefitText}" was provided but no good-faith value for it. The letter must give an estimate of what the donor received. Fill the benefit value column. Left out of the letters until you do.`)); continue;
    }
    if (g.benefitCents > 0 && g.type !== "noncash" && g.benefitCents >= g.amount) findings.push(mk("warning", g, "Benefit is worth as much as the payment", `Line ${g.line}: the benefit (${dollars(g.benefitCents)}) is at least the payment (${dollars(g.amount)}), so none of it may be a deductible gift. The letter says so.`));
    if (g.type === "cash" && g.benefitCents > 0 && g.amount > QPQ_THRESHOLD * 100) g.qpq = true;
    if (g.type === "cash" && g.benefitCents > 0 && g.amount <= QPQ_THRESHOLD * 100) findings.push(mk("info", g, "Quid pro quo disclosure not required at this size", `Line ${g.line}: a payment of ${dollars(g.amount)} or less is below the $75 disclosure threshold, though a letter that says what was received does no harm.`));
    if (g.type === "vehicle") findings.push(mk("warning", g, "Vehicle gift: Form 1098-C", `Line ${g.line} is a vehicle. A gift of a car, boat or aircraft worth more than $500 is acknowledged on Form 1098-C or an equivalent statement, with the sale price or intended use. This letter does not replace it.`));
    // Duplicates: same donor, date, amount.
    const k = `${donorKey(g.donor, g.address)}|${g.date}|${g.amount}|${g.type}`;
    if (seen.has(k)) findings.push(mk("warning", g, "Possible duplicate gift", `Line ${g.line} matches line ${seen.get(k)} (same donor, date and amount). It is kept; remove one row if it is a double entry.`));
    else seen.set(k, g.line);
    usable.push(g);
  }
  // Group into donors.
  const map = new Map();
  for (const g of usable) {
    const k = donorKey(g.donor, g.address);
    if (!map.has(k)) map.set(k, { donor: g.donor, address: g.address, email: g.email, gifts: [] });
    const d = map.get(k);
    if (!d.address && g.address) d.address = g.address;
    if (!d.email && g.email) d.email = g.email;
    d.gifts.push(g);
  }
  // Same name, different address: likely one donor typed two ways.
  const byName = new Map();
  for (const d of map.values()) { const n = norm(d.donor); byName.set(n, [...(byName.get(n) || []), d]); }
  for (const [, ds] of byName) if (ds.length > 1) findings.push({ severity: "warning", line: ds[0].gifts[0].line, donor: ds[0].donor, title: "Same name, different address", detail: `"${ds[0].donor}" appears with ${ds.length} different addresses, so they get ${ds.length} letters. Make the address match on every row if it is one donor.` });
  const donors = [...map.values()].map((d) => {
    d.gifts.sort((a, b) => a.date - b.date || a.line - b.line);
    d.cashCents = d.gifts.filter((g) => g.type === "cash").reduce((s, g) => s + g.amount, 0);
    d.deductibleCents = d.gifts.filter((g) => g.type === "cash").reduce((s, g) => s + Math.max(0, g.amount - (g.benefitCents || 0)), 0);
    d.needsLetter = d.gifts.some((g) => g.type === "noncash" || g.type === "vehicle" || (g.type === "cash" && g.amount >= ACK_THRESHOLD * 100) || g.qpq);
    d.hasQualifying = d.gifts.some((g) => (g.type === "cash" && g.amount >= ACK_THRESHOLD * 100) || g.type === "noncash" || g.type === "vehicle");
    if (!d.address) findings.push({ severity: "info", line: d.gifts[0].line, donor: d.donor, title: "No mailing address", detail: `${d.donor} has no address on file, so the letter has no address block. Email or hand delivery works; the rule is that the donor has it, not how.` });
    const small = d.gifts.length > 1 && d.gifts.every((g) => g.type === "cash" && g.amount < ACK_THRESHOLD * 100) && d.cashCents >= ACK_THRESHOLD * 100;
    if (small) findings.push({ severity: "info", line: d.gifts[0].line, donor: d.donor, title: "Several small gifts add up past $250", detail: `${d.donor} gave ${d.gifts.length} gifts totalling ${dollars(d.cashCents)}, none of them $250 on its own. The $250 rule applies to each gift, not the total, but an annual letter listing them saves the donor's questions and is allowed.` });
    return d;
  }).sort((a, b) => norm(a.donor).localeCompare(norm(b.donor)));
  const sevOrder = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.line - b.line);
  const s = {
    gifts: usable.length, rows: gifts.length, donors: donors.length,
    cashCents: donors.reduce((n, d) => n + d.cashCents, 0),
    letters: donors.filter((d) => d.needsLetter).length,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    skipped: gifts.length - usable.length,
  };
  return { org: o, gifts: usable, donors, findings, summary: s };
}

// The deadline: the donor needs the letter by the earlier of the date they file and the
// due date (with extensions) of the return, so the safe date is early in the new year.
export const ackDeadlineNote = (year) => `Send before January 31, ${Number(year) + 1}. A donor needs the letter in hand before they file their ${year} return (April 15, ${Number(year) + 1} at the latest), and most file in February.`;

function giftLine(g) {
  if (g.type === "noncash" || g.type === "vehicle") return `${longDay(g.date)}: ${g.description || "Donated property"}${g.type === "vehicle" ? " (vehicle; see Form 1098-C)" : ""}. No value is stated; the donor is responsible for determining value.`;
  return `${longDay(g.date)}: ${dollars(g.amount)}${g.fund ? ` (${g.fund})` : ""}${g.id ? ` [receipt ${g.id}]` : ""}`;
}

// One letter, as plain text. `o` is the organisation block.
export function letterText(donor, org) {
  const o = { ...DEFAULT_ORG, ...org };
  const lines = [];
  lines.push(o.name);
  if (o.address) lines.push(o.address);
  if (o.ein) lines.push(`EIN ${o.ein}`);
  lines.push("", `Date: ${"{DATE}"}`, "");
  lines.push(donor.donor);
  if (donor.address) lines.push(donor.address);
  lines.push("", `Re: Your ${o.year} contributions to ${o.name}`, "");
  lines.push(`Dear ${donor.donor},`, "");
  lines.push(`Thank you for your generosity in ${o.year}. This letter is your written acknowledgment of the contributions ${o.name} received from you, for your records.`, "");
  const cash = donor.gifts.filter((g) => g.type === "cash");
  const prop = donor.gifts.filter((g) => g.type !== "cash");
  if (cash.length) {
    lines.push("Cash contributions:");
    for (const g of cash) lines.push(`  - ${giftLine(g)}`);
    if (cash.length > 1) lines.push(`  Total cash contributions: ${dollars(donor.cashCents)}`);
    lines.push("");
  }
  if (prop.length) {
    lines.push("Contributions of property:");
    for (const g of prop) lines.push(`  - ${giftLine(g)}`);
    lines.push("");
  }
  const benefits = donor.gifts.filter((g) => g.benefitCents > 0);
  if (benefits.length) {
    lines.push("Goods or services provided in return:");
    for (const g of benefits) {
      const ded = Math.max(0, g.amount - g.benefitCents);
      lines.push(`  - ${longDay(g.date)}: ${g.benefitText && !/^(y|yes|true|x|1)$/i.test(g.benefitText) ? g.benefitText : "Goods or services"}, with an estimated value of ${dollars(g.benefitCents)}.${g.type === "cash" ? ` The amount of your payment that is a contribution is limited to ${dollars(ded)}.` : ""}`);
    }
    const none = donor.gifts.filter((g) => !(g.benefitCents > 0));
    if (none.length) lines.push(`  No goods or services were provided in exchange for your other contributions.`);
  } else if (o.religious) {
    lines.push("No goods or services were provided in exchange for your contributions, other than intangible religious benefits.");
  } else {
    lines.push("No goods or services were provided in exchange for your contributions.");
  }
  lines.push("");
  lines.push(`${o.name} is a tax-exempt organization. Please keep this letter with your tax records. We cannot tell you whether or how much of a contribution you may deduct; please ask your tax adviser.`);
  if (o.note) lines.push("", o.note);
  lines.push("", "With thanks,", "", o.signer + (o.signerTitle ? `, ${o.signerTitle}` : ""), o.name);
  return lines.join("\n");
}

export function lettersText(result, dateStr) {
  const when = dateStr || isoDay(Math.floor(Date.now() / DAY));
  return result.donors.map((d) => letterText(d, result.org).replace("{DATE}", when)).join("\n\n" + "=".repeat(60) + "\n\n") + "\n";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// A printable page: one letter per sheet.
export function lettersHtml(result, dateStr, onlyRequired = false) {
  const when = dateStr || isoDay(Math.floor(Date.now() / DAY));
  const ds = onlyRequired ? result.donors.filter((d) => d.needsLetter) : result.donors;
  const body = ds.map((d) => `<section class="letter"><pre>${esc(letterText(d, result.org).replace("{DATE}", when))}</pre></section>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(result.org.name)} ${esc(result.org.year)} acknowledgment letters</title><style>body{font:14px/1.5 Georgia,serif;margin:0}.letter{padding:56px 64px;page-break-after:always;max-width:640px;margin:auto}pre{font:inherit;white-space:pre-wrap;margin:0}@media print{.letter{padding:0}}</style></head><body>\n${body}\n</body></html>\n`;
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (cells) => cells.map(csvCell).join(",");

export function donorSummaryCsv(result) {
  const rows = [["Donor", "Address", "Email", "Gifts", "Cash total", "Deductible cash after benefits", "Letter required", "Reason"]];
  for (const d of result.donors) {
    const why = d.hasQualifying ? "A single gift of $250 or more, or property" : d.needsLetter ? "Quid pro quo disclosure (payment over $75 with benefit)" : "Optional";
    rows.push([d.donor, d.address, d.email, d.gifts.length, (d.cashCents / 100).toFixed(2), (d.deductibleCents / 100).toFixed(2), d.needsLetter ? "Yes" : "No", why]);
  }
  return rows.map(csvRow).join("\n") + "\n";
}

export function findingsCsv(result) {
  const rows = [["Severity", "Line", "Donor", "Finding", "Detail"]];
  for (const f of result.findings) rows.push([f.severity, f.line, f.donor || "", f.title, f.detail]);
  return rows.map(csvRow).join("\n") + "\n";
}

export function sampleList() {
  return [
    "Donor,Address,Date,Amount,Type,Description,Goods or services,Benefit value,Fund",
    "Maria Alvarez,\"14 Oak St, Dayton OH 45402\",2026-02-10,500,Check,,No,,Annual fund",
    "Maria Alvarez,\"14 Oak St, Dayton OH 45402\",2026-11-20,100,Card,,No,,Winter appeal",
    "James Whitfield,\"88 Pine Ave, Dayton OH 45409\",2026-05-04,300,Card,,Dinner for two,120,Spring gala",
    "Priya Nair,\"3 Elm Ct, Kettering OH 45429\",2026-03-01,60,Card,,No,,Annual fund",
    "Priya Nair,\"3 Elm Ct, Kettering OH 45429\",2026-06-15,90,Card,,No,,Annual fund",
    "Priya Nair,\"3 Elm Ct, Kettering OH 45429\",2026-09-09,120,Card,,No,,Annual fund",
    "Harbor Hardware,\"500 River Rd, Dayton OH 45410\",2026-08-22,,Non-cash,Ten 20-ft ladders for the volunteer build,No,,",
  ].join("\n");
}

export function sampleBrokenList() {
  return [
    "Donor,Address,Date,Amount,Type,Description,Goods or services,Benefit value,Fund",
    "Maria Alvarez,\"14 Oak St, Dayton OH 45402\",2026-02-10,500,Check,,No,,",
    "Maria Alvarez,\"14 Oak St, Dayton OH 45402\",2026-02-10,500,Check,,No,,",
    "James Whitfield,\"88 Pine Ave, Dayton OH 45409\",2026-05-04,300,Card,,Dinner for two,,Spring gala",
    ",\"1 Main St\",2026-06-01,250,Card,,,,",
    "Chen Wei,,13/45/2026,150,Card,,,,",
    "Dana Brooks,,2026-04-04,1000,Pledge,,,,",
    "Ola Reed,,2025-12-30,200,Card,,,,",
    "Sam Ortiz,\"9 Lake Dr\",2026-07-07,4200,Vehicle,2014 Honda Civic,,,",
    "Lena Park,,2026-07-08,-50,Card,,,,",
  ].join("\n");
}

export const SAMPLE_ORG = { name: "Example Community Fund", ein: "12-3456789", address: "1 Civic Plaza, Dayton OH 45402", signer: "Jordan Lee", signerTitle: "Treasurer", year: 2026 };
