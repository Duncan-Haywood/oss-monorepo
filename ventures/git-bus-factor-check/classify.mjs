// Browser port of busfactor.py. Keep the two in step: classify.test.mjs runs
// both over the same fixtures and compares the JSON.
export const LOG_COMMAND = "git log --no-merges --since=2.years --format='@@|%an|%ae|%at' --numstat";
const PER_FILE_CAP = 500;
const DAY = 86400;
const BOT = /\[bot\]|dependabot|renovate|github-actions|greenkeeper/i;
const NOISE = new RegExp(
  "(^|/)(node_modules|vendor|dist|build|\\.git|third_party)/" +
  "|(^|/)(package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|poetry\\.lock|Cargo\\.lock|" +
  "go\\.sum|Gemfile\\.lock|composer\\.lock|uv\\.lock)$" +
  "|\\.min\\.(js|css)$|\\.map$",
);

export function cleanPath(raw) {
  let p = raw.trim();
  const m = p.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (m) {
    p = (m[1] + m[3] + m[4]).replace(/\/\//g, "/");
  } else if (p.includes(" => ")) {
    p = p.split(" => ").at(-1);
  }
  return p.replace(/^"|"$/g, "").trim();
}

export function parseLog(text) {
  const commits = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("@@|")) {
      const parts = line.split("|");
      const ts = /^\s*-?\d+\s*$/.test(parts.at(-1)) ? parseInt(parts.at(-1), 10) : NaN;
      if (parts.length < 4 || Number.isNaN(ts)) { cur = null; continue; }
      const email = parts.at(-2).trim().toLowerCase();
      const name = parts.slice(1, -2).join("|").trim() || email;
      cur = { name, email, ts, files: [] };
      commits.push(cur);
    } else if (cur && line.includes("\t")) {
      const bits = line.split("\t");
      if (bits.length < 3) continue;
      const [a, d] = bits;
      const path = bits.slice(2).join("\t");
      const n = (s) => (/^\d+$/.test(s) ? parseInt(s, 10) : 0);
      cur.files.push([cleanPath(path), Math.max(n(a) + n(d), 1)]);
    }
  }
  return commits;
}

function dirKey(path, depth) {
  const segs = path.split("/").slice(0, -1);
  return segs.length ? segs.slice(0, depth).join("/") : "(root)";
}

function split(weights, total) {
  const ranked = [...weights.entries()].sort((x, y) => (y[1] - x[1]) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  let run = 0, bf = 0;
  for (const [, w] of ranked) {
    run += w; bf += 1;
    if (run >= total * 0.5) break;
  }
  return [ranked, bf];
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

export function analyze(allCommits, opts = {}) {
  const { depth = 2, halfLifeDays = 180, inactiveDays = 90, minCommits = 3 } = opts;
  const commits = allCommits.filter((c) => !BOT.test(c.name + " " + c.email));
  if (!commits.length) return { error: "no human commits found in the log" };
  const now = opts.now ?? Math.max(...commits.map((c) => c.ts));
  const hl = halfLifeDays * DAY;
  const people = new Map(), dirs = new Map();
  for (const c of commits) {
    let p = people.get(c.email);
    if (!p) { p = { name: c.name, last: 0, first: c.ts, weight: 0, commits: 0 }; people.set(c.email, p); }
    if (c.ts >= p.last) { p.last = c.ts; p.name = c.name; }
    p.first = Math.min(p.first, c.ts);
    p.commits += 1;
    const decay = Math.pow(0.5, Math.max(now - c.ts, 0) / hl);
    const touched = new Set();
    for (const [path, lines] of c.files) {
      if (NOISE.test(path)) continue;
      const w = Math.min(lines, PER_FILE_CAP) * decay;
      const k = dirKey(path, depth);
      let d = dirs.get(k);
      if (!d) { d = { w: new Map(), commits: new Set(), total: 0 }; dirs.set(k, d); }
      d.w.set(c.email, (d.w.get(c.email) || 0) + w);
      d.total += w;
      touched.add(k);
      p.weight += w;
    }
    for (const k of touched) dirs.get(k).commits.add(c);
  }
  const isActive = (e) => now - people.get(e).last <= inactiveDays * DAY;
  const grand = [...dirs.values()].reduce((s, d) => s + d.total, 0) || 1;
  const out = [];
  for (const [k, d] of dirs) {
    if (d.commits.size < minCommits || d.total <= 0) continue;
    const [ranked, bf] = split(d.w, d.total);
    const [top, topW] = ranked[0];
    const share = topW / d.total;
    let status;
    if (share >= 0.5 && !isActive(top)) status = "orphaned";
    else if (bf === 1 && share >= 0.8) status = "single-owner";
    else status = "shared";
    const backup = ranked.slice(1).find(([e]) => isActive(e) && e !== top)?.[0] ?? null;
    out.push({
      dir: k, busFactor: bf, status,
      owner: people.get(top).name,
      ownerShare: round4(share),
      ownerActive: isActive(top),
      ownerDaysSilent: Math.floor((now - people.get(top).last) / DAY),
      backup: backup ? people.get(backup).name : null,
      commits: d.commits.size,
      weightShare: round4(d.total / grand),
    });
  }
  const rank = { orphaned: 0, "single-owner": 1, shared: 2 };
  out.sort((a, b) => rank[a.status] - rank[b.status] || b.weightShare - a.weightShare || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  const allW = new Map([...people].filter(([, p]) => p.weight > 0).map(([e, p]) => [e, p.weight]));
  const total = [...allW.values()].reduce((s, w) => s + w, 0);
  const repoBf = allW.size ? split(allW, total)[1] : 0;
  return {
    commits: commits.length,
    contributors: people.size,
    activeContributors: [...people.keys()].filter(isActive).length,
    repoBusFactor: repoBf,
    directories: out,
    orphaned: out.filter((r) => r.status === "orphaned").length,
    singleOwner: out.filter((r) => r.status === "single-owner").length,
  };
}

export function summaryLine(r) {
  if (r.error) return r.error;
  return `Repo bus factor ${r.repoBusFactor} (${r.activeContributors} of ${r.contributors} contributors active); ` +
    `${r.orphaned} orphaned and ${r.singleOwner} single-owner of ${r.directories.length} directories.`;
}

export const STATUSES = ["orphaned", "single-owner", "shared"];
