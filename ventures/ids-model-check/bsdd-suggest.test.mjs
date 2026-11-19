// bsdd-suggest.mjs: offline bSDD links for standard IFC properties.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suggestBsddLinks, addBsddLinks, ifc43PropUri, suggestReport, IFC43_DICTIONARY, BSDD_UNLINKED } from "./bsdd-suggest.mjs";
import { bsddLinks } from "./bsdd.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { resources } from "./node.mjs";

const { psets } = resources();
const here = new URL(".", import.meta.url).pathname;
const sv = (v) => `<simpleValue>${v}</simpleValue>`;
const prop = (set, name, extra = "") => `    <property${extra}><propertySet>${sv(set)}</propertySet><baseName>${sv(name)}</baseName></property>`;
const ids = (requirements, applicability = "") => `<?xml version="1.0" encoding="UTF-8"?>
<!-- kept as written -->
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <info><title>t</title></info>
  <specifications>
    <specification name="Walls" ifcVersion="IFC4X3_ADD2">
      <applicability><entity><name>${sv("IFCWALL")}</name></entity>${applicability}</applicability>
      <requirements>
${requirements}
      </requirements>
    </specification>
  </specifications>
</ids>
`;

test("a standard property without a uri gets the IFC 4.3 dictionary link, named by the property", () => {
  const text = ids([prop("Pset_WallCommon", "FireRating", ' dataType="IFCLABEL"'), prop("Qto_WallBaseQuantities", "NetVolume")].join("\n"));
  const list = suggestBsddLinks(text, { psets });
  assert.deepEqual(list.map((x) => x.uri), [`${IFC43_DICTIONARY}/prop/FireRating`, `${IFC43_DICTIONARY}/prop/NetVolume`]);
  assert.equal(list[0].line, 9);
  assert.equal(list[0].ifcType, null);
  assert.equal(list[0].specName, "Walls");
});

test("a facet already linked, a pattern, a custom set, a misspelt name or an applicability facet gets nothing", () => {
  const text = ids([
    prop("Pset_WallCommon", "IsExternal", ` uri="${ifc43PropUri("IsExternal")}"`),
    `    <property><propertySet><xs:restriction base="xs:string"><xs:pattern value="Pset_.*"/></xs:restriction></propertySet><baseName>${sv("FireRating")}</baseName></property>`,
    prop("Acme_Walls", "FireRating"),
    prop("Pset_WallCommon", "firerating"),
  ].join("\n"), prop("Pset_WallCommon", "LoadBearing"));
  assert.deepEqual(suggestBsddLinks(text, { psets }), []);
  assert.match(suggestReport([]), /no bSDD links to suggest/);
});

test("a template property bSDD's dictionary leaves out gets no link (it would not resolve)", () => {
  // Pset_PlateCommon.Reference is in the IFC 4.3 templates, but bSDD has no
  // prop/Reference (eval/bsdd-suggest-live-2026-11-19.md).
  assert.ok(Object.hasOwn(psets.IFC4X3.Pset_PlateCommon.props, "Reference"));
  assert.ok(BSDD_UNLINKED.has("Reference"));
  for (const name of BSDD_UNLINKED) assert.ok(Object.values(psets.IFC4X3).some((s) => Object.hasOwn(s.props, name)), `${name} is a template property`);
  const list = suggestBsddLinks(ids([prop("Pset_PlateCommon", "Reference"), prop("Pset_PlateCommon", "FireRating")].join("\n")), { psets });
  assert.deepEqual(list.map((x) => x.baseName), ["FireRating"]);
});

test("the template's type is named when the facet asks for another", () => {
  const [x] = suggestBsddLinks(ids(prop("Pset_WallCommon", "ThermalTransmittance", ' dataType="IFCREAL"')), { psets });
  assert.equal(x.ifcType, "IFCTHERMALTRANSMITTANCEMEASURE");
  assert.match(suggestReport([x]), /the IFC dictionary gives IFCTHERMALTRANSMITTANCEMEASURE; this facet asks IFCREAL/);
});

test("addBsddLinks inserts only the attributes; the result audits the same, and bsdd.mjs reads the links", () => {
  const text = ids([prop("Pset_WallCommon", "FireRating", ' dataType="IFCLABEL"'), prop("Pset_WallCommon", "AcousticRating"), prop("Acme", "X")].join("\n"));
  const list = suggestBsddLinks(text, { psets });
  const out = addBsddLinks(text, list);
  assert.equal(out.length - text.length, list.reduce((n, x) => n + ` uri="${x.uri}"`.length, 0));
  assert.ok(out.includes(`<property uri="${ifc43PropUri("FireRating")}" dataType="IFCLABEL">`));
  assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!-- kept as written -->'));
  assert.deepEqual(suggestBsddLinks(out, { psets }), []);
  assert.deepEqual(bsddLinks(out).map((l) => l.uri), list.map((x) => x.uri));
  const r = resources();
  const codes = (t) => auditIds(parseIds(t), r).map((x) => x.code).sort();
  assert.deepEqual(codes(out), codes(text));
});

test("cli --link-bsdd writes the linked IDS and lists the links on stderr", () => {
  const dir = mkdtempSync(join(tmpdir(), "bsdd-suggest-"));
  const src = join(dir, "in.ids"), dst = join(dir, "out.ids");
  writeFileSync(src, ids(prop("Pset_WallCommon", "FireRating")));
  const r = execFileSync(process.execPath, [join(here, "cli.mjs"), "--link-bsdd", src, "-o", dst], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(r, "");
  const out = execFileSync(process.execPath, [join(here, "cli.mjs"), "--link-bsdd", dst], { encoding: "utf8" });
  assert.ok(out.includes(`uri="${ifc43PropUri("FireRating")}"`));
});

test("not an IDS is an error", () => {
  assert.throws(() => suggestBsddLinks("<foo/>", { psets }), /not an IDS file/);
});
