import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

for (const name of ["index.html", "how-many-studs-for-a-wall.html"]) {
  test(`${name} carries the disclaimer, privacy line and sponsor link`, () => {
    const html = page(name);
    assert.match(html, /No warranty/);
    assert.match(html, /not engineering, construction, building-code/i);
    assert.match(html, /not checked against any span table or code/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    assert.match(html, /Not affiliated with any lumberyard/);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<meta name="description" content="[^"]{80,}/);
    assert.match(html, /<link rel="canonical" href="\.\/[\w-]+\.html">/);
    assert.match(html, /<meta property="og:title"/);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  });
}

test("JSON-LD parses, and every FAQ answer on the page matches its structured data", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "SoftwareApplication");
  assert.equal(blocks[0].offers.price, "0");
  assert.equal(blocks[1]["@type"], "FAQPage");
  assert.ok(blocks[1].mainEntity.length >= 6);
  for (const q of blocks[1].mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("every static control has a label, and generated rows label their inputs", () => {
  const html = page("index.html");
  const statics = [...html.replace(/<script type="module">[\s\S]*<\/script>/, "").matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(statics.length >= 9);
  for (const tag of statics) {
    const id = tag.match(/\sid="([^"]+)"/)?.[1];
    assert.ok(/aria-label=/.test(tag) || (id && new RegExp(`<label for="${id}"`).test(html)), `unlabelled: ${tag}`);
  }
  for (const helper of ["const f = ", "const sel = ", "const chk = ", "const del = "]) {
    const line = html.slice(html.indexOf(helper), html.indexOf("\n", html.indexOf(helper)));
    assert.match(line, /aria-label=/, helper);
  }
});

test("the module script imports only local files, its names exist, and it parses", async () => {
  const html = page("index.html");
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./bidlevel.mjs", "./budget.mjs", "./drawings.mjs", "./drywall.mjs", "./dxf.mjs", "./eaves.mjs", "./engine.mjs", "./fasteners.mjs", "./floor.mjs", "./foundation.mjs", "./gutters.mjs", "./headers.mjs", "./insulation.mjs", "./panels.mjs", "./pdf.mjs", "./roof.mjs", "./schedule.mjs", "./sheathing.mjs", "./siding.mjs", "./sketch.mjs", "./stairs.mjs", "./trim.mjs", "./usage.mjs"]);
  const names = html.match(/import \{([^}]+)\} from "\.\/engine\.mjs"/)[1].split(",").map((s) => s.trim());
  const engine = await import("./engine.mjs");
  for (const name of names) assert.ok(name in engine, name);
  const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(src.replace(/^\s*import .*$/gm, "")));
  assert.doesNotMatch(page("engine.mjs"), /^\s*import\s/m);
});

test("every element the script looks up exists on the page", () => {
  const html = page("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const used = [...html.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]);
  assert.ok(used.length > 25);
  for (const id of used) assert.ok(ids.has(id), `#${id} is used by the script but missing from the markup`);
});

test("the usage events named in the privacy line are the ones the page records", () => {
  const html = page("index.html");
  const recorded = new Set([...html.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]));
  const named = new Set([...html.match(/Anonymous feature events \(([^)]*)\)/)[1].matchAll(/<code>([a-z_]+)<\/code>/g)].map((m) => m[1]));
  assert.deepEqual([...recorded].sort(), [...named].sort());
});

test("sitemap lists every page and robots allows crawling", () => {
  const sm = page("sitemap.xml");
  assert.match(sm, /<loc>\.\/index\.html<\/loc>/);
  assert.match(sm, /<loc>\.\/how-many-studs-for-a-wall\.html<\/loc>/);
  assert.match(page("robots.txt"), /Allow: \//);
});

test("the footer links the cut list optimizer, and it links back", () => {
  assert.match(page("index.html"), /<a href="\.\.\/cut-list-optimizer\/">/);
  assert.match(readFileSync(new URL("../cut-list-optimizer/index.html", import.meta.url), "utf8"), /<a href="\.\.\/wall-framing-takeoff\/">/);
});

test("the page offers blocking and fire blocking, and the plan it builds reaches the engine", async () => {
  const html = page("index.html");
  for (const id of ["blockRows", "fireBlock"]) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.match(html, /blocking: \{ rows: .*fire: \$\("#fireBlock"\)\.value === "fire" \}/);
  const { takeoff, samplePlan } = await import("./engine.mjs");
  const plain = takeoff(samplePlan());
  const blocked = takeoff({ ...samplePlan(), blocking: { rows: 1, fire: true } });
  assert.ok(plain.ok && blocked.ok);
  const count = (r) => r.cuts.filter((c) => /blocking/.test(c.kind)).reduce((n, c) => n + c.qty, 0);
  assert.equal(count(plain), 0);
  assert.ok(count(blocked) > 0);
});

test("the walls table has a tee-lap field that round-trips through the plan", () => {
  const html = page("index.html");
  assert.match(html, /Butts into \(tee lap\)/);
  assert.match(html, /function teeField\(w, L, bad\)/);
  assert.match(html, /tee: w\.tee \?/);
});

test("the page downloads the shop-panel lumber order and pull lists through panels.mjs", () => {
  const html = page("index.html");
  assert.match(html, /id="panelOrderBtn"/);
  assert.match(html, /panelOrder\(last\.result, last\.plan, panelMax, last\.nailers\)/);
  assert.match(html, /panelPullText\(po\)/);
});

test("the page frames a floor through floor.mjs and pools its lumber with the walls", () => {
  const html = page("index.html");
  for (const id of ["flOn", "flW", "flD", "flJoist", "flSpacing", "flBeam", "flBlock", "flUnder", "flOpen", "floorOut"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /layoutFloor\(plan\.floor, plan\)/);
  assert.match(html, /takeoff\(plan, floorExtra\)/);
  assert.match(html, /takeoff\(plan, \[\.\.\.extra, \.\.\.floorExtra\]\)/);
});

test("the page takes several stairwell openings separated by semicolons and restores them all", () => {
  const html = page("index.html");
  assert.match(html, /\$\("#flOpen"\)\.value\.split\(";"\)/);
  assert.match(html, /fl\.openings\.push\(\{ x, y, width, depth \}\)/);
  assert.match(html, /\(fl\.openings \|\| \[\]\)\.map\(\(o\) => \[o\.x[^\n]*\.join\("; "\)/);
});

test("the page offers hip roofs and passes shape and hip size to roof.mjs", () => {
  const html = page("index.html");
  for (const id of ["rfShape", "rfHip", "rfHipBox"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /rf\.shape = "hip"/);
  assert.match(html, /rf\.hip = \$\("#rfHip"\)\.value/);
  assert.match(html, /\$\("#rfShape"\)\.value = rf\.shape === "hip"/);
});

test("the page offers a cross wing and passes it to roof.mjs, only on gable roofs", () => {
  const html = page("index.html");
  for (const id of ["rfWing", "rfWingW", "rfWingP", "rfWingAt", "rfWingSide", "rfWingValley", "rfWingPitch"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /rf\.wing = \{ width: L\(\$\("#rfWingW"\)\.value/);
  assert.match(html, /\$\("#rfWing"\)\.value === "1" && rf\.shape !== "hip"/);
  assert.match(html, /\$\("#rfWing"\)\.value = wg \? "1" : "0"/);
  assert.match(html, /function syncWing/);
});

test("the page offers a second cross wing, only after the first, and round-trips it", () => {
  const html = page("index.html");
  for (const id of ["rfWing2", "rfWing2W", "rfWing2P", "rfWing2At", "rfWing2Side", "rfWing2Valley", "rfWing2Pitch"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /id="rfValleyBacking"/);
  assert.match(html, /rf\.valleyBacking = true/);
  assert.match(html, /\$\("#rfValleyBacking"\)\.value = wg && rf\.valleyBacking/);
  assert.match(html, /rf\.wing && \$\("#rfWing2"\)\.value === "1"/);
  assert.match(html, /rf\.wing2 = \{ width: L\(\$\("#rfWing2W"\)\.value/);
  assert.match(html, /\$\("#rfWing2"\)\.value = w2 \? "1" : "0"/);
});

test("the page takes a gable pitch and peak per wall, passes them to the engine and restores them", () => {
  const html = page("index.html");
  assert.match(html, /function gableField/);
  assert.match(html, /\.\.\.gableField\(w, L, bad\)/);
  assert.match(html, /data-k="gable"|"gable", w\.gable/);
  assert.match(html, /gable: w\.gable \? String\(w\.gable\.pitch\)/);
});

test("the page offers a header table and the engine's auto header option", () => {
  const html = page("index.html");
  assert.match(html, /id="hdrTable"/);
  assert.match(html, /import \{ resolveHeaders \} from "\.\/headers\.mjs"/);
  assert.match(html, /\["auto", \.\.\.HEADER_SIZES\]/);
  assert.match(html, /nothing here carries code values/);
});

test("the schedule card is wired to schedule.mjs and its events are declared", () => {
  const html = page("index.html");
  assert.match(html, /from "\.\/schedule\.mjs"/);
  for (const id of ["schedIn", "schedEx", "schedRun", "schedOut"]) assert.match(html, new RegExp(`id="${id}"`));
  for (const ev of ["schedule_run", "schedule_example_loaded"]) assert.match(html, new RegExp(`<code>${ev}</code>`));
});

test("the drywall joint control is read into the plan and restored from a saved plan", () => {
  const html = page("index.html");
  assert.match(html, /id="dwJoints"/);
  assert.match(html, /dw\.jointsOnStuds = \$\("#dwJoints"\)\.value === "true"/);
  assert.match(html, /\$\("#dwJoints"\)\.value = typeof dw\.jointsOnStuds === "boolean"/);
  assert.match(html, /id="dwJoist"/);
  assert.match(html, /dw\.ceilingJoistsFromRoof = true/);
  assert.match(html, /dw\.ceilingJoistSpacing = Number\(\$\("#dwJoist"\)\.value\)/);
  assert.match(html, /\$\("#dwJoist"\)\.value = dw\.ceilingJoistsFromRoof \? "roof" : dw\.ceilingJoistSpacing != null/);
});

test("the drywall ceiling field reads and restores ceiling steps (length x drop)", () => {
  const html = page("index.html");
  assert.match(html, /\(c\.steps = c\.steps \|\| \[\]\)\.push\(\{ length: L\(m\[0\]/);
  assert.match(html, /\(c\.steps \|\| \[\]\)\.map\(\(st\) => `\$\{formatLength\(st\.length\)\} x \$\{formatLength\(st\.drop\)\}`\)/);
});

test("the insulation controls are read into plan.insulation and restored from a saved plan", () => {
  const html = page("index.html");
  for (const id of ["inOn", "inBag", "inWaste", "inR", "inPrice", "inRim", "inAtticR", "inAtticPer", "inAtticBag", "insulationOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /ins\.bagSqFt = Number\(\$\("#inBag"\)\.value\)/);
  assert.match(html, /plan\.insulation = ins/);
  assert.match(html, /layoutInsulation\(plan\.insulation, plan, result\)/);
  assert.match(html, /\$\("#inAtticBag"\)\.value = ins\.attic\?\.bagCuFt/);
  assert.match(html, /<code>insulation_on<\/code>/);
});

test("the stair controls are read into plan.stairs, restored from a saved plan and add the lumber to the order", () => {
  const html = page("index.html");
  for (const id of ["stOn", "stRise", "stTread", "stWidth", "stStringer", "stTreadBoard", "stOpen", "stLanding", "stairsOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.stairs = st/);
  assert.match(html, /layoutStairWithLanding\(plan\.stairs, plan\)/);
  assert.match(html, /\$\("#stOn"\)\.checked = Boolean\(stp\)/);
  assert.match(html, /<code>stairs_on<\/code>/);
});

test("the trim controls are read into plan.trim, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["trOn", "trSides", "trBaseStock", "trCasStock", "trCasWidth", "trReveal", "trWaste", "trBasePrice", "trCasPrice", "trimOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.trim = tr/);
  assert.match(html, /layoutTrim\(plan\.trim, plan\)/);
  assert.match(html, /trim: last\.trim/);
  assert.match(html, /\$\("#trOn"\)\.checked = Boolean\(trm\)/);
  assert.match(html, /<code>trim_on<\/code>/);
});

test("the siding controls are read into plan.siding, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["sdOn", "sdExposure", "sdStock", "sdWaste", "sdWrapRoll", "sdCorners", "sdBoardPrice", "sdWrapPrice", "sdCornerPrice", "sidingOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.siding = sd/);
  assert.match(html, /layoutSiding\(plan\.siding, plan\)/);
  assert.match(html, /siding: last\.siding/);
  assert.match(html, /\$\("#sdOn"\)\.checked = Boolean\(sdg\)/);
  assert.match(html, /<code>siding_on<\/code>/);
});

test("the eaves controls are read into plan.eaves, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["eaOn", "eaPanelWidth", "eaPanelStock", "eaFasciaStock", "eaChannelStock", "eaWaste", "eaRake", "eaPanelPrice", "eaFasciaPrice", "eaChannelPrice", "eavesOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.eaves = ea/);
  assert.match(html, /layoutEaves\(plan\.eaves, roof\)/);
  assert.match(html, /eaves: last\.eaves/);
  assert.match(html, /\$\("#eaOn"\)\.checked = Boolean\(eav\)/);
  assert.match(html, /<code>eaves_on<\/code>/);
});

test("the gutter controls are read into plan.gutters, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["guOn", "guStock", "guDsStock", "guHeight", "guHanger", "guMaxRun", "guArea", "guWaste", "guGutterPrice", "guDsPrice", "guHangerPrice", "guCapPrice", "guElbowPrice", "guCornerPrice", "guStrapPrice", "guttersOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.gutters = gu/);
  assert.match(html, /layoutGutters\(plan\.gutters, roof\)/);
  assert.match(html, /gutters: last\.gutters/);
  assert.match(html, /\$\("#guOn"\)\.checked = Boolean\(gut\)/);
  assert.match(html, /<code>gutters_on<\/code>/);
});

test("the nail controls are read into plan.fasteners, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["faOn", "faStudEnd", "faPlate", "faEdge", "faField", "faWaste", "faBox", "faPrice", "fastenersOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.fasteners = fa/);
  assert.match(html, /layoutFasteners\(plan\.fasteners, plan, /);
  assert.match(html, /fasteners: last\.fasteners/);
  assert.match(html, /\$\("#" \+ id\)\.value = fa\?\.\[key\]/);
  assert.match(html, /<code>fasteners_on<\/code>/);
  for (const id of ["faHdEnds", "faHdOpen", "faHdPrice"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /fa\.holdDowns = hd/);
  for (const id of ["faRtOn", "faRtPrice"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /fa\.rafterTies = \{ perBearing/);
  assert.match(html, /\$\("#faHdEnds"\)\.value = fa\?\.holdDowns\?\.wallEnds/);
  for (const id of ["faPsOn", "faPsPrice"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /fa\.plateStraps = \{ perJoint: Number/);
  assert.match(html, /\$\("#faPsOn"\)\.value = fa\?\.plateStraps/);
});

test("the foundation anchor bolt fields feed the engine's anchorBolts option and load back from plan files", () => {
  const html = page("index.html");
  assert.match(html, /fn\.anchorBolts = \{ spacing: Number\(\$\("#fnAnchor"\)\.value\), endDistance: Number\(\$\("#fnAnchorEnd"\)\.value\) \}/);
  assert.match(html, /\$\("#fnAnchor"\)\.value = fn\.anchorBolts \?/);
});

test("the bid leveling card parses lines into plan.bids, restores them and levels against the budget", () => {
  const html = page("index.html");
  for (const id of ["bidsCard", "bidText", "bidsOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /levelBids\(last\.budget, pb\.bids\)/);
  assert.match(html, /plan\.bids = pb\.bids/);
  assert.match(html, /Array\.isArray\(plan\.bids\)/);
  assert.match(html, /<code>bids_leveled<\/code>/);
});
