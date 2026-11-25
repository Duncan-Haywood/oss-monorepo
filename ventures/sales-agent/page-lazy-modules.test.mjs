// The model client and the mail-file reader load when first used (perf, 2026-11-25;
// docs/history/sales-agent-page-perf-2026-11-25.md): 134 -> 116 kB gzip, 16 -> 12 modules on first load.
// Pins that neither comes back as a static import, that both load through import(), and that the names the page
// takes from them are exported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("ai.mjs and mailfile.mjs are not static imports of the page, and load through import()", () => {
  const statics = [...html.matchAll(/^\s*import\s[^;]*?from\s+"\.\/([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(statics.includes("engine.mjs"), "the parser found the page's static imports");
  for (const f of ["ai.mjs", "byok.mjs", "mailfile.mjs", "mime.mjs"]) assert.ok(!statics.includes(f), `${f} is imported statically again`);
  assert.deepEqual([...html.matchAll(/import\("\.\/([^"]+)"\)/g)].map((m) => m[1]).sort(), ["ai.mjs", "mailfile.mjs"]);
});

test("the names the page uses from the on-demand modules exist", async () => {
  const ai = await import("./ai.mjs"), mail = await import("./mailfile.mjs");
  assert.equal(typeof ai.runInboxWithModel, "function");
  assert.match(html, /ai\.runInboxWithModel\(/);
  const used = html.match(/const \{ ([^}]+) \} = mf;/)[1].split(",").map((x) => x.trim());
  assert.deepEqual(used, ["createCollector", "MboxSplitter", "isMbox", "describe"]);
  for (const k of used) assert.ok(k in mail, `${k} is not exported by mailfile.mjs`);
});
