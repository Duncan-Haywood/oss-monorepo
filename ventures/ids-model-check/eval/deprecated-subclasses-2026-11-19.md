# Deprecated subclasses and the ticked box, read from real models (2026-11-19)

**Question.** The editor's "and its subclasses" box writes every concrete
subclass of a class. In IFC4X3 that includes two classes IFC 4.3 tells writers
not to use: `IfcWallStandardCase` ("deprecated, IfcWall with
IfcMaterialLayerSetUsage is used instead", `IfcWall.md`) and
`IfcElectricDistributionBoard` ("IFC4.3.0.0 DEPRECATION Use IfcDistributionBoard
instead"), both from buildingSMART/IFC4.3.x-development at `19face7`. The
other IFC4 standard and elemented cases (`IfcSlabStandardCase`,
`IfcBeamStandardCase`, ...) were deleted from IFC4X3_ADD2, so these are the
only deprecated element classes left in the schema the page uses. The bSDD
Toolkit templates (147 classes, IFC4X3) list `IFCBUILTELEMENT` and 34 of its 35
subclasses, leaving out exactly `IFCWALLSTANDARDCASE`, and the flow classes
without `IFCELECTRICDISTRIBUTIONBOARD`; so they opened as 79 exact classes
(`eval/also-subclasses-2026-11-18.md`). Should the box skip deprecated
classes? It changes what a ticked box writes, so the answer had to come from
models people export, not from the schema.

**Models read** (fetched, not committed; `python3 -I eval/deprecated-in-models.py <folders>`):

- buildingSMART/IFC4.3.x-sample-models at `ef22440` (46 files, all IFC4X3_ADD2);
- buildingSMART/Sample-Test-Files at `5030f65` (35 files: IFC2X3, IFC4, IFC4X3);
- ThatOpen/engine_web-ifc `tests/ifcfiles/public` at `c051791c` (28 .ifc files:
  ARCHICAD, Revit, Tekla, BlenderBIM, usBIM and others).

| Schema | Files | IFCWALL | IFCWALLSTANDARDCASE | Files with one | IFCELECTRICDISTRIBUTIONBOARD |
| --- | ---: | ---: | ---: | ---: | ---: |
| IFC4X3_ADD2 | 57 | 25 | **0** | 0 | 0 |
| IFC4 | 22 | 421 | 151 | 4 (ARCHICAD 20 x3, IfcOpenShell 0.5) | 0 |
| IFC2X3 | 28 | 1,209 | 9,657 | 12 | n/a |

Writers of IFC4X3 walls here: SketchUp's IFC manager 5.6 (SketchUp 2026),
ACCA usBIM (Viadotto Acerno) and buildingSMART's hand-built samples. All
write `IFCWALL`. No file in any schema has an electric distribution board, so
that half rests on the standard's text alone. The IFC4X3 sample is small
(25 walls, three writers), so the page keeps a way back, below.

**What landed** (`editor.mjs`, `editor.html`):

- `DEPRECATED` lists the three IFC4X3_ADD2 classes; IFC4 and IFC2X3 list
  none, because IFC4 exports still write `IFCWALLSTANDARDCASE` (151 of 572
  walls above);
- `boxSubclasses(S, cls, spec)`: what a ticked box writes (`subs`) and the
  deprecated subclasses it leaves out (`left`). A specification whose own
  ifcVersion also names IFC4 or IFC2X3 (`deprecatedFor`) keeps them, since it
  checks older models too;
- `specClassNames` writes `subs`; `classListBases` ticks a box when the list
  names every class in `subs`. A deprecated class the list does name stays an
  exact class in "Also applies to", so writing back names the same set;
- the page names what a box leaves out: "(not IFCWALLSTANDARDCASE: deprecated
  in IFC4X3; add it to "Also applies to" if old exports still use it)". With a
  model open that does carry one, the existing warning ("The model also has
  N object(s) of IFCWALLSTANDARDCASE ... would not check them", with its Add
  button) still fires, so a deprecated class a real model uses is not missed
  silently.

**Measured** (`sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh`,
then `node eval/also-subclasses.mjs --list` and `node eval/editor-open.mjs`):

| | Before | After |
| --- | --- | --- |
| Names listed, 29 class-list specifications in 64 public IDS | 368 | **270** |
| bSDD-Toolkit templates (2 files, 147 classes) | 79 classes, 11 ticked | **30 classes**, `IFCBUILTELEMENT`, `IFCDISTRIBUTIONELEMENT` and `IFCFURNISHINGELEMENT` ticked |
| Public IDS writing back the same | 64 / 64 (507 specs) | 64 / 64 (507 specs) |
| IDS-Audit-tool ValidFiles / bSI pass cases writing back the same | 12 / 12, 187 / 187 | 12 / 12, 187 / 187 |

Audit errors after writing back are unchanged on every file, and editable
facets stay 1,871 of 2,012 (93.0%). The DfE COBie component specifications
open as before (`IFCFLOWCONTROLLER` ticked: they are IFC4).

**Checked in a browser** (Chromium via Playwright, page served locally):
IFC4X3, class `IFCFLOWCONTROLLER` shows "its 8 subclass(es) ... (not
IFCELECTRICDISTRIBUTIONBOARD: deprecated in IFC4X3 ...)"; adding
`IFCBUILTELEMENT` shows "its 34 subclass(es) ... (not IFCWALLSTANDARDCASE ...)";
switching to IFC4 lists `IFCELECTRICDISTRIBUTIONBOARD` among the 8 with no
note; no console errors.

**Tests:** `editor.test.mjs`, "in IFC4X3 a ticked subclass box leaves out the
classes IFC 4.3 deprecates, and names them" (box contents per schema, an
"IFC4 IFC4X3_ADD2" specification keeping them, three class lists round-tripping
through a file). Full suite 277 pass, 0 fail.

**Open.** A real IFC4X3 export from Revit or ARCHICAD (neither is in the
public sets above) would test the one assumption that matters: that current
writers have stopped writing `IfcWallStandardCase` in IFC4X3.
