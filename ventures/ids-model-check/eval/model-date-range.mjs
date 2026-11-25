// The editor page's "Use the model's range" on a date and a duration
// property, driven in Chromium (Playwright): opens an IDS asking for
// Pset_Warranty.WarrantyStartDate (IFCDATE) and WarrantyPeriod (IFCDURATION)
// on doors, opens a model of 600 doors with those values, clicks the button on
// both rows, then "Write as a pattern" on the date row, and checks the written IDS with this checker against the model.
//   node eval/model-date-range.mjs            (eval/model-date-range-2026-11-17.md)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check } from "../node.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = new URL("..", import.meta.url).pathname;
const house = fs.readFileSync(path.join(dir, "samples/tiny-house.ifc"), "utf8");
// 600 doors: start dates spread over 2021 to 2026, one moved 400 days earlier;
// periods P1Y to P4Y, one P4Y6M (more values than the inventory lists).
let out = "", id = 5000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const gid = (k) => ("3Wty" + String(k).padStart(18, "0")).slice(0, 22);
for (let i = 0; i < 600; i++) {
  const start = Date.parse("2022-01-01") + ((i * 37) % 1826) * 86400000 + (i === 7 ? -400 * 86400000 : 0);
  const e = id++, ps = id++, a = id++, p = id++, rel = id++;
  out += `#${e}=IFCDOOR('${gid(e)}',$,'D-${i}',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);\n#${ps}=IFCPROPERTYSET('${gid(ps)}',$,'Pset_Warranty',$,(#${a},#${p}));\n`;
  out += `#${a}=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCDATE('${iso(start)}'),$);\n#${p}=IFCPROPERTYSINGLEVALUE('WarrantyPeriod',$,IFCDURATION('P${1 + (i % 4)}Y${i === 3 ? "6M" : ""}'),$);\n`;
  out += `#${rel}=IFCRELDEFINESBYPROPERTIES('${gid(rel)}',$,$,$,(#${e}),#${ps});\n`;
}
const model = house.replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${out}ENDSEC;\nEND-ISO-10303-21;\n`);
const prop = (n, dt) => `<property dataType="${dt}" cardinality="optional"><propertySet><simpleValue>Pset_Warranty</simpleValue></propertySet><baseName><simpleValue>${n}</simpleValue></baseName></property>`;
const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Warranty</title></info><specifications>
<specification name="Door warranty" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability>
<requirements>${prop("WarrantyStartDate", "IFCDATE")}${prop("WarrantyPeriod", "IFCDURATION")}</requirements></specification></specifications></ids>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-range-"));
fs.writeFileSync(path.join(tmp, "w.ids"), ids);
fs.writeFileSync(path.join(tmp, "doors.ifc"), model);

const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".xsd": "application/xml" };
const srv = http.createServer((req, res) => {
  const root = path.resolve(dir);
  const p = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); res.end(b); });
}).listen(0, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${srv.address().port}/editor.html`);
  await page.setInputFiles("#open", path.join(tmp, "w.ids"));
  await page.waitForFunction(() => /Warranty/.test(document.body.textContent) && document.querySelectorAll("[data-act]").length > 3);
  await page.setInputFiles("#open-model", path.join(tmp, "doors.ifc"));
  await page.waitForFunction(() => document.querySelectorAll('[data-act="model-range"]').length >= 2, null, { timeout: 60000 });
  const notes = await page.$$eval('[data-act="model-range"]', (bs) => bs.map((b) => b.parentElement.textContent.replace(/\s+/g, " ").trim()));
  for (let k = 0; k < 2; k++) {
    await page.click('[data-act="model-range"]');
    await page.waitForTimeout(300);
  }
  const left = await page.$$eval('[data-act="model-range"]', (bs) => bs.length);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const xml = fs.readFileSync(await dl.path(), "utf8");
  const r = check(xml, model);
  // The date row's IfcTester note offers the same dates as a pattern.
  await page.click('[data-act="date-pattern"]');
  await page.waitForTimeout(300);
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const xml2 = fs.readFileSync(await dl2.path(), "utf8");
  const res = {
    notes, buttonsLeft: left, errors,
    ranges: [...xml.matchAll(/<xs:restriction base="(xs:[a-z]+)">\s*<xs:minInclusive value="([^"]+)"\/>\s*<xs:maxInclusive value="([^"]+)"\/>/g)].map((m) => m.slice(1)),
    status: r.specs.map((s) => `${s.name}: ${s.status}`),
    oneDayLate: check(xml, model.replace("IFCDATE('2026-12-30')", "IFCDATE('2026-12-31')")).specs[0].status,
    asPattern: { length: (xml2.match(/<xs:pattern value="([^"]+)"/) || [, ""])[1].length, status: check(xml2, model).specs[0].status, oneDayLate: check(xml2, model.replace("IFCDATE('2026-12-30')", "IFCDATE('2026-12-31')")).specs[0].status },
  };
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
  fs.rmSync(tmp, { recursive: true });
  process.exit(res.ranges.length === 2 && r.specs.every((s) => s.status === "pass") && res.oneDayLate === "fail" && res.asPattern.status === "pass" && res.asPattern.oneDayLate === "fail" && !errors.length ? 0 : 1);
});
