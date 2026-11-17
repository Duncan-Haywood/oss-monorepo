// Stable matching: pair applicants with programmes (residents with
// hospitals, students with schools, mentees with mentors, volunteers with
// shifts) so that no applicant and programme would both rather have each
// other than what they got. From the papers: deferred acceptance (Gale &
// Shapley 1962) with either side proposing and capacities on the programme
// side, every stable matching listed by McVitie & Wilson's (1971) break-
// marriage search on the seat-expanded instance (Gusfield & Irving 1989,
// section 1.6), the egalitarian and minimum-regret choices among them
// (Irving, Leather & Gusfield 1987; Gusfield 1987), the rural hospitals
// theorem as a check (Roth 1984, 1986), and a blocking-pair test for a
// matching you already have.
//
// Pure functions, no DOM, no network, no randomness. Implemented from the
// papers; no third-party code was ported. The Python `matching` package
// (Wilde, Knight & Gillard 2020; MIT) was used only to produce
// eval/reference.json, which the tests compare against.

export const PAPERS = [
  {
    authors: "David Gale, Lloyd S. Shapley",
    title: "College Admissions and the Stability of Marriage",
    venue: "The American Mathematical Monthly 69(1), 9-15",
    year: 1962,
    url: "https://doi.org/10.1080/00029890.1962.11989827",
    doi: "10.1080/00029890.1962.11989827",
    implemented: "Deferred acceptance: each free member of the proposing side asks the next partner on its list; each receiver holds the best offers up to its capacity and rejects the rest; repeat until nobody free has anyone left to ask. The result is stable, and when applicants propose every applicant gets the best partner it has in any stable matching (applicant-optimal).",
    deviations: "Lists may be incomplete: a pair is acceptable only when each side lists the other, and a one-sided listing is dropped with a warning. Programmes may also propose; with capacities that is the programme-proposing version (each programme offers its free seats to the next applicants on its list).",
  },
  {
    authors: "D. G. McVitie, L. B. Wilson",
    title: "The stable marriage problem",
    venue: "Communications of the ACM 14(7), 486-490",
    year: 1971,
    url: "https://doi.org/10.1145/362619.362631",
    doi: "10.1145/362619.362631",
    implemented: "Every stable matching, by the break-marriage search: from the applicant-optimal matching, free applicant i (for each i at or after the last one broken), let its partner accept only someone she prefers, and continue deferred acceptance; if the chain ends with that partner taking a better offer the result is the next stable matching down, and the search recurses from it.",
    deviations: "Run on the seat-expanded one-to-one instance (each programme of capacity c becomes c seats ranked consecutively by every applicant), which has the same stable matchings as the original (Gusfield & Irving 1989, section 1.6). A chain also fails when an applicant reaches a seat that was empty, since by the rural hospitals theorem no stable matching fills it. A break started at applicant i also fails if it would displace an applicant listed before i, so each matching is reached once (a first version without that rule reached about 1 in 75 twice on random instances and blew up on large lattices); a set of seen matchings stays as a guard. The listing stops at a limit (default 5,000 matchings) and says so.",
  },
  {
    authors: "Alvin E. Roth",
    title: "The Evolution of the Labor Market for Medical Interns and Residents: A Case Study in Game Theory",
    venue: "Journal of Political Economy 92(6), 991-1016",
    year: 1984,
    url: "https://doi.org/10.1086/261272",
    doi: "10.1086/261272",
    implemented: "The many-to-one (hospitals with several positions) setting and its stability definition, including the observation that the same applicants are matched in every stable matching.",
    deviations: "Couples, and the other side constraints of the real residency match, are not handled.",
  },
  {
    authors: "Alvin E. Roth",
    title: "On the Allocation of Residents to Rural Hospitals: A General Property of Two-Sided Matching Markets",
    venue: "Econometrica 54(2), 425-427",
    year: 1986,
    url: "https://doi.org/10.2307/1913160",
    doi: "10.2307/1913160",
    implemented: "The rural hospitals theorem, checked on every result: each programme fills the same number of seats in every stable matching, and one left short gets exactly the same applicants in all of them. The page says so in words, since it means no stable rule can help an under-filled programme.",
    deviations: "None.",
  },
  {
    authors: "Alvin E. Roth",
    title: "The Economics of Matching: Stability and Incentives",
    venue: "Mathematics of Operations Research 7(4), 617-628",
    year: 1982,
    url: "https://doi.org/10.1287/moor.7.4.617",
    doi: "10.1287/moor.7.4.617",
    implemented: "Stated, not computed: under deferred acceptance the proposing side can never do better by misreporting its list, and no stable mechanism makes truth-telling safe for both sides. The page tells the reader which side that protects.",
    deviations: "None.",
  },
  {
    authors: "Lester E. Dubins, David A. Freedman",
    title: "Machiavelli and the Gale-Shapley Algorithm",
    venue: "The American Mathematical Monthly 88(7), 485-494",
    year: 1981,
    url: "https://doi.org/10.1080/00029890.1981.11995301",
    doi: "10.1080/00029890.1981.11995301",
    implemented: "Stated, not computed: no coalition of proposers can all gain by misreporting under proposer-proposing deferred acceptance.",
    deviations: "None.",
  },
  {
    authors: "Robert W. Irving, Paul Leather, Dan Gusfield",
    title: "An efficient algorithm for the \"optimal\" stable marriage",
    venue: "Journal of the ACM 34(3), 532-543",
    year: 1987,
    url: "https://doi.org/10.1145/28869.28871",
    doi: "10.1145/28869.28871",
    implemented: "The egalitarian stable matching: the one with the smallest total rank (1 = first choice) summed over everyone on both sides.",
    deviations: "Chosen from the full list of stable matchings rather than by the paper's rotation-poset minimum cut, so it is exact only when the listing finishes within its limit (the result says when it did not).",
  },
  {
    authors: "Dan Gusfield",
    title: "Three Fast Algorithms for Four Problems in Stable Marriage",
    venue: "SIAM Journal on Computing 16(1), 111-128",
    year: 1987,
    url: "https://doi.org/10.1137/0216010",
    doi: "10.1137/0216010",
    implemented: "The minimum-regret stable matching: the one whose worst-off person is as well off as possible (smallest maximum rank), ties broken by total rank.",
    deviations: "Chosen from the full list of stable matchings, as for the egalitarian one, rather than by the paper's direct algorithm.",
  },
  {
    authors: "Dan Gusfield, Robert W. Irving",
    title: "The Stable Marriage Problem: Structure and Algorithms",
    venue: "MIT Press (Foundations of Computing), ISBN 0-262-07118-5",
    year: 1989,
    url: "https://mitpress.mit.edu/9780262515528/the-stable-marriage-problem/",
    doi: null,
    implemented: "The reduction of the hospitals/residents problem to stable marriage by expanding each hospital into its seats, and the presentation of the break-marriage enumeration used here.",
    deviations: "None.",
  },
];

export const LIMITS = { agents: 2000, enumerate: 5000, enumerateWork: 20_000_000 };
export const DEFAULTS = { proposer: "A", enumerate: true, limit: 5000 };

export const SAMPLE_TEXT = `[applicants]
ana: city > mercy > general
ben: city > general
cal: mercy > city > general
dee: general > mercy > city
[programmes]
city (2): cal > ana > ben > dee
mercy: ana > dee > cal
general: ben > ana > cal > dee
`;
export const SAMPLE_INPUT = { text: SAMPLE_TEXT, proposer: "A" };

// ---------------------------------------------------------------- parsing

const HEADER = /^\[([^\]]*)\]\s*$/;
const CAPACITY = /^(.*?)\s*(?:\((\d+)\)|\*\s*(\d+))\s*$/;

/**
 * Parse preference lists. Two sections, each opened by a [header] line
 * naming the side; one line per member: `name: first > second > third`
 * (commas or `>` between names). A capacity goes after the name on the
 * second side: `city (2): ...`. Lines starting with # are comments.
 */
export function parseInstance(text) {
  const warnings = [];
  const sides = [];
  let cur = null;
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const h = line.match(HEADER);
    if (h) {
      if (sides.length === 2) throw new Error(`line ${idx + 1}: only two sides are allowed, found a third header [${h[1]}]`);
      cur = { label: h[1].trim() || (sides.length ? "B" : "A"), rows: [] };
      sides.push(cur);
      return;
    }
    if (!cur) throw new Error(`line ${idx + 1}: start with a [header] line naming the first side, e.g. [applicants]`);
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`line ${idx + 1}: expected "name: first > second", got "${line}"`);
    let name = line.slice(0, colon).trim();
    let cap = 1;
    const c = name.match(CAPACITY);
    if (c) {
      name = c[1].trim();
      cap = Number(c[2] ?? c[3]);
    }
    if (!name) throw new Error(`line ${idx + 1}: a member needs a name before the colon`);
    const rest = line.slice(colon + 1).trim();
    const prefs = rest ? rest.split(/\s*(?:>|,)\s*/).map((s) => s.trim()).filter(Boolean) : [];
    cur.rows.push({ name, cap, prefs, line: idx + 1 });
  });
  if (sides.length !== 2) throw new Error("give two sides, each opened by a [header] line, e.g. [applicants] then [programmes]");
  const [SA, SB] = sides;
  for (const S of sides) {
    if (!S.rows.length) throw new Error(`side [${S.label}] has no members`);
    const seen = new Set();
    for (const r of S.rows) {
      if (seen.has(r.name)) throw new Error(`line ${r.line}: ${r.name} appears twice in [${S.label}]`);
      seen.add(r.name);
    }
  }
  if (SA.rows.length + SB.rows.length > LIMITS.agents) throw new Error(`at most ${LIMITS.agents} members in all`);
  for (const r of SA.rows) if (r.cap !== 1) throw new Error(`line ${r.line}: capacities go on the second side only ([${SB.label}]); put the side with several places second`);
  for (const r of SB.rows) if (!(r.cap >= 1)) throw new Error(`line ${r.line}: capacity must be a whole number of at least 1`);
  const idxA = new Map(SA.rows.map((r, i) => [r.name, i]));
  const idxB = new Map(SB.rows.map((r, i) => [r.name, i]));
  const both = [...idxA.keys()].filter((n) => idxB.has(n));
  if (both.length) throw new Error(`a name may be on one side only: ${both.slice(0, 5).join(", ")}`);
  const toIdx = (rows, other, otherLabel) =>
    rows.map((r) => {
      const out = [];
      const dup = new Set();
      for (const p of r.prefs) {
        if (!other.has(p)) throw new Error(`line ${r.line}: ${r.name} lists "${p}", who is not in [${otherLabel}]`);
        const j = other.get(p);
        if (dup.has(j)) throw new Error(`line ${r.line}: ${r.name} lists ${p} twice`);
        dup.add(j);
        out.push(j);
      }
      return out;
    });
  const inst = makeInstance(
    { label: SA.label, names: SA.rows.map((r) => r.name), prefs: toIdx(SA.rows, idxB, SB.label) },
    { label: SB.label, names: SB.rows.map((r) => r.name), prefs: toIdx(SB.rows, idxA, SA.label), cap: SB.rows.map((r) => r.cap) },
    warnings,
  );
  return inst;
}

/**
 * Build an instance from index lists. A pair is acceptable only if each
 * lists the other; one-sided entries are dropped (with a warning).
 */
export function makeInstance(A, B, warnings = []) {
  const nA = A.names.length;
  const nB = B.names.length;
  const cap = B.cap ? B.cap.slice() : new Array(nB).fill(1);
  const listsB = B.prefs.map((l) => new Set(l));
  const listsA = A.prefs.map((l) => new Set(l));
  const oneSided = [];
  const prefA = A.prefs.map((l, i) => l.filter((j) => {
    if (listsB[j].has(i)) return true;
    oneSided.push(`${A.names[i]} lists ${B.names[j]}, who does not list ${A.names[i]}`);
    return false;
  }));
  const prefB = B.prefs.map((l, j) => l.filter((i) => {
    if (listsA[i].has(j)) return true;
    oneSided.push(`${B.names[j]} lists ${A.names[i]}, who does not list ${B.names[j]}`);
    return false;
  }));
  if (oneSided.length) {
    warnings.push(`${oneSided.length} one-sided listing${oneSided.length === 1 ? "" : "s"} dropped (a pair can match only if each lists the other): ${oneSided.slice(0, 4).join("; ")}${oneSided.length > 4 ? "; ..." : ""}`);
  }
  // rank[i][j] = position of j on i's list (0 = first), Infinity if unacceptable.
  const rankA = prefA.map((l) => { const r = new Map(); l.forEach((j, k) => r.set(j, k)); return r; });
  const rankB = prefB.map((l) => { const r = new Map(); l.forEach((i, k) => r.set(i, k)); return r; });
  return {
    A: { label: A.label ?? "A", names: A.names.slice(), prefs: prefA, rank: rankA, n: nA },
    B: { label: B.label ?? "B", names: B.names.slice(), prefs: prefB, rank: rankB, n: nB, cap },
    warnings,
  };
}

const rk = (rankMap, x) => (rankMap.has(x) ? rankMap.get(x) : Infinity);

// ---------------------------------------------------------- deferred acceptance

/**
 * Deferred acceptance (Gale & Shapley 1962). proposer "A" (applicants ask,
 * programmes hold up to capacity) or "B" (programmes offer their seats).
 * Returns aMatch: aMatch[i] = programme index or -1.
 */
export function deferredAcceptance(inst, proposer = "A") {
  const { A, B } = inst;
  const aMatch = new Array(A.n).fill(-1);
  if (proposer === "A") {
    const next = new Array(A.n).fill(0);
    const held = Array.from({ length: B.n }, () => []);
    const free = [];
    for (let i = A.n - 1; i >= 0; i--) free.push(i);
    while (free.length) {
      const i = free.pop();
      if (next[i] >= A.prefs[i].length) continue; // exhausted: stays unmatched
      const j = A.prefs[i][next[i]++];
      const h = held[j];
      h.push(i);
      if (h.length > B.cap[j]) {
        // reject the worst held
        let w = 0;
        for (let k = 1; k < h.length; k++) if (rk(B.rank[j], h[k]) > rk(B.rank[j], h[w])) w = k;
        const out = h[w];
        h.splice(w, 1);
        free.push(out);
      }
    }
    held.forEach((h, j) => h.forEach((i) => (aMatch[i] = j)));
    return aMatch;
  }
  if (proposer !== "B") throw new Error('proposer must be "A" or "B"');
  const next = new Array(B.n).fill(0);
  const filled = new Array(B.n).fill(0);
  const queue = [];
  for (let j = B.n - 1; j >= 0; j--) queue.push(j);
  while (queue.length) {
    const j = queue.pop();
    while (filled[j] < B.cap[j] && next[j] < B.prefs[j].length) {
      const i = B.prefs[j][next[j]++];
      const cur = aMatch[i];
      if (cur === -1) {
        aMatch[i] = j;
        filled[j]++;
      } else if (rk(A.rank[i], j) < rk(A.rank[i], cur)) {
        aMatch[i] = j;
        filled[j]++;
        filled[cur]--;
        queue.push(cur);
      }
    }
  }
  return aMatch;
}

// ------------------------------------------------------------- stability

/** Assignees of each programme under aMatch. */
export function assignees(inst, aMatch) {
  const out = Array.from({ length: inst.B.n }, () => []);
  aMatch.forEach((j, i) => { if (j >= 0) out[j].push(i); });
  return out;
}

/**
 * Check a matching. Returns { stable, blocking: [{a, b}], problems: [text] }:
 * problems are unacceptable pairs and over-full programmes; a blocking pair
 * is an acceptable pair not matched together where the applicant prefers the
 * programme to its own place (or has none) and the programme has a free seat
 * or prefers the applicant to one it has.
 */
export function checkStability(inst, aMatch) {
  const { A, B } = inst;
  const problems = [];
  const asg = assignees(inst, aMatch);
  aMatch.forEach((j, i) => {
    if (j >= 0 && !(A.rank[i].has(j) && B.rank[j].has(i))) problems.push(`${A.names[i]} is placed at ${B.names[j]}, but the pair is not acceptable to both`);
  });
  asg.forEach((h, j) => { if (h.length > B.cap[j]) problems.push(`${B.names[j]} has ${h.length} placed but only ${B.cap[j]} place${B.cap[j] === 1 ? "" : "s"}`); });
  const worst = asg.map((h, j) => (h.length < B.cap[j] ? -1 : Math.max(...h.map((i) => rk(B.rank[j], i)))));
  const blocking = [];
  for (let i = 0; i < A.n; i++) {
    const mine = aMatch[i] >= 0 ? rk(A.rank[i], aMatch[i]) : Infinity;
    for (const j of A.prefs[i]) {
      if (rk(A.rank[i], j) >= mine) break;
      const ri = rk(B.rank[j], i);
      if (worst[j] === -1 || ri < worst[j]) blocking.push({ a: i, b: j });
    }
  }
  return { stable: !problems.length && !blocking.length, blocking, problems };
}

// ------------------------------------------------------------ enumeration

/** Seat expansion: programme j of capacity c becomes seats; returns maps. */
function expandSeats(inst) {
  const { A, B } = inst;
  const seatOf = [];
  const firstSeat = [];
  for (let j = 0; j < B.n; j++) {
    firstSeat.push(seatOf.length);
    for (let s = 0; s < B.cap[j]; s++) seatOf.push(j);
  }
  const prefA = A.prefs.map((l) => l.flatMap((j) => Array.from({ length: B.cap[j] }, (_, s) => firstSeat[j] + s)));
  const rankA = prefA.map((l) => { const r = new Int32Array(seatOf.length).fill(1 << 30); l.forEach((s, k) => (r[s] = k)); return r; });
  const rankS = seatOf.map((j) => { const r = new Int32Array(A.n).fill(1 << 30); B.prefs[j].forEach((i, k) => (r[i] = k)); return r; });
  return { seatOf, firstSeat, prefA, rankA, rankS, nS: seatOf.length };
}

/**
 * Every stable matching, applicant-optimal first (McVitie & Wilson 1971 on
 * the seat-expanded instance). Returns { matchings: [aMatch], complete }.
 */
export function allStableMatchings(inst, { limit = LIMITS.enumerate, work = LIMITS.enumerateWork } = {}) {
  const { A } = inst;
  const X = expandSeats(inst);
  const UNM = 1 << 30;
  // applicant-optimal on seats
  const am = new Int32Array(A.n).fill(-1); // applicant -> seat
  const sm = new Int32Array(X.nS).fill(-1); // seat -> applicant
  const nxt = new Int32Array(A.n);
  {
    const free = [];
    for (let i = A.n - 1; i >= 0; i--) free.push(i);
    while (free.length) {
      const i = free.pop();
      while (nxt[i] < X.prefA[i].length) {
        const s = X.prefA[i][nxt[i]++];
        if (X.rankS[s][i] >= UNM) continue;
        const cur = sm[s];
        if (cur === -1) { sm[s] = i; am[i] = s; break; }
        if (X.rankS[s][i] < X.rankS[s][cur]) { sm[s] = i; am[i] = s; am[cur] = -1; free.push(cur); break; }
      }
    }
  }
  const out = [];
  let steps = 0;
  let complete = true;
  const toProgram = (amS) => Array.from(amS, (s) => (s >= 0 ? X.seatOf[s] : -1));
  const emptyAtStart = new Uint8Array(X.nS);
  for (let s = 0; s < X.nS; s++) if (sm[s] === -1) emptyAtStart[s] = 1;

  // Break-marriage: free applicant i from seat w; w now holds a phantom
  // equal to i, so she accepts only someone she ranks above i.
  function breakMarriage(am0, sm0, i) {
    const amB = am0.slice();
    const smB = sm0.slice();
    const w = amB[i];
    if (w < 0) return null;
    const pos = Int32Array.from(amB, (s, k) => (s >= 0 ? X.rankA[k][s] + 1 : X.prefA[k].length));
    amB[i] = -1;
    smB[w] = -2; // phantom
    const phantomRank = X.rankS[w][i];
    let m = i;
    for (;;) {
      if (++steps > work) { complete = false; return null; }
      if (pos[m] >= X.prefA[m].length) return null; // m runs off his list
      const s = X.prefA[m][pos[m]++];
      if (X.rankS[s][m] >= UNM) continue;
      if (emptyAtStart[s]) return null; // would fill a seat empty in every stable matching
      const cur = smB[s];
      const curRank = cur === -2 ? phantomRank : X.rankS[s][cur];
      if (X.rankS[s][m] >= curRank) continue; // rejected
      smB[s] = m;
      amB[m] = s;
      if (cur === -2) return { am: amB, sm: smB }; // w took a better offer: done
      if (cur < i) return null; // applicants before i stay put in this subtree
      amB[cur] = -1;
      m = cur;
    }
  }

  // Iterative DFS (McVitie & Wilson's STABLE(M, k)).
  const seen = new Set();
  const stack = [{ am, sm, k: 0, emitted: false }];
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (!top.emitted) {
      top.emitted = true;
      const m = toProgram(top.am);
      const k = m.join(",");
      if (!seen.has(k)) {
        if (out.length >= limit) { complete = false; break; }
        seen.add(k);
        out.push(m);
      }
    }
    if (!complete && steps > work) break;
    if (top.k >= A.n) { stack.pop(); continue; }
    const i = top.k++;
    const r = breakMarriage(top.am, top.sm, i);
    if (r) stack.push({ am: r.am, sm: r.sm, k: i, emitted: false });
    else if (!complete) break;
  }
  return { matchings: out, complete };
}

// ---------------------------------------------------------------- scoring

/** Ranks (1 = first choice) and totals for a matching. */
export function scoreMatching(inst, aMatch) {
  const { A, B } = inst;
  const asg = assignees(inst, aMatch);
  const rankA = aMatch.map((j, i) => (j >= 0 ? rk(A.rank[i], j) + 1 : null));
  const rankB = asg.map((h, j) => h.map((i) => rk(B.rank[j], i) + 1).sort((x, y) => x - y));
  const sumA = rankA.reduce((s, r) => s + (r ?? 0), 0);
  const sumB = rankB.reduce((s, l) => s + l.reduce((t, r) => t + r, 0), 0);
  const all = [...rankA.filter((r) => r != null), ...rankB.flat()];
  return { rankA, rankB, sumA, sumB, total: sumA + sumB, regret: all.length ? Math.max(...all) : 0, matched: rankA.filter((r) => r != null).length };
}

const key = (m) => m.join(",");

// ----------------------------------------------------------------- analyze

export const fmt = (v, d = 2) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toString() : String(v));

/** Parse a matching to check: one line per applicant, `name: programme` (or `-`). */
export function parseMatching(inst, text) {
  const idxA = new Map(inst.A.names.map((n, i) => [n, i]));
  const idxB = new Map(inst.B.names.map((n, j) => [n, j]));
  const m = new Array(inst.A.n).fill(-1);
  const seen = new Set();
  String(text ?? "").split(/\r?\n/).forEach((raw, k) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || HEADER.test(line)) return;
    const parts = line.split(/\s*[:,]\s*/);
    if (parts.length !== 2) throw new Error(`matching line ${k + 1}: expected "applicant: programme", got "${line}"`);
    let [a, b] = parts;
    if (!idxA.has(a) && idxA.has(b)) [a, b] = [b, a];
    if (!idxA.has(a)) throw new Error(`matching line ${k + 1}: "${a}" is not in [${inst.A.label}]`);
    if (seen.has(a)) throw new Error(`matching line ${k + 1}: ${a} is placed twice`);
    seen.add(a);
    if (b === "-" || b === "" || /^(none|unmatched)$/i.test(b)) return;
    if (!idxB.has(b)) throw new Error(`matching line ${k + 1}: "${b}" is not in [${inst.B.label}]`);
    m[idxA.get(a)] = idxB.get(b);
  });
  return m;
}

/**
 * Top-level call. input: { text, proposer: "A"|"B", enumerate, limit, check }.
 * `check` is an optional matching to test ("applicant: programme" lines).
 */
export function analyze(input = {}) {
  try {
    return analyzeOrThrow(input);
  } catch (e) {
    return { error: e.message, summary: `Could not read the lists: ${e.message}` };
  }
}

function analyzeOrThrow(input) {
  const o = { ...DEFAULTS, ...input };
  const inst = parseInstance(o.text ?? SAMPLE_TEXT);
  const { A, B } = inst;
  const proposer = o.proposer === "B" ? "B" : "A";
  const aOpt = deferredAcceptance(inst, "A");
  const bOpt = deferredAcceptance(inst, "B");
  const chosen = proposer === "A" ? aOpt : bOpt;
  let list = null;
  let complete = null;
  if (o.enumerate !== false) {
    const r = allStableMatchings(inst, { limit: Math.max(1, Math.min(Number(o.limit) || LIMITS.enumerate, LIMITS.enumerate)) });
    list = r.matchings;
    complete = r.complete;
  }
  const describe = (m) => ({
    pairs: m.map((j, i) => ({ [A.label]: A.names[i], [B.label]: j >= 0 ? B.names[j] : null })),
    assignment: Object.fromEntries(m.map((j, i) => [A.names[i], j >= 0 ? B.names[j] : null])),
    ...scoreMatching(inst, m),
  });
  const res = {
    sides: { A: { label: A.label, size: A.n }, B: { label: B.label, size: B.n, places: B.cap.reduce((s, c) => s + c, 0) } },
    proposer,
    proposerLabel: proposer === "A" ? A.label : B.label,
    matching: describe(chosen),
    optimalA: describe(aOpt),
    optimalB: describe(bOpt),
    unique: key(aOpt) === key(bOpt),
    warnings: inst.warnings.slice(),
  };
  if (list) {
    const scored = list.map((m) => ({ m, s: scoreMatching(inst, m) }));
    const best = (cmp) => scored.reduce((x, y) => (cmp(y.s, x.s) < 0 ? y : x));
    const egal = best((p, q) => p.total - q.total || p.regret - q.regret);
    const minReg = best((p, q) => p.regret - q.regret || p.total - q.total);
    const balanced = best((p, q) => Math.abs(p.sumA - p.sumB) - Math.abs(q.sumA - q.sumB) || p.total - q.total);
    res.stableMatchings = {
      count: list.length,
      complete,
      points: scored.map(({ s }) => ({ sumA: s.sumA, sumB: s.sumB, regret: s.regret })),
      egalitarian: describe(egal.m),
      minimumRegret: describe(minReg.m),
      balanced: describe(balanced.m),
      list: list.length <= 50 ? list.map((m) => Object.fromEntries(m.map((j, i) => [A.names[i], j >= 0 ? B.names[j] : null]))) : null,
    };
    // Rural hospitals theorem check (Roth 1986): same matched applicants, same fill.
    const fills = (m) => assignees(inst, m).map((h) => h.length).join(",");
    const matchedSet = (m) => m.map((j) => (j >= 0 ? 1 : 0)).join("");
    const okRural = list.every((m) => fills(m) === fills(aOpt) && matchedSet(m) === matchedSet(aOpt));
    res.ruralHospitals = okRural;
    if (!okRural) res.warnings.push("internal check failed: the stable matchings do not fill the same places (rural hospitals theorem); please report this instance");
  }
  // Which programmes are short, and which applicants are left out (the same in every stable matching).
  const asg = assignees(inst, aOpt);
  res.unmatched = aOpt.map((j, i) => (j < 0 ? A.names[i] : null)).filter(Boolean);
  res.underfilled = asg.map((h, j) => (h.length < B.cap[j] ? { name: B.names[j], filled: h.length, places: B.cap[j] } : null)).filter(Boolean);
  if (o.check && String(o.check).trim()) {
    const m = parseMatching(inst, o.check);
    const c = checkStability(inst, m);
    res.check = {
      stable: c.stable,
      problems: c.problems,
      blocking: c.blocking.map(({ a, b }) => ({ [A.label]: A.names[a], [B.label]: B.names[b], why: `${A.names[a]} prefers ${B.names[b]} to ${m[a] >= 0 ? B.names[m[a]] : "no place"}, and ${B.names[b]} ${assignees(inst, m)[b].length < B.cap[b] ? "has a free place" : "prefers " + A.names[a] + " to someone it has"}` })),
      ...scoreMatching(inst, m),
    };
  }
  res.summary = summarize(inst, res);
  return res;
}

function summarize(inst, r) {
  const { A, B } = inst;
  const s = [];
  const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const m = r.matching;
  s.push(`${r.proposerLabel} proposing: ${m.matched} of ${A.n} ${A.label} placed; ${B.label} offer ${r.sides.B.places} places in all (${B.n} on that side). ${A.label} got their first choice ${pl(m.rankA.filter((x) => x === 1).length, "time")}; average rank ${fmt(m.sumA / Math.max(1, m.matched))} (1 = first choice).`);
  if (r.unique) s.push("This is the only stable matching: whichever side proposes, the answer is the same.");
  else if (r.stableMatchings) {
    s.push(`There are ${r.stableMatchings.complete ? "exactly" : "at least"} ${r.stableMatchings.count} stable matchings. ${A.label} proposing gives each of the ${A.label} its best stable partner and each of the ${B.label} its worst; ${B.label} proposing is the reverse. The egalitarian one has total rank ${r.stableMatchings.egalitarian.total} against ${r.optimalA.total} (${A.label}-optimal) and ${r.optimalB.total} (${B.label}-optimal).`);
  } else s.push(`More than one stable matching exists (the ${A.label}-optimal and ${B.label}-optimal ones differ).`);
  if (r.unmatched.length) s.push(`Left without a place in every stable matching: ${r.unmatched.slice(0, 8).join(", ")}${r.unmatched.length > 8 ? ", ..." : ""}.`);
  if (r.underfilled.length) s.push(`Short of places in every stable matching, with the same people each time (rural hospitals theorem): ${r.underfilled.slice(0, 6).map((u) => `${u.name} ${u.filled}/${u.places}`).join(", ")}.`);
  s.push(`Only the proposing side (${r.proposerLabel}) can never gain by ranking dishonestly.`);
  if (r.check) s.push(r.check.stable ? "The matching you gave is stable." : `The matching you gave is not stable: ${pl(r.check.blocking.length, "blocking pair")}${r.check.problems.length ? ` and ${pl(r.check.problems.length, "other problem")}` : ""}.`);
  return s.join(" ");
}

export function csvCell(c) {
  let t = String(c ?? "");
  // CSV formula injection: names are typed by the visitor, so a leading
  // = + - @ (or tab/CR) would run as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t;
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** One row per applicant: its place under each named matching and the rank. */
export function toCsv(r) {
  const cols = [["matching", r.matching], [`${r.sides.A.label}-optimal`, r.optimalA], [`${r.sides.B.label}-optimal`, r.optimalB]];
  if (r.stableMatchings) cols.push(["egalitarian", r.stableMatchings.egalitarian], ["minimum-regret", r.stableMatchings.minimumRegret]);
  const names = Object.keys(r.matching.assignment);
  const head = [r.sides.A.label, ...cols.flatMap(([n]) => [n, `${n} rank`])];
  const rows = names.map((a, i) => [a, ...cols.flatMap(([, m]) => [m.assignment[a] ?? "", m.rankA[i] ?? ""])]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
