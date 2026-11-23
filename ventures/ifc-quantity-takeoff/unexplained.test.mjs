// A stored figure that disagrees with the geometry for no named cause: the BoQ
// keeps it by default, can sum the geometry instead, and always shows both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainChecks, rowQuantities, boq, boqCsv } from "./qto.mjs";

const vol = (value) => ({ kind: "volume", value });
const wall = (id, stored, computed, extra = {}) => ({
  id, tag: null, ifcClass: "IfcWall", ifcType: "IFCWALL", type: "W1", stored: { NetVolume: vol(stored) },
  computed: { status: "ok", gross: computed, net: computed, openings: 0 },
  check: { net: { computed, stored, diff: computed - stored, rel: (computed - stored) / stored, agree: Math.abs(computed - stored) / stored <= 0.02 } },
  ...extra,
});

function rows() {
  const r = [wall(1, 5, 3), wall(2, 2, 2), wall(3, 4, 4.4)];
  explainChecks(r);
  return r;
}

test("an unexplained stored volume is kept by default and reported in doubt", () => {
  const [a, b, c] = rows();
  assert.equal(a.check.net.reason, "unexplained");
  const q = rowQuantities(a);
  assert.equal(q.volume, 5);
  assert.equal(q.volumeSource, "stored");
  assert.deepEqual(q.volumeDoubt, { stored: 5, computed: 3 });
  assert.equal(rowQuantities(b).volumeDoubt, null); // agrees
  assert.deepEqual(rowQuantities(c).volumeDoubt, { stored: 4, computed: 4.4 });
});

test("unexplained: geometry sums the geometry's figure for those rows only", () => {
  const [a, b] = rows();
  const q = rowQuantities(a, { unexplained: "geometry" });
  assert.equal(q.volume, 3);
  assert.equal(q.volumeSource, "computed");
  assert.deepEqual(q.volumeDoubt, { stored: 5, computed: 3 }); // still reported
  assert.equal(rowQuantities(b, { unexplained: "geometry" }).volumeSource, "stored");
});

test("a disagreement with a known cause is not in doubt", () => {
  // a stored volume 1000 times the geometry's: unit slip, already not trusted
  const r = [wall(1, 3000, 3)];
  explainChecks(r);
  assert.equal(r[0].check.net.reason, "unit-slip");
  const q = rowQuantities(r[0]);
  assert.equal(q.volumeDoubt, null);
  assert.equal(q.volume, 3);
});

test("BoQ lines carry the count and both sums, and the CSV says which was summed", () => {
  const r = rows();
  const [L] = boq(r, ["class"]);
  assert.equal(L.volume, 5 + 2 + 4);
  assert.deepEqual(L.volumeDoubt, { count: 2, stored: 9, computed: 7.4 });
  const [G] = boq(r, ["class"], null, { unexplained: "geometry" });
  assert.ok(Math.abs(G.volume - (3 + 2 + 4.4)) < 1e-12);
  assert.deepEqual(G.volumeDoubt, L.volumeDoubt);
  const csv = boqCsv([G], ["class"], {}, null, { unexplained: "geometry" }).split("\r\n");
  const head = csv[0].split(","), cells = csv[1].split(",");
  assert.equal(cells[head.indexOf("Volumes in doubt (disagree for no known cause)")], "2");
  assert.equal(cells[head.indexOf("Their stored volume m3")], "9");
  assert.equal(cells[head.indexOf("Their geometry volume m3")], "7.4");
  assert.equal(cells[head.indexOf("Summed for those")], "geometry");
  const plain = boqCsv(boq([r[1]], ["class"]), ["class"]).split("\r\n")[1].split(",");
  assert.equal(plain[head.indexOf("Volumes in doubt (disagree for no known cause)")], "0");
  assert.equal(plain[head.indexOf("Summed for those")], "");
});

test("an unexplained stored area is in doubt too, and geometry swaps it", () => {
  const r = {
    id: 9, ifcClass: "IfcWall", ifcType: "IFCWALL", stored: { NetSideArea: { kind: "area", value: 12 } },
    computed: { status: "ok", gross: 1, net: 1 },
    areaCheck: { NetSideArea: { kind: "side", computed: 10, stored: 12, agree: false, reason: "unexplained", trust: true } },
  };
  assert.deepEqual(rowQuantities(r).areaDoubt, { stored: 12, computed: 10 });
  assert.equal(rowQuantities(r).area, 12);
  const g = rowQuantities(r, { unexplained: "geometry" });
  assert.equal(g.area, 10);
  assert.equal(g.areaSource, "computed");
  r.areaCheck.NetSideArea.reason = "on-a-face"; // a named cause: no doubt
  assert.equal(rowQuantities(r).areaDoubt, null);
});

test("nominal-slip: area x nominal width x 1000 on a slab sloped to drain (ARK_NUS #1186582)", () => {
  const slab = (stored, computed, area = 22.4740007608956, width = 0.25) => ({
    id: 1186582, tag: null, ifcClass: "IfcSlab", ifcType: "IFCSLAB", type: "fall",
    stored: { GrossArea: { kind: "area", value: area }, GrossVolume: vol(stored), Width: { kind: "length", value: width } },
    computed: { status: "ok", gross: computed, net: computed, openings: 0 },
    check: { gross: { computed, stored, rel: (computed - stored) / stored, agree: false } },
  });
  const rows = [slab(5618.50019022391, 5.292362567677673), slab(5618.5 * 1.01, 5.292362567677673), slab(5618.50019022391, 3.0)];
  explainChecks(rows);
  assert.equal(rows[0].check.gross.reason, "nominal-slip");
  assert.equal(rows[0].check.gross.factor, 1000);
  assert.equal(rows[0].trustStored, false);
  const q = rowQuantities(rows[0]);
  assert.equal(q.volume, 5.292362567677673); // the geometry, not 5,618 m3
  assert.equal(q.volumeDoubt, null);
  assert.equal(rows[1].check.gross.reason, "unexplained"); // not the product to 1e-6
  assert.equal(rows[1].check.gross.factor, undefined);
  assert.equal(rows[2].check.gross.reason, "unexplained"); // body far from area x width
});
