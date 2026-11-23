// Writes random .dockerignore cases, runs them through BuildKit's own code
// (oracle/main.go: moby/patternmatcher + tonistiigi/fsutil) and saves cases
// and answers to oracle-fixture.json, which dockerignore.diff.test.mjs
// replays against matcher.mjs without needing Go.
//
//   node ventures/dockerignore-explainer/oracle.gen.mjs [count] [seed]
//
// Needs Go 1.25+ and network for the first `go run` (module download).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// Names and pattern pieces chosen to reach the corners: dotfiles, the three
// star forms, classes with ^ and !, escapes, regexp metacharacters, "..",
// spaces, # and !-prefixed names, and one non-ASCII name.
const NAMES = ["a", "b", "ab", "a.md", "b.go", ".env", "x.log", "node_modules", "src", "docs", "keep", "a b", "#c", "!n", "x^y", "[a]", "é", "a+b", "d.d"];
const PIECES = ["a", "b", "ab", "*", "**", "?", ".", "md", "go", ".env", "x", "log", "node_modules", "src", "docs", "keep", "[ab]", "[^a]", "[!a]", "[a-c]", "\\*", "\\.", "\\a", "^", "+", "é", "..", "#c", " ", "[[:alpha:]]", "\\d", "[", "]"];

export function genCase(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const files = new Set();
  const dirs = new Set();
  const nf = 1 + Math.floor(r() * 9);
  for (let i = 0; i < nf; i++) {
    const depth = 1 + Math.floor(r() * 3);
    const parts = [];
    for (let d = 0; d < depth; d++) parts.push(pick(NAMES));
    files.add(parts.join("/"));
  }
  if (r() < 0.3) dirs.add(pick(NAMES) + "/" + pick(NAMES));
  // A path cannot be both a file and a folder: drop files that are a prefix.
  const all = [...files];
  const clean = all.filter((f) => !all.some((g) => g !== f && g.startsWith(f + "/")) && ![...dirs].some((d) => d === f || d.startsWith(f + "/")));
  const dirList = [...dirs].filter((d) => !clean.some((f) => d.startsWith(f + "/") || f === d));
  const lines = [];
  const nl = 1 + Math.floor(r() * 5);
  for (let i = 0; i < nl; i++) {
    let p = "";
    if (clean.length && r() < 0.55) {
      // From a real path: a prefix of its segments, some swapped for globs.
      const segs = pick(clean).split("/");
      const keep = segs.slice(0, 1 + Math.floor(r() * segs.length));
      p = keep.map((s) => (r() < 0.25 ? pick(["*", "**", "?" + s.slice(1), s[0] + "*", "[" + s[0] + "]" + s.slice(1)]) : s)).join("/");
      if (r() < 0.3) p = "**/" + p;
    } else {
      const np = 1 + Math.floor(r() * 3);
      for (let j = 0; j < np; j++) {
        p += pick(PIECES);
        if (j < np - 1) p += r() < 0.6 ? "/" : "";
      }
    }
    if (r() < 0.12) p = "/" + p;
    if (r() < 0.08) p = "./" + p;
    if (r() < 0.06) p += "/";
    if (r() < 0.3) p = "!" + p;
    if (r() < 0.04) p = "  " + p;
    if (r() < 0.03) p = "# " + p;
    lines.push(p);
  }
  return { ignore: lines.join("\n") + "\n", files: clean, dirs: dirList };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = Number(process.argv[2] || 3000);
  const seed = Number(process.argv[3] || 20261123);
  const r = rng(seed);
  const cases = Array.from({ length: count }, () => genCase(r));
  const dir = fileURLToPath(new URL("./oracle/", import.meta.url));
  const out = execFileSync("go", ["run", "."], { cwd: dir, input: JSON.stringify(cases), maxBuffer: 1 << 28 });
  const results = JSON.parse(out.toString());
  const goVersion = execFileSync("go", ["env", "GOVERSION"], { cwd: dir }).toString().trim();
  writeFileSync(
    new URL("./oracle-fixture.json", import.meta.url),
    JSON.stringify({ generated: "oracle.gen.mjs", seed, count, oracle: "moby/patternmatcher v0.6.1 + tonistiigi/fsutil v0.0.0-20261103125000-e075fd9305eb", go: goVersion, cases: cases.map((c, i) => ({ ...c, ...results[i] })) }) + "\n",
  );
  console.log(`wrote ${count} cases (seed ${seed}, ${goVersion})`);
}
