# A standard property in the file's own dataType, and "Use the template's type" (2026-11-17)

**Question.** Public IDS files give some standard properties a dataType their
template does not (`Pset_ManufacturerOccurrence.SerialNumber` as IFCTEXT,
template IFCIDENTIFIER; Spain's `Qto_SpaceBaseQuantities.GrossFloorArea` as
IFCREAL, template IFCAREAMEASURE). A model that follows the standard can never
pass such a requirement; the audit says so (`pset-datatype`). Until now the
editor could not show those requirements as rows, because a row always wrote
the template's dataType: it held them as read-only XML. Can the editor open
them as rows that keep the file's type, and offer a one-click fix?

**Change** (`editor.mjs`). An opened standard-set property whose dataType is a
known type but not the one the page writes for it gets `fileType`
(`fileTypeOf`). The row offers that type's values (a range on IFCREAL, a
pattern on IFCTEXT) and writes that type back, so the file is unchanged until
the author acts. When the templates refuse the type (`fileTypeRefused`) the
row says so and offers **Use the template's type (X)** (`templateTypeRow`),
which moves the row to the template's first type and carries the value over
when it fits (a shared `carryValue`, also used by `typeRow`): a pattern or text
value when the enumeration allows it, numbers and range bounds onto a number
type, TRUE/FALSE onto a boolean; anything else becomes "any value" with a
warning. Changing the set, property or data type clears `fileType`;
"Accept any data type" (untypeRow) drops it.

**Measurements** (corpus: `sh eval/fetch-audit-corpus.sh`, 64 public IDS files
at each repository's HEAD on 2026-11-17, plus IDS-Audit-tool and the
buildingSMART test cases at 870f9c4).

| | before | after |
|---|---|---|
| public facets editable / held as written (`eval/editor-open.mjs`) | 1,787 / 198 (90.0%) | 1,803 / 182 (90.8%) |
| public files with every facet editable | 20 of 63 | 23 of 63 |
| public files writing back asking the same | 63 of 63 | 63 of 63 |
| audit errors changed by open + write back | 0 | 0 |
| IDS-Audit-tool valid files / pass-* test cases | 721/87, 320/54 | unchanged |

`eval/template-type.mjs` (output `eval/template-type.txt`): 16 rows in 7 files
open with a `fileType`, and the templates refuse all 16. "Use the template's
type" applied to each carries every value over (0 dropped: 6 patterns, 10
presence-only) and the 14 `pset-datatype` errors on those files go to 0.

In the page, driven in Chromium (`eval/template-type-page.mjs FILE.ids`, output
`eval/template-type-page.txt`): the 7 files show 16 buttons; the page's live
audit errors on those rows go from 14 to 0 after the clicks (the CLI counted
the same 14 before), no page errors, no horizontal scroll at 390 px. The two
RVB BIM Norm copies show one error for two buttons: those specifications name
IFC2X3 and IFC4, and IFC2X3's Pset_SpaceCommon has no IsExternal, so the CLI
reports that row as `pset-property` in IFC2X3 and the page counts the
IsExternal fix under that. After the clicks both copies audit with no error in
the CLI (`node cli.mjs --audit`), and all 7 written files validate against
ids.xsd in IfcTester (`eval/editor-xsd-check.py`), as their originals did.

The rows by file:

- DfE Information Model Assurance (4 of the Stage 4/5 object files):
  SerialNumber and BarCode as IFCTEXT with a pattern, template IFCIDENTIFIER;
  the pattern carries over.
- CHEK (GAIA, Ascoli Piceno): Pset_BuildingUse.MarketCategory and
  MarketSubCategory as IFCREAL or IFCLENGTHMEASURE, template IFCLABEL.
- RVB BIM Norm v1.1 (two copies): Pset_BuildingCommon.BuildingID as IFCLABEL
  (template IFCIDENTIFIER), Pset_SpaceCommon.IsExternal as IFCLABEL (IFCBOOLEAN).
- buildingSMART Spain MEI: Qto_SpaceBaseQuantities Height, GrossVolume and
  GrossFloorArea as IFCREAL (IFCLENGTHMEASURE, IFCVOLUMEMEASURE, IFCAREAMEASURE).

**What is still held as written.** The earlier tally's "about 30" counted the
other half of that line too: properties the template lacks (Portugal's
`Lenght`, `Pset_DoorCommon.Mark`) are a `pset-property` fault, not a type
one, and stay as XML. Every remaining kept property facet on a Pset_/Qto_ set
in the public files is one of: IDS 0.9 `<name>` (no baseName), a property the
template lacks, a non-standard Pset_ name, or one bim2sim facet with no
dataType on a set the page writes typed. None has a known non-template type.

**Limits.** The fix moves to the template's *first* type; a property whose
template allows several (rare in IFC4) gets that one. A value that fits the
file's type but not the template's (text on a measure) is dropped with a
warning rather than guessed. The page does not yet suggest the nearest
standard property name for a misspelling like `Lenght`.
