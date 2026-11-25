// The editor page on a "one of" row of numbers, driven in Chromium
// (Playwright): opens an IDS whose door OverallHeight is one of 2100 or 2400 on
// xs:double (as buildingSMART's IDS-Audit-tool files write numeric lists),
// checks it opens as an editable row with both ticked; opens a model whose
// doors are 2100, 2400 and 2100.0000000000005 high (2100 at 12 digits, as a
// unit round trip leaves it) and clicks "Allow exactly these values"; the
// downloaded IDS lists the three exact heights and passes the model; then
// types "2,4" into the add field and checks the row says IDS cannot read it.
//   node eval/number-oneof-page.mjs [SCREENSHOT.png]   (eval/number-oneof-2026-11-17.md)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check } from "../node.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = new URL("..", import.meta.url).pathname;
const model = fs.readFileSync(path.join(dir, "samples/tiny-house.ifc"), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `#900=IFCDOOR('2HZIdgNmz5bROhh9k9DL01',$,'D-02',$,$,$,$,$,2400.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#901=IFCDOOR('2HZIdgNmz5bROhh9k9DL02',$,'D-03',$,$,$,$,$,2100.0000000000005,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
ENDSEC;
END-ISO-10303-21;
`);
const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Door heights</title></info><specifications>
<specification name="Door heights" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability>
<requirements><attribute><name><simpleValue>OverallHeight</simpleValue></name><value><xs:restriction base="xs:double"><xs:enumeration value="2100"/><xs:enumeration value="2400"/></xs:restriction></value></attribute></requirements></specification></specifications></ids>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-num-oneof-"));
fs.writeFileSync(path.join(tmp, "d.ids"), ids);
fs.writeFileSync(path.join(tmp, "doors.ifc"), model);
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
  await page.setInputFiles("#open", path.join(tmp, "d.ids"));
  await page.waitForFunction(() => /Door heights/.test(document.body.textContent) && document.querySelectorAll("[data-act]").length > 3);
  const kept = await page.$$eval(".req.kept", (x) => x.length);
  const ticked = await page.$$eval('input[data-k="oneOf"]:checked', (x) => x.map((i) => i.value));
  const note = await page.$$eval("p.muted", (ps) => ps.map((p) => p.textContent.replace(/\s+/g, " ").trim()).find((t) => /Real numbers/.test(t)) || null);
  await page.setInputFiles("#open-model", path.join(tmp, "doors.ifc"));
  await page.waitForFunction(() => document.querySelector('[data-act="model-values"][data-pick="oneOf"]'), null, { timeout: 60000 });
  const offer = await page.$eval('[data-act="model-values"][data-pick="oneOf"]', (b) => b.parentElement.textContent.replace(/\s+/g, " ").trim());
  await page.click('[data-act="model-values"][data-pick="oneOf"]');
  await page.waitForTimeout(300);
  const tickedModel = await page.$$eval('input[data-k="oneOf"]:checked', (x) => x.map((i) => i.value));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const xml = fs.readFileSync(await dl.path(), "utf8");
  await page.fill('input[data-k="oneOfAdd"]', "2,4");
  await page.press('input[data-k="oneOfAdd"]', "Enter");
  await page.waitForTimeout(300);
  const warn = await page.$$eval("p.warn", (ps) => ps.map((p) => p.textContent.replace(/\s+/g, " ").trim()).find((t) => /2,4/.test(t)) || null);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await browser.close(); srv.close();
  fs.rmSync(tmp, { recursive: true });
  const listed = [...xml.matchAll(/<xs:enumeration value="([^"]+)"\/>/g)].map((m) => m[1]);
  const v0 = check(ids, model).specs[0], v1 = check(xml, model).specs[0];
  console.log(`opened: kept as written ${kept}, ticked ${JSON.stringify(ticked)}`);
  console.log(`note: ${note}`);
  console.log(`model line: ${offer}`);
  console.log(`after "Allow exactly these values": ticked ${JSON.stringify(tickedModel)}; downloaded list ${JSON.stringify(listed)}`);
  console.log(`verdict on the three doors: opened ${v0.status} (${(v0.failed || []).length} failing; 2100.0000000000005 is within IDS's tolerance of 2100), downloaded ${v1.status}`);
  console.log(`after typing 2,4: ${warn}`);
  console.log(`horizontal scroll at 390 px: ${wide}; page errors: ${errors.length ? errors.join("; ") : "none"}`);
  const ok = kept === 0 && ticked.length === 2 && note && listed.join() === "2100,2100.0000000000005,2400" && v1.status === "pass" && warn && !wide && !errors.length;
  console.log(ok ? "OK" : "FAILED");
  process.exit(ok ? 0 : 1);
});
