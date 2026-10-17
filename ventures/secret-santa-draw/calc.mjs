// Secret Santa draw engine. Pure functions, no I/O, no network.
//
// A draw is a permutation: assign[i] = the index of the person i gives to.
// Rules: nobody draws themselves; people in the same group (couples, families)
// do not draw each other; last year's pairs are not repeated; and a mode says
// whether two people may swap ("any"), may not ("noswap"), or whether the whole
// draw must form one big loop ("loop": A->B->C->...->A).

export const MODES = ["any", "noswap", "loop"];
export const MAX_PEOPLE = 200;
export const MAX_NAME = 60;
const SEARCH_BUDGET = 60000;

// Deterministic generator so one seed always yields the same draw in every browser.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function parseNames(text) {
  const names = [];
  const seen = new Set();
  const duplicates = [];
  const tooLong = [];
  for (const raw of String(text ?? "").split(/[\n,;]+/)) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > MAX_NAME) { tooLong.push(name.slice(0, 20) + "…"); continue; }
    if (seen.has(key(name))) { duplicates.push(name); continue; }
    seen.add(key(name));
    names.push(name);
  }
  const errors = [];
  if (duplicates.length) errors.push(`Each name must be different. Repeated: ${duplicates.join(", ")}. Add a last initial, e.g. "Sam B." and "Sam K.".`);
  if (tooLong.length) errors.push(`Names must be ${MAX_NAME} characters or fewer.`);
  if (names.length > MAX_PEOPLE) errors.push(`At most ${MAX_PEOPLE} people.`);
  return { names, duplicates, errors };
}

function indexer(names) {
  const map = new Map(names.map((n, i) => [key(n), i]));
  return (s) => map.get(key(s));
}

// One group per line: "Ann, Ben" means Ann and Ben may not draw each other.
export function parseGroups(text, names) {
  const at = indexer(names);
  const groups = [];
  const errors = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    const idx = [];
    for (const part of line.split(/[,;&]+/)) {
      if (!part.trim()) continue;
      const i = at(part);
      if (i === undefined) errors.push(`"${part.trim()}" is in a can't-draw group but not in the names list.`);
      else if (!idx.includes(i)) idx.push(i);
    }
    if (idx.length >= 2) groups.push(idx);
    else if (idx.length === 1 && !errors.length) errors.push(`A group needs at least two names: "${line.trim()}".`);
  }
  return { groups, errors };
}

// One pair per line: "Ann > Ben" means Ann gave to Ben last time.
export function parsePrevious(text, names) {
  const at = indexer(names);
  const pairs = [];
  const errors = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(/\s*(?:->|=>|>|→)\s*/);
    if (parts.length !== 2) { errors.push(`Write last year's pairs as "Giver > Receiver": "${line.trim()}".`); continue; }
    const a = at(parts[0]);
    const b = at(parts[1]);
    if (a === undefined || b === undefined) { errors.push(`"${line.trim()}" names someone who is not in the list.`); continue; }
    pairs.push([a, b]);
  }
  return { pairs, errors };
}

export function buildAllowed(n, groups = [], previous = []) {
  const ok = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i !== j));
  for (const g of groups) for (const a of g) for (const b of g) if (a !== b && ok[a]?.[b] !== undefined) ok[a][b] = false;
  for (const [a, b] of previous) if (ok[a]?.[b] !== undefined) ok[a][b] = false;
  return ok;
}

function cycleCount(assign) {
  const seen = new Array(assign.length).fill(false);
  let cycles = 0;
  for (let i = 0; i < assign.length; i++) {
    if (seen[i]) continue;
    cycles++;
    for (let j = i; !seen[j]; j = assign[j]) seen[j] = true;
  }
  return cycles;
}

export function validateDraw(assign, allowed, mode = "noswap") {
  const n = assign.length;
  if (n !== allowed.length) return false;
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const j = assign[i];
    if (!Number.isInteger(j) || j < 0 || j >= n || used.has(j) || !allowed[i][j]) return false;
    used.add(j);
  }
  if (mode === "noswap" || mode === "loop") for (let i = 0; i < n; i++) if (assign[assign[i]] === i) return false;
  if (mode === "loop" && cycleCount(assign) !== 1) return false;
  return true;
}

// Maximum bipartite matching (Kuhn). Returns {match} when every giver is matched,
// otherwise the set of givers that cannot all be served and the receivers they can reach.
function matching(allowed) {
  const n = allowed.length;
  const rec = new Array(n).fill(-1);
  const tryGive = (u, seen) => {
    for (let v = 0; v < n; v++) {
      if (!allowed[u][v] || seen[v]) continue;
      seen[v] = true;
      if (rec[v] === -1 || tryGive(rec[v], seen)) { rec[v] = u; return true; }
    }
    return false;
  };
  for (let u = 0; u < n; u++) {
    const seen = new Array(n).fill(false);
    if (!tryGive(u, seen)) {
      // Alternating reachability from u: the givers S reach receivers N with |N| < |S|.
      const S = new Set([u]);
      const N = new Set();
      const queue = [u];
      while (queue.length) {
        const g = queue.shift();
        for (let v = 0; v < n; v++) {
          if (!allowed[g][v] || N.has(v)) continue;
          N.add(v);
          const holder = rec[v];
          if (holder !== -1 && !S.has(holder)) { S.add(holder); queue.push(holder); }
        }
      }
      return { ok: false, givers: [...S].sort((a, b) => a - b), receivers: [...N].sort((a, b) => a - b) };
    }
  }
  const assign = new Array(n);
  rec.forEach((u, v) => { assign[u] = v; });
  return { ok: true, assign };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomPermutation(n, rng) {
  return shuffle(Array.from({ length: n }, (_, i) => i), rng);
}

// A uniformly random single loop as an assignment.
function randomLoop(n, rng) {
  const order = randomPermutation(n, rng);
  const assign = new Array(n);
  for (let k = 0; k < n; k++) assign[order[k]] = order[(k + 1) % n];
  return assign;
}

function backtrackAssign(allowed, noswap, rng) {
  const n = allowed.length;
  const assign = new Array(n).fill(-1);
  const taken = new Array(n).fill(false);
  let nodes = 0;
  const options = (g) => {
    const out = [];
    for (let r = 0; r < n; r++) {
      if (!allowed[g][r] || taken[r]) continue;
      if (noswap && assign[r] === g) continue;
      out.push(r);
    }
    return out;
  };
  const go = (left) => {
    if (left === 0) return true;
    if (++nodes > SEARCH_BUDGET) return null;
    let best = -1;
    let bestOpts = null;
    for (let g = 0; g < n; g++) {
      if (assign[g] !== -1) continue;
      const o = options(g);
      if (o.length === 0) return false;
      if (!bestOpts || o.length < bestOpts.length) { best = g; bestOpts = o; if (o.length === 1) break; }
    }
    shuffle(bestOpts, rng);
    for (const r of bestOpts) {
      assign[best] = r; taken[r] = true;
      const res = go(left - 1);
      if (res !== false) { if (res === true) return true; return null; }
      assign[best] = -1; taken[r] = false;
    }
    return false;
  };
  const res = go(n);
  return res === true ? { assign } : { exhausted: res === false };
}

function backtrackLoop(allowed, rng) {
  const n = allowed.length;
  const visited = new Array(n).fill(false);
  const path = [0];
  visited[0] = true;
  let nodes = 0;
  const prune = n <= 40;
  const stuck = (cur) => {
    // Every unvisited node still needs someone who can hand to it, and someone it can hand on to.
    for (let v = 0; v < n; v++) {
      if (visited[v]) continue;
      let inc = allowed[cur][v];
      let out = allowed[v][0];
      for (let w = 0; w < n && !(inc && out); w++) {
        if (w === v) continue;
        if (!visited[w]) { inc = inc || allowed[w][v]; out = out || allowed[v][w]; }
      }
      if (!inc || !out) return true;
    }
    return false;
  };
  const go = () => {
    if (path.length === n) return allowed[path[n - 1]][0] ? true : false;
    if (++nodes > SEARCH_BUDGET) return null;
    const cur = path[path.length - 1];
    const next = [];
    for (let v = 0; v < n; v++) if (!visited[v] && allowed[cur][v]) next.push(v);
    shuffle(next, rng);
    for (const v of next) {
      visited[v] = true; path.push(v);
      if (!(prune && stuck(v))) {
        const res = go();
        if (res === true) return true;
        if (res === null) return null;
      }
      visited[v] = false; path.pop();
    }
    return false;
  };
  const res = go();
  if (res !== true) return { exhausted: res === false };
  const assign = new Array(n);
  for (let k = 0; k < n; k++) assign[path[k]] = path[(k + 1) % n];
  return { assign };
}

function describeBlock(names, m) {
  const who = m.givers.map((i) => names[i]);
  const to = m.receivers.map((i) => names[i]);
  if (to.length === 0) return `${who[0]} has nobody left to give to. Remove a group or a last-year pair that involves them.`;
  return `${list(who)} can only give to ${list(to)}, which is not enough people for all of them. Loosen a can't-draw group or a last-year pair among these names.`;
}

function list(a) {
  if (a.length <= 1) return a.join("");
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
}

// The one entry point. Returns {ok:true, assign} or {ok:false, reason, message}.
export function draw({ names, allowed, mode = "noswap", rng }) {
  const n = names.length;
  if (!MODES.includes(mode)) return { ok: false, reason: "mode", message: "Unknown rule." };
  if (n < 2) return { ok: false, reason: "few", message: "Add at least two names." };
  if (n < 3 && mode !== "any") return { ok: false, reason: "few", message: "With only two people the only possible draw is a swap. Choose \"swaps allowed\" or add a person." };
  const base = matching(allowed);
  if (!base.ok) return { ok: false, reason: "impossible", message: describeBlock(names, base) };

  const accept = (a) => validateDraw(a, allowed, mode);
  const tries = mode === "any" ? 400 : 1500;
  for (let t = 0; t < tries; t++) {
    const cand = mode === "loop" ? randomLoop(n, rng) : randomPermutation(n, rng);
    if (accept(cand)) return { ok: true, assign: cand, method: "random" };
  }
  const found = mode === "loop" ? backtrackLoop(allowed, rng) : backtrackAssign(allowed, mode === "noswap", rng);
  if (found.assign && accept(found.assign)) return { ok: true, assign: found.assign, method: "search" };

  const advice = [];
  if (mode === "loop") {
    const alt = backtrackAssign(allowed, true, rng);
    if (alt.assign) advice.push("It works if you drop the single-loop rule.");
  }
  if (mode !== "any") {
    const alt = backtrackAssign(allowed, false, rng);
    if (alt.assign) advice.push("It works if you allow two people to swap gifts.");
  }
  const stop = found.exhausted
    ? "No draw satisfies every rule at once."
    : "The search gave up before finding a draw.";
  return { ok: false, reason: found.exhausted ? "impossible" : "search-limit", message: `${stop} ${advice.join(" ")}`.trim() };
}

// Count every valid draw (small groups only): used in tests and the guide's worked example.
export function countDraws(allowed, mode = "noswap") {
  const n = allowed.length;
  if (n > 9) throw new Error("countDraws is for small groups only");
  const assign = new Array(n).fill(-1);
  const taken = new Array(n).fill(false);
  let count = 0;
  const go = (g) => {
    if (g === n) { if (validateDraw(assign, allowed, mode)) count++; return; }
    for (let r = 0; r < n; r++) {
      if (taken[r] || !allowed[g][r]) continue;
      assign[g] = r; taken[r] = true;
      go(g + 1);
      taken[r] = false;
    }
  };
  go(0);
  return count;
}

// ---- group links: everything needed to recompute the draw, in the URL fragment ----

const b64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeGroup(g) {
  return b64(JSON.stringify({
    v: 1, t: g.title || "", n: g.names, g: g.groups || [], p: g.previous || [],
    m: g.mode, s: g.seed >>> 0, b: g.budget || "", d: g.date || "", x: g.note || "",
  }));
}

const intPairOk = (p, n) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isInteger(v) && v >= 0 && v < n);

export function decodeGroup(text) {
  let o;
  try { o = JSON.parse(unb64(String(text).replace(/^#?d=/, ""))); } catch { return { error: "This link is damaged or incomplete. Ask the organizer to send it again." }; }
  if (!o || o.v !== 1 || !Array.isArray(o.n) || o.n.length < 2 || o.n.length > MAX_PEOPLE || !o.n.every((s) => typeof s === "string" && s.length > 0 && s.length <= MAX_NAME)) return { error: "This link is not a draw this page understands." };
  const n = o.n.length;
  const groups = Array.isArray(o.g) ? o.g : [];
  const previous = Array.isArray(o.p) ? o.p : [];
  if (!groups.every((g) => Array.isArray(g) && g.every((v) => Number.isInteger(v) && v >= 0 && v < n))) return { error: "This link is not a draw this page understands." };
  if (!previous.every((p) => intPairOk(p, n))) return { error: "This link is not a draw this page understands." };
  if (!MODES.includes(o.m) || !Number.isInteger(o.s)) return { error: "This link is not a draw this page understands." };
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  return { group: { title: str(o.t, 80), names: o.n, groups, previous, mode: o.m, seed: o.s >>> 0, budget: str(o.b, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(o.d) ? o.d : "", note: str(o.x, 300) } };
}

// Recompute the draw a link describes. Same link, same answer, on every device.
export function resolveGroup(g) {
  const allowed = buildAllowed(g.names.length, g.groups, g.previous);
  return draw({ names: g.names, allowed, mode: g.mode, rng: mulberry32(g.seed) });
}

export function pairsOf(names, assign) {
  return assign.map((r, i) => [names[i], names[r]]);
}

export function pairsText(names, assign) {
  return pairsOf(names, assign).map(([a, b]) => `${a} > ${b}`).join("\n");
}

export function pairsCsv(names, assign) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["giver,receiver", ...pairsOf(names, assign).map(([a, b]) => `${q(a)},${q(b)}`)].join("\n") + "\n";
}

// An all-day calendar event for the exchange date.
export function exchangeIcs({ title, date, stamp, giftee }) {
  const d = date.replace(/-/g, "");
  const next = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, "");
  const esc = (s) => String(s).replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//secret-santa-draw//EN", "BEGIN:VEVENT",
    `UID:${d}-${esc(title || "gift-exchange").replace(/\W+/g, "-")}@secret-santa-draw`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(title || "Gift exchange")}`,
    `DESCRIPTION:${esc(giftee ? `Your person: ${giftee}` : "Gift exchange")}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

export const EXAMPLE = {
  title: "Office gift swap",
  names: "Ann\nBen\nCara\nDev\nEli\nFay\nGus\nHana",
  groups: "Ann, Ben\nCara, Dev",
  previous: "Eli > Fay\nFay > Gus\nGus > Hana\nHana > Eli",
  mode: "noswap",
  budget: "$25",
};
