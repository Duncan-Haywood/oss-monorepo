// Clicks index.html in a real browser: the "outline" roof shape draws the all-hip roof plan (roof lines and every
// rafter, roofplan.mjs) with its eave sides dimensioned, lays its sheathing in courses (outlinesheathing.mjs), puts the
// framing and the sheathing on the material list, and a DXF fills the outline (from the walls, or an eave line on a roof layer). `node eval-roof-plan-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
let chromium;
const candidates = ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) =>
  !c.startsWith("/") || !existsSync(c) ? c : statSync(c).isDirectory() ? join(c, "index.mjs") : c);
for (const c of candidates) {
  try { const m = await import(c.startsWith("/") ? "file://" + c : c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {}
}
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types = { ".html": "text/html", ".mjs": "text/javascript" };
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(req.url.split("?")[0]));
    res.writeHead(200, { "content-type": types[extname(p)] || "text/plain" }).end(await readFile(p));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }); } catch (e) { console.log("skipped: no Chromium:", e.message.split("\n")[0]); server.close(); process.exit(0); }
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "ok: " : "FAIL: ") + msg); if (!ok) fail = 1; };
await page.click("#example");
await page.check("#rfOn");
await page.selectOption("#rfShape", "outline");
check(await page.isVisible("#rfOutline"), "outline box shown for the outline shape");
check(!(await page.isVisible("#rfW")), "roof width hidden for the outline shape");
check(!(await page.isVisible("#rfWing")), "wings hidden for the outline shape");
// an L: 40 x 20 ft with a 20 x 15 ft leg
await page.fill("#rfOutline", "0, 0\n40', 0\n40', 20'\n20', 20'\n20', 35'\n0, 35'");
await page.fill("#rfPitch", "4");
await page.selectOption("#rfHip", "2x10");
await page.click("#run");
await page.waitForSelector("#roofPlan svg", { timeout: 10000 });
const kinds = await page.$$eval("#roofPlan svg line", (ls) => ls.map((l) => l.getAttribute("data-kind")));
check(kinds.filter((k) => k === "valley").length === 1, `one valley drawn (${kinds.filter((k) => k === "valley").length})`);
check(kinds.filter((k) => k === "hip").length === 5, `five hips drawn (${kinds.filter((k) => k === "hip").length})`);
check(kinds.filter((k) => k === "rafter").length > 10, `common rafters drawn (${kinds.filter((k) => k === "rafter").length})`);
check(kinds.includes("valley jack rafter"), "valley jacks drawn");
const legend = await page.textContent("#roofPlanLegend");
check(/valley \(1\)/.test(legend) && /eave line/.test(legend), `legend ${legend.replace(/\s+/g, " ").trim()}`);
const cuts = await page.textContent("#cuts");
check(/hip rafter/.test(cuts) && /valley rafter/.test(cuts), "hip and valley rafters in the cut list");
check(!(await page.isHidden("#roofCard")), "roof card shown");
// the eave sides are dimensioned, and the same roof's sheathing is laid in courses (outlinesheathing.mjs)
const dims = await page.$$eval("#roofPlan svg text", (ts) => ts.map((t) => t.textContent));
check(dims.length === 6 && dims.includes(`42' 0"`) && dims.includes(`37' 0"`), `six eave dimensions (${dims.join(", ")})`);
const roofOut = await page.textContent("#roofOut");
check(/Roof sheathing \(all-hip, from outline\): \d+ sheets/.test(roofOut) && /Plane 3 \(eave side 240"/.test(roofOut), "sheathing courses on the roof card");
// the L's valley-corner fills leave joints with no rafter: their nailers and blocks are in the cut list (the lumber order)
check(/Blocking under joints with no rafter \(2x\d+, in the lumber order\): \d+ nailers? the course wide and \d+ blocks/.test(roofOut), "blocking under joints with no rafter on the roof card");
check(/sheathing block/.test(cuts) && /sheathing nailer/.test(cuts), "sheathing blocks and nailers in the cut list");
await page.screenshot({ path: process.env.SHOT || "/dev/null", fullPage: false, clip: await page.$eval("#roofCard", (e) => { e.scrollIntoView(); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY - window.scrollY, width: r.width, height: Math.min(r.height, 1400) }; }) }).catch(() => {});
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#mlCsv")]);
const csv = (await readFile(await dl.path(), "utf8")).trimEnd().split("\n");
check(csv.some((l) => l.startsWith('Roof,"roof area (all-hip, from outline)",')), "outline squares on the material list");
check(csv.some((l) => l.startsWith("Roof,rafters framed from outline,")), "framed rafters on the material list");
check(csv.some((l) => l.startsWith('Roof,"roof sheathing (all-hip, from outline)",4x8,')), "outline roof sheathing on the material list");
// the two roof prices on the form weigh the hip starts (outlinesheathing.mjs): the 30 x 30 ft stair-step at 6:12,
// opened from a plan file with 20 ft boards (its 198" hips are longer than the example's 16 ft stock)
check(await page.isVisible("#rfSheetPrice") && await page.isVisible("#rfBlockPrice"), "sheet and blocked-joint price fields shown for the outline shape");
const [first] = await Promise.all([page.waitForEvent("download"), page.click("#savePlan")]);
const stairPlan = JSON.parse(await readFile(await first.path(), "utf8"));
check(stairPlan.roof && stairPlan.roof.sheet === undefined, "no roof.sheet in the plan while both prices are blank");
stairPlan.roof = { ...stairPlan.roof, outline: [[0, 0], [360, 0], [360, 120], [240, 120], [240, 240], [120, 240], [120, 360], [0, 360]], pitch: 6, overhang: 12, sheet: { price: 25, blockedJointPrice: 20 } };
stairPlan.stock.push(...["2x8", "2x10"].map((size) => ({ size, length: 240, price: 20 })));
await page.setInputFiles("#openPlan", { name: "stair-step.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(stairPlan)) });
await page.waitForFunction(() => document.querySelector("#rfBlockPrice").value === "20", null, { timeout: 10000 });
check(await page.inputValue("#rfSheetPrice") === "25", "an opened plan's roof.sheet prices fill the fields");
await page.click("#run");
await page.waitForTimeout(300);
const dear = await page.textContent("#roofOut");
if (/Not framed/.test(dear)) check(false, `stair-step not framed: ${dear.slice(dear.indexOf("Not framed"), dear.indexOf("Not framed") + 300)}`);
check(/would save 4 sheets \(\$100\.00 at \$25\.00 a sheet\) but leave 10 more joints with no rafter to block \(\$200\.00 at \$20\.00 a joint\), so they are not used/.test(dear), "at $20 a joint the hip starts are weighed and not used");
await page.fill("#rfBlockPrice", "5");
await page.click("#run");
await page.waitForTimeout(300);
const cheap = await page.textContent("#roofOut");
check(/\(\$100\.00 of sheets at \$25\.00 a sheet against \$40\.00 of blocking at \$5\.00 a joint\)/.test(cheap) && /2 hip ends are not started though they could be/.test(cheap), "at $5 a joint (typed) the starts pay, two weighed out one at a time");
// the typed prices are saved in the plan file's roof.sheet
const [saved] = await Promise.all([page.waitForEvent("download"), page.click("#savePlan")]);
const savedPlan = JSON.parse(await readFile(await saved.path(), "utf8"));
check(savedPlan.roof?.sheet?.price === 25 && savedPlan.roof?.sheet?.blockedJointPrice === 5, `roof.sheet in the saved plan (${JSON.stringify(savedPlan.roof?.sheet)})`);
// one price cleared: the count decides, and the other price is still saved
await page.fill("#rfBlockPrice", "");
await page.click("#run");
await page.waitForTimeout(300);
check(/4 sheets fewer, 10 more joints with no rafter to block/.test(await page.textContent("#roofOut")), "with one price blank the count decides as before");
await page.fill("#rfSheetPrice", "-3");
await page.click("#run");
check(/roof sheathing price per sheet must be a number from 0 to 10000/.test(await page.textContent("#errors")), "a negative sheet price is refused with the field named");
await page.fill("#rfSheetPrice", "");
await page.fill("#rfOutline", "0, 0\n40', 0\n40', 20'\n20', 20'\n20', 35'\n0, 35'");
await page.fill("#rfPitch", "4");
// a too-short stock: the lines are still drawn, nothing framed
await page.fill("#rfPitch", "12");
await page.click("#run");
await page.waitForTimeout(300);
const k2 = await page.$$eval("#roofPlan svg line", (ls) => ls.map((l) => l.getAttribute("data-kind")));
const out2 = await page.textContent("#roofOut");
if (/Not framed/.test(out2)) check(k2.length === 8 && !k2.includes("rafter"), `unframed outline draws its 8 roof lines only (${k2.length})`);
else check(k2.includes("rafter"), "steeper roof still framed");
// a slanted side is taken since 2026-11-27 (skeleton.mjs): its roof lines are drawn, nothing is framed
await page.fill("#rfOutline", "0, 0\n40', 0\n30', 20'\n0, 20'");
await page.click("#run");
await page.waitForSelector("#roofPlan svg", { timeout: 10000 });
const k3 = await page.$$eval("#roofPlan svg line", (ls) => ls.map((l) => l.getAttribute("data-kind")));
check(k3.includes("ridge") && !k3.includes("rafter"), `a slanted side draws its roof lines, no rafters (${k3.length})`);
// bad outline: it crosses itself, an error, no plan
await page.fill("#rfOutline", "0, 0\n40', 20'\n40', 0\n0, 20'");
await page.click("#run");
check(/crosses itself/.test(await page.textContent("#errors")), "a self-crossing outline is refused with the reason");
// a DXF fills the outline
await page.setInputFiles("#openPlan", join(root, "fixtures", "open-house-plans-1.dxf"));
await page.waitForFunction(() => /Opened/.test(document.querySelector("#status").textContent), null, { timeout: 15000 });
const status = await page.textContent("#status");
const filled = await page.inputValue("#rfOutline");
if (/Roof outline filled/.test(status)) check(filled.split("\n").length >= 4, `DXF filled ${filled.split("\n").length} outline corners`);
else console.log(`note: this DXF has no closed exterior loop (${status.slice(0, 160)})`);
// an eave line on a roof layer (roofdxf.mjs): the overhang is measured against the walls and fills the eave field
{
  const g = (c, v) => `${c}\n${v}\n`, ft = (n) => n * 12;
  const L = [[0, 0], [ft(40), 0], [ft(40), ft(20)], [ft(20), ft(20)], [ft(20), ft(35)], [0, ft(35)]];
  const E = [[-18, -18], [ft(40) + 18, -18], [ft(40) + 18, ft(20) + 18], [ft(20) + 18, ft(20) + 18], [ft(20) + 18, ft(35) + 18], [-18, ft(35) + 18]];
  let d = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, 1) + g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  L.forEach((a, i) => { const b = L[(i + 1) % L.length]; d += g(0, "LINE") + g(8, "A-WALL") + g(10, a[0]) + g(20, a[1]) + g(30, 0) + g(11, b[0]) + g(21, b[1]) + g(31, 0); });
  d += g(0, "LINE") + g(8, "A-ROOF") + g(10, -18) + g(20, -18) + g(30, 0) + g(11, ft(10)) + g(21, ft(10)) + g(31, 0); // a hip inside the eave line
  d += g(0, "LWPOLYLINE") + g(8, "A-ROOF") + g(90, E.length) + g(70, 1) + E.map(([x, y]) => g(10, x) + g(20, y)).join("");
  d += g(0, "ENDSEC") + g(0, "EOF");
  await page.$eval("#rfOver", (el) => { el.value = "12 in"; });
  await page.setInputFiles("#openPlan", { name: "l-house-roof.dxf", mimeType: "application/dxf", buffer: Buffer.from(d) });
  await page.waitForFunction(() => /Opened l-house/.test(document.querySelector("#status").textContent), null, { timeout: 15000 });
  const st = await page.textContent("#status");
  check(/Eave line read from the roof layer A-ROOF: 6 corners/.test(st) && /measured from the drawing: 18 in/.test(st), `status names the eave line and the measured overhang (${st.slice(0, 120)}...)`);
  check((await page.inputValue("#rfOver")) === `1' 6"`, `eave overhang filled from the drawing (${await page.inputValue("#rfOver")})`);
  const o = (await page.inputValue("#rfOutline")).split("\n");
  check(o.length === 6 && o[0] === `0", 0"` && o[1] === `40' 0", 0"`, `outline is the wall outline (${o.join(" | ")})`);
  await page.check("#rfOn");
  await page.selectOption("#rfShape", "outline");
  await page.click("#run");
  await page.waitForSelector("#roofPlan svg", { timeout: 10000 });
  const dims = await page.$$eval("#roofPlan svg text", (ts) => ts.map((t) => t.textContent));
  check(dims.includes(`43' 0"`) && dims.includes(`38' 0"`), `eave sides 18 in out on the roof plan (${dims.join(", ")})`);
}
check(errors.length === 0, `no page errors ${errors.join("; ")}`);
await browser.close();
server.close();
process.exit(fail);
