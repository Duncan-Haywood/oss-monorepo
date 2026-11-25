// The editor page on a dateTime range, driven in Chromium (Playwright): opens
// an IDS asking a beam's ActualErectionDate (IFCDATETIME) to fall in a range,
// checks the row warns about IfcTester and offers "Write as a pattern",
// clicks it, downloads the IDS and checks the pattern gives the same verdict
// as the range on two beams (one inside, one a millisecond late).
//   node eval/datetime-pattern-page.mjs [SCREENSHOT.png]   (eval/datetime-pattern-2026-11-21.md)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check } from "../node.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const dir = new URL("..", import.meta.url).pathname;
const beam = (n, v) => `#${n}=IFCBEAM('2Bm00000000000000000${n % 100}',$,'B',$,$,$,$,$,.BEAM.);
#${n + 1}=IFCPROPERTYSET('2Bp00000000000000000${n % 100}',$,'Pset_PrecastConcreteElementFabrication',$,(#${n + 2}));
#${n + 2}=IFCPROPERTYSINGLEVALUE('ActualErectionDate',$,IFCDATETIME('${v}'),$);
#${n + 3}=IFCRELDEFINESBYPROPERTIES('2Br00000000000000000${n % 100}',$,$,$,(#${n}),#${n + 1});
`;
const withBeams = (vs) => fs.readFileSync(path.join(dir, "samples/tiny-house.ifc"), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, vs.map((v, i) => beam(910 + 10 * i, v)).join("") + "ENDSEC;\nEND-ISO-10303-21;\n");
const inside = withBeams(["2025-04-01T12:00:00+05:30"]), late = withBeams(["2025-06-30T17:00:00.001"]);
const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Erection window</title></info><specifications>
<specification name="Beams erected in the window" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCBEAM</simpleValue></name></entity></applicability>
<requirements><property dataType="IFCDATETIME"><propertySet><simpleValue>Pset_PrecastConcreteElementFabrication</simpleValue></propertySet><baseName><simpleValue>ActualErectionDate</simpleValue></baseName><value><xs:restriction base="xs:dateTime"><xs:minInclusive value="2025-03-01T07:00:00"/><xs:maxInclusive value="2025-06-30T17:00:00"/></xs:restriction></value></property></requirements></specification></specifications></ids>`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ids-dt-"));
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
  await page.waitForFunction(() => /Erection/.test(document.body.textContent) && document.querySelectorAll("[data-act]").length > 3);
  const btn = await page.$('[data-act="date-pattern"]');
  const warn = btn ? await btn.evaluate((b) => b.parentElement.textContent.replace(/\s+/g, " ").trim()) : null;
  if (btn) await btn.click();
  await page.waitForTimeout(300);
  if (process.argv[2]) await page.screenshot({ path: process.argv[2], fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  const xml = fs.readFileSync(await dl.path(), "utf8");
  await browser.close(); srv.close();
  const pat = (xml.match(/<xs:pattern value="([^"]*)"/) || [])[1] || "";
  const v = (x, m) => check(x, m).specs[0].status;
  console.log(`warning: ${warn}`);
  console.log(`downloaded pattern: ${pat.length} characters; range on xs:dateTime left: ${/xs:minInclusive/.test(xml)}`);
  console.log(`inside beam: range ${v(ids, inside)}, pattern ${v(xml, inside)}; beam 1 ms late: range ${v(ids, late)}, pattern ${v(xml, late)}`);
  console.log(`horizontal scroll at 390 px: ${wide}; page errors: ${errors.length ? errors.join("; ") : "none"}`);
  const ok = warn && !/\$\{/.test(warn) && /instants/.test(warn) && pat.length > 1000 && v(ids, inside) === "pass" && v(xml, inside) === "pass" && v(ids, late) === "fail" && v(xml, late) === "fail" && !wide && !errors.length;
  console.log(ok ? "OK" : "FAILED");
  process.exit(ok ? 0 : 1);
});
