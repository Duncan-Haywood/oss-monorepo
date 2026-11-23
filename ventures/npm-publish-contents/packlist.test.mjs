import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, braceExpand, compileRule, buildTree, packlist, parseFileList, parseIgnoreBundle, reportCsv, EXAMPLE, classify } from "./packlist.mjs";

const pack = (files, contents, pkg = { name: "p", version: "1.0.0" }) =>
  packlist(buildTree(["package.json", ...files, ...Object.keys(contents)], { ...contents, "package.json": JSON.stringify(pkg) }), pkg).files.sort();

test("brace expansion follows brace-expansion", () => {
  assert.deepEqual(braceExpand("a{b,c}d"), ["abd", "acd"]);
  assert.deepEqual(braceExpand("{1..3}"), ["1", "2", "3"]);
  assert.deepEqual(braceExpand("x{01..03}"), ["x01", "x02", "x03"]);
  assert.deepEqual(braceExpand("readme{,.*[^~$]}"), ["readme", "readme.*[^~$]"]);
  assert.deepEqual(braceExpand("{a}"), ["{a}"]);
});

test("rules are minimatch: matchBase, nocase, dot", () => {
  assert.equal(compileRule("*.js").match("lib/A.JS"), true);
  assert.equal(compileRule("lib/*.js").match("x/lib/a.js"), false);
  assert.equal(compileRule("*").match(".env"), true);
  assert.equal(compileRule("!x").negate, true);
  assert.equal(compileRule("!!x").negate, false);
});

test("a root .npmignore replaces the root .gitignore", () => {
  const files = pack([".env", "index.js"], { ".gitignore": ".env\n", ".npmignore": "test/\n" });
  assert.ok(files.includes(".env"));
  const without = pack([".env", "index.js"], { ".gitignore": ".env\n" });
  assert.ok(!without.includes(".env"));
});

test("files is an allow-list but README, LICENSE and package.json always ship", () => {
  const files = pack(["README.md", "LICENSE", "lib/a.js", "src/a.ts", "notes.md"], {}, { name: "p", files: ["lib"] });
  assert.deepEqual(files, ["LICENSE", "README.md", "lib/a.js", "package.json"]);
});

test("root node_modules and lockfiles never ship, nested node_modules do", () => {
  const files = pack(["node_modules/x/index.js", "lib/node_modules/y/index.js", "package-lock.json", "yarn.lock"], {});
  assert.deepEqual(files, ["lib/node_modules/y/index.js", "package.json"]);
});

test("sub-folder ignore files still apply under files", () => {
  const files = pack(["lib/a.js", "lib/a.test.js"], { "lib/.npmignore": "*.test.js\n" }, { name: "p", files: ["lib"] });
  assert.deepEqual(files, ["lib/a.js", "package.json"]);
});

test("main with a leading ./ is not forced in, bin is", () => {
  const pkg = { name: "p", main: "./dist/index.js", bin: { p: "./bin/cli.js" }, files: ["lib"] };
  const files = pack(["dist/index.js", "bin/cli.js"], {}, pkg);
  assert.deepEqual(files, ["bin/cli.js", "package.json"]);
  const plain = pack(["dist/index.js", "bin/cli.js"], {}, { ...pkg, main: "dist/index.js" });
  assert.deepEqual(plain, ["bin/cli.js", "dist/index.js", "package.json"]);
  const r = analyze({ packageJson: pkg, files: ["dist/index.js", "bin/cli.js"] });
  assert.ok(r.findings.some((f) => f.id === "main-dot-slash"));
  assert.ok(r.findings.some((f) => f.id === "entry-missing"));
});

test("the example report flags the leaked .env through the shadowed .gitignore", () => {
  const r = analyze({ packageJson: EXAMPLE.packageJson, files: parseFileList(EXAMPLE.files), ignoreFiles: parseIgnoreBundle(EXAMPLE.ignoreFiles) });
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes("secret-ships"));
  assert.ok(ids.includes("gitignore-shadowed"));
  assert.ok(r.files.includes(".env"));
  assert.ok(!r.files.includes(".env.example") || !classify(".env.example").secret);
  assert.ok(!r.files.includes("src/index.ts"));
  assert.ok(!r.files.includes("node_modules/left-pad/index.js"));
  const env = r.rows.find((x) => x.path === ".env");
  assert.match(env.reason, /no rule matches/);
  const src = r.rows.find((x) => x.path === "src/format.ts");
  assert.match(src.reason, /folder src\/ is never entered: \.npmignore:1/);
  assert.match(reportCsv(r), /^path,ships,reason,flag\n/);
});

test("file lists: plain, npm notice lines and npm pack --json", () => {
  assert.deepEqual(parseFileList("./a.js\nlib/b.js\n\n# c\n"), ["a.js", "lib/b.js"]);
  assert.deepEqual(parseFileList("npm notice 1.2kB lib/a.js\nnpm notice 300B package.json"), ["lib/a.js", "package.json"]);
  assert.deepEqual(parseFileList(JSON.stringify([{ files: [{ path: "a.js" }, { path: "package.json" }] }])), ["a.js", "package.json"]);
});

test("ignore bundle: head-style and --- headers", () => {
  const m = parseIgnoreBundle("==> .npmignore <==\ntest/\n\n--- lib/.gitignore\n*.log\n");
  assert.equal(m.get(".npmignore"), "test/");
  assert.equal(m.get("lib/.gitignore"), "*.log");
});

test("a files entry that selects nothing is reported", () => {
  const r = analyze({ packageJson: { name: "p", files: ["dist", "lib"] }, files: ["lib/a.js"] });
  const f = r.findings.find((x) => x.id === "files-entry-unused");
  assert.deepEqual(f.paths, ["dist"]);
});

test("a key file that ships is high severity", () => {
  const r = analyze({ packageJson: { name: "p" }, files: ["index.js", "certs/server.key"] });
  assert.equal(r.findings[0].id, "secret-ships");
  assert.equal(r.findings[0].severity, "high");
});

test("un-ignoring one file in an ignored folder publishes the whole folder", () => {
  const files = pack(["index.js", "secrets/public.pem", "secrets/private.pem"], { ".npmignore": "secrets/\n!secrets/public.pem\n" });
  assert.deepEqual(files, ["index.js", "package.json", "secrets/private.pem", "secrets/public.pem"]);
  const fixed = pack(["index.js", "secrets/public.pem", "secrets/private.pem"], { ".npmignore": "secrets/**\n!secrets/public.pem\n" });
  assert.deepEqual(fixed, ["index.js", "package.json", "secrets/public.pem"]);
  const r = analyze({ packageJson: { name: "s" }, files: ["index.js", "secrets/public.pem", "secrets/private.pem"], ignoreFiles: { ".npmignore": "secrets/\n!secrets/public.pem\n" } });
  const f = r.findings.find((x) => x.id === "folder-rule-bypassed");
  assert.equal(f.severity, "high");
});

test("CSV cells that look like formulas are defused", () => {
  const r = analyze({ packageJson: { name: "p" }, files: ["=HYPERLINK(1).js", "-x.js"] });
  const csv = reportCsv(r);
  assert.match(csv, /^"'=HYPERLINK\(1\)\.js",yes/m);
  assert.match(csv, /^"'-x\.js",yes/m);
});
