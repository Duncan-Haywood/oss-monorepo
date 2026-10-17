// Restaurant tip pool calculator: shift lines in, per-person payout out. Money is integer cents; the pool is split
// by largest remainder so the payouts add up to the pool to the cent. Three methods: one pool shared by weighted
// hours ("points"), the same pool shared by plain hours, and server tip-out (servers keep their own tips less a
// percentage of sales that goes to support staff by hours).

export const DEFAULTS = { method: "points", cardFeePct: 0, tipOutPct: 3, tipCredit: false };

// class: front = shares in the pool as a tipped role, support = shares in tip-out / pool at its points, boh = kitchen,
// excluded = owners and managers, who may not keep any part of employees' tips.
export const DEFAULT_ROLES = `server,front,1
bartender,front,1
busser,support,0.5
food runner,support,0.5
host,support,0.3
barista,front,1
dishwasher,boh,0.3
cook,boh,0.5
manager,excluded,0
owner,excluded,0`;

const ALIASES = {
  date: ["date", "shift date", "day"],
  name: ["name", "employee", "staff", "person", "server name"],
  role: ["role", "position", "job", "title"],
  hours: ["hours", "hrs", "hours worked", "time"],
  card: ["card tips", "credit tips", "cc tips", "charged tips", "card"],
  cash: ["cash tips", "cash"],
  tips: ["tips", "total tips", "tip", "tips earned"],
  sales: ["sales", "net sales", "food sales", "check total", "total sales"],
};

export function parseCsv(text) {
  const rows = [];
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delim = src.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// Dollars to cents; refuses more than two decimals rather than rounding silently. Blank is 0.
export function parseCents(s) {
  const t = String(s ?? "").trim().replace(/[$,\s]/g, "");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [d, f = ""] = t.split(".");
  return parseInt(d, 10) * 100 + parseInt((f + "00").slice(0, 2), 10);
}

export function parseHours(s) {
  const t = String(s ?? "").trim();
  let m;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(t))) return +m[1] + +m[2] / 60;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return n > 0 && n <= 24 ? n : null;
}

export function parseRoles(text) {
  const roles = new Map(), errors = [];
  String(text ?? "").split(/\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const [r, c, p] = line.split(",").map((x) => x.trim());
    const points = p === undefined || p === "" ? 1 : parseFloat(p);
    if (!r || !["front", "support", "boh", "excluded"].includes((c || "").toLowerCase()) || !(points >= 0)) {
      errors.push(`Role line ${i + 1} should read "role,front|support|boh|excluded,points".`);
      return;
    }
    roles.set(r.toLowerCase(), { role: r, cls: c.toLowerCase(), points });
  });
  return { roles, errors };
}

export const money = (c) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function pick(header, key) {
  const names = header.map((h) => h.trim().toLowerCase());
  for (const a of ALIASES[key]) { const i = names.indexOf(a); if (i >= 0) return i; }
  return -1;
}

export function parseShifts(text) {
  const rows = parseCsv(text), errors = [], shifts = [];
  if (!rows.length) return { shifts, errors: ["Nothing to read."], columns: {} };
  const h = rows[0];
  const col = {};
  for (const k of Object.keys(ALIASES)) col[k] = pick(h, k);
  const missing = ["name", "role", "hours"].filter((k) => col[k] < 0);
  if (missing.length) return { shifts, errors: [`Missing column: ${missing.join(", ")}. Needs name, role and hours (tips and sales optional).`], columns: col };
  rows.slice(1).forEach((r, i) => {
    const n = i + 2;
    const name = (r[col.name] || "").trim(), role = (r[col.role] || "").trim();
    const hours = parseHours(r[col.hours]);
    if (!name || !role) return errors.push(`Row ${n}: needs a name and a role.`);
    if (hours === null) return errors.push(`Row ${n}: hours should be a number up to 24 or h:mm.`);
    const card = col.card >= 0 ? parseCents(r[col.card]) : 0;
    const cash = col.cash >= 0 ? parseCents(r[col.cash]) : 0;
    const tips = col.tips >= 0 ? parseCents(r[col.tips]) : 0;
    const sales = col.sales >= 0 ? parseCents(r[col.sales]) : 0;
    if ([card, cash, tips, sales].includes(null)) return errors.push(`Row ${n}: tips and sales should be dollar amounts with at most two decimals.`);
    // A single "tips" column counts as card tips only when no card/cash split is given.
    const cardTips = col.card >= 0 || col.cash >= 0 ? card : tips;
    shifts.push({ date: col.date >= 0 ? (r[col.date] || "").trim() : "", name, role, hours, card: cardTips, cash, sales });
  });
  return { shifts, errors, columns: col };
}

// Split `total` cents across weights, exactly. Largest remainder; ties go to the earlier entry.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return out;
}

export function calculate(text, rolesText = DEFAULT_ROLES, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const { shifts, errors } = parseShifts(text);
  const { roles, errors: roleErrors } = parseRoles(rolesText);
  const warnings = [];
  errors.push(...roleErrors);

  const people = new Map();
  for (const s of shifts) {
    const def = roles.get(s.role.toLowerCase());
    if (!def && !warnings.some((w) => w.includes(`"${s.role}"`))) warnings.push(`Role "${s.role}" is not in your role list; it was treated as a tipped front-of-house role at 1 point.`);
    const r = def || { role: s.role, cls: "front", points: 1 };
    const key = s.name.toLowerCase() + "|" + r.role.toLowerCase();
    if (!people.has(key)) people.set(key, { name: s.name, role: r.role, cls: r.cls, points: r.points, hours: 0, card: 0, cash: 0, sales: 0 });
    const p = people.get(key);
    p.hours += s.hours; p.card += s.card; p.cash += s.cash; p.sales += s.sales;
  }
  const list = [...people.values()];

  const excluded = list.filter((p) => p.cls === "excluded");
  const heldBack = excluded.reduce((a, p) => a + p.card + p.cash, 0);
  if (excluded.length) warnings.push(`${excluded.map((p) => p.name).join(", ")} ${excluded.length === 1 ? "is" : "are"} in an excluded role (owner or manager) and receive nothing from the pool. ${heldBack > 0 ? `Tips of ${money(heldBack)} recorded against ${excluded.length === 1 ? "that person" : "them"} are still distributed to the staff, not kept.` : ""}`.trim());

  const eligible = list.filter((p) => p.cls !== "excluded");
  const boh = eligible.filter((p) => p.cls === "boh");
  if (boh.length) warnings.push(`${boh.map((p) => p.name).join(", ")} work in the kitchen. Whether kitchen staff may share in a pool depends on whether tipped staff are paid under a tip credit and on your state; check before including them. Not decided here.`);
  if (o.tipCredit && boh.length) warnings.push("You said a tip credit is taken for tipped staff: under the federal rule, kitchen staff cannot share in a pool for those staff. Remove the kitchen roles or confirm with your payroll provider.");

  const cardGross = list.reduce((a, p) => a + p.card, 0), cash = list.reduce((a, p) => a + p.cash, 0);
  const fee = Math.round((cardGross * (o.cardFeePct || 0)) / 100);
  const pool = cardGross - fee + cash;
  const eligiblePool = pool;

  let pay = new Map(eligible.map((p) => [p, 0]));
  let detail = "";
  if (!eligible.length || pool <= 0) {
    if (pool > 0) warnings.push("No eligible staff to share the pool.");
  } else if (o.method === "hours") {
    const alloc = allocate(pool, eligible.map((p) => p.hours));
    eligible.forEach((p, i) => pay.set(p, alloc[i]));
    detail = "One pool shared by hours worked.";
  } else if (o.method === "points") {
    const alloc = allocate(pool, eligible.map((p) => p.hours * p.points));
    eligible.forEach((p, i) => pay.set(p, alloc[i]));
    detail = "One pool shared by hours times each role's points.";
  } else {
    // tip-out: front staff keep their own net tips less tip-out of their sales; support share the tip-out by weighted hours.
    const front = eligible.filter((p) => p.cls === "front"), support = eligible.filter((p) => p.cls !== "front");
    const share = (p) => p.card + p.cash;
    const feeFor = (p) => (cardGross > 0 ? (p.card * fee) / cardGross : 0);
    let tipOutTotal = 0;
    const owed = new Map();
    for (const p of front) {
      const net = Math.round(share(p) - feeFor(p));
      let out = Math.min(net, Math.round((p.sales * o.tipOutPct) / 100));
      if (!support.length) out = 0;
      out = Math.max(0, out);
      owed.set(p, out); tipOutTotal += out;
      pay.set(p, net - out);
    }
    // Excluded roles' tips: pooled to the support-and-front weighted by hours so nothing is retained.
    const strays = eligible.length ? heldBack - Math.round((heldBack * (cardGross > 0 ? fee / cardGross : 0))) : 0;
    const supAlloc = allocate(tipOutTotal, support.map((p) => p.hours * p.points));
    support.forEach((p, i) => pay.set(p, (pay.get(p) || 0) + supAlloc[i]));
    if (strays > 0) {
      const a = allocate(strays, eligible.map((p) => p.hours));
      eligible.forEach((p, i) => pay.set(p, pay.get(p) + a[i]));
    }
    if (!support.length && front.some((p) => p.sales > 0) && o.tipOutPct > 0) warnings.push("Tip-out was set but there are no support staff on the list, so no tip-out was taken.");
    if (front.some((p) => p.sales === 0) && o.tipOutPct > 0) warnings.push("Some tipped staff have no sales figure, so no tip-out was taken from them.");
    detail = `Tipped staff keep their own tips less ${o.tipOutPct}% of their sales, shared by weighted hours among support staff.`;
  }

  // Rounding drift guard: whatever the method, payouts add up to the pool.
  let paid = [...pay.values()].reduce((a, b) => a + b, 0);
  const drift = pool - paid;
  if (drift !== 0 && eligible.length) {
    const top = [...pay.entries()].sort((a, b) => b[1] - a[1])[0][0];
    pay.set(top, pay.get(top) + drift);
    paid += drift;
  }

  const rows = eligible.map((p) => {
    const own = p.card + p.cash;
    return { name: p.name, role: p.role, cls: p.cls, hours: p.hours, ownTips: own, payout: pay.get(p), perHour: p.hours > 0 ? Math.round(pay.get(p) / p.hours) : 0, delta: pay.get(p) - own };
  }).sort((a, b) => b.payout - a.payout || a.name.localeCompare(b.name));

  return {
    rows, warnings, errors, method: o.method, detail,
    summary: { people: rows.length, hours: Math.round(eligible.reduce((a, p) => a + p.hours, 0) * 100) / 100, cardGross, cash, fee, pool, paid, balanced: paid === pool, shifts: shifts.length },
  };
}

export function reportCsv(r) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["Name,Role,Hours,Tips collected,Payout,Payout per hour"];
  for (const x of r.rows) lines.push([q(x.name), q(x.role), x.hours.toFixed(2), (x.ownTips / 100).toFixed(2), (x.payout / 100).toFixed(2), (x.perHour / 100).toFixed(2)].join(","));
  lines.push(["Total", "", r.summary.hours.toFixed(2), ((r.summary.cardGross + r.summary.cash) / 100).toFixed(2), (r.summary.paid / 100).toFixed(2), ""].join(","));
  return lines.join("\n") + "\n";
}

export function payrollCsv(r) {
  return "Name,Tips to add to payroll\n" + r.rows.map((x) => `${/[",]/.test(x.name) ? `"${x.name.replace(/"/g, '""')}"` : x.name},${(x.payout / 100).toFixed(2)}`).join("\n") + "\n";
}

export function sampleList() {
  return `Date,Name,Role,Hours,Card tips,Cash tips,Sales
2026-10-02,Ana,Server,6,142.50,20,1180
2026-10-02,Ben,Server,5,96.00,35,820
2026-10-02,Cy,Bartender,6,88.00,41,
2026-10-02,Dee,Busser,5,,,
2026-10-02,Eli,Host,4,,,
2026-10-02,Fay,Food runner,5,,,
2026-10-02,Gus,Cook,6,,,
2026-10-02,Hal,Manager,8,30.00,,`;
}
