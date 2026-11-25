// The editor page on a public IDS that gives a standard property a dataType
// its template refuses (the audit's pset-datatype), driven in Chromium
// (Playwright): opens the file, counts the rows offering "Use the template's
// type" and the page's pset-datatype errors, clicks every such button, then
// counts again and saves the written IDS for the CLI's audit.
//   node eval/template-type-page.mjs FILE.ids [OUT.ids] [SCREENSHOT.png]   (eval/template-type-2026-11-17.md)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources } from "../node.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = new URL("..", import.meta.url).pathname;
const spec = (name, set, prop, dt) => `<specification ifcVersion="IFC2X3 IFC4" name="${name}"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCSPACE</simpleValue></name></entity></applicability>
<requirements><property dataType="${dt}" cardinality="required"><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${prop}</simpleValue></baseName></property></requirements></specification>`;
const fileArg = process.argv[2];
const shot = process.argv.find((a) => /\.png$/i.test(a));
const ids = fs.readFileSync(fileArg, "utf8");
const cli = auditIds(parseIds(ids), resources()).filter((x) => x.level === "error").map((x) => `${x.specName}: ${x.code}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-multi-version-"));
fs.writeFileSync(path.join(tmp, "multi.ids"), ids);
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".xsd": "application/xml" };
const srv = http.createServer((req, res) => {
  const root = path.resolve(dir);
  const p = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(b); });
}).listen(0, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${srv.address().port}/editor.html`);
  await page.waitForFunction(() => document.querySelectorAll("[data-act]").length > 3);
  await page.setInputFiles("#open", path.join(tmp, "multi.ids"));
  await page.waitForFunction(() => /Opened/.test(document.getElementById("open-status").textContent));
  await page.waitForTimeout(500);
  const status = await page.$eval("#open-status", (e) => e.textContent.replace(/\s+/g, " ").trim());
  const count = () => page.$$eval("#audit li", (lis) => lis.filter((l) => /pset-datatype|can never pass/.test(l.textContent) && /^\s*ERROR/.test(l.textContent)).length);
  const kept = await page.$$eval(".req.kept", (x) => x.length);
  const buttons = await page.$$eval('[data-act="template-type"]', (b) => b.map((x) => x.textContent));
  const before = await count();
  for (;;) { const b = await page.$('[data-act="template-type"]'); if (!b) break; await b.click(); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  const after = await count();
  const out = process.argv.find((a, i) => i > 2 && /\.ids$/i.test(a));
  if (out) fs.writeFileSync(out, await page.$eval("#xml", (e) => e.value ?? e.textContent));
  if (shot) await page.screenshot({ path: shot, fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await browser.close(); srv.close();
  fs.rmSync(tmp, { recursive: true });
  console.log(JSON.stringify({ file: path.basename(fileArg), status, kept, buttons, pageErrorsBefore: before, pageErrorsAfter: after, cliErrorsBefore: cli.filter((x) => /pset-datatype/.test(x)).length, wide, errors }, null, 2));
  process.exit(errors.length || wide ? 1 : 0);
});
