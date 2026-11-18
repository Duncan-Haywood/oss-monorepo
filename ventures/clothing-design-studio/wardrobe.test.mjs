import test from "node:test";
import assert from "node:assert/strict";
import { planWardrobe, outfits, firstDrop, defaultProfile, ITEMS } from "./wardrobe.mjs";
import { COLOURS } from "./catalogue.mjs";

const profiles = [
  defaultProfile(),
  defaultProfile({ style: "classic", occasions: ["office", "evening"], ageBand: "35-44", climate: "cold", season: "autumn-winter", size: 15 }),
  defaultProfile({ style: "streetwear", ageBand: "18-24", climate: "warm", season: "spring-summer", size: 8, source: "in-house" }),
  defaultProfile({ style: "minimal", tier: "luxury", size: 20, source: "partners" }),
];

test("the wardrobe has the size asked for, a top and a bottom, and real colours", () => {
  for (const p of profiles) {
    const w = planWardrobe(p);
    assert.equal(w.items.length, p.size, JSON.stringify(p));
    assert.ok(w.items.some(i => i.role === "top") && w.items.some(i => i.role === "bottom"));
    for (const i of w.items) assert.ok(COLOURS[i.colourName], `${i.colourName} is not a known colour`);
  }
});

test("items only come in colours they are made in (no white jeans by accident)", () => {
  for (const p of profiles) for (const i of planWardrobe(p).items) {
    const def = ITEMS.find(x => x.id === i.id);
    if (def.colours) assert.ok(def.colours.includes(i.colourName), `${i.colourName} ${i.id}`);
  }
});

test("season and climate are respected", () => {
  const winter = planWardrobe(profiles[1]);
  assert.ok(!winter.items.some(i => ["linen-shirt", "shorts"].includes(i.id)));
  const summer = planWardrobe(profiles[2]);
  assert.ok(!summer.items.some(i => ["coat", "puffer", "beanie"].includes(i.id)));
});

test("no two pieces are the same item in the same colour", () => {
  for (const p of profiles) {
    const keys = planWardrobe(p).items.map(i => `${i.id}|${i.colourName}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("source setting decides in-house vs partner", () => {
  assert.ok(planWardrobe(profiles[3]).items.every(i => i.source === "partner brand"));
  assert.ok(planWardrobe(profiles[2]).items.every(i => i.source.startsWith("in-house")));
});

test("outfit count by hand: 2 tops x 2 bottoms x (no layer + 1 layer), one accent allowed", () => {
  const it = (role, colourName, accent = false, id = role) => ({ id, role, colourName, accent, label: id });
  const items = [it("top", "white"), it("top", "burgundy", true), it("bottom", "indigo"), it("bottom", "khaki"), it("layer", "navy")];
  assert.equal(outfits(items).count, 8);
  const twoAccents = [it("top", "burgundy", true), it("bottom", "indigo"), it("layer", "gold", true)];
  assert.equal(outfits(twoAccents).count, 1);
});

test("same answers, same wardrobe", () => {
  assert.deepEqual(planWardrobe(profiles[1]), planWardrobe(profiles[1]));
});

test("first drop starts small: minimum orders within budget, most-worn pieces first", () => {
  const w = planWardrobe(defaultProfile({ source: "in-house", size: 10 }));
  const unitCosts = {};
  w.items.forEach((i, idx) => { if (i.studio) unitCosts[idx] = 20; });
  const d = firstDrop(w, { budget: 2500, moq: 50, unitCosts });
  assert.ok(d.spent <= 2500);
  assert.ok(d.lines.every(l => l.quantity >= 50 && l.quantity <= 150));
  assert.equal(d.lines.length, 2);
  assert.ok(d.dropped.length > 0);
  assert.ok(d.needQuote.length > 0, "items not made in the studio need a quote");
  const tiny = firstDrop(w, { budget: 500, moq: 50, unitCosts });
  assert.equal(tiny.lines.length, 0);
});
