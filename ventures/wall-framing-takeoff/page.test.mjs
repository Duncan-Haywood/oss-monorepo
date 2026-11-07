import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

for (const name of ["index.html", "how-many-studs-for-a-wall.html", "stair-stringer-calculator.html", "drywall-calculator.html", "schedule-calculator.html", "siding-calculator.html", "insulation-calculator.html", "trim-calculator.html", "roof-calculator.html", "gutter-calculator.html", "flooring-calculator.html", "bid-leveling-calculator.html", "change-order-calculator.html", "ventilation-calculator.html", "stud-drilling-checker.html", "plumbing-calculator.html", "hvac-calculator.html", "walltile-calculator.html", "electrical-calculator.html", "paint-calculator.html", "price-sensitivity-calculator.html", "order-by-date-calculator.html", "fireblock-calculator.html", "nail-calculator.html", "floor-calculator.html", "foundation-calculator.html", "cmu-calculator.html", "dormer-calculator.html", "fence-calculator.html", "paver-calculator.html"]) {
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
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./bidletter.mjs", "./bidlevel.mjs", "./bidpackage.mjs", "./budget.mjs", "./checkout.mjs", "./compare.mjs", "./deck.mjs", "./dormer.mjs", "./drawings.mjs", "./drywall.mjs", "./dxf.mjs", "./eaves.mjs", "./engine.mjs", "./fasteners.mjs", "./floor.mjs", "./foundation.mjs", "./gutters.mjs", "./headers.mjs", "./ifcwasm.mjs", "./insulation.mjs", "./licence.mjs", "./openingschedule.mjs", "./panels.mjs", "./pdf.mjs", "./roof.mjs", "./schedule.mjs", "./sensitivity.mjs", "./sheathing.mjs", "./siding.mjs", "./sketch.mjs", "./stairs.mjs", "./trim.mjs", "./usage.mjs"]);
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
  assert.match(sm, /<loc>\.\/stair-stringer-calculator\.html<\/loc>/);
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

test("the page reads and restores the stair stringer check", () => {
  const html = page("index.html");
  assert.match(html, /id="stCheck"/);
  assert.match(html, /st\.stringerCheck = \{ liveLoad: n\[0\]/);
  assert.match(html, /\$\("#stCheck"\)\.value = k \?/);
  assert.match(html, /id="stCheck2"/);
  assert.match(html, /st\.stringerCheck\.connectorCapacity = m\[0\]/);
  assert.match(html, /\$\("#stCheck2"\)\.value = k && k\.connectorCapacity/);
  assert.match(html, /id="stCheck3"/);
  assert.match(html, /st\.stringerCheck\.notchedSupport = true/);
  assert.match(html, /\$\("#stCheck3"\)\.value = k && k\.notchedSupport/);
});

test("the page frames a floor through floor.mjs and pools its lumber with the walls", () => {
  const html = page("index.html");
  for (const id of ["flOn", "flW", "flD", "flJoist", "flSpacing", "flBeam", "flCant", "flHdr", "flStairSide", "flBlock", "flUnder", "flOpen", "floorOut"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /layoutFloor\(plan\.floor, plan\)/);
  assert.match(html, /fl\.headerCheck = \{ liveLoad: n\[0\]/); // header check read into the plan
  assert.match(html, /\$\("#flHdr"\)\.value = h \?/); // and restored
  assert.match(html, /fl\.cantilever = L\(\$\("#flCant"\)\.value/); // read into the plan
  assert.match(html, /\$\("#flCant"\)\.value = fl\.cantilever/); // and restored from a saved plan
  assert.match(html, /if \(n\[7\]\) fl\.headerCheck\.cantDeflLimit = n\[7\]/); // cantilever tip ratio, eighth figure
  assert.match(html, /h\.cantDeflLimit \? \[h\.cantDeflLimit\]/); // and restored
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
  for (const id of ["schedIn", "schedEx", "schedRun", "schedOut", "schedHol", "schedWx"]) assert.match(html, new RegExp(`id="${id}"`));
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
  for (const id of ["inOn", "inBag", "inWaste", "inR", "inPrice", "inRim", "inEff", "inContR", "inAssumedF", "inWinU", "inDoorU", "inSlabF", "inAch50", "inNFac", "inVol", "inDeltaF", "inHdd", "inAtticR", "inAtticPer", "inAtticBag", "inAtticHeel", "insulationOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /ins\.bagSqFt = Number\(\$\("#inBag"\)\.value\)/);
  assert.match(html, /plan\.insulation = ins/);
  assert.match(html, /layoutInsulation\(plan\.insulation, plan, result\)/);
  assert.match(html, /\$\("#inAtticBag"\)\.value = ins\.attic\?\.bagCuFt/);
  assert.match(html, /ins\.attic\.heel = Number\(\$\("#inAtticHeel"\)\.value\)/);
  assert.match(html, /\$\("#inAtticHeel"\)\.value = ins\.attic\?\.heel/);
  assert.match(html, /<code>insulation_on<\/code>/);
});

test("the stair controls are read into plan.stairs, restored from a saved plan and add the lumber to the order", () => {
  const html = page("index.html");
  for (const id of ["stOn", "stRise", "stTread", "stWidth", "stStringer", "stTreadBoard", "stOpen", "stLanding", "stairsOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.stairs = st/);
  assert.match(html, /layoutStairWithLanding\(stairPlan, plan\)/);
  assert.match(html, /\$\("#stOn"\)\.checked = Boolean\(stp\)/);
  assert.match(html, /<code>stairs_on<\/code>/);
  // winders (2026-10-31): the field is read into plan.stairs.winders, laid out, printed under the stair and restored
  assert.match(html, /id="stWinders"/);
  assert.match(html, /st\.winders = \{ count: w\[0\], turn: w\[1\]/);
  assert.match(html, /stairs\.winders = layoutWinders\(/);
  assert.match(html, /winderText\(st\.winders\)/);
  assert.match(html, /\$\("#stWinders"\)\.value = stp\?\.winders/);
  // landing post column check (2026-10-31): typed soil, size, fc, Emin become plan.stairs.landing and are restored
  assert.match(html, /id="stLandPosts"/);
  assert.match(html, /st\.landing = \{ soilBearing: n\[0\], postSize: t\[1\], postFc: n\[1\], postEmin: n\[2\] \}/);
  assert.match(html, /\$\("#stLandPosts"\)\.value = l && typeof l/);
  // stair guard and handrail (2026-10-31): typed sides and handrail height become plan.stairs.rail and are restored
  assert.match(html, /id="stLandEdges"/);
  assert.match(html, /openEdges: e \}/);
  assert.match(html, /\$\("#stLandEdges"\)\.value = Array\.isArray/);
  assert.match(html, /id="stRail"/);
  assert.match(html, /st\.rail = \{ sides: r\[0\]/);
  assert.match(html, /\$\("#stRail"\)\.value = stp\?\.rail/);
});

test("the trim controls are read into plan.trim, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["trOn", "trSides", "trBaseStock", "trCasStock", "trCasWidth", "trReveal", "trWaste", "trBasePrice", "trCasPrice", "trShoe", "trShoeStock", "trShoePrice", "trScarf", "trimOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.trim = tr/);
  assert.match(html, /tr\.shoe = true/);
  assert.match(html, /\["trScarf", "scarf"\]/);
  assert.match(html, /layoutTrim\(plan\.trim, plan\)/);
  assert.match(html, /trim: last\.trim/);
  assert.match(html, /\$\("#trOn"\)\.checked = Boolean\(trm\)/);
  assert.match(html, /<code>trim_on<\/code>/);
});

test("the siding controls are read into plan.siding, restored from a saved plan and feed the budget", () => {
  const html = page("index.html");
  for (const id of ["sdOn", "sdExposure", "sdStock", "sdWaste", "sdWrapRoll", "sdCorners", "sdBoardPrice", "sdWrapPrice", "sdCornerPrice", "sdStyle", "sdBoardWidth", "sdBattens", "sdBattenStock", "sdBattenPrice", "sdOpeningTrim", "sdTrimWidth", "sdTrimStock", "sdTrimPrice", "sdStarter", "sdStarterPrice", "sdHeadFlashing", "sdFlashingExtend", "sdFlashingStock", "sdFlashingPrice", "sidingOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /sd\.style = \$\("#sdStyle"\)\.value/);
  assert.match(html, /sd\.battens = true/);
  assert.match(html, /sd\.openingTrim = true/);
  assert.match(html, /sd\.starter = true/);
  assert.match(html, /sd\.headFlashing = true/);
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

test("the dormer controls are read into plan.dormer, restored from a saved plan and drawn on a card", () => {
  const html = page("index.html");
  for (const id of ["dmOn", "dmFields", "dmWidth", "dmEave", "dmPitch", "dmMain", "dormerCard", "dormerOut"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /plan\.dormer = dm/);
  assert.match(html, /const dArgs = \{ mainPitch/);
  assert.match(html, /\$\("#dmOn"\)\.checked = Boolean\(dmp\)/);
  assert.match(html, /<code>dormer_on<\/code>/);
  // shed dormer (2026-10-31): shape select and roof-opening depth, routed to layoutShedDormer
  for (const id of ["dmShape", "dmOpening", "dmWinW", "dmWinH", "dmWinSill"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /layoutShedDormer\(dArgs\)/);
  assert.match(html, /dm\.shape = "shed"/);
  assert.match(html, /\$\("#dmShape"\)\.value = dmp\?\.shape === "shed"/);
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
  for (const id of ["faWbOn", "faWbSpacing", "faWbPrice"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /fa\.wallBracing = Object\.keys\(wb\)/);
  assert.match(html, /\$\("#faWbOn"\)\.value = wb \? "1"/);
});

test("the foundation anchor bolt fields feed the engine's anchorBolts option and load back from plan files", () => {
  const html = page("index.html");
  assert.match(html, /fn\.anchorBolts = \{ spacing: Number\(\$\("#fnAnchor"\)\.value\), endDistance: Number\(\$\("#fnAnchorEnd"\)\.value\) \}/);
  assert.match(html, /\$\("#fnAnchor"\)\.value = fn\.anchorBolts \?/);
});

test("the foundation pier box parses lines into fn.piers and loads them back from plan files", () => {
  const html = page("index.html");
  assert.match(html, /id="fnPiers"/);
  assert.match(html, /fn\.piers = piers/);
  assert.match(html, /\$\("#fnPiers"\)\.value = \(fn\.piers \|\| \[\]\)/);
  assert.match(html, /Pier line \$\{i \+ 1\}/);
});

test("the footing step box parses lines into fn.footing.steps and loads them back from plan files", () => {
  const html = page("index.html");
  assert.match(html, /id="fnSteps"/);
  assert.match(html, /fn\.footing\.steps = steps/);
  assert.match(html, /\$\("#fnSteps"\)\.value = \(fn\.footing\?\.steps \|\| \[\]\)/);
  assert.match(html, /Footing step line \$\{i \+ 1\}/);
});

test("the bid leveling card parses lines into plan.bids, restores them and levels against the budget", () => {
  const html = page("index.html");
  for (const id of ["bidsCard", "bidText", "bidsOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /levelBids\(last\.budget, pb\.bids\)/);
  assert.match(html, /plan\.bids = pb\.bids/);
  assert.match(html, /Array\.isArray\(plan\.bids\)/);
  assert.match(html, /<code>bids_leveled<\/code>/);
});

test("the deck controls are read into plan.deck, restored from a saved plan and drawn in the deck card", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const id of ["dkOn", "dkWidth", "dkDepth", "dkHeight", "dkJoist", "dkSpacing", "dkBeam", "dkPost", "dkFree", "dkGuard", "dkGuardSides", "dkStair", "dkBorder", "dkBlocking", "dkPostCheck", "dkJoistCheck", "dkBeamCheck", "deckOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.deck = dk/);
  assert.match(html, /layoutDeck\(plan\.deck\)/);
  assert.match(html, /\$\("#dkOn"\)\.checked = Boolean\(dkp\)/);
  assert.match(html, /dk\.guard = false/);
  assert.match(html, /dk\.stairs = \{\}/);
  assert.match(html, /dk\.border = Number\(\$\("#dkBorder"\)\.value\)/);
  assert.match(html, /\$\("#dkBorder"\)\.value = dkp\?\.border === true/);
  assert.match(html, /dk\.postCheck = \{ deadPsf: n\[0\], livePsf: n\[1\], fc: n\[2\], emin: n\[3\]/);
  assert.match(html, /\$\("#dkPostCheck"\)\.value = pc \?/);
  assert.match(html, /dk\[key\] = \{ deadPsf: n\[0\]/);
  assert.match(html, /\["#dkJoistCheck", "joistCheck"\]/);
  assert.match(html, /dk\.blocking = \{ every: bk \}/);
  assert.match(html, /\$\("#dkBlocking"\)\.value = dkp\?\.blocking\?\.every/);
  assert.match(html, /totalRise: plan\.deck\.height/);
  assert.match(html, /\$\("#dkStair"\)\.value = dkp\?\.stairs/);
  assert.match(html, /\$\("#dkGuard"\)\.value = dkp\?\.guard === false/);
  assert.match(html, /<code>deck_on<\/code>/);
});

test("the stair calculator page: FAQ matches its data, and its default inputs give the README's 9 ft stair", async () => {
  const html = page("stair-stringer-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutStair, stairText } = await import("./stairs.mjs");
  const l = layoutStair({ totalRise: 108, tread: 10, width: 36, stringer: "2x12", treadBoard: "2x12", treadThickness: 1.5, nosing: 0.75, floorThickness: 12.5 });
  assert.equal(l.risers, 14);
  assert.match(stairText(l)[0], /14 risers of 7-11\/16"/);
  assert.match(html, /9 ft rise with 10 in treads and a 12-1\/2 in floor, at least 9 ft 11-15\/16 in/);
});

test("the drywall calculator page: FAQ matches its data, default inputs give the 12 x 12 room's 17 sheets", async () => {
  const html = page("drywall-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutDrywall } = await import("./drywall.mjs");
  const wall = (id, length, openings = []) => ({ id, length, openings });
  const plan = { studLength: 91.5, defaultHeaderHeight: 80, walls: [wall("A", 144, [{ offset: 12, width: 36, height: 80 }]), wall("B", 144), wall("C", 144), wall("D", 144)] };
  const d = layoutDrywall({ sheetLength: 96, height: 96, faces: "inside", ceiling: [{ width: 144, depth: 144 }] }, plan);
  assert.equal(d.sheets.count, 17);
  assert.equal(Math.round(d.netSqFt), 508);
  assert.equal(d.finishing.tapeRolls, 1);
  assert.equal(d.finishing.compoundPails, 2);
  assert.match(html, /counts 17 sheets: 508 sq ft of faces, which is 15\.9 sheets/);
});

test("the schedule page: FAQ matches its data, the sample schedule runs and has a critical path", async () => {
  const html = page("schedule-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ["src", "out", "gantt", "nb", "ac", "cp"]) assert.ok(ids.has(id), id);
  const { schedule, sampleSchedule } = await import("./schedule.mjs");
  const s = schedule(sampleSchedule());
  assert.equal(s.ok, true);
  assert.ok(s.criticalPath.length > 0);
});

test("the siding calculator page: FAQ matches its data, default inputs give the 40 x 30 house's 176 boards", async () => {
  const html = page("siding-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutSiding } = await import("./siding.mjs");
  const wall = (id, length, openings = []) => ({ id, length, openings, sheathed: true });
  const plan = { studLength: 91.5, defaultHeaderHeight: 80, walls: [wall("A", 480, [{ kind: "door", offset: 60, width: 36, height: 80 }, { kind: "window", offset: 200, width: 36, height: 48, headerHeight: 80 }, { kind: "window", offset: 300, width: 36, height: 48, headerHeight: 80 }]), wall("B", 360), wall("C", 480), wall("D", 360)] };
  const s = layoutSiding({ exposure: 7, stock: 144, waste: 0.1, height: 96 }, plan);
  assert.equal(s.courses, 56);
  assert.equal(s.boards, 176);
  assert.equal(s.wrapRolls, 1);
  assert.equal(s.cornerBoards, 9);
  assert.match(html, /56 courses, 176 boards with 10% waste, 1 roll of house wrap and 9 corner boards/);
});

test("the insulation calculator page: FAQ matches its data, the 40 x 30 house gives 890 sq ft of cavity, 11 bags and R-13.1", async () => {
  const html = page("insulation-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { takeoff, defaultStock } = await import("./engine.mjs");
  const { layoutInsulation } = await import("./insulation.mjs");
  const build = (size) => {
    const w = (id, length, openings = []) => ({ id, length, openings, stud: size, corner: true });
    const ops = [{ kind: "door", offset: 60, width: 36, height: 80, header: "2x10" }, { kind: "window", offset: 200, width: 36, height: 48, header: "2x10" }, { kind: "window", offset: 300, width: 36, height: 48, header: "2x10" }];
    return { studSpacing: 16, studLength: 91.5, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 80, stock: defaultStock(91.5), walls: [w("A", 480, ops), w("B", 360), w("C", 480), w("D", 360)] };
  };
  for (const [size, cavity, bags, effR, clearR, share] of [["2x4", 890, 11, 13.1, 16.9, 16.6], ["2x6", 882, 11, 17.8, 22.9, 17.3]]) {
    const plan = build(size);
    const d = layoutInsulation({ bagSqFt: 88, waste: 0.05, assembly: true }, plan, takeoff(plan));
    assert.equal(Math.round(d.cavitySqFt), cavity, size);
    assert.equal(d.bags, bags, size);
    assert.equal(+d.assembly.effectiveR.toFixed(1), effR, size);
    assert.equal(+d.assembly.clearWallR.toFixed(1), clearR, size);
    assert.equal(+(100 * d.framingShare).toFixed(1), share, size);
  }
  assert.match(html, /890 sq ft of open cavity/);
  assert.match(html, /about R-13\.1/);
  assert.match(html, /about R-17\.8/);
});

test("the trim calculator page: FAQ matches its data, the 40 x 30 house with an interior wall needs 17 baseboard and 25 casing boards", async () => {
  const html = page("trim-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutTrim } = await import("./trim.mjs");
  const op = (kind, n, width, height) => Array.from({ length: n }, () => ({ kind, width, height }));
  const walls = [{ id: "A", length: 480, openings: [...op("door", 1, 36, 80), ...op("window", 2, 36, 48)] }, { id: "B", length: 360 }, { id: "C", length: 480 }, { id: "D", length: 360 }, { id: "I", length: 240, sheathed: false, openings: op("door", 3, 30, 80) }];
  const t = layoutTrim({}, { walls });
  assert.equal(Math.round(t.baseFeet), 162);
  assert.equal(t.baseBoards, 17);
  assert.equal(Math.round(t.casingFeet), 143);
  assert.equal(t.casingBoards, 25);
  assert.equal(t.doorFaces, 7);
  assert.equal(t.windowFaces, 2);
  assert.match(html, /162 ft/);
  assert.match(html, /143 ft of 2\.25 in casing/);
});

test("the concrete calculator page: FAQ matches its data, the 12 x 12 x 4 in case orders 2 yd and 88 bags", async () => {
  const html = page("concrete-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { slabConcrete } = await import("./slab.mjs");
  const r = slabConcrete({ length: 144, width: 144, depth: 4 });
  assert.ok(r.ok);
  assert.equal(r.cuFt, 48);
  assert.equal(r.orderYd, 2);
  assert.equal(r.bags, 88);
  assert.match(html, /48 cu ft, which is 1\.78 cu yd/);
  assert.match(html, /about 88 bags of 80 lb/);
  const b80 = slabConcrete({ length: 108, width: 108, depth: 4, waste: 0 });
  assert.ok(b80.ok); assert.equal(b80.bags, 45); // the FAQ's 45 bags to a yard
});

test("the bid leveling page: FAQ matches its data, the sample bids level as the page says", async () => {
  const html = page("bid-leveling-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { levelBids, sampleBids } = await import("./bidlevel.mjs");
  const s = sampleBids();
  const r = levelBids({ lines: s.scope.map((l) => ({ unitPrice: null, ...l })) }, s.bids, { tolerance: s.tolerance });
  assert.deepEqual(r.errors, []);
  const by = Object.fromEntries(r.bidders.map((b) => [b.bidder, b]));
  // Sub A bids every line: 1520 + 2220 + 450 + 960
  assert.equal(by["Sub A"].bidTotal, 5150);
  assert.equal(by["Sub A"].additions, 0);
  // Sub B: 100 of 120 sheets is short by 20 at its own 19 = 380; house wrap left out, at the scope's 160 x 3 = 480; ties left out, 400 x 2.5 = 1000
  assert.equal(by["Sub B"].bidTotal, 1440 + 1900);
  assert.equal(by["Sub B"].additions, 380 + 480 + 1000);
  assert.equal(by["Sub B"].leveledTotal, 5200);
  assert.equal(r.lowestAsBid, "Sub B");
  assert.equal(r.lowestLeveled, "Sub A");
});

test("the change order page: FAQ matches its data, the sample diffs as a hand sum says", async () => {
  const html = page("change-order-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { budgetDiff } = await import("./compare.mjs");
  const w = (lines) => { const t = lines.reduce((a, l) => a + (l.amount ?? 0), 0); return { lines, total: t, bid: t }; };
  const d = budgetDiff(w([{ section: "Lumber", item: "2x4", unit: "ea", qty: 300, amount: 1050 }]), w([{ section: "Lumber", item: "2x4", unit: "ea", qty: 228, amount: 798 }, { section: "Hardware", item: "Hold-downs", unit: "ea", qty: 6, amount: null }]));
  // 798 - 1050 = -252; the unpriced hold-downs are listed, not netted
  assert.equal(d.totals.total.delta, -252);
  assert.equal(d.unpricedChanges.length, 1);
});

test("the deck lumber calculator page: FAQ matches its data, default inputs give the 16 x 12 ft deck's counts", async () => {
  const html = page("deck-lumber-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutDeck } = await import("./deck.mjs");
  const l = layoutDeck({ width: 192, depth: 144, height: 36, joist: "2x8", spacing: 16, beam: "2x10", beamPlies: 2, postSize: "6x6", overhang: 12 });
  assert.equal(l.joists.length, 13);
  assert.equal(l.posts.length, 3);
  assert.equal(l.rows, 26);
  assert.equal(l.concrete.bags, 16);
  assert.ok(html.includes("13 joists") && html.includes("26 deck boards of 16 ft") && html.includes("16 bags"));
});

test("every page links to every other page (internal linking for readers and crawlers)", () => {
  const pages = ["index", "how-many-studs-for-a-wall", "stair-stringer-calculator", "drywall-calculator", "concrete-calculator", "siding-calculator", "insulation-calculator", "trim-calculator", "roof-calculator", "gutter-calculator", "flooring-calculator", "deck-lumber-calculator", "schedule-calculator", "bid-leveling-calculator", "change-order-calculator", "ventilation-calculator", "stud-drilling-checker", "plumbing-calculator", "hvac-calculator", "walltile-calculator", "electrical-calculator", "paint-calculator", "price-sensitivity-calculator", "order-by-date-calculator", "fireblock-calculator", "nail-calculator", "floor-calculator", "foundation-calculator", "cmu-calculator", "dormer-calculator", "fence-calculator", "paver-calculator"].map((n) => n + ".html");
  for (const f of pages) {
    const html = page(f);
    for (const other of pages) if (other !== f) assert.ok(html.includes(`<a href="${other}">`), `${f} does not link ${other}`);
  }
});

test("the schedule card resolves per/rate durations from the takeoff before it runs", () => {
  const html = page("index.html");
  assert.match(html, /import \{[^}]*resolveRates[^}]*\} from "\.\/schedule\.mjs"/);
  assert.match(html, /resolveRates\(input, \{ \.\.\.last\.result/);
});

test("index.html price hint lists every labor rate the budget reads", () => {
  const names = [...new Set([...readFileSync(new URL("./budget.mjs", import.meta.url), "utf8").matchAll(/P\("(labor[A-Za-z]+)"\)/g)].map((m) => m[1]))];
  assert.ok(names.length >= 13);
  const hint = page("index.html").match(/names: ([^;]*);/)[1];
  for (const n of names) assert.ok(hint.includes(n), `${n} missing from the page's price-name hint`);
});

test("the studs-per-wall page's FAQ is visible and matches its FAQPage JSON-LD", () => {
  const html = page("how-many-studs-for-a-wall.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
});

test("index.html shows the budget's ignored prices, built from the engine's own list", () => {
  const html = page("index.html");
  assert.ok(html.includes("b.ignoredPrices.length"));
  assert.ok(html.includes('id="ignoredPrices"'));
  assert.ok(html.includes("did you mean"));
});

test("the change-order card saves a budget as the original and diffs the next one against it", () => {
  const html = page("index.html");
  for (const id of ["coCard", "coSave", "coClear", "coOut", "coState"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /import \{ budgetDiff \} from "\.\/compare\.mjs"/);
  assert.match(html, /budgetDiff\(coBase, last\.budget\)/);
  assert.match(html, /<code>change_order_saved<\/code>/);
});

test("the ventilation calculator page: FAQ matches its data, default inputs give the 24 x 40 ft attic's figures", async () => {
  const html = page("ventilation-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutVentilation } = await import("./ventilation.mjs");
  const roof = { ok: true, shape: "gable", width: 288, length: 480, spacing: 16 };
  // hand: 960 sq ft / 150 = 6.4 sq ft = 921.6 sq in; half high = 460.8 / 18 = 25.6 ft -> 7 four-foot pieces; 460.8 / 56 -> 9 soffit units
  const s = layoutVentilation({ ratio: 150, ridgeVent: true, ridgeNfaPerFt: 18, soffitUnitNfa: 56, soffitUnitWidth: 16 }, roof);
  assert.equal(Math.round(s.requiredSqIn), 922);
  assert.equal(s.ridgeFeetUsed.toFixed(1), "25.6");
  assert.equal(s.ridgePieces, 7);
  assert.equal(s.soffitUnits, 9);
  assert.equal(Math.round(layoutVentilation({ ratio: 300 }, roof).requiredSqIn), 461);
});

test("the roof calculator page: FAQ matches its data, the 24 x 40 ft 6:12 gable gives 62 rafters, 44 sheets, 41 bundles", async () => {
  const html = page("roof-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutRoof } = await import("./roof.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const l = layoutRoof({ id: "Roof", shape: "gable", width: 288, length: 480, pitch: 6, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 16, ridge: "2x10", hip: "2x10", roofing: { waste: 1.1 } }, samplePlan());
  assert.equal(l.rafters.length, 62);
  assert.equal(l.rafterLength, 173.5625);
  assert.equal(l.sheets.count, 44);
  assert.equal(l.roofing.squares.toFixed(1), "12.2");
  assert.equal(l.roofing.shingleBundles, 41);
  assert.equal(l.roofing.ridgeBundles, 2);
  const hip = layoutRoof({ id: "Roof", shape: "hip", width: 216, length: 360, pitch: 6, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 16, ridge: "2x10", hip: "2x10", roofing: { waste: 1.1 } }, samplePlan());
  assert.notEqual(hip.ok, false, "the hip default must lay out: " + (hip.errors || []).join("; "));
});

test("the gutter calculator page: FAQ matches its data, the 24 x 40 ft gable gives 84 ft, 10 sections, 4 downspouts, 44 hangers", async () => {
  const html = page("gutter-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutRoof } = await import("./roof.mjs");
  const { layoutGutters } = await import("./gutters.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const roof = layoutRoof({ id: "Roof", shape: "gable", width: 288, length: 480, pitch: 6, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 16, ridge: "2x10", hip: "2x10" }, samplePlan());
  const g = layoutGutters({ gutterStock: 120, eaveHeight: 120, hangerSpacing: 24, maxRunFeet: 40, waste: 0.1 }, roof);
  assert.equal(g.runFeet, 84);
  assert.equal(g.gutters, 10);
  assert.equal(g.downspouts, 4);
  assert.equal(Math.round(g.planSqFt), 1092);
  assert.equal(g.downspoutPieces, 4);
  assert.equal(g.elbows, 8);
  assert.equal(g.straps, 8);
  assert.equal(g.hangers, 44);
});

test("the stud-per-foot comparison page is in the sitemap and llms.txt, and its FAQ matches its JSON-LD", () => {
  assert.match(page("sitemap.xml"), /<loc>\.\/vs-stud-per-foot-rule\.html<\/loc>/);
  assert.match(page("llms.txt"), /vs-stud-per-foot-rule\.html/);
  const html = page("vs-stud-per-foot-rule.html");
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.match(html, /No warranty/);
});

test("the lumber-order comparison page is wired, its FAQ matches its JSON-LD, and its sample-house figures equal the benchmark's", () => {
  assert.match(page("sitemap.xml"), /<loc>\.\/vs-ordering-lumber-by-hand\.html<\/loc>/);
  assert.match(page("llms.txt"), /vs-ordering-lumber-by-hand\.html/);
  const html = page("vs-ordering-lumber-by-hand.html");
  const faq = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1])).find((b) => b["@type"] === "FAQPage");
  assert.ok(faq && faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  assert.ok(html.includes("2450.00 (+2.8%)") && html.includes("2915.04 (+22.3%)"));
  assert.ok(Math.abs(2450 / 2384.16 - 1.028) < 0.0005 && Math.abs(2915.04 / 2384.16 - 1.223) < 0.0005);
  assert.match(html, /No warranty/);
});

test("the stud drilling checker page: FAQ matches its data, figures in the answers equal the engine's", async () => {
  const html = page("stud-drilling-checker.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutDrilling } = await import("./drilling.mjs");
  const one = (run, stud, bearing) => layoutDrilling({ runs: [{ wall: "w", ...run }] }, { walls: [{ id: "w", stud, bearing }] }).rows[0];
  // hand: 40% of 3.5 = 1.4; 60% = 2.1; notch 25% of 3.5 = 0.875, 1 in is 28.6%
  assert.equal(one({ kind: "bore", size: 1.5 }, "2x4", true).maxSize, 1.4);
  assert.equal(one({ kind: "bore", size: 1.5 }, "2x4", true).ok, false);
  assert.equal(one({ kind: "bore", size: 1.5 }, "2x4", false).maxSize, 2.1);
  assert.equal(one({ kind: "bore", size: 1.5 }, "2x4", false).ok, true);
  assert.equal(one({ kind: "notch", size: 1 }, "2x4", true).usedPct, 28.6);
  // 3 in DWV: 3.5 + 0.125 = 3.625 in, 65.9% of 5.5; doubled limit 3.3 in; fix is a 2x8
  const p = one({ kind: "bore", pipe: "3" }, "2x6", true);
  assert.equal(p.size, 3.625); assert.equal(p.usedPct, 65.9);
  const d = one({ kind: "bore", pipe: "3", doubled: true }, "2x6", true);
  assert.equal(d.maxSize, 3.3); assert.match(d.fix, /2x8/);
});

test("the flooring calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("flooring-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutFlooring } = await import("./flooring.mjs");
  const p = layoutFlooring({ rooms: [{ width: 180, depth: 144, kind: "plank" }] }).plank;
  assert.equal(p.boxes, 10); // 180 x 1.07 = 192.6 sq ft / 20
  const t = layoutFlooring({ rooms: [{ width: 96, depth: 60, kind: "tile" }] }).tile;
  assert.equal(t.tiles, 44); assert.equal(t.thinsetBags, 1); assert.equal(t.groutLb.toFixed(1), "2.6");
  const c = layoutFlooring({ rooms: [{ width: 144, depth: 144, kind: "carpet" }] }).carpet;
  assert.equal(c.rollLinearFeet, 12.5); assert.equal(c.rollSqYd.toFixed(1), "16.7"); assert.equal(c.padSqYd.toFixed(1), "16.8"); assert.equal(c.tackFeet, 48);
});

test('index links one hop to the permit-packet-preflight sibling', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./index.html', import.meta.url), 'utf8'), /href="\.\.\/permit-packet-preflight\/"/);
});

test("the door and window schedule button is on the page and writes the schedule CSV", () => {
  const html = page("index.html");
  assert.match(html, /id="openingsCsvBtn"/);
  assert.match(html, /layoutOpeningSchedule\(last\.plan\.openingSchedule \|\| \{\}, last\.plan\)/);
  assert.match(html, /download\("door-window-schedule\.csv", "text\/csv", openingScheduleCsv\(sch\)\)/);
});

test("the plan form has a cull allowance field wired to plan.culls and the order note", () => {
  const html = page("index.html");
  assert.match(html, /<input id="cullPct"[^>]*max="50"/);
  assert.match(html, /culls: \{ pct: Math\.min\(50, Number\(\$\("#cullPct"\)\.value\)\) \/ 100 \}/);
  assert.match(html, /\$\("#cullPct"\)\.value = String\(s\.cullPct \|\| 0\)/);
  assert.match(html, /Cull allowance \(\$\{result\.summary\.cullBoards\} spare boards/);
});

test("the price sensitivity card is wired to sensitivity.mjs and its event is declared", () => {
  const html = page("index.html");
  assert.match(html, /id="sensCard"/);
  assert.match(html, /import \{ sensitivity \} from "\.\/sensitivity\.mjs"/);
  assert.match(html, /record\("sensitivity_run"\)/);
  assert.match(html, /<code>sensitivity_run<\/code>/);
});

test("the plumbing calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("plumbing-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutPlumbing } = await import("./plumbing.mjs");
  const sample = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const r = layoutPlumbing(sample);
  assert.equal(r.ok, true);
  assert.equal(r.drainFt + r.ventFt, 34); assert.equal(r.drainSticks, 4);
  assert.equal(r.hotFt, 24); assert.equal(r.coldFt, 36); assert.equal(r.hotCoils, 1); assert.equal(r.coldCoils, 1);
  assert.equal(r.traps, 3); assert.equal(r.stops, 5);
});

test("the HVAC calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("hvac-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutHvac } = await import("./hvac.mjs");
  const r = layoutHvac(JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]));
  assert.equal(r.ok, true);
  assert.equal(r.supplyFt, 56); assert.equal(r.returnFt, 18); assert.equal(r.flexFt, 74);
  assert.equal(r.flexRolls, 4); assert.equal(r.trunkSticks, 7);
  assert.equal(r.registers, 5); assert.equal(r.boots, 5); assert.equal(r.returnGrilles, 3); assert.equal(r.fittings, 3);
});

test("the price sensitivity page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("price-sensitivity-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { sensitivity, budgetFromSections } = await import("./sensitivity.mjs");
  const d = JSON.parse(html.match(/<textarea id="json"[^>]*>(.*?)<\/textarea>/s)[1]);
  const s = sensitivity(budgetFromSections(d), d.swing);
  assert.equal(s.total, 55367.95); assert.equal(s.bid, 66995.22); assert.equal(s.profit, 6090.47);
  const by = Object.fromEntries(s.rows.map((r) => [r.section, r]));
  assert.equal(by.Lumber.costUp, 3033.45); assert.equal(by.Lumber.bidUp, 3670.47); assert.equal(by.Lumber.bidUpPct, 5.48);
  assert.equal(by.Lumber.profitAbsorbsPct, 30.12); assert.equal(by.Labor.profitAbsorbsPct, 27.68);
  assert.equal(by.Sheathing.profitAbsorbsPct, 83.4); assert.equal(by.Roofing.profitAbsorbsPct, 104.25);
  assert.equal(s.allUp.bid, 77044.5);
  // hand stack: labor +15% = 3300 cost, times 1.1 overhead and 1.1 profit = 3993
  assert.equal(by.Labor.bidUp, 3993);
});

test("budgetFromSections refuses hostile input with a reason", async () => {
  const { budgetFromSections } = await import("./sensitivity.mjs");
  for (const bad of [null, 5, "x", [], {}, { sections: [] }, { sections: [null] }, { sections: [{ name: "", subtotal: 1 }] },
    { sections: [{ name: "a", subtotal: "5" }] }, { sections: [{ name: "a", subtotal: -1 }] }, { sections: [{ name: "a", subtotal: Infinity }] },
    { sections: [{ name: "a", subtotal: 1 }], taxRate: "0.1" }, { sections: [{ name: "a", subtotal: 1 }], profitRate: -1 }])
    assert.throws(() => budgetFromSections(bad), /./);
  assert.equal(budgetFromSections({ sections: [{ name: "a", subtotal: 100 }], profitRate: 0.1 }).profit, 10);
});

test("the wall tile calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("walltile-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutWallTile } = await import("./walltile.mjs");
  const r = layoutWallTile(JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]));
  assert.equal(r.ok, true);
  assert.equal(r.tiles, 591); assert.equal(r.backerSheets, 6); assert.equal(r.screws, 108); assert.equal(r.screwBoxes, 2);
  assert.equal(r.membraneGallons, 2); assert.equal(r.thinsetBags, 1); assert.equal(r.groutBags, 1);
  assert.equal(r.sqFt.toFixed(1), "71.3"); assert.equal(r.groutLb.toFixed(1), "11.2");
});

test("the electrical calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("electrical-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutElectrical } = await import("./electrical.mjs");
  const plan = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const r = layoutElectrical(plan.electrical, plan);
  assert.equal(r.ok, true);
  assert.equal(r.receptacles, 6); assert.equal(r.switches, 2); assert.equal(r.boxes, 8);
  assert.equal(r.cableFt, 96); assert.equal(r.cableRolls, 1); assert.equal(r.cost, 123);
});

test("the paint calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("paint-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutPaint } = await import("./paint.mjs");
  const plan = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const r = layoutPaint(plan.paint, plan);
  assert.equal(r.ok, true);
  assert.equal(r.paintGallonsExact.toFixed(2), "3.05"); assert.equal(r.paintGallons, 4);
  assert.equal(r.primerGallonsExact.toFixed(2), "1.47"); assert.equal(r.primerGallons, 2);
  assert.equal(r.doorSqFt, 84); assert.equal(r.cost, 208);
});

test("the order-by date calculator page: FAQ matches its data and the stated dates are what the engine gives", async () => {
  const html = page("order-by-date-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { orderByFromLines } = await import("./orderby.mjs");
  const r = orderByFromLines(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.rows.map((x) => [x.item, x.orderBy]));
  assert.equal(by.Trusses, "2026-05-01"); // Friday 1 May 2026
  assert.equal(by.Windows, "2026-04-20"); // Monday 20 April 2026
});

test("the fireblocking calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("fireblock-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { takeoff, samplePlan, defaultStock } = await import("./engine.mjs");
  const { layoutFireblock } = await import("./fireblock.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const run = (fb) => { const plan = { ...samplePlan(), ...d, fireblock: fb }; plan.stock = defaultStock(d.studLength); return layoutFireblock(fb, takeoff(plan)); };
  const a = run(d.fireblock);
  assert.equal(a.ok, true);
  assert.deepEqual(a.walls.map((w) => w.pieces), [13, 8, 6]);
  assert.equal(a.pieces, 27); assert.equal(a.boards, 8); assert.equal(a.cost, 44);
  assert.deepEqual(a.sizes.map((s) => [s.size, s.boardsPacked, s.boards]), [["2x4", 4, 5], ["2x6", 2, 3]]);
  const b = run({ ...d.fireblock, intervalFt: 5 });
  assert.equal(b.rowsTotal, 6); assert.equal(b.pieces, 54); assert.equal(b.boards, 12); assert.equal(b.cost, 66);
});

test("the framing nail calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("nail-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { takeoff, samplePlan, defaultStock } = await import("./engine.mjs");
  const { layoutFasteners } = await import("./fasteners.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const run = (fs) => { const plan = { ...samplePlan(), ...d, fasteners: fs }; plan.stock = defaultStock(d.studLength); return layoutFasteners(fs, plan, takeoff(plan)); };
  const a = run(d.fasteners);
  assert.equal(a.ok, true);
  assert.equal(a.total, 387); assert.equal(a.order, 426); assert.equal(a.boxes, 1); assert.equal(a.cost, 48);
  assert.deepEqual(a.connections.map((c) => c.nails), [220, 32, 16, 18, 4, 10, 43, 44]);
  const b = run({ ...d.fasteners, studEndNails: 3 });
  assert.equal(b.connections[0].nails, 330); assert.equal(b.total, 497); assert.equal(b.order, 547); assert.equal(b.boxes, 1);
});

test("the floor calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("floor-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutFloor } = await import("./floor.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const a = layoutFloor(d, samplePlan());
  assert.equal(a.ok, true);
  assert.equal(a.joists.length, 19); assert.equal(a.rims.length, 4); assert.equal(a.blocks.length, 18);
  assert.equal(a.sheets.count, 14); assert.equal(a.sheets.area, 336); assert.equal(a.sheets.waste, 0.25);
  const b = layoutFloor({ ...d, spacing: 24 }, samplePlan());
  assert.equal(b.joists.length, 13); assert.equal(b.blocks.length, 12); assert.equal(b.sheets.count, 14);
});

test("the foundation calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("foundation-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutFoundation } = await import("./foundation.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const a = layoutFoundation(d);
  assert.equal(a.ok, true);
  assert.deepEqual(a.pours.map((p) => +p.cuYd.toFixed(2)), [6.65, 8.52, 11.94, 2.07]);
  assert.equal(+a.concrete.net.toFixed(2), 29.18); assert.equal(a.concrete.order, 30.64);
  assert.equal(a.concrete.trucks, 4); assert.equal(a.concrete.lastLoad, 0.64); assert.equal(a.rebarLb, 1099);
  const b = layoutFoundation({ ...d, footing: { ...d.footing, width: 24, depth: 12 } });
  assert.equal(b.concrete.order, 33.24); assert.equal(b.concrete.trucks, 4); assert.equal(b.concrete.lastLoad, 3.24); assert.equal(b.rebarLb, 1096);
});

test("the CMU calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("cmu-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutCmu } = await import("./cmu.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const a = layoutCmu(d);
  assert.equal(a.netSqFt, 300); assert.equal(a.blocksNet, 337.5); assert.equal(a.blocks, 355); assert.equal(a.mortarBags, 11);
  assert.equal(a.groutCuFt, 25.6); assert.equal(a.groutOrderCuFt, 28.16); assert.equal(a.groutYd, 1.04); assert.equal(a.rebarLb, 175);
  const w = { walls: [{ length: 240, height: 96 }], barSpacing: 48, groutWaste: 0 };
  assert.equal(layoutCmu({ ...w, bondBeamEvery: 6 }).groutCuFt, 17.6); assert.equal(layoutCmu(w).groutCuFt, 9.6);
});

test("the dormer calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("dormer-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutDormer } = await import("./dormer.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const a = layoutDormer(d);
  assert.equal(a.ok, true);
  assert.equal(a.geometry.ridgeLength, 162); assert.equal(a.geometry.commonLength, 43.25); assert.equal(a.geometry.valleyLength, 56.3125);
  assert.equal(a.areas.roofSqFt, 86.5); assert.equal(a.areas.wallSqFt, 121.5);
  assert.equal(a.opening.depth, 126); assert.equal(a.opening.area, 63); assert.equal(a.opening.cutMainRafters, 4);
  assert.equal(a.parts.find((p) => p.part === "common rafter").count, 16);
  assert.equal(a.parts.filter((p) => p.part === "valley jack").reduce((n, p) => n + p.count, 0), 4);
  assert.equal(a.parts.filter((p) => p.part === "cheek stud").length, 7);
  const b = layoutDormer({ ...d, pitch: 6 });
  assert.equal(b.geometry.rise, 18); assert.equal(b.geometry.ridgeLength, 153); assert.equal(b.geometry.commonLength, 40.25);
  assert.equal(b.geometry.valleyLength, 48.4375); assert.equal(b.areas.roofSqFt, 78);
});

test("the header checker page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("header-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { resolveHeaders } = await import("./headers.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const d = JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]);
  const a = resolveHeaders({ ...samplePlan(), ...d });
  assert.equal(a.ok, true);
  assert.deepEqual(a.rows.map((r) => [r.required, r.chosen, r.status]), [["2 x 2x8", "2 x 2x8", "set"], ["2 x 2x6", "2 x 2x6", "ok"], ["2 x 2x10", "2 x 2x8", "under"]]);
  const b = resolveHeaders({ ...samplePlan(), ...d, headerTable: d.headerTable.slice(0, 2) });
  assert.equal(b.ok, false);
  assert.match(b.errors[0], /wider than the table's longest span \(5' 0"\)/);
});

test("the fence calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("fence-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutFence } = await import("./fence.mjs");
  const r = layoutFence(JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]));
  assert.equal(r.ok, true);
  assert.equal(r.posts, 16); assert.equal(r.cornerPosts, 4); assert.equal(r.linePosts, 10); assert.equal(r.gatePosts, 2);
  assert.equal(r.bays, 14); assert.equal(r.railPieces, 42); assert.equal(r.pickets, 222);
  assert.equal(r.concreteBags, 31); assert.equal(r.concreteBagsPerPost.toFixed(2), "1.92"); assert.equal(r.fasteners, 1332); assert.equal(r.fastenerBoxes, 2); assert.equal(r.postLength, 120);
});

test("the paver calculator page: FAQ matches its data and the stated figures are what the engine gives", async () => {
  const html = page("paver-calculator.html");
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\$\("([\w-]+)"\)/g)) assert.ok(ids.has(m[1]), m[1]);
  const { layoutPaver } = await import("./paver.mjs");
  const r = layoutPaver(JSON.parse(html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1]));
  assert.equal(r.ok, true);
  assert.equal(r.netSqFt, 176); assert.equal(r.pavers, 832); assert.equal(r.edgePieces, 6); assert.equal(r.spikes, 56); assert.equal(r.jointSandBags, 4);
  assert.equal(r.paversExact.toFixed(2), "756.18"); assert.equal(r.baseCuYd.toFixed(2), "3.16"); assert.equal(r.baseTons.toFixed(2), "4.43");
  assert.equal(Math.round(r.jointSandLb), 158);
});
