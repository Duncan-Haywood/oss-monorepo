# Several classes per specification in the IDS editor (2026-11-17)

**Question.** The editor held one class per specification (with its
subclasses, optionally). An opened IDS whose applicability names a list of
classes that is not one class and its subclasses (`IFCSLAB IFCCOLUMN IFCBEAM
IFCWALL IFCPLATE IFCROOF`) kept that entity facet as written: shown as XML,
not editable. How many of the public files' specifications is that, and does
opening them as editable rows still write back the same file?

**What landed** (`editor.mjs`, `editor.html`):

- page state: `spec.also`, further exact classes after `spec.cls`;
  `specClassNames()` writes `cls` (plus its subclasses when ticked) then `also`
  as one entity facet enumeration;
- a requirement must make sense for every class, so the page offers what they
  share: `commonSets()` (standard sets every class can carry),
  `commonAttributes()` (attributes every class has; an enumeration is offered
  only when the type is the same on all, `sameAttributeType()`: `PredefinedType`
  is `IfcSlabTypeEnum` on a slab and `IfcBeamTypeEnum` on a beam) and
  `commonPredefinedTypes()` (one `predefinedType` applies to every name);
- `importIds()` opens a class list as `cls` + `also` when every name is a class
  of the schema (or an IFC2X3 type-mapping name) and any predefined type is one
  all of them allow; otherwise the facet is kept as written, as before;
- the page: an "Also applies to" field (comma or space separated), a warning
  for names the schema lacks, the set picker narrowed to shared sets, and a
  changed list clears a standard-set row or predefined type no longer shared.

**Measured** (`sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh`,
then `node eval/editor-open.mjs`; before = main at 0571750c3):

| Files | Write back the same, before / after | Editable facets, before | after | Files with every facet editable, before / after |
| --- | --- | ---: | ---: | --- |
| 64 public IDS | 64 / 64 (507 of 507 specs) | 1,598 (79.4%) | **1,631 (81.1%)** | 8 / **10** |
| 12 IDS-Audit-tool ValidFiles | 12 / 12 | 68 | 68 | 3 / 3 |
| 187 buildingSMART pass cases | 187 / 187 | 308 | 308 | 121 / 121 |

On the public files, entity facets kept as written fell from 50 to 21: 29
specifications in 11 files now open with several classes (2 to 147 classes,
median 7). Audit errors changed on none. The 21 left are patterns, mixed-case
names (`IfcSpace`, which the audit flags) and classes the schema lacks (an IFC4
file naming IFC4X3's `IFCBEARINGTYPE`).

The requirements in those 29 specifications: 35 open as rows, 35 stay kept.
The kept ones are mostly correct refusals: a standard set only some of the
classes can carry (`Pset_ManufacturerOccurrence` on a list with `IFCROOF`;
`Pset_WallCommon` on a slab-and-wall list), a `Pset_.*Common` pattern, and
`Pset_4D_ConstructionSequencing`, a non-standard name in the reserved prefix.

Against `ids.xsd` (`node eval/editor-open.mjs --write DIR`, then
`python3 eval/editor-xsd-compare.py DIR`, IfcTester 0.8.1 here; the 2026-11-16
run used 0.9.0): public files valid 53 before, 54 after writing back (the same
one made valid as on 2026-11-16, an unescaped `&`), 0 made invalid; 11 of 12
and 187 of 187 unchanged.

Tests: `editor.test.mjs` ("a specification can apply to several classes",
"an opened IDS naming several classes"). The page in Chromium (Playwright,
390 px): typing `ifcslab, IFCBEAM` into "Also applies to" on the starter
specification writes `IFCWALL IFCWALLELEMENTEDCASE IFCWALLSTANDARDCASE IFCSLAB
IFCBEAM`, drops the wall-only `Pset_WallCommon` row, offers the seven sets all
three share, no horizontal scroll, no console errors.

**Not claimed.** A class list is held as exact names: a list that is two
classes each with all their subclasses opens with every name in `also`
(correct, but the subclass checkbox applies to the first class only). Property
and attribute facets in the applicability (85 kept) are the next item.
