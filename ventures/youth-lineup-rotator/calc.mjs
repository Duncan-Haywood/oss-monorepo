// Youth-sports lineup rotator: who plays where in each period so every kid gets
// fair playing time, nobody sits twice in a row, and the keeper job is shared.
// Pure functions, no DOM, no network. Deterministic for a given seed.

export const PRESETS = {
  soccer7: { label: "Soccer 7v7", slots: "GK, DEF x2, MID x2, FWD x2", periods: 4, minutes: 12 },
  soccer9: { label: "Soccer 9v9", slots: "GK, DEF x3, MID x3, FWD x2", periods: 4, minutes: 12 },
  soccer11: { label: "Soccer 11v11", slots: "GK, DEF x4, MID x4, FWD x2", periods: 2, minutes: 30 },
  soccer5: { label: "Soccer 5v5", slots: "GK, DEF x2, FWD x2", periods: 4, minutes: 10 },
  basketball: { label: "Basketball 5v5", slots: "Guard x2, Wing x2, Post", periods: 4, minutes: 8 },
  hockey: { label: "Ice hockey (skaters + goalie)", slots: "G, D x2, C, W x2", periods: 3, minutes: 15 },
  lacrosse: { label: "Lacrosse 10v10", slots: "G, D x3, M x3, A x3", periods: 4, minutes: 12 },
  volleyball: { label: "Volleyball 6v6", slots: "Setter, Outside x2, Middle x2, Opposite", periods: 3, minutes: 25 },
};

const KEEPER = /^(gk|goalie|goalkeeper|keeper|g|catcher|pitcher)$/i;

export const EXAMPLE = {
  preset: "soccer7",
  players: [
    "Ana | skill: 4 | can: GK, DEF, MID",
    "Ben | skill: 2",
    "Cy | skill: 3 | not: GK",
    "Dee | skill: 5",
    "Eli | skill: 3 | late: 1",
    "Fay | skill: 2 | not: GK",
    "Gus | skill: 4",
    "Hal | skill: 3 | sat: 2",
    "Ivy | skill: 3",
    "Jo | skill: 1 | not: GK, FWD",
    "Kit | skill: 3 | leaves: 3",
  ].join("\n"),
};

export function parseSlots(text) {
  const errors = [];
  const slots = [];
  for (const raw of String(text || "").split(/[,\n;]/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^(.*?)(?:\s+x|\s*×)\s*(\d+)$/i) || tok.match(/^(\d+)\s*[x×]?\s+(.*)$/i);
    let name = tok;
    let n = 1;
    if (m) {
      if (/^\d+$/.test(m[1])) { n = Number(m[1]); name = m[2]; } else { name = m[1]; n = Number(m[2]); }
    }
    name = name.trim();
    if (!name || n < 1 || n > 20) { errors.push(`Could not read the position "${tok}". Write it like DEF x2.`); continue; }
    for (let i = 0; i < n; i++) slots.push(name);
  }
  if (!slots.length && !errors.length) errors.push("Add the positions on the field, for example GK, DEF x2, MID x2, FWD x2.");
  if (slots.length > 25) errors.push("That is more than 25 players on the field at once.");
  return { slots, errors };
}

const posKey = (s) => s.toLowerCase();

// "Name | skill: 4 | can: GK, DEF | not: GK | late: 2 | leaves: 3 | sat: 1"
export function parsePlayers(text, slotNames, periods) {
  const errors = [];
  const known = new Map();
  for (const s of slotNames) known.set(posKey(s), s);
  let lines = String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].includes("|") && lines[0].includes(",")) lines = lines[0].split(",").map((l) => l.trim()).filter(Boolean);
  const players = [];
  const seen = new Set();
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    if (seen.has(name.toLowerCase())) { errors.push(`${name} is listed twice.`); continue; }
    seen.add(name.toLowerCase());
    const p = { name, skill: 3, can: null, not: new Set(), late: 0, leaves: periods, sat: 0 };
    for (const attr of parts.slice(1)) {
      const m = attr.match(/^([a-z]+)\s*:\s*(.*)$/i);
      if (!m) { if (attr) errors.push(`${name}: could not read "${attr}". Use skill:, can:, not:, late:, leaves: or sat:.`); continue; }
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "skill" || key === "late" || key === "leaves" || key === "sat") {
        const v = Number(val);
        if (!Number.isFinite(v) || val === "") { errors.push(`${name}: ${key} needs a number.`); continue; }
        if (key === "skill") p.skill = Math.min(5, Math.max(1, v));
        if (key === "late") p.late = Math.min(periods, Math.max(0, Math.floor(v)));
        if (key === "leaves") p.leaves = Math.min(periods, Math.max(0, Math.floor(v)));
        if (key === "sat") p.sat = Math.min(4, Math.max(0, v));
      } else if (key === "can" || key === "not") {
        const set = new Set();
        for (const w of val.split(/[,/]/).map((w) => w.trim()).filter(Boolean)) {
          const hit = known.get(posKey(w));
          if (!hit) errors.push(`${name}: "${w}" is not a position on this field (${[...new Set(slotNames)].join(", ")}).`);
          else set.add(hit);
        }
        if (key === "can") p.can = set; else p.not = set;
      } else errors.push(`${name}: unknown setting "${key}".`);
    }
    players.push(p);
  }
  if (players.length < 2) errors.push("Add at least two players.");
  return { players, errors };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildContext(players, slotNames, periods, options = {}) {
  const names = [...new Set(slotNames)];
  const nameOf = slotNames.map((s) => names.indexOf(s));
  const okPos = players.map((p) => names.map((n) => (p.can ? p.can.has(n) : true) && !p.not.has(n)));
  const avail = players.map((p) => Array.from({ length: periods }, (_, t) => t >= p.late && t < p.leaves));
  return {
    players, slotNames, names, nameOf, periods, okPos, avail,
    keeperMax: options.keeperMax ?? 1,
    balance: options.balance ?? 1,
    isKeeper: names.map((n) => KEEPER.test(n)),
  };
}

const eligible = (ctx, p, t, s) => ctx.avail[p][t] && ctx.okPos[p][ctx.nameOf[s]];

// Lower is better. Weights are ordered so that filling the field beats fair
// time, which beats back-to-back benching, which beats variety and balance.
export function lineupCost(ctx, grid) {
  const { players, periods, names } = ctx;
  const N = players.length;
  const S = ctx.slotNames.length;
  let cost = 0;
  const played = new Array(N).fill(0);
  const onField = Array.from({ length: periods }, () => new Array(N).fill(false));
  const count = Array.from({ length: N }, () => new Array(names.length).fill(0));
  const strength = new Array(periods).fill(0);
  const last = new Array(N).fill(-1);
  for (let t = 0; t < periods; t++) {
    for (let s = 0; s < S; s++) {
      const p = grid[t][s];
      if (p < 0) { cost += 1e6; continue; }
      played[p]++;
      onField[t][p] = true;
      count[p][ctx.nameOf[s]]++;
      strength[t] += players[p].skill;
      if (last[p] === ctx.nameOf[s] && onField[t - 1]?.[p]) cost += 15;
    }
    for (let p = 0; p < N; p++) last[p] = -1;
    for (let s = 0; s < S; s++) if (grid[t][s] >= 0) last[grid[t][s]] = ctx.nameOf[s];
  }
  for (let p = 0; p < N; p++) {
    let avail = 0;
    let run = 0;
    for (let t = 0; t < periods; t++) {
      if (!ctx.avail[p][t]) { run = 0; continue; }
      avail++;
      if (!onField[t][p]) { if (run > 0) cost += 400; run++; } else run = 0;
    }
    const eff = avail - played[p] + 0.5 * players[p].sat;
    cost += 100 * eff * eff;
    for (let n = 0; n < names.length; n++) {
      const c = count[p][n];
      cost += 10 * c * c;
      if (ctx.isKeeper[n] && c > ctx.keeperMax) cost += 3000 * (c - ctx.keeperMax);
    }
  }
  if (ctx.balance > 0) {
    const mean = strength.reduce((a, b) => a + b, 0) / periods;
    for (const v of strength) cost += 8 * ctx.balance * (v - mean) ** 2;
  }
  return cost;
}

function greedy(ctx, rng) {
  const { players, periods } = ctx;
  const N = players.length;
  const S = ctx.slotNames.length;
  const played = players.map((p) => -0.5 * p.sat);
  const grid = [];
  for (let t = 0; t < periods; t++) {
    const row = new Array(S).fill(-1);
    const used = new Set();
    const order = Array.from({ length: S }, (_, s) => s);
    const cands = (s) => players.map((_, p) => p).filter((p) => eligible(ctx, p, t, s)).length;
    order.sort((a, b) => cands(a) - cands(b) || a - b);
    for (const s of order) {
      let best = -1;
      let bv = Infinity;
      for (let p = 0; p < N; p++) {
        if (used.has(p) || !eligible(ctx, p, t, s)) continue;
        const v = played[p] + rng() * 0.4;
        if (v < bv) { bv = v; best = p; }
      }
      if (best >= 0) { row[s] = best; used.add(best); }
    }
    for (const p of used) played[p]++;
    grid.push(row);
  }
  return grid;
}

function anneal(ctx, rng, iters) {
  const { periods } = ctx;
  const N = ctx.players.length;
  const S = ctx.slotNames.length;
  let grid = greedy(ctx, rng);
  let cost = lineupCost(ctx, grid);
  let best = grid.map((r) => r.slice());
  let bestCost = cost;
  for (let i = 0; i < iters; i++) {
    const temp = 300 * (1 - i / iters) + 1;
    const t = Math.floor(rng() * periods);
    const row = grid[t];
    const s1 = Math.floor(rng() * S);
    let undo;
    if (rng() < 0.45 && S > 1) {
      const s2 = Math.floor(rng() * S);
      if (s1 === s2) continue;
      const a = row[s1];
      const b = row[s2];
      if ((a >= 0 && !eligible(ctx, a, t, s2)) || (b >= 0 && !eligible(ctx, b, t, s1))) continue;
      row[s1] = b; row[s2] = a;
      undo = () => { row[s1] = a; row[s2] = b; };
    } else {
      const q = Math.floor(rng() * N);
      if (!eligible(ctx, q, t, s1)) continue;
      const at = row.indexOf(q);
      const a = row[s1];
      if (at === s1) continue;
      if (at >= 0) {
        // q is already on the field this period: swap places.
        if (a >= 0 && !eligible(ctx, a, t, at)) continue;
        row[s1] = q; row[at] = a;
        undo = () => { row[s1] = a; row[at] = q; };
      } else {
        row[s1] = q;
        undo = () => { row[s1] = a; };
      }
    }
    const next = lineupCost(ctx, grid);
    if (next <= cost || rng() < Math.exp((cost - next) / temp)) {
      cost = next;
      if (cost < bestCost) { bestCost = cost; best = grid.map((r) => r.slice()); }
    } else undo();
  }
  return { grid: best, cost: bestCost };
}

export function buildLineup(spec) {
  const ctx = buildContext(spec.players, spec.slotNames, spec.periods, spec);
  const seed = spec.seed ?? 1;
  const restarts = spec.restarts ?? 5;
  const iters = spec.iterations ?? 25000;
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const res = anneal(ctx, mulberry32(seed * 7919 + r * 104729 + 1), iters);
    if (!best || res.cost < best.cost) best = res;
  }
  return summarise(ctx, best.grid, best.cost);
}

export function summarise(ctx, grid, cost = lineupCost(ctx, grid)) {
  const { players, periods, slotNames } = ctx;
  const N = players.length;
  const stats = players.map((p, i) => {
    const slots = [];
    let played = 0;
    let avail = 0;
    let maxBenchRun = 0;
    let run = 0;
    const positions = {};
    for (let t = 0; t < periods; t++) {
      const s = grid[t].indexOf(i);
      if (!ctx.avail[i][t]) { slots.push(null); run = 0; continue; }
      avail++;
      if (s >= 0) { played++; slots.push(slotNames[s]); positions[slotNames[s]] = (positions[slotNames[s]] || 0) + 1; run = 0; }
      else { slots.push("bench"); run++; maxBenchRun = Math.max(maxBenchRun, run); }
    }
    return { name: p.name, played, avail, bench: avail - played, maxBenchRun, slots, positions };
  });
  const unfilled = [];
  for (let t = 0; t < periods; t++) for (let s = 0; s < slotNames.length; s++) if (grid[t][s] < 0) unfilled.push({ period: t + 1, position: slotNames[s] });
  const subs = [];
  for (let t = 1; t < periods; t++) {
    const was = new Set(grid[t - 1].filter((p) => p >= 0));
    const now = new Set(grid[t].filter((p) => p >= 0));
    subs.push({
      period: t + 1,
      on: [...now].filter((p) => !was.has(p)).map((p) => players[p].name),
      off: [...was].filter((p) => !now.has(p)).map((p) => players[p].name),
    });
  }
  const warnings = [];
  if (unfilled.length) warnings.push(`${unfilled.length} position${unfilled.length > 1 ? "s" : ""} could not be filled: ${unfilled.slice(0, 6).map((u) => `${u.position} in period ${u.period}`).join(", ")}${unfilled.length > 6 ? ", ..." : ""}. Too few available players are allowed there.`);
  const twice = stats.filter((s) => s.maxBenchRun >= 2);
  if (twice.length) warnings.push(`${twice.map((s) => s.name).join(", ")} sit${twice.length === 1 ? "s" : ""} two periods in a row; with this many players and restrictions it could not be avoided.`);
  ctx.names.forEach((n, ni) => {
    if (!ctx.isKeeper[ni]) return;
    const over = stats.filter((s) => (s.positions[n] || 0) > ctx.keeperMax);
    if (over.length) warnings.push(`${over.map((s) => s.name).join(", ")} must play ${n} more than ${ctx.keeperMax} period${ctx.keeperMax > 1 ? "s" : ""}: not enough players are allowed in that spot.`);
  });
  const playedAll = stats.filter((s) => s.avail === periods).map((s) => s.played);
  const spread = playedAll.length ? Math.max(...playedAll) - Math.min(...playedAll) : 0;
  const strength = grid.map((row) => row.reduce((a, p) => a + (p >= 0 ? players[p].skill : 0), 0));
  return { grid, cost, stats, unfilled, subs, warnings, spread, strength, periods, slotNames, playerNames: players.map((p) => p.name), N };
}

// Check every hard rule; returns a list of problems (empty = valid).
export function validateLineup(ctx, grid) {
  const problems = [];
  for (let t = 0; t < ctx.periods; t++) {
    const seen = new Set();
    for (let s = 0; s < ctx.slotNames.length; s++) {
      const p = grid[t][s];
      if (p < 0) continue;
      if (seen.has(p)) problems.push(`${ctx.players[p].name} is in two places in period ${t + 1}`);
      seen.add(p);
      if (!ctx.avail[p][t]) problems.push(`${ctx.players[p].name} is not there in period ${t + 1}`);
      if (!ctx.okPos[p][ctx.nameOf[s]]) problems.push(`${ctx.players[p].name} cannot play ${ctx.slotNames[s]}`);
    }
  }
  return problems;
}

// League minimum-play rule ("every child plays at least half the game"):
// `fraction` of the periods the whole game has, rounded up. A child who is only
// there for part of the game is never asked for more than they can play.
// Returns the children who fall short.
export function minPlayCheck(result, fraction) {
  const f = Number(fraction);
  if (!(f > 0 && f <= 1)) return [];
  const short = [];
  for (const s of result.stats) {
    if (s.avail === 0) continue;
    const need = Math.min(s.avail, Math.ceil(f * result.periods - 1e-9));
    if (s.played < need) short.push({ name: s.name, played: s.played, need, avail: s.avail });
  }
  return short;
}

export function minPlayWarning(short, fraction) {
  if (!short.length) return null;
  const pct = Math.round(Number(fraction) * 100);
  return `Minimum play of ${pct}% is not met for ${short.map((x) => `${x.name} (${x.played} of ${x.need} periods)`).join(", ")}. Too many children are restricted to share the field; change the restrictions or check your league's rule.`;
}

export function periodTable(result) {
  return Array.from({ length: result.periods }, (_, t) => result.slotNames.map((pos, s) => ({ pos, player: result.grid[t][s] >= 0 ? result.playerNames[result.grid[t][s]] : null })));
}

export function lineupText(result, { minutes = 0, title = "" } = {}) {
  const lines = [];
  if (title) lines.push(title);
  for (let t = 0; t < result.periods; t++) {
    lines.push(`Period ${t + 1}: ` + periodTable(result)[t].map((c) => `${c.pos} ${c.player || "?"}`).join(", "));
    const bench = result.stats.filter((s) => s.slots[t] === "bench").map((s) => s.name);
    lines.push(`  Bench: ${bench.length ? bench.join(", ") : "nobody"}`);
    if (t > 0) {
      const sub = result.subs[t - 1];
      lines.push(`  Subs: ${sub.on.length ? sub.on.join(", ") + " on" : "none"}${sub.off.length ? "; " + sub.off.join(", ") + " off" : ""}`);
    }
  }
  lines.push("");
  for (const s of result.stats) {
    const mins = minutes ? `, ${s.played * minutes} min` : "";
    lines.push(`${s.name}: ${s.played} of ${s.avail} periods${mins}`);
  }
  return lines.join("\n");
}

export function lineupCsv(result) {
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [["Player", ...Array.from({ length: result.periods }, (_, t) => `Period ${t + 1}`), "Played", "Available"].map(q).join(",")];
  for (const s of result.stats) rows.push([s.name, ...s.slots.map((x) => x ?? "absent"), s.played, s.avail].map((v) => q(String(v))).join(","));
  return rows.join("\n");
}

// Roster lines for the next game: how many periods each kid sat this time.
export function carryOverText(players, result) {
  return players.map((p, i) => {
    const bits = [p.name];
    if (p.skill !== 3) bits.push(`skill: ${p.skill}`);
    if (p.can) bits.push(`can: ${[...p.can].join(", ")}`);
    if (p.not.size) bits.push(`not: ${[...p.not].join(", ")}`);
    const sat = result.stats[i].bench;
    if (sat > 0) bits.push(`sat: ${sat}`);
    return bits.join(" | ");
  }).join("\n");
}

export function playerMessages(result, { minutes = 0 } = {}) {
  return result.stats.map((s) => {
    const plan = s.slots.map((x, t) => `P${t + 1} ${x === null ? "-" : x}`).join(", ");
    return `Hi ${s.name}'s family: today ${s.name} plays ${s.played} of ${s.avail} periods${minutes ? ` (${s.played * minutes} min)` : ""}. ${plan}.`;
  });
}

export function encodeSetup(setup) {
  const bytes = new TextEncoder().encode(JSON.stringify(setup));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSetup(text) {
  try {
    const b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes));
    if (!v || typeof v !== "object" || typeof v.players !== "string") return { error: "That link is not a lineup setup." };
    return { setup: v };
  } catch {
    return { error: "That link could not be read." };
  }
}
