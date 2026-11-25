// The editor page on a one-of row of dates, driven in Chromium (Playwright):
// opens an IDS whose door warranty start date is "one of" two dates written on
// xs:string (what the editor wrote before 2026-11-17), checks the row opens
// editable with the base note and its "Write on xs:date" button, clicks it,
// downloads the IDS and checks it holds the same values on xs:date and gives
// the same verdict on the sample house with a warranty.
//   node eval/date-oneof-page.mjs [SCREENSHOT.png]   (eval/date-oneof-2026-11-17.md)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check } from "../node.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = new URL("..", import.meta.url).pathname;
const model = fs.readFileSync(path.join(dir, "samples/tiny-house.ifc"), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `#900=IFCPROPERTYSET('1Wty0000000000000000aa',$,'Pset_Warranty',$,(#901));
#901=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCDATE('2024-05-01'),$);
#903=IFCRELDEFINESBYPROPERTIES('1Wty0000000000000000ab',$,$,$,(#23),#900);
ENDSEC;
END-ISO-10303-21;
`);
const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Warranty</title></info><specifications>
<specification name="Door warranty" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability>
<requirements><property dataType="IFCDATE"><propertySet><simpleValue>Pset_Warranty</simpleValue></propertySet><baseName><simpleValue>WarrantyStartDate</simpleValue></baseName><value><xs:restriction base="xs:string"><xs:enumeration value="2024-05-01"/><xs:enumeration value="2025-01-01"/></xs:restriction></value></property></requirements></specification></specifications></ids>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-oneof-"));
fs.writeFileSync(path.join(tmp, "w.ids"), ids);
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".xsd": "application/xml" };
const srv = http.createServer((req, res) => {
  const root = path.resolve(dir);
  const p = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(b); });
}).listen(0, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 390, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${srv.address().port}/editor.html`);
  await page.setInputFiles("#open", path.join(tmp, "w.ids"));
  await page.waitForFunction(() => /Warranty/.test(document.body.textContent) && document.querySelectorAll("[data-act]").length > 3);
  const kept = await page.$$eval(".req.kept", (x) => x.length);
  const ticked = await page.$$eval('input[data-k="oneOf"]:checked', (x) => x.map((i) => i.value));
  const btn = await page.$('[data-act="oneof-base"]');
  const before = btn ? (await btn.evaluate((b) => b.parentElement.textContent.replace(/\s+/g, " ").trim())) : null;
  if (btn) await btn.click();
  await page.waitForTimeout(300);
  const after = await page.$$eval("p.muted", (ps) => ps.map((p) => p.textContent.replace(/\s+/g, " ").trim()).find((t) => /base IDS 1.0 gives/.test(t)) || null);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const xml = fs.readFileSync(await dl.path(), "utf8");
  await browser.close(); srv.close();
  const enumOn = (x) => (x.match(/<xs:restriction base="([^"]+)">\s*<xs:enumeration value="2024-05-01"\/>\s*<xs:enumeration value="2025-01-01"\/>/) || [])[1] || null;
  const v0 = check(ids, model).specs[0].status, v1 = check(xml, model).specs[0].status;
  console.log(`opened: kept as written ${kept}, ticked ${JSON.stringify(ticked)}`);
  console.log(`note before: ${before}`);
  console.log(`note after: ${after}`);
  console.log(`downloaded enumeration base: ${enumOn(xml)} (opened: ${enumOn(ids)}); verdict opened ${v0}, downloaded ${v1}`);
  console.log(`horizontal scroll at 390 px: ${wide}; page errors: ${errors.length ? errors.join("; ") : "none"}`);
  const ok = kept === 0 && ticked.length === 2 && before && after && enumOn(xml) === "xs:date" && v0 === v1 && !wide && !errors.length;
  console.log(ok ? "OK" : "FAILED");
  process.exit(ok ? 0 : 1);
});
