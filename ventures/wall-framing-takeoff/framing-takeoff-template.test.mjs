import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OUTPUTS, EXAMPLE_SETTINGS, FIRST, LAST, TOTAL, WALLS, exampleWalls, sheetRule, sheetXml, wallRule } from "./framing-takeoff-template.mjs";
import { workedTakeoff } from "./takeoff-example.mjs";

const page = readFileSync(new URL("./framing-takeoff-template.html", import.meta.url), "utf8");
const text = page.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const fmt = (n) => Math.round(n).toLocaleString("en-US");

test("the committed .xlsx files are what the generator writes (node framing-takeoff-template.mjs)", async () => {
  for (const [name, build] of Object.entries(OUTPUTS)) {
    assert.equal(Buffer.compare(readFileSync(new URL(`./${name}`, import.meta.url)), await build()), 0, `${name} is stale`);
  }
});

test("each workbook is a zip whose entries are the six SpreadsheetML parts", async () => {
  for (const build of Object.values(OUTPUTS)) {
    const b = await build();
    assert.equal(b.readUInt32LE(0), 0x04034b50);
    assert.equal(b.readUInt32LE(b.length - 22), 0x06054b50);
    assert.equal(b.readUInt16LE(b.length - 12), 6);
  }
});

test("the blank template has 40 wall rows, a totals row and no example data", () => {
  const x = sheetXml({});
  assert.equal(WALLS, 40);
  assert.equal(LAST - FIRST + 1, WALLS);
  assert.match(x, new RegExp(`<row r="${TOTAL}"><c r="A${TOTAL}"[^>]*t="inlineStr"><is><t xml:space="preserve">Totals`));
  assert.doesNotMatch(x, /Open House Plans/);
  // Every computed wall cell is blank until the wall has a length.
  assert.match(x, new RegExp(`<c r="J${FIRST}" s="13"><f>IF\\(B${FIRST}=&quot;&quot;,&quot;&quot;,ROUNDUP`));
});

test("wallRule: a 12 ft wall at 16 in with one 3 ft window", () => {
  const r = wallRule({ length: 12, windows: 1, windowFeet: 3 });
  // 9 spaces + 1 = 10 layout studs, 2 fall in the window; 2 cripples above, 2 below.
  assert.deepEqual([r.studs, r.kings, r.jacks, r.cripples, r.sills, r.headerFeet, r.bottomFeet, r.topFeet], [8, 2, 2, 4, 1, 6.5, 12, 24]);
  assert.equal(wallRule({ length: 12 }, 24).studs, 7);
});

test("the example sheet is Open House Plans 1: 14 walls, 220 ft, 8 doors, 10 windows, 4 corners and 12 tees backed", async () => {
  const w = await exampleWalls();
  assert.equal(w.length, 14);
  assert.equal(w.reduce((s, x) => s + x.length, 0), 220);
  assert.equal(w.reduce((s, x) => s + (+x.doors || 0), 0), 8);
  assert.equal(w.reduce((s, x) => s + (+x.windows || 0), 0), 10);
  assert.equal(w.reduce((s, x) => s + (+x.backed || 0), 0), 16);
  assert.equal(w.filter((x) => x.exterior).length, 4);
});

test("the page's comparison table is the sheet's rules against the counted layout", async () => {
  const w = await exampleWalls();
  for (const sp of [16, 24]) {
    const s = sheetRule(w, { ...EXAMPLE_SETTINGS, spacing: sp }), t = workedTakeoff(sp);
    const more = ((s.boughtFeet / t.boughtFeet - 1) * 100).toFixed(1);
    assert.ok(text.includes(`${fmt(s.boughtFeet)} lineal ft`), `${sp}: sheet feet ${fmt(s.boughtFeet)}`);
    assert.ok(text.includes(`${fmt(t.boughtFeet)} lineal ft`), `${sp}: counted feet ${fmt(t.boughtFeet)}`);
    assert.ok(text.includes(`${more}% more`), `${sp}: ${more}% more`);
    if (sp === 16) {
      const rowsWanted = [["Layout and end studs", s.studs, t.count.stud], ["King studs", s.kings, t.count.king], ["Jack studs", s.jacks, t.count.jack],
        ["Cripples", s.cripples, t.count.cripple], ["Rough sills", s.sills, t.count.sill], ["Corner and tee backing", s.backing, t.count.corner + t.count.tee],
        ["Boards bought, before any allowance", s.boards, t.boards]];
      for (const [label, a, b] of rowsWanted) {
        assert.match(page, new RegExp(`<td>${label}</td><td class="n">${a}</td><td class="n">${b}</td>`), label);
      }
      assert.equal(Math.round(s.topFeet + s.bottomFeet), Math.round(t.plateFeet["2x4"] + t.plateFeet["2x4 PT"]));
    }
  }
});

test("the page links both downloads, the free tool and the paid edition", () => {
  assert.match(page, /href="framing-takeoff-template\.xlsx" download/);
  assert.match(page, /href="framing-takeoff-example\.xlsx" download/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /href="\.\.\/residential-takeoff\/"/);
});
