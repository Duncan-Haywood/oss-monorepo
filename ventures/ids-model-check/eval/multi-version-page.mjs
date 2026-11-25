// The editor page on an IDS whose specifications name several IFC versions,
// driven in Chromium (Playwright). Opens a file written for "IFC2X3 IFC4"
// (by default a two-specification one built here; pass a path to open another,
// e.g. eval/corpus/real/OpenAEC-Foundation__OpenAEC-BIM-validator__ids-bestanden_NL_BIM_Basis_ILS_v2.ids)
// and reports the open message, the schema picked, rows held as written, and the
// page's live audit beside the CLI's (`node cli.mjs --audit`).
//   node eval/multi-version-page.mjs [FILE.ids] [SCREENSHOT.png]   (eval/multi-version-2026-11-17.md)
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
const fileArg = process.argv[2] && /\.ids$/i.test(process.argv[2]) ? process.argv[2] : null;
const shot = process.argv.find((a) => /\.png$/i.test(a));
const ids = fileArg ? fs.readFileSync(fileArg, "utf8") : `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Spaces, two versions</title></info><specifications>
${spec("Spaces have a net floor area", "Qto_SpaceBaseQuantities", "NetFloorArea", "IFCAREAMEASURE")}
${spec("Spaces have a reference", "Pset_SpaceCommon", "Reference", "IFCIDENTIFIER")}
</specifications></ids>`;
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
  const schema = await page.$eval("#doc-schema", (e) => e.value);
  const kept = await page.$$eval(".req.kept", (x) => x.length);
  const auditText = await page.$eval("#audit", (e) => e.textContent.replace(/\s+/g, " ").trim());
  const pageErrors = await page.$$eval("#audit li", (lis) => lis.map((l) => l.textContent.replace(/\s+/g, " ").trim()).filter((t) => /^ERROR/.test(t)));
  const note = await page.$$eval("p.muted", (ps) => ps.map((p) => p.textContent.replace(/\s+/g, " ").trim()).find((t) => /keeps its own ifcVersion/.test(t)) || null);
  if (shot) await page.screenshot({ path: shot, fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await browser.close(); srv.close();
  fs.rmSync(tmp, { recursive: true });
  console.log(JSON.stringify({ status, schema, kept, audit: auditText.slice(0, 160), pageErrors: pageErrors.length, cliErrors: cli.length, note, wide, errors }, null, 2));
  process.exit(errors.length || wide ? 1 : 0);
});
