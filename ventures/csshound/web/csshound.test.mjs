// The browser build must judge exactly as the CLI does on the same page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { load } from "./csshound.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const wasm = await load(readFileSync(join(here, "csshound.wasm")));

test("judges a stylesheet against content by PurgeCSS's rules", () => {
  const css = ".card{x:y} .card .title{x:y} .gone{x:y} .a :is(.b,.c){x:y} [type=number]{x:y} @keyframes k{from{x:y}}";
  const r = wasm.analyze(css, '<div class="card a b"><input type="number"></div>', { dynamic: false });
  assert.deepEqual(r.rejected, [".c", ".card .title", ".gone"]);
  assert.equal(r.rules, 5);
  assert.equal(r.dead_rules, 2);
  assert.deepEqual(r.dead.map((d) => d.selector), [".card .title", ".gone"]);
});

test("a class built from a run-time prefix is kept unless dynamic is off", () => {
  const css = ".tier-high{x:y} .tier-low{x:y} .other{x:y}";
  const content = 'el.className = "tier-" + level;';
  assert.deepEqual(wasm.analyze(css, content).rejected, [".other"]);
  assert.deepEqual(wasm.analyze(css, content, { dynamic: false }).rejected, [".other", ".tier-high", ".tier-low"]);
});

test("html mode takes the page's <style> blocks as the CSS", () => {
  const page = "<style>.used{x:y} .unused{x:y}</style><p class=used>hi</p>";
  const r = wasm.analyze(page, "", { html: true });
  assert.deepEqual(r.rejected, [".unused"]);
});

test("a <style> inside a script or a comment is text, not CSS", () => {
  const page =
    "<style>.used{x:y}</style><p class=used>hi</p>" +
    "<script>const t = `<style>.fake{}</style>`;</script><!-- <style>.gone{}</style> -->";
  const r = wasm.analyze(page, "", { html: true });
  assert.deepEqual(r.rejected, []);
});

test("the wasm report equals the CLI report on real pages", (t) => {
  const bin = join(root, "target", "release", "csshound");
  if (!existsSync(bin)) return t.skip("native binary not built (cargo build --release)");
  // pages that load no local stylesheet or script, so the page alone is the input
  const pages = [];
  for (const v of readdirSync(join(root, "..")).sort()) {
    const p = join(root, "..", v, "index.html");
    if (!existsSync(p)) continue;
    const html = readFileSync(p, "utf8");
    if (!/<style/i.test(html) || /<script\b[^>]*\ssrc=|<link\b[^>]*stylesheet/i.test(html)) continue;
    pages.push(p);
    if (pages.length === 40) break;
  }
  assert.ok(pages.length > 0);
  for (const p of pages) {
    const cli = JSON.parse(execFileSync(bin, ["--json", "--no-imports", p], { encoding: "utf8" }));
    const got = wasm.analyze(readFileSync(p, "utf8"), "", { html: true });
    delete got.dead;
    got.page = cli.page;
    assert.deepEqual(got, cli, p);
  }
});
