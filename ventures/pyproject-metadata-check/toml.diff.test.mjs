// Differential test: parseToml against Python's tomllib on every pyproject.toml in
// this repository (936 on 2026-11-23). The toml-test suite (717 TOML 1.0 cases, all
// agreeing) is run by setting TOML_TEST_DIR to a toml-test checkout's tests/ folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { agree } from "./eval/toml-compare.mjs";

let py = null;
for (const p of [process.env.TOMLLIB_PYTHON, "python3"].filter(Boolean)) {
  try { execFileSync(p, ["-I", "-c", "import tomllib"], { stdio: "ignore" }); py = p; break; } catch { /* next */ }
}
const opts = { skip: py ? false : "no Python 3.11+ (tomllib) found" };
const dump = (srcs) => execFileSync(py, ["-I", new URL("./eval/tomllib_dump.py", import.meta.url).pathname], { input: srcs.map((src) => JSON.stringify({ src })).join("\n") + "\n", maxBuffer: 1 << 28 }).toString().trim().split("\n").map((l) => JSON.parse(l));

function compare(files, readAs) {
  const srcs = files.map(readAs);
  const out = dump(srcs);
  return files.filter((f, i) => !agree(srcs[i], out[i]).agree);
}

test("every pyproject.toml in the repository parses as tomllib reads it", opts, () => {
  const root = new URL("../../", import.meta.url).pathname;
  const files = execFileSync("git", ["ls-files", "*pyproject.toml"], { cwd: root }).toString().trim().split("\n").filter(Boolean).map((f) => root + f);
  assert.ok(files.length > 50, `found ${files.length}`);
  assert.deepEqual(compare(files, (f) => readFileSync(f, "utf8")), []);
});

test("hand-written edge cases agree with tomllib", opts, () => {
  const cases = ['a = """x""""\n', "a = '''x'''''\n", 'a = "\\u00e9\\U0001F600"\n', "a = [1,\n# c\n2,]\n", 'a = {}\n', 'a."b.c" = 1\n', 'a = 0x_1\n', 'a = +inf\nb = -nan\n', 'a = 1_000.5e-3\n', 'a = 07:32:00.999999999\n', 'a = 2000-02-30\n', 'a = 2000-02-29\n', '[[a]]\n[a.b]\n[[a]]\n[a.b]\n', 'a = [{b = 1}]\n[[a]]\n', '"" = 1\n', 'a = "tab\there"\n', 'a = 1\r\n', 'a = 1\r', '\ufeffa = 1\n', 'a.b = 1\n[a]\n', 'a = { b.c = 1, b.d = 2 }\n', 'a = { b = { c = 1 }, b.d = 2 }\n', 'x = 1979-05-27 07:32:00\n', 'x = 1979-05-27T07:32:00+25:00\n', "a = 1 # \x01\n", 'a = 9223372036854775808\n', 'a = -0.0\n'];
  const out = dump(cases);
  assert.deepEqual(cases.filter((c, i) => !agree(c, out[i]).agree), []);
});

test("toml-test suite (when TOML_TEST_DIR is set)", { skip: !py || !process.env.TOML_TEST_DIR ? "set TOML_TEST_DIR to toml-test/tests" : false }, () => {
  const dir = process.env.TOML_TEST_DIR.replace(/\/?$/, "/");
  const list = readFileSync(dir + "files-toml-1.0.0", "utf8").trim().split("\n").filter((f) => f.endsWith(".toml") && existsSync(dir + f));
  assert.ok(list.length > 500);
  assert.deepEqual(compare(list, (f) => new TextDecoder().decode(readFileSync(dir + f))), []);
});
