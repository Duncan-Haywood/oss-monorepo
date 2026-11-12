import { test } from "node:test";
import assert from "node:assert/strict";
import * as e from "./semver.mjs";

const rs = (r, o) => e.rangeString(e.parseRange(r, o));

test("desugaring follows npm's documented table", () => {
  const table = {
    "^1.2.3": ">=1.2.3 <2.0.0-0", "^0.2.3": ">=0.2.3 <0.3.0-0", "^0.0.3": ">=0.0.3 <0.0.4-0",
    "^1.2.3-beta.2": ">=1.2.3-beta.2 <2.0.0-0", "^0.0.x": "<0.1.0-0", "^1.x": ">=1.0.0 <2.0.0-0",
    "~1.2.3": ">=1.2.3 <1.3.0-0", "~1.2": ">=1.2.0 <1.3.0-0", "~1": ">=1.0.0 <2.0.0-0", "~>1.2.3": ">=1.2.3 <1.3.0-0",
    "1.x": ">=1.0.0 <2.0.0-0", "1.2.x": ">=1.2.0 <1.3.0-0", "*": "", "": "",
    "1.2.3 - 2.3.4": ">=1.2.3 <=2.3.4", "1.2 - 2.3.4": ">=1.2.0 <=2.3.4", "1.2.3 - 2.3": ">=1.2.3 <2.4.0-0", "1.2.3 - 2": ">=1.2.3 <3.0.0-0",
    ">1.2": ">=1.3.0", ">1": ">=2.0.0", "<1.2": "<1.2.0-0", "<=1.2": "<1.3.0-0", "=1.2": ">=1.2.0 <1.3.0-0", ">*": "<0.0.0-0",
    "> 1.2.3": ">1.2.3", "~ 1.2": ">=1.2.0 <1.3.0-0", "v1.2.3": "v1.2.3".slice(1),
  };
  for (const [r, want] of Object.entries(table)) assert.equal(rs(r), want, r);
  assert.equal(rs("1.x", { includePrerelease: true }), ">=1.0.0-0 <2.0.0-0");
  assert.equal(rs("^1.2.3", { includePrerelease: true }), ">=1.2.3 <2.0.0-0");
  assert.equal(rs("^0.2.3", { includePrerelease: true, semver: "7.7" }), ">=0.2.3-0 <0.3.0-0");
  assert.equal(rs("^0.2.3", { includePrerelease: true, semver: "7.8" }), ">=0.2.3 <0.3.0-0");
});

test("the two node-semver flavours differ where 7.8 changed the rules", () => {
  assert.equal(e.DEFAULT_SEMVER, "7.8");
  assert.equal(rs("~1.2", { includePrerelease: true, semver: "7.7" }), ">=1.2.0 <1.3.0-0");
  assert.equal(rs("~1.2", { includePrerelease: true, semver: "7.8" }), ">=1.2.0-0 <1.3.0-0");
  assert.equal(rs("1.x.2", { semver: "7.7" }), ">=1.0.0 <2.0.0-0");
  assert.throws(() => e.parseRange("1.x.2", { semver: "7.8" }), /number after an x/);
  assert.equal(rs("^1.x.2", { semver: "7.8" }), ">=1.0.0 <2.0.0-0", "caret still accepts it");
  assert.throws(() => e.parseRange("^1", { semver: "6" }), /Unknown node-semver version/);
  assert.equal(e.semverFlavourFor("7.7.4"), "7.7");
  assert.equal(e.semverFlavourFor("7.8.5"), "7.8");
  assert.equal(e.semverFlavourFor("8.0.0"), "7.8");
  assert.equal(e.semverFlavourFor(null), "7.8");
});

test("precedence is semver 2.0.0 section 11", () => {
  const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
  for (let i = 0; i + 1 < order.length; i++) assert.equal(e.compare(e.parseVersion(order[i]), e.parseVersion(order[i + 1])), -1, order[i]);
  assert.equal(e.compare(e.parseVersion("1.0.0+a"), e.parseVersion("1.0.0+b")), 0);
});

test("the prerelease rule: only the named major.minor.patch opens", () => {
  assert.equal(e.satisfies("1.3.0-beta", "^1.2.0"), false);
  assert.equal(e.satisfies("1.3.0-beta", "^1.2.0", { includePrerelease: true }), true);
  assert.equal(e.satisfies("1.2.3-beta.4", ">=1.2.3-beta.2"), true);
  assert.equal(e.satisfies("1.2.4-beta.4", ">=1.2.3-beta.2"), false);
  const x = e.explainVersion("1.9.0-rc.1", "^1.2.0");
  assert.equal(x.ok, false);
  assert.equal(x.blockedByPrerelease, true);
  assert.match(x.reason, /no comparator in this branch names a prerelease of 1\.9\.0/);
});

test("a bare * branch swallows the others, prereleases included (npm's rule), and is flagged", () => {
  assert.equal(e.satisfies("1.2.3-rc.1", "^1.2.3-rc.1"), true);
  assert.equal(e.satisfies("1.2.3-rc.1", "^1.2.3-rc.1 || *"), false);
  const f = e.explainRange("^1.2.3-rc.1 || *").findings.find((x) => x.code === "star-branch");
  assert.equal(f.severity, "high");
  assert.match(f.message, /1\.2\.3/);
});

test("compareRanges is exact and gives witnesses", () => {
  let c = e.compareRanges("~1.2.5", "^1.2");
  assert.deepEqual([c.aInB, c.bInA, c.overlap], [true, false, true]);
  assert.equal(c.onlyB, "1.2.0");
  c = e.compareRanges("1.2.3-rc.1 >=1.0.0", "^10.0.0");
  assert.equal(c.aInB, false);
  assert.equal(c.onlyA, "1.2.3-rc.1");
  c = e.compareRanges("<2.0.0", "*");
  assert.equal(c.aInB, true, "no prerelease can satisfy <2.0.0 by default, so it sits inside *");
  c = e.compareRanges("^1", "^2");
  assert.equal(c.overlap, false);
  c = e.compareRanges("1.2.3 - 2.3.4", ">=1.2.3 <=2.3.4");
  assert.equal(c.equivalent, true);
  assert.equal(e.compareRanges(">2 <1", "1.0.0").aEmpty, true);
});

test("minVersion is the least satisfying version", () => {
  assert.equal(e.minVersion("^1.2.3"), "1.2.3");
  assert.equal(e.minVersion(">1.2.3"), "1.2.4");
  assert.equal(e.minVersion(">1.2.3-beta"), "1.2.3-beta.0");
  assert.equal(e.minVersion("*"), "0.0.0");
  assert.equal(e.minVersion("*", { includePrerelease: true }), "0.0.0-0");
  assert.equal(e.minVersion(">2 <1"), null);
});

test("max and min satisfying from a pasted npm view list", () => {
  const list = e.parseVersionList('["1.0.0","1.2.0","1.9.0-rc.1","2.0.0"]');
  assert.deepEqual(list, ["1.0.0", "1.2.0", "1.9.0-rc.1", "2.0.0"]);
  assert.equal(e.maxSatisfying(list, "^1.0.0"), "1.2.0");
  assert.equal(e.minSatisfying(list, "^1.0.0"), "1.0.0");
  assert.deepEqual(e.parseVersionList("1.0.0, 1.1.0\n2.0.0"), ["1.0.0", "1.1.0", "2.0.0"]);
});

test("invalid input gets a reason, not a crash", () => {
  for (const [r, re] of [["latest", /dist-tag/], ["1.2.3, 2.0.0", /space means AND/], ["1.2.3.4", /four numbers/], ["01.2.3", /leading zero/], ["github:user/repo", /URL, path/]]) {
    const x = e.explainRange(r);
    assert.equal(x.valid, false, r);
    assert.match(x.error, re, r);
  }
  assert.match(e.explainVersion("=1.2.3", "*").reason, /leading "="/);
  assert.match(e.explainVersion("1.2", "*").reason, /major\.minor\.patch/);
});

test("findings: no upper bound, caret on 0.x, redundant branch, hyphen spacing, unsatisfiable", () => {
  const codes = (r) => e.explainRange(r).findings.map((f) => f.code);
  assert.ok(codes(">=1.2.0").includes("no-upper-bound"));
  assert.ok(codes("^0.2.3").includes("caret-zero"));
  assert.ok(codes("^1.2 || ^1.4").includes("redundant-branch"));
  assert.ok(codes("1.2.3-2.0.0").includes("hyphen-spacing"));
  assert.ok(codes(">2 <1").includes("unsatisfiable"));
  assert.deepEqual(codes("^1.2.3"), []);
});

test("analyze on the page's example", () => {
  const r = e.analyze(e.EXAMPLE);
  assert.equal(e.analyze(e.DEFAULTS).comparison, null);
  assert.equal(r.max, "2.0.0-beta.4");
  assert.equal(r.totals.matching, 4);
  assert.equal(r.totals.blocked, 1);
  assert.equal(r.comparison.aInB, true);
  assert.equal(r.comparison.bInA, false);
  assert.equal(r.comparison.onlyB, "2.0.0-0");
  assert.match(e.reportCsv(r), /^version,satisfies,reason\n"1\.1\.9",no,/);
});

test("ranges and versions over 256 characters are refused like npm", () => {
  assert.throws(() => e.parseRange("1".repeat(300)));
  assert.equal(e.parseVersion("1.2.3-" + "a".repeat(300)), null);
});
