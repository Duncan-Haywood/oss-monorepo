// Shared engine for the CI Test Shard Balancer: parses per-test timings out of
// JUnit XML (pytest, Jest via jest-junit, Go via gotestsum/go-junit-report,
// Maven Surefire / Gradle, RSpec via rspec_junit_formatter), groups them into
// schedulable units, splits the units into N shards (multiway number
// partitioning: LPT greedy, then pairwise local search, then an exact search
// when the instance is small), and prices the result. Deterministic: no
// randomness, no clock, no network. Used by index.html and cli.mjs.

export const DISCLAIMER =
  "A heuristic split computed from the timings in the reports you gave it. Test timings vary from run to run, " +
  "so the real shards will not match the predicted ones exactly. Not a guarantee of any wall-clock or billing figure, " +
  "and not engineering or financial advice. Check the shard commands before relying on them.";

export const EPS = 1e-9;

// ---------------------------------------------------------------- XML parsing

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === "#") {
      const code = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return NAMED[k];
  });
}

function parseAttrs(str) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(str))) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? "");
  return out;
}

function toSeconds(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Returns the flat list of test cases in one JUnit document, each with the
// attributes the grouping step needs. CDATA and comments are removed first so a
// "<testcase" string inside captured output cannot be mistaken for a test.
export function parseJUnit(xml, report = 0) {
  const clean = String(xml)
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const tagRe = /<(\/?)(testsuite|testcase)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const stack = [];
  const tests = [];
  let m;
  while ((m = tagRe.exec(clean))) {
    const [, closing, tag, attrText, selfClose] = m;
    if (tag === "testsuite") {
      if (closing) stack.pop();
      else if (!selfClose) {
        const a = parseAttrs(attrText);
        stack.push({ name: a.name || "", file: a.file || "" });
      }
    } else if (!closing) {
      const a = parseAttrs(attrText);
      const suite = stack[stack.length - 1] || { name: "", file: "" };
      tests.push({
        report,
        suite: suite.name,
        suiteFile: suite.file,
        classname: a.classname || "",
        name: a.name || "",
        file: a.file || "",
        time: toSeconds(a.time),
      });
    }
  }
  return tests;
}

// Several reports pasted into one box: split at XML declarations, else at the
// closing </testsuites>, else treat the whole text as one report.
export function splitReports(text) {
  const t = String(text).trim();
  if (!t) return [];
  const byDecl = t.split(/(?=<\?xml\b)/i).map((s) => s.trim()).filter(Boolean);
  if (byDecl.length > 1) return byDecl;
  const byClose = t.split(/(?<=<\/testsuites>)/i).map((s) => s.trim()).filter((s) => /<testcase\b/.test(s));
  if (byClose.length > 1) return byClose;
  return [t];
}

export const DIALECTS = ["pytest", "jest", "go", "java", "rspec", "unknown"];

export function detectDialect(tests) {
  if (!tests.length) return "unknown";
  const any = (f) => tests.some(f);
  const all = (f) => tests.every(f);
  if (any((t) => /\.rb$/.test(t.file)) || any((t) => /^(\.\/)?spec[./]/.test(t.classname))) return "rspec";
  if (all((t) => /^(Test|Example|Fuzz)/.test(t.name)) && all((t) => t.classname.includes("/") || !t.classname.includes("."))) return "go";
  if (
    any((t) => /\.[cm]?[jt]sx?$/.test(t.file)) ||
    any((t) => /jest/i.test(t.suite)) ||
    any((t) => /\s/.test(t.classname))
  ) return "jest";
  if (
    any((t) => t.suite === "pytest") || any((t) => /\.py$/.test(t.file)) ||
    any((t) => /(^|\.)test_\w*(\.|$)/.test(t.classname)) || any((t) => /^test_/.test(t.name))
  ) return "pytest";
  if (any((t) => /^[a-z][\w]*(\.[\w$]+)*\.[A-Z][\w$]*$/.test(t.classname) || /^[A-Z][\w$]*$/.test(t.classname))) return "java";
  return "unknown";
}

// -------------------------------------------------------------- grouping units

function pytestParts(t) {
  const parts = t.classname.split(".").filter(Boolean);
  let i = parts.findIndex((p) => /^[A-Z]/.test(p));
  if (i < 0) i = parts.length;
  const cls = parts.slice(i).join("::");
  const path = t.file ? t.file.replace(/^\.\//, "") : parts.slice(0, i).join("/") + ".py";
  return { path, cls };
}

function looksLikePath(s) {
  return /[\\/]/.test(s) || /\.[cm]?[jt]sx?$/.test(s);
}

// Gives every test case the fields all dialects need: path, cls, pkg, method, id.
function annotate(t, dialect) {
  const o = { ...t, path: "", cls: "", pkg: "", method: t.name, id: "", noFile: false };
  if (dialect === "pytest") {
    const { path, cls } = pytestParts(t);
    o.path = path; o.cls = cls;
    o.id = `${path}${cls ? `::${cls}` : ""}::${t.name}`;
  } else if (dialect === "jest") {
    const p = t.file || t.suiteFile || (looksLikePath(t.suite) ? t.suite : "");
    o.noFile = !p;
    o.path = (p || t.suite || t.classname || "(unknown file)").replace(/^\.\//, "");
    o.cls = t.suite || "";
    o.id = `${o.path}::${t.classname || t.name}::${t.name}`;
  } else if (dialect === "rspec") {
    const p = t.file ? t.file.replace(/^\.\//, "") : `${t.classname.replace(/\./g, "/")}.rb`;
    o.path = p; o.cls = t.classname;
    o.id = `${p}::${t.name}`;
  } else if (dialect === "go") {
    o.pkg = t.classname || t.suite || "(package)";
    o.method = t.name.split("/")[0];
    o.path = o.pkg; o.cls = o.pkg;
    o.id = `${o.pkg}::${o.method}`;
  } else if (dialect === "java") {
    o.cls = t.classname;
    o.path = `${t.classname.replace(/\./g, "/")}.java`;
    o.method = t.name.replace(/[([].*$/, "").trim() || t.name;
    o.id = `${t.classname}#${o.method}`;
  } else {
    o.cls = t.classname || t.suite || "(unknown)";
    o.path = o.cls;
    o.id = `${o.cls}::${t.name}`;
  }
  return o;
}

// Go reports a parent test's time that already includes its subtests, so the
// schedulable unit is the top-level test: take the larger of the parent's own
// time and the sum of its children.
function collapseGo(annotated) {
  const byId = new Map();
  for (const t of annotated) {
    const g = byId.get(t.id) || { t, parent: 0, children: 0 };
    if (t.name === t.method) g.parent = Math.max(g.parent, t.time);
    else g.children += t.time;
    byId.set(t.id, g);
  }
  return [...byId.values()].map((g) => ({ ...g.t, name: g.t.method, time: Math.max(g.parent, g.children) }));
}

function dedupe(annotated) {
  // The same test id twice (a retry, or the same report passed twice) is one
  // test: keep the longest observation instead of double counting it.
  const by = new Map();
  for (const t of annotated) {
    const k = `${t.id}\u0000${t.name}`;
    const prev = by.get(k);
    if (!prev || t.time > prev.time) by.set(k, t);
  }
  return [...by.values()];
}

export const GROUPS = ["file", "class", "test"];

function unitKey(t, dialect, group) {
  if (dialect === "go") return group === "test" ? t.id : t.pkg;
  if (group === "test") return t.id;
  if (dialect === "java") return t.cls;
  if (group === "file") return t.path;
  if (dialect === "pytest") return t.path + (t.cls ? `::${t.cls}` : "");
  if (dialect === "jest") return `${t.path}::${t.cls}`;
  return t.cls || t.path;
}

export function buildUnits(tests, { dialect, group = "file" } = {}) {
  const d = dialect && dialect !== "auto" ? dialect : detectDialect(tests);
  if (!GROUPS.includes(group)) throw new Error(`group must be one of ${GROUPS.join(", ")}`);
  let annotated = tests.map((t) => annotate(t, d));
  if (d === "go") annotated = collapseGo(annotated);
  annotated = dedupe(annotated);
  const map = new Map();
  for (const t of annotated) {
    const key = unitKey(t, d, group);
    const u = map.get(key) || { key, time: 0, count: 0, members: [] };
    u.time += t.time;
    u.count += 1;
    u.members.push(t);
    map.set(key, u);
  }
  const units = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { dialect: d, group, units, noFile: d === "jest" && annotated.some((t) => t.noFile) };
}

// ---------------------------------------------------------------- partitioning

const byTimeDesc = (a, b) => b.time - a.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// Longest Processing Time first: put the next-longest unit on the least-loaded
// shard. Graham (1969): makespan <= (4/3 - 1/(3n)) * optimal.
export function lpt(units, n) {
  const shards = Array.from({ length: n }, () => ({ items: [], load: 0 }));
  for (const u of [...units].sort(byTimeDesc)) {
    let best = 0;
    for (let j = 1; j < n; j += 1) if (shards[j].load < shards[best].load - EPS) best = j;
    shards[best].items.push(u);
    shards[best].load += u.time;
  }
  return shards;
}

function lowerBound(units, n) {
  const total = units.reduce((s, u) => s + u.time, 0);
  const longest = units.reduce((m, u) => Math.max(m, u.time), 0);
  return Math.max(longest, total / n);
}

// Pairwise local search: for the heavier shard H and a lighter shard L, move a
// unit across or swap two so that both new loads fall strictly between the old
// ones. The sum of squared loads strictly decreases on every step, so it
// terminates, and the makespan never increases.
export function improve(shards, maxSteps = 100000) {
  const cmp = (a, b) => a.time - b.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  for (const s of shards) s.items.sort(cmp);
  let steps = 0;
  for (;;) {
    const order = shards.map((_, i) => i).sort((a, b) => shards[b].load - shards[a].load || a - b);
    let applied = false;
    for (let hi = 0; hi < order.length && !applied; hi += 1) {
      for (let li = order.length - 1; li > hi && !applied; li -= 1) {
        const H = shards[order[hi]];
        const L = shards[order[li]];
        const gap = H.load - L.load;
        if (gap <= EPS) continue;
        let best = null;
        const consider = (xi, yi, delta) => {
          if (delta <= EPS || delta >= gap - EPS) return;
          const score = Math.abs(gap - 2 * delta);
          if (!best || score < best.score - EPS) best = { xi, yi, delta, score };
        };
        for (let xi = 0; xi < H.items.length; xi += 1) {
          const x = H.items[xi].time;
          consider(xi, -1, x);
          const target = x - gap / 2;
          let lo = 0;
          let hi2 = L.items.length;
          while (lo < hi2) {
            const mid = (lo + hi2) >> 1;
            if (L.items[mid].time < target) lo = mid + 1; else hi2 = mid;
          }
          for (const yi of [lo - 1, lo, lo + 1]) {
            if (yi >= 0 && yi < L.items.length) consider(xi, yi, x - L.items[yi].time);
          }
        }
        if (best) {
          const x = H.items.splice(best.xi, 1)[0];
          const y = best.yi >= 0 ? L.items.splice(best.yi, 1)[0] : null;
          // best.yi indexes L before removal; H and L are distinct arrays so it is stable.
          L.items.push(x); L.items.sort(cmp);
          H.load -= best.delta; L.load += best.delta;
          if (y) { H.items.push(y); H.items.sort(cmp); }
          applied = true;
          steps += 1;
        }
      }
    }
    if (!applied || steps >= maxSteps) break;
  }
  return shards;
}

// Exact branch-and-bound for small instances, seeded with the heuristic answer
// as the incumbent. Returns null when the node budget runs out before the
// search finishes, so a caller never mistakes "gave up" for "proved optimal".
export function exactPartition(units, n, incumbentMakespan, nodeLimit = 200000) {
  const items = [...units].sort(byTimeDesc);
  const m = items.length;
  const lb = lowerBound(units, n);
  let best = incumbentMakespan;
  let bestAssign = null;
  const loads = new Array(n).fill(0);
  const assign = new Array(m).fill(0);
  let nodes = 0;
  let aborted = false;
  const suffix = new Array(m + 1).fill(0);
  for (let i = m - 1; i >= 0; i -= 1) suffix[i] = suffix[i + 1] + items[i].time;
  const dfs = (i) => {
    if (aborted || best <= lb + EPS) return;
    nodes += 1;
    if (nodes > nodeLimit) { aborted = true; return; }
    if (i === m) {
      const mk = Math.max(...loads);
      if (mk < best - EPS) { best = mk; bestAssign = assign.slice(); }
      return;
    }
    // Remaining work cannot fit under `best` even if spread perfectly.
    const room = loads.reduce((s, l) => s + Math.max(0, best - EPS - l), 0);
    if (room < suffix[i] - EPS) return;
    const seen = new Set();
    for (let j = 0; j < n; j += 1) {
      const key = Math.round(loads[j] * 1e9);
      if (seen.has(key)) continue;
      seen.add(key);
      if (loads[j] + items[i].time >= best - EPS) continue;
      loads[j] += items[i].time;
      assign[i] = j;
      dfs(i + 1);
      loads[j] -= items[i].time;
    }
  };
  dfs(0);
  if (aborted) return null;
  if (!bestAssign) return { improved: false, shards: null, makespan: best };
  const shards = Array.from({ length: n }, () => ({ items: [], load: 0 }));
  items.forEach((u, i) => { shards[bestAssign[i]].items.push(u); shards[bestAssign[i]].load += u.time; });
  return { improved: true, shards, makespan: best };
}

const maxLoad = (shards) => shards.reduce((m, s) => Math.max(m, s.load), 0);

export function balance(units, n, { exactMaxUnits = 22, nodeLimit = 200000 } = {}) {
  if (!Number.isInteger(n) || n < 1) throw new Error("shards must be a whole number of 1 or more");
  const lb = lowerBound(units, n);
  let shards = lpt(units, n);
  const lptMakespan = maxLoad(shards);
  improve(shards);
  let method = "LPT greedy + local search";
  let optimal = maxLoad(shards) <= lb + 1e-7;
  if (!optimal && units.length <= exactMaxUnits) {
    const r = exactPartition(units, n, maxLoad(shards), nodeLimit);
    if (r) {
      optimal = true;
      method = "exact search";
      if (r.improved) shards = r.shards;
    }
  }
  if (optimal && method !== "exact search") method = "LPT greedy + local search, matching the lower bound";
  shards.sort((a, b) => b.load - a.load || (a.items[0]?.key ?? "").localeCompare(b.items[0]?.key ?? ""));
  for (const s of shards) s.items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { shards, makespan: maxLoad(shards), lptMakespan, lowerBound: lb, optimal, method };
}

// The naive split most runners do: units in name order, cut into N chunks of
// near-equal COUNT, ignoring how long each takes.
export function equalCountSplit(units, n) {
  const sorted = [...units].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const size = Math.ceil(sorted.length / n) || 1;
  const shards = Array.from({ length: n }, () => ({ items: [], load: 0 }));
  sorted.forEach((u, i) => {
    const s = shards[Math.min(n - 1, Math.floor(i / size))];
    s.items.push(u); s.load += u.time;
  });
  return shards;
}

// ------------------------------------------------------------ cost and report

export function imbalancePct(max, total, n) {
  const ideal = total / n;
  return ideal > 0 ? ((max - ideal) / ideal) * 100 : 0;
}

const wallOf = (maxSeconds, setup) => maxSeconds + setup;
// Per the stated model: every shard is billed as long as the slowest one.
const billedOf = (n, maxSeconds, setup) => (n * wallOf(maxSeconds, setup)) / 60;

export function sweepShards(units, setupSeconds, maxN) {
  const total = units.reduce((s, u) => s + u.time, 0);
  const out = [];
  for (let n = 1; n <= maxN; n += 1) {
    const b = balance(units, n);
    out.push({
      n,
      max: b.makespan,
      wall: wallOf(b.makespan, setupSeconds),
      billedMinutes: billedOf(n, b.makespan, setupSeconds),
      billedMinutesExact: (total + n * setupSeconds) / 60,
      imbalancePct: imbalancePct(b.makespan, total, n),
    });
  }
  return out;
}

export function recommend(sweep, { targetSeconds = null, floor = 0, setupSeconds = 0 } = {}) {
  if (!sweep.length) return null;
  if (targetSeconds !== null && targetSeconds !== undefined) {
    const ok = sweep.filter((r) => r.wall <= targetSeconds + EPS);
    if (!ok.length) {
      return {
        basis: "target", n: null,
        note: `No shard count up to ${sweep[sweep.length - 1].n} brings the wall-clock to ${formatSeconds(targetSeconds)}. ` +
          `The floor is ${formatSeconds(floor + setupSeconds)} (longest unit ${formatSeconds(floor)} plus ${formatSeconds(setupSeconds)} setup) ` +
          "unless that unit is split.",
      };
    }
    const pick = ok.reduce((a, b) => (b.billedMinutes < a.billedMinutes - EPS ? b : a));
    return { basis: "target", n: pick.n, wall: pick.wall, billedMinutes: pick.billedMinutes, note: `Cheapest shard count that finishes within ${formatSeconds(targetSeconds)}.` };
  }
  const minWall = Math.min(...sweep.map((r) => r.wall));
  const knee = sweep.find((r) => r.wall <= minWall * 1.05 + EPS);
  return { basis: "knee", n: knee.n, wall: knee.wall, billedMinutes: knee.billedMinutes, note: "Smallest shard count within 5% of the fastest wall-clock this suite can reach." };
}

export function formatSeconds(s) {
  if (!Number.isFinite(s)) return "n/a";
  if (s < 60) return `${(Math.round(s * 10) / 10).toString()}s`;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const mi = Math.floor((total % 3600) / 60);
  const se = total % 60;
  return h ? `${h}h ${mi}m ${se}s` : `${mi}m ${se}s`;
}

export function formatMinutes(min) {
  return `${(Math.round(min * 10) / 10).toString()} min`;
}

export function formatPct(p) {
  return `${(Math.round(p * 10) / 10).toString()}%`;
}

// ------------------------------------------------------------------- emitters

const shellQuote = (s) => (/^[\w@%+=:,./#-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
const uniq = (a) => [...new Set(a)];

// Turns one shard's units into the arguments and command for the dialect.
export function emitShard(dialect, group, items) {
  const members = items.flatMap((u) => u.members);
  const sortedKeys = items.map((u) => u.key).sort();
  if (dialect === "pytest") {
    const args = group === "test" ? uniq(members.map((t) => t.id)).sort()
      : group === "class" ? uniq(members.map((t) => t.path + (t.cls ? `::${t.cls}` : ""))).sort()
        : uniq(members.map((t) => t.path)).sort();
    return { args, command: args.length ? `pytest ${args.map(shellQuote).join(" ")}` : "" };
  }
  if (dialect === "jest") {
    const args = uniq(members.map((t) => t.path)).sort();
    return { args, command: args.length ? `npx jest ${args.map(shellQuote).join(" ")}` : "" };
  }
  if (dialect === "rspec") {
    const args = uniq(members.map((t) => t.path)).sort();
    return { args, command: args.length ? `bundle exec rspec ${args.map(shellQuote).join(" ")}` : "" };
  }
  if (dialect === "go") {
    if (group !== "test") {
      const args = uniq(members.map((t) => t.pkg)).sort();
      return { args, command: args.length ? `go test ${args.map(shellQuote).join(" ")}` : "" };
    }
    const byPkg = new Map();
    for (const t of members) byPkg.set(t.pkg, [...(byPkg.get(t.pkg) || []), t.method]);
    const pkgs = [...byPkg.keys()].sort();
    const cmds = pkgs.map((p) => `go test -run ${shellQuote(`^(${uniq(byPkg.get(p)).sort().join("|")})$`)} ${shellQuote(p)}`);
    return { args: pkgs.flatMap((p) => uniq(byPkg.get(p)).sort().map((m) => `${p}::${m}`)), command: cmds.join(" && ") };
  }
  if (dialect === "java") {
    const args = group === "test" ? uniq(members.map((t) => `${t.cls}#${t.method}`)).sort() : uniq(members.map((t) => t.cls)).sort();
    return {
      args,
      command: args.length ? `mvn test -Dtest=${shellQuote(args.join(","))}` : "",
      altCommand: args.length ? `gradle test ${args.map((a) => `--tests ${shellQuote(a.replace("#", "."))}`).join(" ")}` : "",
    };
  }
  return { args: sortedKeys, command: sortedKeys.join(" ") };
}

export function matrixOf(report) {
  return {
    include: report.balanced.shards.map((s) => ({
      shard: s.index,
      tests: s.emit.args.join(" "),
      units: s.units.length,
      seconds: Math.round(s.seconds * 100) / 100,
      command: s.emit.command,
    })),
  };
}

// --------------------------------------------------------------------- report

function shardView(shard, i, dialect, group, total, withEmit) {
  const base = {
    index: i + 1,
    seconds: shard.load,
    units: shard.items.map((u) => u.key),
    tests: shard.items.reduce((s, u) => s + u.count, 0),
    pctOfIdeal: null,
  };
  if (withEmit) base.emit = emitShard(dialect, group, shard.items);
  return base;
}

// reports: array of arrays of parsed test cases (one array per report file).
export function analyze(reports, opts = {}) {
  const {
    shards: nOpt = 4, setupSeconds = 0, group = "file", dialect = "auto",
    currentFromReports = false, targetSeconds = null, maxShards = 32, runsPerMonth = null,
    maxImbalancePct = null,
  } = opts;
  const n = Number(nOpt);
  if (!Number.isInteger(n) || n < 1) throw new Error("shards must be a whole number of 1 or more");
  const setup = Number(setupSeconds);
  if (!Number.isFinite(setup) || setup < 0) throw new Error("setup seconds must be 0 or more");
  const all = reports.flat();
  if (!all.length) throw new Error("no <testcase> elements found; is this a JUnit XML report?");
  const built = buildUnits(all, { dialect, group });
  const { units } = built;
  const total = units.reduce((s, u) => s + u.time, 0);
  if (total <= 0) throw new Error("every test has a time of 0; the report has no timings to balance");
  const warnings = [];
  if (built.noFile) warnings.push("Some Jest test cases carry no file path, so the file list below falls back to the suite name. Set JEST_JUNIT_ADD_FILE_ATTRIBUTE=true (jest-junit) so shard lists name real files.");
  if (built.dialect === "unknown") warnings.push("The report did not look like pytest, Jest, Go, Maven/Gradle or RSpec output, so shard lists are plain unit names.");
  if (units.length < n) warnings.push(`Only ${units.length} unit(s) for ${n} shards: ${n - units.length} shard(s) would sit empty. Try a finer grouping (--group test) or fewer shards.`);
  const zero = all.filter((t) => t.time === 0).length;
  if (zero > all.length * 0.5) warnings.push(`${zero} of ${all.length} test cases report a time of 0; the report may be missing timings, which makes any split unreliable.`);

  // Current split.
  let currentShards;
  let currentMode;
  if (currentFromReports && reports.length > 1) {
    currentMode = "reports";
    currentShards = reports.map((r) => {
      const u = buildUnits(r, { dialect: built.dialect, group }).units;
      return { items: u, load: u.reduce((s, x) => s + x.time, 0) };
    });
  } else {
    if (currentFromReports) warnings.push("--current-from-reports needs two or more report files, one per current shard; using the equal-count baseline instead.");
    currentMode = "equal-count";
    currentShards = equalCountSplit(units, n);
  }
  const cn = currentShards.length;
  const curMax = maxLoad(currentShards);
  const curTotal = currentShards.reduce((s, x) => s + x.load, 0);

  // Balanced split.
  const bal = balance(units, n);
  const balMax = bal.makespan;
  const ideal = total / n;
  const floor = units.reduce((m, u) => Math.max(m, u.time), 0);

  const current = {
    mode: currentMode,
    label: currentMode === "reports" ? "each report file is one current shard" : "equal-count split in name order (a stand-in for an unweighted split)",
    shards: currentShards.map((s, i) => ({ ...shardView(s, i, built.dialect, group, total, false), pctOfIdeal: ideal > 0 ? (s.load / (curTotal / cn)) * 100 : 0 })),
    max: curMax,
    wall: wallOf(curMax, setup),
    billedMinutes: billedOf(cn, curMax, setup),
    imbalancePct: imbalancePct(curMax, curTotal, cn),
  };
  const balanced = {
    shards: bal.shards.map((s, i) => ({ ...shardView(s, i, built.dialect, group, total, true), pctOfIdeal: (s.load / ideal) * 100 })),
    max: balMax,
    wall: wallOf(balMax, setup),
    billedMinutes: billedOf(n, balMax, setup),
    imbalancePct: imbalancePct(balMax, total, n),
    optimal: bal.optimal,
    method: bal.method,
    lowerBound: bal.lowerBound,
    lptMakespan: bal.lptMakespan,
  };

  // Indivisible units: longer than the ideal shard, so they set the floor.
  const bottlenecks = units
    .filter((u) => u.time > ideal + EPS)
    .sort(byTimeDesc)
    .slice(0, 10)
    .map((u) => ({
      key: u.key, seconds: u.time, tests: u.count, pctOfIdeal: (u.time / ideal) * 100,
      splittable: group !== "test" && u.count > 1,
    }));
  if (bottlenecks.length) {
    const b = bottlenecks[0];
    warnings.push(
      `${b.key} takes ${formatSeconds(b.seconds)}, longer than the ideal shard of ${formatSeconds(ideal)}. ` +
      `No split can finish faster than ${formatSeconds(b.seconds)} plus setup while it stays one unit` +
      (b.splittable ? `; it holds ${b.tests} tests, so try --group test to split it.` : "."),
    );
  }

  const maxN = Math.max(1, Math.min(Number(maxShards) || 32, units.length));
  const fullSweep = sweepShards(units, setup, Math.max(maxN, Math.min(n, units.length)));
  // Past the first N that reaches the floor (the longest unit) more shards only
  // add cost, so show two rows beyond it and stop -- but never cut before N.
  const hit = fullSweep.findIndex((row) => row.max <= floor + EPS);
  const cut = hit < 0 ? fullSweep.length : Math.max(hit + 3, Math.min(n, fullSweep.length));
  const sweep = fullSweep.slice(0, cut);
  const rec = recommend(sweep, { targetSeconds, floor, setupSeconds: setup });

  const savedBilled = current.billedMinutes - balanced.billedMinutes;
  const savings = {
    wallSeconds: current.wall - balanced.wall,
    wallPct: current.wall > 0 ? ((current.wall - balanced.wall) / current.wall) * 100 : 0,
    billedMinutes: savedBilled,
    billedPct: current.billedMinutes > 0 ? (savedBilled / current.billedMinutes) * 100 : 0,
    monthlyBilledMinutes: runsPerMonth ? savedBilled * Number(runsPerMonth) : null,
  };
  const gate = maxImbalancePct === null || maxImbalancePct === undefined
    ? null
    : { maxImbalancePct: Number(maxImbalancePct), imbalancePct: current.imbalancePct, exceeded: current.imbalancePct > Number(maxImbalancePct) + EPS };

  return {
    dialect: built.dialect, group, n, setupSeconds: setup,
    totals: { units: units.length, tests: all.length, seconds: total },
    idealSeconds: ideal, floorSeconds: floor,
    current, balanced, savings, sweep, recommendation: rec,
    bottlenecks, warnings, gate, disclaimer: DISCLAIMER,
  };
}

export function parseReports(texts) {
  return texts.flatMap((x) => splitReports(x)).map((x, i) => parseJUnit(x, i));
}

export function summarize(r) {
  const s = r.savings;
  return `${r.totals.tests} tests in ${r.totals.units} ${r.group === "test" ? "test" : r.group} unit(s), ${formatSeconds(r.totals.seconds)} of test time. ` +
    `Slowest shard: ${formatSeconds(r.current.max)} now, ${formatSeconds(r.balanced.max)} balanced over ${r.n} shard(s). ` +
    `Wall-clock with ${formatSeconds(r.setupSeconds)} setup: ${formatSeconds(r.current.wall)} -> ${formatSeconds(r.balanced.wall)} ` +
    `(${s.wallSeconds >= 0 ? "saves" : "adds"} ${formatSeconds(Math.abs(s.wallSeconds))}).`;
}
