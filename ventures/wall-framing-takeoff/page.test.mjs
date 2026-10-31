import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

for (const name of ["index.html", "how-many-studs-for-a-wall.html", "stair-stringer-calculator.html", "drywall-calculator.html", "schedule-calculator.html", "siding-calculator.html", "bid-leveling-calculator.html"]) {
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
  assert.deepEqual([...html.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort(), ["./bidlevel.mjs", "./budget.mjs", "./deck.mjs", "./dormer.mjs", "./drawings.mjs", "./drywall.mjs", "./dxf.mjs", "./eaves.mjs", "./engine.mjs", "./fasteners.mjs", "./floor.mjs", "./foundation.mjs", "./gutters.mjs", "./headers.mjs", "./insulation.mjs", "./panels.mjs", "./pdf.mjs", "./roof.mjs", "./schedule.mjs", "./sheathing.mjs", "./siding.mjs", "./sketch.mjs", "./stairs.mjs", "./trim.mjs", "./usage.mjs"]);
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
});

test("the page frames a floor through floor.mjs and pools its lumber with the walls", () => {
  const html = page("index.html");
  for (const id of ["flOn", "flW", "flD", "flJoist", "flSpacing", "flBeam", "flCant", "flHdr", "flStairSide", "flBlock", "flUnder", "flOpen", "floorOut"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /layoutFloor\(plan\.floor, plan\)/);
  assert.match(html, /fl\.headerCheck = \{ liveLoad: n\[0\]/); // header check read into the plan
  assert.match(html, /\$\("#flHdr"\)\.value = h \?/); // and restored
  assert.match(html, /fl\.cantilever = L\(\$\("#flCant"\)\.value/); // read into the plan
  assert.match(html, /\$\("#flCant"\)\.value = fl\.cantilever/); // and restored from a saved plan
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
  for (const id of ["dkOn", "dkWidth", "dkDepth", "dkHeight", "dkJoist", "dkSpacing", "dkBeam", "dkPost", "dkFree", "dkGuard", "dkGuardSides", "dkStair", "dkBorder", "dkBlocking", "dkPostCheck", "deckOut"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /plan\.deck = dk/);
  assert.match(html, /layoutDeck\(plan\.deck\)/);
  assert.match(html, /\$\("#dkOn"\)\.checked = Boolean\(dkp\)/);
  assert.match(html, /dk\.guard = false/);
  assert.match(html, /dk\.stairs = \{\}/);
  assert.match(html, /dk\.border = Number\(\$\("#dkBorder"\)\.value\)/);
  assert.match(html, /\$\("#dkBorder"\)\.value = dkp\?\.border === true/);
  assert.match(html, /dk\.postCheck = \{ deadPsf: n\[0\], livePsf: n\[1\], fc: n\[2\], emin: n\[3\]/);
  assert.match(html, /\$\("#dkPostCheck"\)\.value = pc \?/);
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
  for (const id of ["src", "out", "gantt", "nb"]) assert.ok(ids.has(id), id);
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

test("every page links to every other page (internal linking for readers and crawlers)", () => {
  const pages = ["index", "how-many-studs-for-a-wall", "stair-stringer-calculator", "drywall-calculator", "concrete-calculator", "siding-calculator", "schedule-calculator", "bid-leveling-calculator"].map((n) => n + ".html");
  for (const f of pages) {
    const html = page(f);
    for (const other of pages) if (other !== f) assert.ok(html.includes(`<a href="${other}">`), `${f} does not link ${other}`);
  }
});
