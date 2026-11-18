// Page smoke check (eval/step-bytes-2026-11-18.md): the sample, dropped models and
// the editor's "Open a model", against a server on 127.0.0.1:8765 serving this folder
// (python3 -m http.server 8765 --bind 127.0.0.1).
//   node eval/page-smoke.mjs <venture dir> [more models...]
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)("playwright");
const [V, ...more] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("http://127.0.0.1:8765/index.html");
await p.click("#sample"); await p.waitForFunction(() => /Done in/.test(document.getElementById("status").textContent), null, { timeout: 30000 });
console.log("sample:", await p.textContent("#status"));
for (const f of [V + "/samples/tiny-house.ifczip", V + "/samples/tiny-house.ifcxml", ...more]) {
  await p.setInputFiles("#ifc", f);
  await p.waitForFunction(() => !/Reading/.test(document.getElementById("ifc-name").textContent));
  await p.evaluate(() => { document.getElementById("status").textContent = ""; });
  await p.click("#go"); await p.waitForFunction(() => /Done in|rror|ould not/.test(document.getElementById("status").textContent), null, { timeout: 60000 });
  console.log(f.split("/").pop(), await p.textContent("#status"), (await p.textContent("body")).match(/a (IFC\w+) model with (\d{1,3}(?:,\d{3})+|\d+) entities/)?.slice(1).join(" "));
}
await p.goto("http://127.0.0.1:8765/editor.html");
await p.setInputFiles("#open-model", V + "/samples/tiny-house.ifc");
await p.waitForFunction(() => !/Reading/.test(document.getElementById("model").textContent), null, { timeout: 30000 });
console.log("editor:", (await p.textContent("#model")).slice(0, 150));
console.log("errors:", errs);
await b.close();
