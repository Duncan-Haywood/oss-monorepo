// The browser build must report exactly what the CLI reports on the same files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname, posix } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { load } from "./cyclehound.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const wasm = await load(readFileSync(join(here, "cyclehound.wasm")));

function readTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push({ path: relative(dir, p).split("\\").join("/"), text: readFileSync(p, "utf8") });
    }
  };
  walk(dir);
  return out;
}

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "cyclehound-"));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  return dir;
}

const sample = {
  "a.mjs": "import { b } from './b.mjs';\nexport const a = 1;\n",
  "b.mjs": "import { c } from './lib';\nexport const b = 2;\n",
  "lib/index.mjs": "import { a } from '../a.mjs';\nexport const c = () => import('./late.mjs');\n",
  "lib/late.mjs": "import '../b.mjs';\nimport './missing.mjs';\n",
  "x.ts": "import type { Y } from './y';\nexport type X = Y;\n",
  "y.ts": "import type { X } from './x';\nexport type Y = X;\n",
  "c.cjs": "const d = require('./d.cjs');\n",
  "d.cjs": "module.exports = require('./c.cjs');\n",
};

test("finds the ring, the type-only pair, the require pair and the missing import", () => {
  const r = wasm.analyze(Object.entries(sample).map(([path, text]) => ({ path, text })));
  assert.deepEqual(r.components.map((c) => c.files), [
    ["a.mjs", "b.mjs", "lib/index.mjs", "lib/late.mjs"],
    ["c.cjs", "d.cjs"],
    ["x.ts", "y.ts"],
  ]);
  assert.deepEqual(r.unresolved, [{ file: "lib/late.mjs", line: 2, spec: "./missing.mjs" }]);
  const noType = wasm.analyze(Object.entries(sample).map(([path, text]) => ({ path, text })), { types: false, require: false });
  assert.deepEqual(noType.components.map((c) => c.files), [["a.mjs", "b.mjs", "lib/index.mjs", "lib/late.mjs"]]);
  const staticOnly = wasm.analyze(Object.entries(sample).map(([path, text]) => ({ path, text })), { types: false, require: false, dynamic: false });
  assert.deepEqual(staticOnly.components.map((c) => c.files), [["a.mjs", "b.mjs", "lib/index.mjs"]]);
});

test("the wasm report equals the CLI report", (t) => {
  const bin = join(root, "target", "release", "cyclehound");
  if (!existsSync(bin)) return t.skip("native binary not built (cargo build --release)");
  const dirs = [tree(sample), join(root, "src"), join(root, "web")];
  for (const name of ["shed-designer", "ai-bookkeeper", "league-schedule-generator"]) {
    const d = join(root, "..", name);
    if (existsSync(d)) dirs.push(d);
  }
  for (const dir of dirs) {
    const files = readTree(dir).filter((f) => !f.path.includes("node_modules"));
    let cli;
    try {
      cli = execFileSync(bin, ["--json", "--no-follow", "--no-gitignore", dir], { encoding: "utf8", maxBuffer: 1 << 26 });
    } catch (e) {
      cli = e.stdout; // exit 1 when there is a cycle
    }
    // The page sees only the folder it was given, so an import that leaves
    // the folder is unresolved there; the CLI finds the file on disk. That is
    // the one expected difference, and the page says so.
    const got = wasm.analyze(files);
    got.unresolved = got.unresolved.filter((u) => !posix.normalize(posix.join(posix.dirname(u.file), u.spec)).startsWith("../"));
    assert.deepEqual(got, JSON.parse(cli), dir);
  }
});
