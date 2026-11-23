import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, why, reportCsv, parseFileList, DEFAULTS } from "./dockerignore.mjs";
import { readIgnore, goClean, goMatch, goRegexToJs } from "./matcher.mjs";
import { contextUses } from "./dockerfile.mjs";

const ids = (r) => r.findings.map((f) => f.id);
const row = (r, p) => r.rows.find((x) => x.path === p);

test("readIgnore follows ignorefile.ReadAll", () => {
  const l = readIgnore("\ufeff# c\n  # not\n/abs/x\n! neg/./y\n\na/../b\r\n!\n");
  assert.deepEqual(l.map((x) => x.pattern), [null, "# not", "abs/x", "!neg/y", null, "b", "!"]);
  assert.equal(l[0].comment, true);
});

test("goClean and goMatch behave like Go", () => {
  assert.equal(goClean("a//b/./../c/"), "a/c");
  assert.equal(goClean("/../x"), "/x");
  assert.equal(goClean("../x/.."), "..");
  assert.equal(goMatch("*.go", "a.go"), true);
  assert.equal(goMatch("*.go", "d/a.go"), false);
  assert.equal(goMatch("[^a]", "b"), true);
  assert.throws(() => goMatch("[", "."));
  assert.equal(goMatch("a*[", "."), false); // Go stops checking after the miss
});

test("the regexp translator follows Go's RE2 rules", () => {
  const re = (s) => new RegExp(goRegexToJs(s).source, "u");
  assert.ok(re("^a[^x]b$").test("a/b"));
  assert.ok(re("^[[:digit:]]$").test("7"));
  assert.ok(!re("^\\d$").test("٣")); // Go's \d is ASCII
  assert.match(goRegexToJs("^[z-a]$").error, /range/);
  assert.match(goRegexToJs("^\\k$").error, /escape/);
});

test("the example finds the broken COPY, the secrets, root-only patterns and the !docs trap", () => {
  const r = analyze(DEFAULTS);
  const f = ids(r);
  for (const id of ["copy-excluded", "secret-env", "secret-rc", "root-only", "indented-comment", "folder-exception", "bang-class", "heavy-.git"]) assert.ok(f.includes(id), id);
  assert.equal(r.findings[0].severity, "high");
  assert.equal(row(r, "src/config/default.js").unvisited, "src/config");
  assert.equal(row(r, "src/config").rule.text, "src/config");
  assert.equal(row(r, "logs/server.log").sent, true);
  assert.equal(row(r, "api.log").sent, false);
  assert.equal(row(r, "docs/README.md").sent, false);
  assert.equal(row(r, "node_modules/express/index.js").unvisited, "node_modules");
  // The fix is re-run: every target fixed, nothing else changed.
  assert.ok(r.fix.fixed.length >= 10);
  assert.deepEqual(r.fix.unfixed, []);
  assert.deepEqual(r.fix.sideEffects, []);
  assert.match(r.fix.text, /^\*\*\/node_modules$/m);
  assert.match(r.fix.text, /^!docs\/\*\*$/m);
  assert.match(r.fix.text, /^!src\/config\/default\.js$/m);
  const again = analyze({ ...DEFAULTS, ignore: r.fix.text });
  assert.ok(!ids(again).some((i) => ["copy-excluded", "secret-env", "secret-rc", "root-only", "folder-exception"].includes(i)), ids(again).join());
});

test("a syntax error stops the build and is reported with its line", () => {
  const r = analyze({ ignore: "a\n[b\n", files: "a\nb" });
  assert.equal(r.findings[0].id, "build-fails");
  assert.equal(r.findings[0].line, 2);
  const bang = analyze({ ignore: "x\n!\n", files: "x" });
  assert.match(bang.findings.find((f) => f.id === "build-fails").detail, /illegal exclusion/);
});

test("secrets only sent are medium; copied by COPY . . they are high", () => {
  assert.equal(analyze({ ignore: "", files: ".env\nkey.pem" }).findings.find((f) => f.id === "secret-env").severity, "medium");
  const r = analyze({ ignore: "", files: ".env\nsrc/a.js\nconf/id_ed25519", dockerfile: "FROM x\nCOPY conf /conf\n" });
  assert.equal(r.findings.find((f) => f.id === "secret-ssh").severity, "high");
  assert.equal(r.findings.find((f) => f.id === "secret-env").severity, "medium");
  assert.ok(!analyze({ ignore: "", files: ".env.example" }).findings.length);
});

test("a source that is COPYed by name is not flagged as a secret to exclude", () => {
  const r = analyze({ ignore: "", files: ".npmrc\npackage.json", dockerfile: "FROM node\nCOPY .npmrc package.json ./\n" });
  assert.ok(!ids(r).includes("secret-rc"));
});

test("globs and partial folder copies", () => {
  const r = analyze({ ignore: "*.json", files: "a.json\nb.json\nsrc/x.js\nsrc/x.test.js", dockerfile: "FROM x\nCOPY *.json ./\n" });
  assert.equal(r.findings.find((f) => f.id === "copy-excluded").severity, "high");
  const p = analyze({ ignore: "**/*.test.js", files: "src/x.js\nsrc/x.test.js", dockerfile: "FROM x\nCOPY src ./src\n" });
  assert.ok(ids(p).includes("copy-partial"));
});

test("unused, shadowed and inline-comment rules", () => {
  const r = analyze({ ignore: "!keep\n*\nnothing/here\nbuild # out\n", files: "keep\nsrc/a" });
  assert.ok(ids(r).includes("rule-shadowed"));
  assert.ok(ids(r).includes("rule-unused"));
  assert.ok(ids(r).includes("inline-comment"));
});

test("why walks folder by folder and names a skipped folder", () => {
  const w = why({ ignore: "node_modules\n", path: "node_modules/a/b.js" });
  assert.equal(w.steps.length, 1);
  assert.match(w.steps[0].note, /skips this folder/);
  const v = why({ ignore: "src\n!src/keep/**\n", path: "src/keep/a.js" });
  assert.deepEqual(v.steps.map((s) => s.sent), [true, true, true]);
});

test("file lists: find output, sizes, folders; CSV is formula-safe", () => {
  const l = parseFileList("./a\n./b/\n.\n");
  assert.deepEqual(l.files.map((f) => f.path), ["a"]);
  assert.deepEqual(l.dirs, ["b"]);
  assert.equal(parseFileList("12 a\n3 b c").files[1].path, "b c");
  const csv = reportCsv(analyze({ ignore: "", files: "=cmd" }));
  assert.match(csv, /^'=cmd,file,yes/m);
});

test("Dockerfile reader: flags, JSON form, --from, heredocs, continuations, bind mounts", () => {
  const u = contextUses([
    "# escape=`",
    "FROM node AS build",
    "COPY --chown=1:1 [\"a b.txt\", \"/x/\"]",
    "COPY --from=build /out /out",
    "ADD https://example.com/x.tgz /tmp/",
    "COPY <<EOF /etc/conf",
    "COPY not-an-instruction /",
    "EOF",
    "RUN --mount=type=bind,source=scripts,target=/s `",
    "    sh /s/run.sh",
    "COPY $APP_DIR/ /app/",
    "COPY ./pkg/../src/ /src/",
  ].join("\n"));
  assert.deepEqual(u.uses.map((x) => x.path), ["a b.txt", "scripts", "$APP_DIR", "src"]);
  assert.equal(u.uses[2].variable, true);
  assert.equal(u.skipped.length, 2);
});
