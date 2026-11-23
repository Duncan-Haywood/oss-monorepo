// Group expense settle-up: who paid what, who owes whom, and the fewest
// transfers that square everyone up.
//
// Everything is integer minor units (cents) of the group's base currency, so
// every split adds back to the bill to the cent and every balance sums to zero.
//
// Settlement modes:
//   - "fewest": the minimum number of transfers. With k people whose balance
//     is not zero, the minimum is k minus the largest number of groups the
//     k balances can be cut into where each group sums to zero (Verhoeff 2004,
//     "Settling multiple debts efficiently"). Finding that partition is
//     NP-hard in general, so it is solved exactly by dynamic programming over
//     subsets for up to EXACT_LIMIT people, and by a pairing-then-greedy
//     heuristic above that (said so on the page).
//   - "greedy": largest creditor paid by largest debtor until done; at most
//     k - 1 transfers, what most apps do.
//   - "direct": no simplifying; everyone pays back the people who paid for
//     them, netted per pair. Most transfers, but nobody pays a stranger.

export const EXACT_LIMIT = 20;

// ISO 4217 minor units that are not 2.
const MINOR_DIGITS = {
  JPY: 0, KRW: 0, VND: 0, ISK: 0, CLP: 0, PYG: 0, UGX: 0, XOF: 0, XAF: 0, HUF: 2, TWD: 2,
  BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, LYD: 3, IQD: 3,
};
export const digitsOf = (cur) => (cur in MINOR_DIGITS ? MINOR_DIGITS[cur] : 2);

const SYMBOLS = { "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₩": "KRW", "₺": "TRY", "₽": "RUB", "₱": "PHP", "₫": "VND", "฿": "THB", "₪": "ILS", "zł": "PLN" };
const DOLLAR_BASES = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN"]);

// "1,234.56", "1.234,56", "12,50", "1 200", "84.5" -> number, or NaN.
export function parseAmount(text) {
  let s = String(text ?? "").trim().replace(/[\s  ']/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("");
    if (s.split(dec).length > 2) return NaN;
    s = s.replace(dec, ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    // One comma with 1-2 digits after it is a decimal comma ("12,5", "12,50");
    // groups of exactly three are thousands ("1,200", "12,000,000").
    if (parts.length === 2 && parts[1].length >= 1 && parts[1].length <= 2) s = parts.join(".");
    else if (parts.slice(1).every((p) => p.length === 3)) s = parts.join("");
    else return NaN;
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2) {
      if (parts.slice(1).every((p) => p.length === 3)) s = parts.join("");
      else return NaN;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function toMinor(amount, cur) {
  return Math.round(amount * 10 ** digitsOf(cur));
}

export function formatMinor(minor, cur) {
  const d = digitsOf(cur);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** d);
  const frac = d ? "." + String(abs % 10 ** d).padStart(d, "0") : "";
  return `${sign}${whole.toLocaleString("en-US")}${frac} ${cur}`;
}

// Split `total` integer units by non-negative `weights` so the parts add to
// `total` exactly: floor of each exact share, then the leftover units to the
// largest remainders (Hamilton / largest-remainder), ties to the earlier entry.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new Error("allocate: weights must add to more than zero");
  const sign = total < 0 ? -1 : 1;
  const T = Math.abs(total);
  const exact = weights.map((w) => (T * w) / sum);
  const parts = exact.map((x) => Math.floor(x + 1e-9));
  let left = T - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, r: x - parts[i], w: weights[i] }))
    .filter((o) => o.w > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i]++;
  return parts.map((p) => p * sign);
}

function norm(name) {
  return String(name).trim().replace(/\s+/g, " ").toLowerCase();
}

export function parsePeople(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text ?? "").split(/[\n,;]+/)) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    out.push(name);
  }
  return out;
}

// Rates: "EUR 1.08" per line = 1 EUR is worth 1.08 of the base currency.
export function parseRates(text) {
  const rates = {};
  const errors = [];
  String(text ?? "").split(/\n+/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const m = t.match(/^([A-Za-z]{3})\s*[=:]?\s*(\d[\d.,]*)$/);
    const r = m ? parseAmount(m[2]) : NaN;
    if (!m || !(r > 0)) errors.push(`Rate line ${i + 1}: write it as "EUR 1.08" (one EUR in the base currency).`);
    else rates[m[1].toUpperCase()] = r;
  });
  return { rates, errors };
}

// One expense line:
//   [YYYY-MM-DD] Payer[+Payer2|=amt...] AMOUNT [CUR] description [/ who]
//   [YYYY-MM-DD] From -> To AMOUNT [CUR] [note]            (a payment)
// who: "Ana, Ben" (equal), "Ana:2, Ben:1" (shares), "Ana=30, Ben=20" (exact),
//      "Ana=60%, Ben=40%" (percent), "all -Ben" (everyone but Ben).
// Lines starting with # are notes.
export function parseLines(text, people, base) {
  const index = new Map(people.map((p, i) => [norm(p), i]));
  const expenses = [];
  const errors = [];
  const find = (name, ln) => {
    const i = index.get(norm(name));
    if (i === undefined) errors.push(`Line ${ln}: "${name.trim()}" is not in the group. Add them to the people list or fix the spelling.`);
    return i;
  };
  String(text ?? "").split("\n").forEach((rawLine, li) => {
    const ln = li + 1;
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    let date = null;
    const dm = line.match(/^(\d{4}-\d{2}-\d{2})\s+/);
    if (dm) {
      date = dm[1];
      line = line.slice(dm[0].length);
    }
    const before = errors.length;
    // Payment line.
    const pay = line.match(/^(.+?)\s*(?:->|→)\s*(.+?)\s+([^\s\d]{0,2})(\d[\d.,\s]*?)(?:\s+([A-Za-z]{3}))?(?:\s+(.*))?$/);
    if (pay) {
      const from = find(pay[1], ln);
      const to = find(pay[2], ln);
      const cur = currencyOf(pay[3], pay[5], base, ln, errors);
      const amount = parseAmount(pay[4]);
      if (!(amount > 0)) errors.push(`Line ${ln}: "${pay[4].trim()}" is not an amount above zero.`);
      if (from !== undefined && from === to) errors.push(`Line ${ln}: a payment needs two different people.`);
      if (errors.length === before) {
        expenses.push({ line: ln, kind: "payment", date, from, to, cur, amount, desc: (pay[6] || "Payment").trim() });
      }
      return;
    }
    const m = line.match(/^(.+?)\s+([^\s\d]{0,2})(\d[\d.,]*)(?:\s+([A-Z]{3}))?(?:\s+(.*))?$/);
    if (!m) {
      errors.push(`Line ${ln}: write it as "Payer amount description", for example "Ana 84.50 groceries".`);
      return;
    }
    const cur = currencyOf(m[2], m[4], base, ln, errors);
    const amount = parseAmount(m[3]);
    if (!(amount > 0)) errors.push(`Line ${ln}: "${m[3]}" is not an amount above zero.`);
    let rest = (m[5] || "").trim();
    let who = null;
    const slash = rest.lastIndexOf("/");
    if (slash >= 0) {
      who = rest.slice(slash + 1).trim();
      rest = rest.slice(0, slash).trim();
    }
    const payers = parsePayers(m[1], amount, ln, errors, find);
    const split = parseWho(who, people, amount, ln, errors, find);
    if (errors.length === before) {
      expenses.push({ line: ln, kind: "expense", date, cur, amount, desc: rest || "Expense", payers, split });
    }
  });
  return { expenses, errors };
}

function currencyOf(sym, code, base, ln, errors) {
  if (code) return code.toUpperCase();
  if (!sym) return base;
  if (sym === "$") return DOLLAR_BASES.has(base) ? base : "USD";
  if (SYMBOLS[sym]) return SYMBOLS[sym];
  errors.push(`Line ${ln}: "${sym}" is not a currency symbol this page knows. Put a code after the amount instead, like "40 EUR".`);
  return base;
}

function parsePayers(text, amount, ln, errors, find) {
  const parts = text.split("+").map((s) => s.trim()).filter(Boolean);
  const out = [];
  let anyAmount = false;
  for (const p of parts) {
    const pm = p.match(/^(.+?)\s*=\s*(\d[\d.,]*)$/);
    if (pm) {
      anyAmount = true;
      const a = parseAmount(pm[2]);
      if (!(a > 0)) errors.push(`Line ${ln}: "${pm[2]}" is not an amount above zero.`);
      out.push({ who: find(pm[1], ln), w: a });
    } else out.push({ who: find(p, ln), w: null });
  }
  if (anyAmount) {
    if (out.some((o) => o.w === null)) errors.push(`Line ${ln}: give every payer an amount (Ana=120+Ben=80), or none of them.`);
    const sum = out.reduce((s, o) => s + (o.w || 0), 0);
    if (Number.isFinite(amount) && Math.abs(sum - amount) > 1e-6) errors.push(`Line ${ln}: the payers' amounts add to ${round6(sum)}, not ${amount}.`);
  } else out.forEach((o) => (o.w = 1));
  return out;
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

function parseWho(text, people, amount, ln, errors, find) {
  if (!text || /^(all|everyone|everybody)$/i.test(text)) return { type: "shares", parts: people.map((_, i) => ({ who: i, w: 1 })) };
  const items = (text.includes(",") ? text.split(",") : text.split(/\s+/)).map((s) => s.trim()).filter(Boolean);
  let set = null;
  const parts = [];
  let type = "shares";
  const kinds = new Set();
  for (const item of items) {
    if (/^(all|everyone|everybody)$/i.test(item)) {
      set = new Set(people.map((_, i) => i));
      continue;
    }
    if (item.startsWith("-")) {
      const i = find(item.slice(1), ln);
      if (!set) set = new Set(people.map((_, j) => j));
      if (i !== undefined) set.delete(i);
      continue;
    }
    let mm;
    if ((mm = item.match(/^(.+?)\s*=\s*(\d[\d.,]*)\s*%$/))) {
      kinds.add("percent");
      parts.push({ who: find(mm[1], ln), w: parseAmount(mm[2]) });
    } else if ((mm = item.match(/^(.+?)\s*=\s*(\d[\d.,]*)$/))) {
      kinds.add("exact");
      parts.push({ who: find(mm[1], ln), w: parseAmount(mm[2]) });
    } else if ((mm = item.match(/^(.+?)\s*[:x×]\s*(\d[\d.,]*)$/))) {
      kinds.add("shares");
      parts.push({ who: find(mm[1], ln), w: parseAmount(mm[2]) });
    } else {
      kinds.add("shares");
      parts.push({ who: find(item, ln), w: 1 });
    }
  }
  if (set) {
    if (parts.length) errors.push(`Line ${ln}: use either "all -Name" or a list of names after the /, not both.`);
    return { type: "shares", parts: [...set].sort((a, b) => a - b).map((who) => ({ who, w: 1 })) };
  }
  if (kinds.size > 1) {
    errors.push(`Line ${ln}: mix of split styles after the /. Use shares (Ana:2), exact amounts (Ana=30) or percents (Ana=60%), one style per line.`);
    return { type, parts };
  }
  type = [...kinds][0] || "shares";
  for (const p of parts) if (!(p.w >= 0) || !Number.isFinite(p.w)) errors.push(`Line ${ln}: a split number is not valid.`);
  const seen = new Set();
  for (const p of parts) {
    if (p.who === undefined) continue;
    if (seen.has(p.who)) errors.push(`Line ${ln}: ${people[p.who]} is named twice after the /.`);
    seen.add(p.who);
  }
  const sum = parts.reduce((s, p) => s + (p.w || 0), 0);
  if (type === "exact" && Number.isFinite(amount) && Math.abs(sum - amount) > 1e-6) {
    errors.push(`Line ${ln}: the exact amounts add to ${round6(sum)}, not ${amount}.`);
  }
  if (type === "percent" && Math.abs(sum - 100) > 1e-6) errors.push(`Line ${ln}: the percents add to ${round6(sum)}, not 100.`);
  if (type === "shares" && !(sum > 0)) errors.push(`Line ${ln}: nobody has a share of this expense.`);
  if (!parts.length) errors.push(`Line ${ln}: nobody is named after the /.`);
  return { type, parts };
}

// Convert to base minor units. Returns { cents, missing } for one amount.
export function toBase(amount, cur, base, rates) {
  if (cur === base) return { cents: toMinor(amount, base) };
  const r = rates[cur];
  if (!(r > 0)) return { missing: cur };
  return { cents: toMinor(amount * r, base) };
}

// Balances and per-pair direct debts in base minor units.
//   net[i] > 0: the group owes person i; < 0: person i owes the group.
export function ledger(people, expenses, base, rates) {
  const n = people.length;
  const paid = Array(n).fill(0);
  const share = Array(n).fill(0);
  const sent = Array(n).fill(0);
  const received = Array(n).fill(0);
  const pair = Array.from({ length: n }, () => Array(n).fill(0)); // pair[a][b]: a owes b
  const missing = new Set();
  const rows = [];
  for (const e of expenses) {
    const conv = toBase(e.amount, e.cur, base, rates);
    if (conv.missing) {
      missing.add(conv.missing);
      continue;
    }
    const total = conv.cents;
    if (e.kind === "payment") {
      sent[e.from] += total;
      received[e.to] += total;
      pair[e.to][e.from] += total; // the receiver now owes the sender this back
      rows.push({ ...e, total, shares: null });
      continue;
    }
    const pays = allocate(total, e.payers.map((p) => p.w));
    const owes = allocate(total, e.split.parts.map((p) => p.w));
    const owed = Array(n).fill(0);
    e.split.parts.forEach((p, k) => (owed[p.who] += owes[k]));
    const put = Array(n).fill(0);
    e.payers.forEach((p, k) => (put[p.who] += pays[k]));
    for (let i = 0; i < n; i++) {
      paid[i] += put[i];
      share[i] += owed[i];
    }
    // Direct debts: each person's share is owed to the payers in proportion
    // to what they paid; allocate keeps it to the cent.
    for (let i = 0; i < n; i++) {
      if (!owed[i]) continue;
      const to = allocate(owed[i], put);
      for (let j = 0; j < n; j++) if (j !== i && to[j]) pair[i][j] += to[j];
    }
    rows.push({ ...e, total, shares: owed });
  }
  const net = people.map((_, i) => paid[i] - share[i] + sent[i] - received[i]);
  return { paid, share, sent, received, net, pair, rows, missing: [...missing] };
}

// Largest creditor paid by largest debtor. Ties go to the earlier person, so
// the same input always gives the same transfers.
export function settleGreedy(net, members = null) {
  const idx = members || net.map((_, i) => i);
  const bal = new Map(idx.map((i) => [i, net[i]]));
  const out = [];
  for (;;) {
    let cr = -1;
    let dr = -1;
    for (const i of idx) {
      const b = bal.get(i);
      if (b > 0 && (cr < 0 || b > bal.get(cr))) cr = i;
      if (b < 0 && (dr < 0 || b < bal.get(dr))) dr = i;
    }
    if (cr < 0 || dr < 0) break;
    const amt = Math.min(bal.get(cr), -bal.get(dr));
    out.push({ from: dr, to: cr, cents: amt });
    bal.set(cr, bal.get(cr) - amt);
    bal.set(dr, bal.get(dr) + amt);
  }
  return out;
}

// The most zero-sum groups the nonzero balances can be cut into, by DP over
// subsets: best[mask] = max over i in mask of best[mask without i], plus one
// when mask itself sums to zero. Walking the argmax chain back from the full
// set cuts it into consecutive zero-sum groups.
export function zeroSumGroups(values) {
  const k = values.length;
  if (k === 0) return [];
  if (k > EXACT_LIMIT) throw new Error(`zeroSumGroups: more than ${EXACT_LIMIT} balances`);
  const size = 1 << k;
  const sum = new Float64Array(size);
  const best = new Uint8Array(size);
  const via = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = 31 - Math.clz32(mask & -mask);
    sum[mask] = sum[mask & (mask - 1)] + values[low];
    let b = -1;
    let arg = 0;
    for (let m = mask; m; m &= m - 1) {
      const i = 31 - Math.clz32(m & -m);
      const v = best[mask ^ (1 << i)];
      if (v > b) {
        b = v;
        arg = i;
      }
    }
    best[mask] = b + (sum[mask] === 0 ? 1 : 0);
    via[mask] = arg;
  }
  const groups = [];
  let cur = [];
  let mask = size - 1;
  while (mask) {
    if (sum[mask] === 0 && cur.length) {
      groups.push(cur);
      cur = [];
    }
    const i = via[mask];
    cur.push(i);
    mask ^= 1 << i;
  }
  if (cur.length) groups.push(cur);
  return groups.map((g) => g.sort((a, b) => a - b));
}

// Fewest transfers. Returns { transfers, exact }.
export function settleFewest(net) {
  const nz = net.map((v, i) => i).filter((i) => net[i] !== 0);
  if (nz.length <= EXACT_LIMIT) {
    const groups = zeroSumGroups(nz.map((i) => net[i]));
    const transfers = [];
    for (const g of groups) transfers.push(...settleGreedy(net, g.map((j) => nz[j])));
    return { transfers, exact: true };
  }
  // Above the limit: pair off exact opposites first (each pair is a group of
  // two, always in some optimal answer's reach), then greedy on the rest.
  const bal = net.slice();
  const transfers = [];
  const byAmount = new Map();
  for (const i of nz) {
    if (bal[i] > 0) {
      const list = byAmount.get(bal[i]) || [];
      list.push(i);
      byAmount.set(bal[i], list);
    }
  }
  for (const i of nz) {
    if (bal[i] >= 0) continue;
    const list = byAmount.get(-bal[i]);
    if (list && list.length) {
      const j = list.shift();
      transfers.push({ from: i, to: j, cents: bal[j] });
      bal[j] = 0;
      bal[i] = 0;
    }
  }
  transfers.push(...settleGreedy(bal));
  return { transfers, exact: false };
}

// No simplifying: net each pair's direct debts.
export function settleDirect(pair) {
  const n = pair.length;
  const out = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const d = pair[a][b] - pair[b][a];
      if (d > 0) out.push({ from: a, to: b, cents: d });
      else if (d < 0) out.push({ from: b, to: a, cents: -d });
    }
  }
  return out;
}

export function settle(mode, book) {
  if (mode === "direct") return { transfers: settleDirect(book.pair), exact: true };
  if (mode === "greedy") return { transfers: settleGreedy(book.net), exact: true };
  return settleFewest(book.net);
}

// The whole pipeline from the three text boxes.
export function run({ peopleText, linesText, base = "USD", ratesText = "", mode = "fewest" }) {
  const B = String(base || "USD").toUpperCase();
  const people = parsePeople(peopleText);
  const errors = [];
  if (people.length < 2) errors.push("Add at least two people, one per line.");
  const r = parseRates(ratesText);
  errors.push(...r.errors);
  const p = parseLines(linesText, people, B);
  errors.push(...p.errors);
  const book = ledger(people, p.expenses, B, r.rates);
  for (const cur of book.missing) errors.push(`Add a rate for ${cur}: one ${cur} in ${B}, like "${cur} 1.08".`);
  const result = settle(mode, book);
  const greedyCount = settleGreedy(book.net).length;
  const directCount = settleDirect(book.pair).length;
  const nonzero = book.net.filter((v) => v !== 0).length;
  return { people, base: B, expenses: p.expenses, errors, book, mode, ...result, counts: { greedy: greedyCount, direct: directCount, nonzero } };
}

export function transfersText(res) {
  const { people, base } = res;
  if (!res.transfers.length) return "Everyone is square.";
  return res.transfers.map((t) => `${people[t.from]} pays ${people[t.to]} ${formatMinor(t.cents, base)}`).join("\n");
}

const csvCell = (v) => {
  let s = String(v ?? "");
  // A cell a spreadsheet would run as a formula is kept as text.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function expensesCsv(res) {
  const { people, base } = res;
  const head = ["Line", "Date", "Kind", "Description", "Amount", "Currency", `Total ${base}`, ...people.map((p) => `${p} share ${base}`)];
  const rows = [head];
  for (const r of res.book.rows) {
    const shares = r.shares ? r.shares.map((c) => (c / 10 ** digitsOf(base)).toFixed(digitsOf(base))) : people.map(() => "");
    const desc = r.kind === "payment" ? `${people[r.from]} paid ${people[r.to]}: ${r.desc}` : r.desc;
    rows.push([r.line, r.date || "", r.kind, desc, r.amount, r.cur, (r.total / 10 ** digitsOf(base)).toFixed(digitsOf(base)), ...shares]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function transfersCsv(res) {
  const d = digitsOf(res.base);
  const rows = [["From", "To", `Amount ${res.base}`]];
  for (const t of res.transfers) rows.push([res.people[t.from], res.people[t.to], (t.cents / 10 ** d).toFixed(d)]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// The payment line that records a transfer as done.
export function paymentLine(res, t, date = null) {
  const d = digitsOf(res.base);
  return `${date ? date + " " : ""}${res.people[t.from]} -> ${res.people[t.to]} ${(t.cents / 10 ** d).toFixed(d)} ${res.base} settled up`;
}

// Share link state: the four boxes as JSON, UTF-8, base64url.
export function encodeState(state) {
  const json = JSON.stringify({ v: 1, t: state.title || "", p: state.peopleText || "", l: state.linesText || "", b: state.base || "USD", r: state.ratesText || "", m: state.mode || "fewest" });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeState(code) {
  try {
    const b64 = String(code).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    if (!o || o.v !== 1) return null;
    const str = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");
    const mode = ["fewest", "greedy", "direct"].includes(o.m) ? o.m : "fewest";
    const base = /^[A-Z]{3}$/.test(o.b) ? o.b : "USD";
    return { title: str(o.t, 120), peopleText: str(o.p, 4000), linesText: str(o.l, 100000), base, ratesText: str(o.r, 2000), mode };
  } catch {
    return null;
  }
}

export const EXAMPLE = {
  title: "Lisbon weekend",
  base: "EUR",
  peopleText: "Ana\nBen\nCara\nDev\nEli",
  ratesText: "USD 0.92\nGBP 1.18",
  linesText: [
    "# Payer amount [currency] description / who (blank = everyone)",
    "2026-10-02 Ana 640 apartment, 2 nights",
    "2026-10-02 Ben 86.40 groceries",
    "2026-10-03 Cara 120 USD museum tickets / Ana, Cara, Dev, Eli",
    "2026-10-03 Dev 210 dinner / Ana:2, Ben:1, Cara:1, Dev:1, Eli:1",
    "2026-10-03 Eli 45 taxi / all -Ben",
    "2026-10-04 Ana=30+Ben=20 50 boat trip / Ana, Ben",
    "2026-10-04 Cara 36 GBP train snacks",
    "2026-10-05 Eli -> Ana 100 sent by bank",
  ].join("\n"),
  mode: "fewest",
};
