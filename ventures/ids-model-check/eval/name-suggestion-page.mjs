// The editor page on a public IDS with a property one slip from its
// template's name (the audit's pset-property / pset-name "did you mean"),
// driven in Chromium (Playwright): opens the file, counts the rows offering
// "Use <name>" and the page's name errors, clicks every such button (then
// every "Use the template's type" a rename uncovers), counts again and saves
// the written IDS for the CLI's audit.
//   node eval/name-suggestion-page.mjs FILE.ids [OUT.ids] [SCREENSHOT.png]   (eval/name-suggestion-2026-11-17.md)
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
const fileArg = process.argv[2];
const shot = process.argv.find((a) => /\.png$/i.test(a));
const ids = fs.readFileSync(fileArg, "utf8");
const NAME = /pset-property|pset-name/;
const cli = auditIds(parseIds(ids), resources()).filter((x) => x.level === "error" && NAME.test(x.code) && /did you mean/.test(x.message)).length;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-name-suggestion-"));
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
  const count = (re) => page.$$eval("#audit li", (lis, src) => lis.filter((l) => new RegExp(src).test(l.textContent) && /^\s*ERROR/.test(l.textContent)).length, re);
  const nameErr = "did you mean", typeErr = "can never pass";
  const kept = await page.$$eval(".req.kept", (x) => x.length);
  const buttons = await page.$$eval('[data-act="rename-row"]', (b) => b.map((x) => x.textContent));
  const before = await count(nameErr), typeBefore = await count(typeErr);
  for (;;) { const b = await page.$('[data-act="rename-row"]'); if (!b) break; await b.click(); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  const after = await count(nameErr), typeUncovered = await count(typeErr) - typeBefore;
  const tplButtons = await page.$$eval('[data-act="template-type"]', (b) => b.length);
  for (;;) { const b = await page.$('[data-act="template-type"]'); if (!b) break; await b.click(); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  const typeAfter = await count(typeErr);
  const keptAfter = await page.$$eval(".req.kept", (x) => x.length);
  const out = process.argv.find((a, i) => i > 2 && /\.ids$/i.test(a));
  if (out) fs.writeFileSync(out, await page.$eval("#xml", (e) => e.value ?? e.textContent));
  if (shot) await page.screenshot({ path: shot, fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await browser.close(); srv.close();
  fs.rmSync(tmp, { recursive: true });
  console.log(JSON.stringify({ file: path.basename(fileArg), status, kept, buttons, keptAfter, pageDidYouMeanBefore: before, pageDidYouMeanAfter: after, cliDidYouMeanBefore: cli, typeErrorsUncovered: typeUncovered, templateTypeButtons: tplButtons, typeErrorsBefore: typeBefore, typeErrorsAfterBoth: typeAfter, wide, errors }, null, 2));
  process.exit(errors.length || wide ? 1 : 0);
});
