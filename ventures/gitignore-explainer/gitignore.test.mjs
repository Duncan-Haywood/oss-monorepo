import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, why, parseRule, splitSources, reportCsv, DEFAULTS, compile, resolver } from "./gitignore.mjs";

const run = (sources, paths, tracked = "") => analyze({ sources, paths, tracked });
const decide = (sources, path, isDir = false) => resolver(compile(sources))(path, isDir);

test("parseRule follows git's line rules", () => {
  assert.equal(parseRule("# comment"), null);
  assert.equal(parseRule(""), null);
  assert.equal(parseRule("   "), null);
  assert.deepEqual(parseRule("build/"), { text: "build/", pattern: "build", negated: false, dirOnly: true, anchored: false, prefix: 5 });
  assert.equal(parseRule("/build").anchored, true);
  assert.equal(parseRule("/build").pattern, "build");
  assert.equal(parseRule("docs/*.pdf").anchored, true);
  assert.equal(parseRule("!keep.txt").negated, true);
  assert.equal(parseRule("\\!bang").negated, false);
  assert.equal(parseRule("a.log  ").text, "a.log");
  assert.equal(parseRule("a.log\\ ").text, "a.log\\ ");
  assert.equal(parseRule("a.log\t").text, "a.log\t", "tabs are not trimmed");
  assert.equal(parseRule("a.log\r").text, "a.log", "CRLF line endings");
});

test("splitSources reads head-style bundles and a bare root file", () => {
  assert.deepEqual(splitSources("*.log").map((f) => f.path), [".gitignore"]);
  const files = splitSources("*.log\n==> web/.gitignore <==\ndist\n\n==> .git/info/exclude <==\nlocal/\n");
  assert.deepEqual(files.map((f) => f.path), [".gitignore", "web/.gitignore", ".git/info/exclude"]);
  assert.deepEqual(files[1].lines, ["dist"]);
});

test("last matching rule wins, deeper files beat shallower, info/exclude comes last", () => {
  const src = "*.log\n!keep.log\n==> sub/.gitignore <==\n!*.log\n==> .git/info/exclude <==\n*.tmp\n!x.tmp";
  assert.equal(decide(src, "a.log").ignored, true);
  assert.equal(decide(src, "keep.log").ignored, false);
  assert.equal(decide(src, "sub/a.log").ignored, false);
  assert.equal(decide(src, "sub/a.log").rule.source, "sub/.gitignore");
  assert.equal(decide(src, "y.tmp").ignored, true);
  assert.equal(decide(src, "y.tmp").rule.source, ".git/info/exclude");
});

test("a rule with a slash is anchored to its file's directory", () => {
  const src = "docs/*.pdf\n==> web/.gitignore <==\n/dist";
  assert.equal(decide(src, "docs/a.pdf").ignored, true);
  assert.equal(decide(src, "web/docs/a.pdf").ignored, false);
  assert.equal(decide(src, "web/dist", true).ignored, true);
  assert.equal(decide(src, "web/x/dist", true).ignored, false);
  assert.equal(decide(src, "dist", true).ignored, false, "a nested file never speaks for its parents");
});

test("an ignored directory hides everything below it, negations included", () => {
  const r = decide("build/\n!build/keep.txt", "build/keep.txt");
  assert.equal(r.ignored, true);
  assert.equal(r.via, "build");
  assert.equal(r.own.text, "!build/keep.txt");
  // the contents pattern leaves the directory open, so the negation works
  assert.equal(decide("build/*\n!build/keep.txt", "build/keep.txt").ignored, false);
});

test("a .gitignore inside an ignored directory is never read", () => {
  const r = decide("vendor/\n==> vendor/lib/.gitignore <==\n!*", "vendor/lib/a.c");
  assert.equal(r.ignored, true);
  assert.equal(r.rule.text, "vendor/");
});

test("git before 2.52 lets `a**/x` cross directories; 2.52 and later do not", () => {
  const legacy = (src, path) => resolver(compile(src, { git: "legacy" }))(path, false).ignored;
  assert.equal(legacy("/a**/*.c", "a.c/ab/b.c/b.c"), true);
  assert.equal(legacy("/x**/y", "xa/b/y"), true);
  assert.equal(decide("/a**/*.c", "a.c/ab/b.c/b.c").ignored, false);
  assert.equal(decide("/x**/y", "xa/b/y").ignored, false);
  assert.equal(decide("/x**/y", "xab/y").ignored, true, "glued ** still acts like *");
  // patterns without ** after literal text are the same in both
  for (const [src, path] of [["/a/**/b", "a/x/y/b"], ["src/*.js", "src/a.js"], ["/ab*", "abc"]]) {
    assert.equal(legacy(src, path), decide(src, path).ignored, src);
  }
});

test("gitModeFor reads git --version", async () => {
  const { gitModeFor } = await import("./gitignore.mjs");
  assert.equal(gitModeFor("git version 2.43.0"), "legacy");
  assert.equal(gitModeFor("git version 2.51.2"), "legacy");
  assert.equal(gitModeFor("git version 2.52.0"), "modern");
  assert.equal(gitModeFor("git version 2.56.0.windows.1"), "modern");
  assert.equal(gitModeFor("nonsense"), "modern");
});

test("the default example finds both blocked negations and a verified fix", () => {
  const r = analyze();
  const blocked = r.findings.filter((f) => f.kind === "negation-blocked");
  assert.deepEqual(blocked.map((f) => `${f.source}:${f.line}`), [".gitignore:3", "packages/web/.gitignore:2"]);
  assert.deepEqual(r.fix.patches, [
    { file: ".gitignore", lines: ["!/build/", "/build/*", "!build/keep.txt"] },
    { file: "packages/web/.gitignore", lines: ["!/dist/", "/dist/*", "!dist/robots.txt"] },
  ]);
  assert.deepEqual(r.fix.fixed.sort(), ["build/keep.txt", "packages/web/dist/robots.txt"]);
  assert.deepEqual(r.fix.unfixed, []);
  assert.deepEqual(r.fix.sideEffects, []);
  assert.ok(r.findings.some((f) => f.kind === "tracked-ignored" && f.paths.includes(".env")));
  assert.ok(r.findings.some((f) => f.kind === "inline-comment" && f.line === 9));
  assert.equal(r.totals.paths, 13);
});

test("the fix carries a negation from a file git never reads up to one it does", () => {
  const r = run("vendor/\n==> vendor/lib/.gitignore <==\n!keep.c", "vendor/lib/keep.c\nvendor/lib/other.c");
  const f = r.findings.find((x) => x.kind === "negation-blocked");
  assert.equal(`${f.source}:${f.line}`, "vendor/lib/.gitignore:1");
  assert.deepEqual(r.fix.patches, [{ file: ".gitignore", lines: ["!/vendor/", "/vendor/*", "!/vendor/lib/", "/vendor/lib/*", "!/vendor/lib/**/keep.c"] }]);
  assert.deepEqual(r.fix.fixed, ["vendor/lib/keep.c"]);
  assert.deepEqual(r.fix.sideEffects, []);
});

test("fix side effects are listed, not hidden", () => {
  // re-opening out/ un-ignores the directory itself (its contents stay ignored)
  const r = run("out/\n!out/keep.txt", "out/keep.txt\nout/\nout/b.txt");
  assert.deepEqual(r.fix.fixed, ["out/keep.txt"]);
  assert.deepEqual(r.fix.sideEffects, [{ path: "out", before: true, after: false }]);
  assert.equal(r.paths.find((p) => p.path === "out/b.txt").ignored, true);
});

test("tracked files matched by a rule are reported, untracked ones are not", () => {
  const r = run("*.env", "local.env", "prod.env");
  const f = r.findings.filter((x) => x.kind === "tracked-ignored");
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].paths, ["prod.env"]);
});

test("unmatched, shadowed and redundant rules", () => {
  const r = run("docs/*.pdf\n*.log\n!*.log\n*.tmp\n/a.tmp", "a.log\na.tmp\nsrc/docs/b.pdf");
  const kind = (line) => r.findings.find((f) => f.line === line && ["unmatched", "shadowed", "redundant"].includes(f.kind))?.kind;
  assert.equal(kind(1), "unmatched");
  assert.match(r.findings.find((f) => f.line === 1).detail, /\*\*\/docs\/\*\.pdf/);
  assert.equal(kind(2), "shadowed");
  assert.equal(kind(3), undefined, "the negation decides a.log");
  assert.equal(kind(4), "shadowed", "/a.tmp, later, decides a.tmp");
  assert.equal(kind(5), "redundant", "without it *.tmp would decide a.tmp the same way");
});

test("lint catches the usual copy-paste mistakes", () => {
  const r = run("*.log\t\n  build/\ncoverage # tests\nbin\\\nsrc/**.js\n[abc", "x");
  const kinds = r.findings.map((f) => `${f.kind}:${f.line}`);
  for (const k of ["trailing-tab:1", "leading-space:2", "inline-comment:3", "backslash:4", "starstar:5", "bracket:6"]) assert.ok(kinds.includes(k), k);
  // escapes that are deliberate are not flagged
  assert.ok(!run("\\#notes\n\\!bang\nspace\\ ", "x").findings.some((f) => f.kind === "backslash"));
});

test("path lists accept git status output, quotes, CRLF and directories", () => {
  const r = run("dist/", '?? dist/\r\n!! "odd name.txt"\r\n./src/a.js\r\n# comment\r\n.git/config');
  assert.deepEqual(r.paths.map((p) => [p.path, p.isDir, p.ignored]), [["dist", true, true], ["odd name.txt", false, false], ["src/a.js", false, false]]);
});

test("why walks the directories git enters", () => {
  const w = why({ sources: DEFAULTS.sources, path: "build/keep.txt" });
  assert.equal(w.ignored, true);
  assert.equal(w.via, "build");
  assert.match(w.steps.at(-1).note, /never looks inside build\//);
  const w2 = why({ sources: DEFAULTS.sources, path: "important.log" });
  assert.equal(w2.ignored, false);
  assert.equal(w2.rule.text, "!important.log");
});

test("reportCsv quotes every field that needs it", () => {
  const csv = reportCsv(run('*.log', 'a "b".log'));
  assert.match(csv, /^path,tracked,ignored,deciding_rule/);
  assert.match(csv, /"a ""b"".log",false,true,"\*\.log",".gitignore",1,""/);
});

test("a large list stays fast", () => {
  const rules = Array.from({ length: 200 }, (_, i) => (i % 3 ? `*.ext${i}` : `dir${i}/`)).join("\n");
  const paths = Array.from({ length: 20000 }, (_, i) => `pkg${i % 50}/dir${i % 200}/f${i}.ext${i % 200}`).join("\n");
  const t0 = performance.now();
  const r = run(rules, paths);
  assert.equal(r.paths.length, 20000);
  assert.ok(performance.now() - t0 < 15000, `took ${Math.round(performance.now() - t0)} ms`);
});

test("a negated folder inside an ignored folder is blocked too, and its contents come back with the fix", () => {
  const r = run("build/\n!build/keep.txt\n!build/assets/", "build/keep.txt\nbuild/assets/logo.svg\nbuild/app.js");
  const blocked = r.findings.filter((f) => f.kind === "negation-blocked");
  assert.deepEqual(blocked.map((f) => f.paths), [["build/keep.txt"], ["build/assets/"]]);
  assert.deepEqual(r.fix.patches[0].lines, ["!/build/", "/build/*", "!build/keep.txt", "!build/assets/"]);
  assert.deepEqual(r.fix.fixed.sort(), ["build/assets", "build/assets/logo.svg", "build/keep.txt"]);
  assert.deepEqual(r.fix.sideEffects, []);
  assert.equal(r.paths.find((p) => p.path === "build/app.js").ignored, true);
});
