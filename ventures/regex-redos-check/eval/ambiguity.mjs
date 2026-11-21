// An exact exponential-backtracking oracle for small regular expressions, used to
// measure engine.mjs's static heuristic (see ambiguity.diff.test.mjs and
// eval/README.md). Node only, no dependencies, MIT.
//
// Method. A backtracking engine that fails to match explores every parse of
// every prefix of the input, so it takes exponential time on some input exactly
// when the parse automaton is exponentially ambiguous (EDA): some reachable state
// p has two different paths p -> p on the same word w. Then prefix . w^n . "!"
// has at least 2^n parses that all fail at "!". This is the criterion of
// Weideman, van der Merwe, Berglund and Watson, "Analyzing Matching Time Behavior
// of Backtracking Regular Expression Matchers by Using Ambiguity of NFA" (CIAA
// 2016, LNCS 9705, doi:10.1007/978-3-319-40946-7_27), with the EDA test of Allauzen, Mohri and Rastogi, "General
// algorithms for testing the ambiguity of finite automata and the double-tape
// ambiguity of finite-state transducers" (IJFCS 22, 2011, pp. 883-904): EDA iff the
// squared automaton has a strongly connected component holding a diagonal pair
// (p,p) and an off-diagonal pair. The code here is our own.
//
// The automaton is a Glushkov (position) automaton whose transitions carry
// multiplicities, so that (a*)* is ambiguous although its plain Glushkov
// automaton is not: the a -> a step can be taken by the inner loop or by the
// outer loop, and a backtracking engine tries both. Counting follows
// ECMAScript's RepeatMatcher: an iteration past the minimum may not match the
// empty string, so E* takes only E's non-empty parses.
//
// Scope: the generated grammar below (literals over {a,b,c}, the class [ab],
// concatenation, |, *, +, ?, non-capturing groups) and full-match use,
// ^(?:R)$. No backreferences, lookaround, lazy or bounded quantifiers.

// --- random regular expressions ---------------------------------------------

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEAVES = [{ t: "chr", set: "a" }, { t: "chr", set: "b" }, { t: "chr", set: "ab" }, { t: "chr", set: "c" }];
const LEAF_WEIGHTS = [5, 3, 2, 1];

export function randomRegex(rand, size = 6) {
  const pick = (arr, w) => {
    let r = rand() * w.reduce((x, y) => x + y, 0);
    for (let k = 0; k < arr.length; k += 1) { r -= w[k]; if (r < 0) return arr[k]; }
    return arr[arr.length - 1];
  };
  function gen(n) {
    if (n <= 1) return { ...pick(LEAVES, LEAF_WEIGHTS) };
    const op = pick(["seq", "alt", "star", "plus", "opt"], [4, 3, 2, 2, 1]);
    if (op === "seq" || op === "alt") {
      const k = 1 + Math.floor(rand() * (n - 1));
      return { t: op, a: gen(k), b: gen(n - k) };
    }
    return { t: op, a: gen(n - 1) };
  }
  return gen(size);
}

export function toSource(node) {
  switch (node.t) {
    case "chr": return node.set.length === 1 ? node.set : `[${node.set}]`;
    case "seq": return wrapAlt(node.a) + wrapAlt(node.b);
    case "alt": return `${toSource(node.a)}|${toSource(node.b)}`;
    default: {
      const q = { star: "*", plus: "+", opt: "?" }[node.t];
      const inner = node.a.t === "chr" ? toSource(node.a) : `(?:${toSource(node.a)})`;
      return inner + q;
    }
  }
}
const wrapAlt = (n) => (n.t === "alt" ? `(?:${toSource(n)})` : toSource(n));

// --- counted Glushkov automaton ---------------------------------------------

// Returns { labels: [null, set1, set2, ...], edges: Map("p,q" -> multiplicity) }.
// State 0 is the start; state x >= 1 is "just read position x".
export function buildAutomaton(ast) {
  const labels = [null];
  const follow = new Map();
  const addFollow = (x, y, k) => { if (!k) return; const key = `${x},${y}`; follow.set(key, (follow.get(key) || 0) + k); };
  const addAll = (into, from, k = 1) => { if (!k) return into; for (const [x, c] of from) into.set(x, (into.get(x) || 0) + c * k); return into; };
  const cross = (last, first) => { for (const [x, cx] of last) for (const [y, cy] of first) addFollow(x, y, cx * cy); };
  // first/last: Map(position -> number of parses), nul: number of empty parses.
  function go(n) {
    switch (n.t) {
      case "chr": { labels.push(n.set); const x = labels.length - 1; return { first: new Map([[x, 1]]), last: new Map([[x, 1]]), nul: 0 }; }
      case "alt": {
        const A = go(n.a); const B = go(n.b);
        return { first: addAll(addAll(new Map(), A.first), B.first), last: addAll(addAll(new Map(), A.last), B.last), nul: A.nul + B.nul };
      }
      case "seq": {
        const A = go(n.a); const B = go(n.b);
        cross(A.last, B.first);
        return { first: addAll(addAll(new Map(), A.first), B.first, A.nul), last: addAll(addAll(new Map(), B.last), A.last, B.nul), nul: A.nul * B.nul };
      }
      case "star": { const A = go(n.a); cross(A.last, A.first); return { first: A.first, last: A.last, nul: 1 }; }
      case "plus": {
        // E+ = E then E*: the first iteration may be empty, later ones may not.
        const A = go(n.a);
        cross(A.last, A.first);
        return { first: addAll(addAll(new Map(), A.first), A.first, A.nul), last: addAll(addAll(new Map(), A.last), A.last, A.nul), nul: A.nul };
      }
      case "opt": { const A = go(n.a); return { first: A.first, last: A.last, nul: 1 + A.nul }; }
      default: throw new Error(`unknown node ${n.t}`);
    }
  }
  const top = go(ast);
  for (const [y, c] of top.first) addFollow(0, y, c);
  return { labels, edges: follow };
}

// --- exponential ambiguity, with a witness ----------------------------------

const common = (s, t) => [...s].find((c) => t.includes(c)) ?? null;

// Returns null, or { state, prefix, pump } with two distinct paths state -> state
// on `pump` and `prefix` leading from the start to `state`.
export function findEDA({ labels, edges }) {
  const n = labels.length;
  const out = Array.from({ length: n }, () => []);
  for (const [key, m] of edges) { const [p, q] = key.split(",").map(Number); out[p].push({ q, m }); }
  // Words that reach each state from the start.
  const prefix = new Array(n).fill(null);
  prefix[0] = "";
  const queue = [0];
  while (queue.length) {
    const p = queue.shift();
    for (const { q } of out[p]) if (prefix[q] === null) { prefix[q] = prefix[p] + labels[q][0]; queue.push(q); }
  }
  // Pair graph search: from (q,r) find a word back to (p,p).
  const wordBack = (q, r, p) => {
    const seen = new Map([[`${q},${r}`, ""]]);
    const qu = [[q, r]];
    while (qu.length) {
      const [x, y] = qu.shift();
      const w = seen.get(`${x},${y}`);
      if (x === p && y === p) return w;
      for (const ex of out[x]) for (const ey of out[y]) {
        const c = common(labels[ex.q], labels[ey.q]);
        if (c === null) continue;
        const key = `${ex.q},${ey.q}`;
        if (!seen.has(key)) { seen.set(key, w + c); qu.push([ex.q, ey.q]); }
      }
    }
    return null;
  };
  for (let p = 1; p < n; p += 1) {
    if (prefix[p] === null) continue;
    const es = out[p];
    for (let i = 0; i < es.length; i += 1) {
      for (let j = i; j < es.length; j += 1) {
        if (i === j && es[i].m < 2) continue; // the same edge twice is one path unless it has multiplicity
        const c = common(labels[es[i].q], labels[es[j].q]);
        if (c === null) continue;
        const back = wordBack(es[i].q, es[j].q, p);
        if (back !== null) return { state: p, prefix: prefix[p], pump: c + back };
      }
    }
  }
  return null;
}

// --- timing the real engine ---------------------------------------------------

import vm from "node:vm";

export function timeMatch(source, input, timeoutMs = 200) {
  const re = new RegExp(source);
  const ctx = vm.createContext({ re, input, out: false });
  const start = process.hrtime.bigint();
  try {
    vm.runInContext("out = re.test(input)", ctx, { timeout: timeoutMs });
  } catch (err) {
    if (/timed out/i.test(String(err && err.message))) return { ms: timeoutMs, timedOut: true, matched: false };
    throw err;
  }
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, timedOut: false, matched: ctx.out };
}

// Pumps the witness until V8 takes >= 25 ms or times out; "confirmed" when the
// time at least doubles for every extra pump over the last steps.
export function confirmExponential(source, { prefix, pump }, { maxN = 40, timeoutMs = 200 } = {}) {
  let prev = null;
  for (let k = 4; k <= maxN; k += 2) {
    const r = timeMatch(source, prefix + pump.repeat(k) + "!", timeoutMs);
    if (r.matched) return { confirmed: false, reason: "matched", k };
    if (r.timedOut) return { confirmed: true, k, ms: r.ms, timedOut: true };
    if (r.ms >= 25 && prev && r.ms / Math.max(prev.ms, 0.01) >= 3) return { confirmed: true, k, ms: r.ms, timedOut: false };
    prev = r;
  }
  return { confirmed: false, reason: "no growth", k: maxN, ms: prev && prev.ms };
}
