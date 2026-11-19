# bSDD links in public IDS files, checked against bSDD (2026-11-19)

What was measured: whether the `uri` on an IDS property, classification or
material facet agrees with the buildingSMART Data Dictionary (bSDD) entry it
links, using the new `bsdd.mjs` (`node cli.mjs --audit SPEC.ids --bsdd`).

IDS 1.0 lets a facet carry `uri`, meant to be the bSDD identifier of what the
facet asks for. Nothing in `ids.xsd` ties that link to the rest of the facet,
and until this change neither this checker nor its audit read it at all. An
IDS can therefore name one property and link another, or ask for an
`IFCLABEL` where the dictionary says Boolean. A model authored from the
dictionary then fails the IDS for the IDS author's slip, and the IDS author
gets no warning.

## Corpus

`eval/bsdd-ids-files.txt`: every `.ids` file GitHub code search returned for
`identifier.buildingsmart.org extension:ids` on 2026-11-19, 88 files in 26
repositories (buildingSMART's own IDS documentation examples, the Dutch VNG
Omgevingswet requirement sets, xBIM's and ifc-lite's test files, the
bSDD-to-IDS converter's example, product passport and LCA prototypes).
`sh eval/fetch-bsdd-ids.sh` fetches them (not committed; each under its own
repository's licence). 30 are byte-identical copies, leaving 58 distinct
files, 53 with a facet `uri`: 344 `uri` attributes, 211 distinct links, 197 of
them on the bSDD host, 126 in the IFC 4.3 dictionary.

`node eval/bsdd-corpus.mjs` runs the check over them; its full output is
`eval/bsdd-corpus.txt` (207 distinct bSDD requests).

## What the check does

For each facet `uri` (bsdd.mjs, header comment, has the full list):

| level | code | when |
| --- | --- | --- |
| error | bsdd-not-found | bSDD has no entry at the link (for an IFC link it also tries the IFC 4.3 form and names it) |
| error | bsdd-shape / bsdd-kind | the link ends in neither `/prop/<code>` nor `/class/<code>`, or a property facet links a class (or the reverse) |
| error | bsdd-datatype | the facet's dataType cannot hold the dictionary's data type (Boolean in an IfcLabel, String in a length) |
| warning | bsdd-datatype | the IFC dictionary names another IFC type ("takes 'IfcAreaMeasure' as value") |
| warning | bsdd-name | baseName is not the linked property's code or name; if baseName is itself in the same dictionary, its link is named |
| warning | bsdd-value / bsdd-system / bsdd-entity | values outside the property's allowed values; a classification value or system other than the class's code or dictionary; requirement classes the bSDD class is not related to |
| warning | bsdd-status | the entry is Inactive |
| note | bsdd-form / bsdd-old-version / bsdd-not-bsdd | resolves but bSDD writes it another way (http, `ifc-4.3`, lower case); not the dictionary's latest version; not a bSDD link |

The bSDD findings never change the audit's VALID/INVALID verdict (the IDS is a
valid IDS that disagrees with what it cites). With `--bsdd` the CLI's exit
code is 1 also when a bSDD error is found.

## Results

7 of 53 files with links have a bSDD error and 15 a warning. After dropping
copies, every distinct finding was read by hand against the IDS text and the
bSDD answer; none was a checker fault once the two fixes below were in.

| finding | where (first distinct file) | what it is |
| --- | --- | --- |
| baseName `Width`, dataType `IFCLENGTHMEASURE`, linked to IFC `prop/Name` (String) | 255ribeiro/intro_ifc `IDS_TEMPLATE.ids` | the link was pasted from another row; the check names `prop/Width` |
| baseName `AreaPerOccupant` linked to `prop/OccupancyNumberPeak` | buildingSMART-Japan/bSI_IDS_ja `IDS_random_example.ids` (the translation) | same slip; the check names `prop/AreaPerOccupant` |
| `ifc-2x3/prop/acousticrating`: not in bSDD | buildingSMART's `IDS_wooden-windows.ids` and 4 copies | the file's own comment says "uri not live yet"; the IFC 4.3 dictionary has `prop/AcousticRating`, which the check names |
| `uri/dummy-example/FireRating`: no `/prop/` | buildingSMART's `IDS_oma_input.ids`, xBIM's `Example.ids` | a placeholder in an example |
| `outside diameter_general` linked to IFC `OutsideDiameter`; `IFCLENGTHMEASURE` where IFC gives `IFCPOSITIVELENGTHMEASURE` | buildingSMART's `IDS_ucms_prefab_pipes_IFC4.3.ids` | the property name and the link disagree |
| `medium`, `component designation`, `material` vs bSDD `Medium`, `Component designation`, `Material` | same file (UCM-CH demo, ETIM 8.0 links) | case only; IDS names are case-sensitive |
| `DENSITY` vs ETIM `Density`; `EPD_GWP_TOTAL_A1A3` vs LCA `GWP_total`; three `demo2025/thermal-insulation-products` links not found | louistrue/lignum-dpp-bsdd `POC.ids` | a prototype linking dictionaries it does not follow, and one that is not (or no longer) in bSDD |
| `IFCREAL` where IFC gives `IFCTHERMALTRANSMITTANCEMEASURE`, `IFCAREAMEASURE`, `IFCPOSITIVERATIOMEASURE`; `Thermal Transmittance [ThermalTransmittance]` as a baseName | peterrdf/VNG (Omgevingswet sets) | an IfcReal property passes `IFCREAL`, but a model following IFC writes the measure type and fails it |
| `Bouwlaaginhoud` required on IfcSpatialZone/IfcSpace/IfcZone, bSDD relates it to IfcBuildingStorey; three more classes required on IfcZone, which bSDD does not list | peterrdf/VNG | the IDS and the Omgevingswet-Ruimten 0.2.0 dictionary disagree (and 0.2.0 is not the dictionary's latest version, a note on 30 links) |
| `example/nosuch/1.0/...` not found | marwiss/Dataregium `tests/fixtures/bsdd.ids` | a deliberate broken link in a test fixture: the check finds it |

## Two faults found and fixed while measuring

1. **Rate limit.** The first run sent 6 requests at a time; bSDD answered 429
   to 68 of 205. `getJson` now retries a 429 or 503 after its Retry-After or
   a doubling wait (0.5 s, 1 s, ...), five times, and sends 4 at a time; the
   rerun had 0 unanswered (215 requests sent for 207 links, 8 retries).
2. **Two false errors, fixed.** `IFCCOUNTMEASURE` was reported unable to hold
   bSDD's Integer on IFC4 files: IFC4's `IfcCountMeasure` is a NUMBER, which
   the schema reads as a double. Integer now accepts integer or real IFC
   types, and a facet whose dataType is exactly the IFC dictionary's type is
   never flagged. bs-agri `fruitvegs` 1.6 answers `"status": "3"`, which the
   API documents no meaning for; only `Inactive` is now reported.

## Limits

- **CLI only.** bSDD's API sends no `Access-Control-Allow-Origin` header
  (checked with an `Origin` request and a preflight, 2026-11-19), so the page
  cannot ask it from a browser; the page stays offline as before.
- The property set is not compared: bSDD gives a property's set only on a
  class's property list, and the IDS facet links the property alone.
- A non-IFC dictionary's property code or its name is accepted as the
  baseName. Dictionaries differ on which one a model should carry (ETIM codes
  like `EF002169` are not what authors type); a stricter rule would need a
  dictionary owner's word.
- Searched on GitHub only, default branches only, on one day; private
  requirement sets, where most real IDS live, are not in it.
