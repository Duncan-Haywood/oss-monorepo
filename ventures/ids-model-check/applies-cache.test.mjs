// The applicability cache and the per-facet verdict cache (ids.mjs,
// eval/applies-cache-2026-11-18.md) must not change a report: every IDS file
// checked against one shared parsed model, caches on, gives the report that a
// fresh model with the caches off gives. The specifications below repeat
// facets on purpose: the same applicability in several specifications, a
// requirement equal to an applicability facet, a requirement written twice in
// one specification, the same facet under every cardinality, and facets that
// differ only in a value, a data type or a pattern (which the keys must tell
// apart).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, parseModel, readModel } from "./node.mjs";
import { applies, parseIds } from "./ids.mjs";

const ids = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const sv = (x) => `<simpleValue>${x}</simpleValue>`;
const pat = (x) => `<xs:restriction base="xs:string"><xs:pattern value="${x}"/></xs:restriction>`;
const spec = (app, req, occurs = ` minOccurs="0" maxOccurs="unbounded"`) => `<specification name="s" ifcVersion="IFC4"><applicability${occurs}>${app}</applicability><requirements>${req}</requirements></specification>`;
const anyEnt = `<entity><name>${pat(".*")}</name></entity>`;
const anyAttr = (card = "", value = "") => `<attribute${card}><name>${pat(".*")}</name>${value}</attribute>`;
const named = (n, card = "", value = "") => `<attribute${card}><name>${sv(n)}</name>${value}</attribute>`;
const prop = (ps, p, card = "", value = "", dt = "") => `<property${card}${dt}><propertySet>${sv(ps)}</propertySet><baseName>${sv(p)}</baseName>${value}</property>`;

const FILES = [
  // The same applicability, several requirements; one requirement twice.
  ids(spec(anyEnt, named("Name")) + spec(anyEnt, named("Name") + named("Name")) + spec(anyEnt, named("Description", ` cardinality="optional"`)) + spec(anyEnt, named("Description", ` cardinality="prohibited"`)) + spec(anyEnt, named("Name", ` cardinality="prohibited"`))),
  // A requirement equal to an applicability facet; the same facet with a value.
  ids(spec(anyAttr(), anyAttr()) + spec(anyAttr(), anyAttr("", `<value>${pat("W.*")}</value>`)) + spec(anyAttr(), anyAttr(` cardinality="prohibited"`, `<value>${sv("W-01")}</value>`)) + spec(anyAttr(), anyAttr(` cardinality="optional"`, `<value>${pat("Tiny.*")}</value>`))),
  // Facets that differ only in a value or a data type; an entity requirement.
  ids(spec(anyEnt, prop("Pset_WallCommon", "LoadBearing")) + spec(anyEnt, prop("Pset_WallCommon", "LoadBearing", "", "", ` dataType="IFCBOOLEAN"`)) + spec(anyEnt, prop("Pset_WallCommon", "LoadBearing", "", "", ` dataType="IFCLABEL"`)) + spec(anyEnt, prop("Pset_WallCommon", "LoadBearing", ` cardinality="optional"`, `<value>${sv("TRUE")}</value>`)) + spec(anyAttr(), `<entity><name>${sv("IFCWALL")}</name></entity>`) + spec(anyEnt, `<entity><name>${pat("IFC(WALL|DOOR)")}</name></entity>`)),
  // Applicability facets that differ only in a value; a prohibited specification.
  ids(spec(named("Name", "", `<value>${pat("W.*")}</value>`), named("Description")) + spec(named("Name", "", `<value>${pat("D.*")}</value>`), named("Description")) + spec(named("Name"), named("ObjectType"), ` minOccurs="0" maxOccurs="0"`) + spec(named("Name"), "", ` minOccurs="0" maxOccurs="0"`) + spec(anyEnt + named("Name"), named("Name"))),
  // A file repeating the first, as CI's second IDS file would.
  ids(spec(anyEnt, named("Name")) + spec(anyAttr(), anyAttr())),
];

const strip = (r) => { delete r.seconds; return JSON.stringify(r); };

test("one shared model with the caches gives each file's uncached report", async () => {
  const { text } = await readModel(new URL("samples/tiny-house.ifc", import.meta.url).pathname);
  const shared = parseModel(text);
  const starters = ["coordination-basics", "quantities-and-naming", "infrastructure-and-mep"].map((n) => readFileSync(new URL(`samples/${n}.ids.xml`, import.meta.url), "utf8"));
  const all = [...FILES, ...starters, ...FILES];
  for (const [i, f] of all.entries()) {
    const want = strip(check(f, parseModel(text), { facetCache: false }));
    assert.equal(strip(check(f, shared)), want, `file ${i}`);
  }
  // Each file alone on a fresh model, so no earlier file's verdicts are kept.
  for (const [i, f] of FILES.entries()) assert.equal(strip(check(f, parseModel(text))), strip(check(f, parseModel(text), { facetCache: false })), `file ${i} alone`);
  // The caches were used: several applicability results and facet verdicts kept.
  assert.ok(shared._appliesCache.map.size >= 5, "applicability results kept");
  assert.ok(shared._appliesCache.verdicts.size >= 4, "facet verdicts kept");
});

test("a cached applicability result is the walk's, in the same order, on every call", async () => {
  const { text } = await readModel(new URL("samples/tiny-house.ifc", import.meta.url).pathname);
  const m = parseModel(text);
  const ctx = { typeMap: null };
  for (const f of FILES) for (const sp of parseIds(f).specs) {
    const want = applies(sp, m, ctx, true).map((e) => e.id);
    assert.deepEqual(applies(sp, m, ctx).map((e) => e.id), want);
    assert.deepEqual(applies(sp, m, ctx).map((e) => e.id), want, "second call, from the cache");
  }
});

test("a new check context starts a new cache", async () => {
  const { text } = await readModel(new URL("samples/tiny-house.ifc", import.meta.url).pathname);
  const m = parseModel(text);
  check(FILES[0], m);
  const first = m._appliesCache;
  check(FILES[0], m, { typeMap: {} });
  assert.notEqual(m._appliesCache, first);
});
