// confinedPath keeps the eval-*-click.mjs servers inside the app directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve, sep } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { confinedPath } from "./static-path.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = resolve(root);

test("a file in the app directory resolves inside it, query dropped", () => {
  assert.equal(confinedPath(root, "/index.html"), join(base, "index.html"));
  assert.equal(confinedPath(root, "/engine.mjs?v=2"), join(base, "engine.mjs"));
  assert.equal(confinedPath(root, "/fixtures/a%20b.dxf"), join(base, "fixtures", "a b.dxf"));
  assert.equal(confinedPath(root, "/sub/../index.html"), join(base, "index.html"));
});

test('"/" maps to the index file only when one is given', () => {
  assert.equal(confinedPath(root, "/", "index.html"), join(base, "index.html"));
  assert.equal(confinedPath(root, "/"), null);
});

test("paths that leave the app directory are refused", () => {
  for (const url of ["/../package.json", "/..%2f..%2fetc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/..", "/%00index.html", "/%E0%A4%A", undefined]) {
    assert.equal(confinedPath(root, url), null, url);
  }
  // a leading "//" or a backslash is read relative to the root, never as an absolute path
  for (const url of ["//etc/passwd", "/%2Fetc/passwd", "/..\\..\\x"]) {
    const p = confinedPath(root, url);
    assert.ok(p?.startsWith(base + sep), `${url} -> ${p}`);
  }
});

test("a sibling directory sharing the root's name prefix is refused", () => {
  const name = base.split(sep).pop();
  assert.equal(confinedPath(root, `/../${name}-evil/x`), null);
});

test("every eval-*-click.mjs server routes requests through confinedPath", () => {
  for (const f of ["browser", "change-order", "cull", "ifc-real", "material-list", "openings", "pricesheet", "schedule", "sketch", "stair", "steps"]) {
    const src = readFileSync(new URL(`./eval-${f}-click.mjs`, import.meta.url), "utf8");
    assert.match(src, /const p = confinedPath\(root, req\.url/, f);
    assert.doesNotMatch(src, /join\(root,/, f);
  }
});
