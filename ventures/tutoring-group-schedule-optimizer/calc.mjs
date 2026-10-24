// Tutoring / lesson group scheduler. Given the weekly group slots a centre
// could run (capacity, minimum group, cost to run) and each student's price and
// available slots, choose which slots to run and who sits in which, to
// maximise weekly profit.
//
// For a fixed set of open slots the best seating is a min-cost flow
// (student -> slot -> sink), with the first `min` seats of every slot made
// attractive enough that a slot is only "open" if its minimum is really met.
// Which slots to open is then searched: exactly (every subset) up to
// EXACT_LIMIT slots, otherwise by seeded local search with restarts.

export const EXACT_LIMIT = 10;
const BIG = 1e7;
const EPS = 1e-9;

export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";

function splitLine(line) {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map((s) => s.trim());
}

function cleanLines(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");

export function parseSlots(text, defaults = {}) {
  const lines = cleanLines(text);
  const warnings = [];
  if (!lines.length) return { error: "Paste the slots you could run, one per line: slot, capacity, minimum group, cost to run." };
  let cols = { slot: 0, capacity: 1, min: 2, cost: 3 };
  const head = splitLine(lines[0]).map((h) => h.toLowerCase());
  const named = head.findIndex((h) => /^(slot|session|time|class)/.test(h));
  if (named >= 0 && head.some((h) => /cap|max|seat/.test(h) || /cost|pay|rate/.test(h))) {
    cols = {
      slot: named,
      capacity: head.findIndex((h) => /cap|max|seat/.test(h)),
      min: head.findIndex((h) => /^min/.test(h)),
      cost: head.findIndex((h) => /cost|pay|rate/.test(h)),
    };
    lines.shift();
  }
  const slots = [];
  const seen = new Set();
  let bad = 0;
  for (const line of lines) {
    const f = splitLine(line);
    const name = f[cols.slot] || "";
    const capacity = Number(f[cols.capacity]);
    const minRaw = cols.min >= 0 && f[cols.min] !== undefined && f[cols.min] !== "" ? Number(f[cols.min]) : defaults.min ?? 1;
    const cost = Number(f[cols.cost]);
    if (!name || !Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(minRaw) || minRaw < 1 || minRaw > capacity || !Number.isFinite(cost) || cost < 0 || f[cols.cost] === "") { bad++; continue; }
    if (seen.has(norm(name))) { bad++; continue; }
    seen.add(norm(name));
    slots.push({ name, capacity, min: minRaw, cost });
  }
  if (bad) warnings.push(`${bad} slot row(s) skipped: each needs a unique name, a whole capacity of 1 or more, a whole minimum between 1 and the capacity, and a cost of 0 or more.`);
  if (!slots.length) return { error: "No usable slot rows. Expected: slot, capacity, minimum group, cost to run." };
  return { slots, warnings };
}

export function parseStudents(text) {
  const lines = cleanLines(text);
  if (!lines.length) return { error: "Paste your students, one per line: name, price per session, then the slots they can attend." };
  const head = splitLine(lines[0]).map((h) => h.toLowerCase());
  if (/^(name|student)/.test(head[0] || "") && /price|fee|rate|pays/.test(head[1] || "")) lines.shift();
  const students = [];
  const warnings = [];
  let bad = 0;
  for (const line of lines) {
    const f = splitLine(line);
    const name = f[0];
    const price = Number(f[1]);
    const avail = f.slice(2).join(";").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    if (!name || !Number.isFinite(price) || price <= 0 || f[1] === "" || !avail.length) { bad++; continue; }
    students.push({ name, price, avail });
  }
  if (bad) warnings.push(`${bad} student row(s) skipped: each needs a name, a price above 0, and at least one available slot.`);
  if (!students.length) return { error: "No usable student rows. Expected: name, price per session, slot; slot; slot." };
  return { students, warnings };
}

// ---- min-cost flow -------------------------------------------------------

function seat(open, slots, students, idx) {
  // open: array of slot indices; idx: Map(normalised slot name -> slot index)
  const n = students.length, m = open.length;
  const S = 0, T = 1 + n + m;
  const to = [], cap = [], cost = [], adj = Array.from({ length: T + 1 }, () => []);
  const add = (u, v, c, w) => {
    adj[u].push(to.length); to.push(v); cap.push(c); cost.push(w);
    adj[v].push(to.length); to.push(u); cap.push(0); cost.push(-w);
  };
  const pos = new Map(open.map((s, k) => [s, k]));
  const stuEdges = students.map(() => []);
  students.forEach((st, i) => {
    add(S, 1 + i, 1, -st.price);
    for (const a of st.availIdx) {
      if (pos.has(a)) { stuEdges[i].push([to.length, a]); add(1 + i, 1 + n + pos.get(a), 1, 0); }
    }
  });
  open.forEach((s, k) => {
    const sl = slots[s];
    add(1 + n + k, T, sl.min, -BIG);
    if (sl.capacity > sl.min) add(1 + n + k, T, sl.capacity - sl.min, 0);
  });
  const N = T + 1;
  for (;;) {
    const dist = new Array(N).fill(Infinity), prevE = new Array(N).fill(-1), inQ = new Array(N).fill(false);
    dist[S] = 0;
    const q = [S];
    inQ[S] = true;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      inQ[u] = false;
      for (const e of adj[u]) {
        if (cap[e] > 0 && dist[u] + cost[e] < dist[to[e]] - EPS) {
          dist[to[e]] = dist[u] + cost[e];
          prevE[to[e]] = e;
          if (!inQ[to[e]]) { inQ[to[e]] = true; q.push(to[e]); }
        }
      }
    }
    if (!(dist[T] < -EPS)) break;
    for (let v = T; v !== S; v = to[prevE[v] ^ 1]) { cap[prevE[v]] -= 1; cap[prevE[v] ^ 1] += 1; }
  }
  const seatOf = new Array(n).fill(-1);
  const load = new Map(open.map((s) => [s, 0]));
  stuEdges.forEach((es, i) => {
    for (const [e, a] of es) if (cap[e] === 0) { seatOf[i] = a; load.set(a, load.get(a) + 1); }
  });
  let feasible = true, revenue = 0, runCost = 0;
  for (const s of open) {
    if (load.get(s) < slots[s].min) feasible = false;
    runCost += slots[s].cost;
  }
  seatOf.forEach((a, i) => { if (a >= 0) revenue += students[i].price; });
  return { feasible, profit: feasible ? revenue - runCost : -Infinity, revenue, runCost, seatOf, load };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function search(slots, students, { seed = 7, restarts = 12, exactLimit = EXACT_LIMIT } = {}) {
  const m = slots.length;
  const idx = new Map(slots.map((s, i) => [norm(s.name), i]));
  const stu = students.map((s) => ({ ...s, availIdx: [...new Set(s.avail.map((a) => idx.get(norm(a))).filter((i) => i !== undefined))] }));
  const cache = new Map();
  const evalMask = (mask) => {
    if (cache.has(mask)) return cache.get(mask);
    const open = [];
    for (let i = 0; i < m; i++) if (mask & (1 << i)) open.push(i);
    const r = open.length ? seat(open, slots, stu, idx) : { feasible: true, profit: 0, revenue: 0, runCost: 0, seatOf: stu.map(() => -1), load: new Map() };
    cache.set(mask, r);
    return r;
  };
  let best = 0, exact = false;
  if (m <= exactLimit) {
    exact = true;
    for (let mask = 0; mask < 1 << m; mask++) if (evalMask(mask).profit > evalMask(best).profit + EPS) best = mask;
  } else {
    if (m > 30) throw new Error("At most 30 slots are supported.");
    const rnd = mulberry32(seed);
    const climb = (start) => {
      let mask = start, cur = evalMask(mask).profit;
      for (;;) {
        let bm = mask, bv = cur;
        for (let i = 0; i < m; i++) {
          const v = evalMask(mask ^ (1 << i)).profit;
          if (v > bv + EPS) { bv = v; bm = mask ^ (1 << i); }
        }
        // swaps: close one open slot, open one closed slot
        if (bm === mask) {
          for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
            if (!(mask & (1 << i)) || (mask & (1 << j))) continue;
            const t = (mask ^ (1 << i)) | (1 << j);
            const v = evalMask(t).profit;
            if (v > bv + EPS) { bv = v; bm = t; }
          }
        }
        if (bm === mask) return mask;
        mask = bm; cur = bv;
      }
    };
    const starts = [(1 << m) - 1, 0];
    for (let r = 0; r < restarts; r++) { let k = 0; for (let i = 0; i < m; i++) if (rnd() < 0.5) k |= 1 << i; starts.push(k); }
    for (const s of starts) {
      const mask = climb(evalMask(s).feasible ? s : 0);
      if (evalMask(mask).profit > evalMask(best).profit + EPS) best = mask;
    }
  }
  return { best, evalMask, stu, exact };
}

export function analyze(slots, students, opts = {}) {
  const warnings = [];
  if (students.length < 4) return { error: "Need at least 4 students to compare schedules." };
  const names = new Set(slots.map((s) => norm(s.name)));
  const unknown = new Set();
  for (const st of students) for (const a of st.avail) if (!names.has(norm(a))) unknown.add(a);
  if (unknown.size) warnings.push(`Availability that matches no slot was ignored: ${[...unknown].slice(0, 8).join(", ")}${unknown.size > 8 ? ", ..." : ""}.`);
  const { best, evalMask, stu, exact } = search(slots, students, opts);
  const m = slots.length;
  const plan = evalMask(best);
  const all = (1 << m) - 1;
  const rows = slots.map((s, i) => {
    const isOpen = !!(best & (1 << i));
    const flip = evalMask(best ^ (1 << i));
    const seated = isOpen ? plan.load.get(i) || 0 : 0;
    return {
      slot: s.name, capacity: s.capacity, min: s.min, cost: s.cost, open: isOpen,
      students: seated,
      revenue: isOpen ? plan.seatOf.reduce((t, a, k) => t + (a === i ? stu[k].price : 0), 0) : 0,
      // profit change from flipping this one slot, other slots re-optimised
      flipDelta: Number.isFinite(flip.profit) ? flip.profit - plan.profit : null,
    };
  });
  const placed = plan.seatOf.map((a, i) => ({ name: stu[i].name, price: stu[i].price, slot: a >= 0 ? slots[a].name : null }));
  const unplaced = placed.filter((p) => !p.slot);
  const stuIdx = new Map(stu.map((s, i) => [s.name + "#" + i, i]));
  const unplacedDetail = unplaced.map((p) => {
    const i = placed.indexOf(p);
    const closed = stu[i].availIdx.filter((a) => !(best & (1 << a))).map((a) => slots[a].name);
    return { ...p, reason: stu[i].availIdx.length === 0 ? "none of their slots exist" : closed.length ? `only fits closed slots: ${closed.join(", ")}` : "their open slots are full" };
  });
  const everything = evalMask(all);
  // running every slot with no minimum is the "do nothing clever" baseline
  const relaxed = slots.map((s) => ({ ...s, min: 1 }));
  const bs = search(relaxed, students, { seed: 1 }).evalMask(all);
  const baseProfit = bs.revenue - bs.runCost;
  if (!exact) warnings.push(`${m} slots is too many to try every combination (limit ${EXACT_LIMIT}), so this is the best of a seeded local search. It is a good plan, not proven best.`);
  if (!Number.isFinite(plan.profit) || plan.profit <= 0) warnings.push("No schedule earns a profit with these prices and costs. Raise prices, cut run costs, or widen availability.");
  return {
    exact, profit: plan.profit, revenue: plan.revenue, runCost: plan.runCost,
    opened: rows.filter((r) => r.open).length, slotsTotal: m,
    placed: placed.length - unplaced.length, studentsTotal: placed.length,
    baseline: baseProfit, gainVsAll: plan.profit - baseProfit,
    rows, assignments: placed, unplaced: unplacedDetail, warnings,
    everythingFeasible: everything.feasible,
  };
}

export function reportCsv(r) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = "slot,decision,students,capacity,minimum,cost_to_run,revenue,profit_change_if_flipped";
  const body = r.rows.map((x) => [x.slot, x.open ? "run" : "skip", x.students, x.capacity, x.min, x.cost, x.revenue.toFixed(2), x.flipDelta === null ? "" : x.flipDelta.toFixed(2)].map(q).join(","));
  const seats = ["", "student,price,slot", ...r.assignments.map((a) => [a.name, a.price, a.slot || "unplaced"].map(q).join(","))];
  return [head, ...body, ...seats].join("\n");
}

export function sampleText() {
  const slots = ["Mon 4pm", "Mon 5pm", "Tue 4pm", "Wed 4pm", "Wed 5pm", "Thu 4pm", "Thu 5pm", "Sat 10am", "Sat 11am"];
  const slotText = ["slot,capacity,min,cost", ...slots.map((s, i) => `${s},6,3,${s.startsWith("Sat") ? 55 : 40 + (i % 2) * 5}`)].join("\n");
  const rnd = mulberry32(2024);
  const students = ["name,price,slots"];
  for (let i = 1; i <= 34; i++) {
    const k = 1 + Math.floor(rnd() * 3);
    const picks = new Set();
    while (picks.size < k) picks.add(slots[Math.floor(rnd() * slots.length)]);
    students.push(`Student ${i},${[22, 25, 28, 30][Math.floor(rnd() * 4)]},${[...picks].join(";")}`);
  }
  return { slots: slotText, students: students.join("\n") };
}
