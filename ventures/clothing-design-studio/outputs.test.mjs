import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDesign, applyOp } from "./design.mjs";
import { renderDesign } from "./render.mjs";
import { techPack, quoteRequest, techPackHtml } from "./techpack.mjs";
import { launchKit, storeCsv } from "./launchkit.mjs";
import { compatibilityNotes, GARMENTS, PX_PER_CM } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";
import { cleanModelLines, interpret, systemPrompt } from "./ai.mjs";

const sample = () => {
  let d = newDesign({ name: "Ave Maria", quantity: 60 });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", method: "high-density", w: 20 });
  d = applyOp(d, { op: "add", kind: "text", text: "AVE <MARIA>", area: "back", method: "screen" });
  return d;
};

test("the drawing is to scale: a medium tee is about 51 cm wide and 72 cm long", () => {
  const nums = GARMENTS.tee.outline.front.match(/\d+/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  assert.equal(Math.round((403 - 97) / PX_PER_CM), 51);
  assert.equal(Math.round((484 - 52) / PX_PER_CM), 72);
  assert.ok(Math.max(...xs) <= 500);
});

test("render escapes text and only draws the side shown", () => {
  const d = sample();
  const front = renderDesign(d, { side: "front" });
  const back = renderDesign(d, { side: "back" });
  assert.ok(!front.includes("MARIA"));
  assert.ok(back.includes("AVE &lt;MARIA&gt;"));
  assert.ok(!back.includes("<MARIA>"));
  assert.ok(front.includes('filter="url(#cds-raised)"'));
});

test("tech pack measures from the shoulder high point", () => {
  const pack = techPack(sample());
  const p1 = pack.placements[0];
  // full front top edge is 10 cm below HPS when the art fills the height and sits centred
  assert.equal(p1.widthCm, 20);
  assert.equal(p1.fromHpsCm, 10 + (38 - 20) / 2);
  assert.equal(p1.inkColours, 1);
  assert.match(quoteRequest(sample()), /60 x t-shirt/);
  assert.ok(techPackHtml(sample()).includes("No warranty"));
});

test("compatibility notes catch the common mistakes", () => {
  assert.ok(compatibilityNotes("heavyweight-cotton", "sublimation").some(n => /polyester/.test(n)));
  assert.ok(compatibilityNotes("performance-poly", "sublimation", { colour: "#1b1b1d" }).some(n => /dark/.test(n)));
  assert.equal(compatibilityNotes("performance-poly", "sublimation", { colour: "#ffffff" }).length, 0);
  assert.ok(compatibilityNotes("cotton-jersey", "3d-puff-embroidery", { gsm: 150 }).length >= 1);
  assert.ok(compatibilityNotes("heavyweight-cotton", "high-density").some(n => /bold shapes/.test(n)));
});

test("launch kit never claims what the design does not support", () => {
  const d = sample();
  const kit = launchKit(d);
  assert.ok(!/organic/i.test(kit.description));
  assert.ok(kit.hashtags.includes("#sacredart"));
  const organic = launchKit(applyOp(d, { op: "fabric", value: "organic-cotton" }));
  assert.ok(organic.hashtags.includes("#organiccotton"));
  const big = launchKit(applyOp(d, { op: "quantity", value: 5000 }));
  assert.ok(!/run of/.test(big.description));
  const csv = storeCsv(d).trim().split("\n");
  assert.equal(csv.length, 1 + 5);
  assert.match(csv[0], /^Handle,Title,Body \(HTML\)/);
  assert.ok(!csv.join("").includes("<MARIA>"));
});

test("motifs are self-contained SVG using currentColor", () => {
  for (const m of Object.values(MOTIFS)) {
    assert.ok(m.svg.includes("currentColor"), m.id);
    assert.ok(!/<script|href=/i.test(m.svg), m.id);
  }
});

test("model output is filtered to plain command lines", () => {
  assert.deepEqual(cleanModelLines("1. make it navy\n- add a halo\n<script>x</script>\nnone\n```"), ["make it navy", "add a halo"]);
  assert.match(systemPrompt(), /commands only/);
});

test("with no model configured, interpret uses the built-in parser", async () => {
  const r = await interpret("make it navy", newDesign(), null);
  assert.equal(r.source, "fallback");
  assert.equal(r.result.steps[0].ops[0].value, "navy");
});

test("with a model, its lines are parsed by the same rules; a failure falls back", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "make it burgundy\nadd a halo" }], usage: {} }) });
  const cfg = { provider: "anthropic", apiKey: "test", model: "m" };
  const r = await interpret("I want it to feel like an old church", newDesign(), cfg, { fetch: fakeFetch });
  assert.equal(r.source, "model");
  assert.deepEqual(r.rewritten, ["make it burgundy", "add a halo"]);
  const failing = async () => { throw new Error("offline"); };
  const f = await interpret("make it navy", newDesign(), cfg, { fetch: failing });
  assert.equal(f.source, "fallback");
});

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});
