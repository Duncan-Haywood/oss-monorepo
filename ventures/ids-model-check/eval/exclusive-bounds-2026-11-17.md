# IDS editor: exclusive bounds (2026-11-17)

**Question.** A range row in the editor wrote only `xs:minInclusive` and
`xs:maxInclusive`, so an opened IDS with `xs:minExclusive` or `xs:maxExclusive`
("U-value more than 0.5", "block height more than 0") was held as read-only
XML. Can a range row say "more than" / "less than", write it as IDS's own
restriction test cases do (`restriction/pass-a_bound_can_be_exclusive_*`),
and do this checker and IfcOpenShell's IfcTester agree on it?

**What landed:**

- `editor.mjs`: a range row has `minEx` and `maxEx`. `valueXml` writes
  `xs:minExclusive` / `xs:maxExclusive` when they are set; `appMatchCount`
  counts a condition's model matches with strict comparisons on those sides.
- An opened range opens as a row when each side has at most one bound
  (inclusive or exclusive) and nothing else (no length, pattern or
  enumeration). Two lower bounds on one side (`minInclusive` and
  `minExclusive`) have no single control and are still kept as written.
- Restrictions kept as written now write their bounds lower-then-upper
  (`minInclusive, minExclusive, maxInclusive, maxExclusive`), so a row and the
  facet it came from compare equal whatever mix of bounds the file had.
  The order of facets inside `xs:restriction` carries no meaning.
- `editor.html`: each bound has a select, "at least" / "more than" and
  "at most" / "less than". **Use the model's range** resets both to
  inclusive (the model's range is a closed one, rounded outward).

## Measured: opened files

`sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh && node eval/editor-open.mjs`,
on main's editor and on this one:

| Corpus | Facets editable before | After | Write back asking the same | Audit errors changed |
| --- | ---: | ---: | --- | --- |
| 64 public IDS files (`eval/real-ids-files.txt`) | 1,709 of 2,012 (84.9%) | 1,714 (85.2%) | 507 of 507 specifications | 0 files |
| 12 IDS-Audit-tool valid files | 174 of 808 (21.5%) | 202 (25.0%) | 288 of 288 | 0 |
| 187 buildingSMART pass cases | 316 of 374 (84.5%) | 319 (85.3%) | 187 of 187 | 0 |

Every new row is a facet with an exclusive bound. The public files hold 6
such facets in 6 files; 5 now open as rows:

- `Pset_PlateCommon.ThermalTransmittance` more than 0.5 and less than 2.1, in
  buildingSMART's wooden-windows sample (two copies: xBIM's Xids tests and
  d4su-server);
- `Additional_Pset_BuildingCommon.MaximumBlockHeight` more than 0, in the
  UK Department for Education's stage 3 and stage 4 building checks;
- `Pset_SolidStratumCapacity.FrictionAngle` at least 0.48028 and less than
  0.610866 (radians), in a geotechnical demonstration IDS.

The sixth (`CohesionBehaviour` less than 1000, the same geotechnical set's
other file) stays kept: its specification has no class facet, only a
property, so the page has no class to hang a row on. In the IDS-Audit-tool
valid files 28 exclusive facets open and 82 stay kept (duration, time and
date bases, and attributes outside the page's attribute list).

## The same ranges in IfcTester

`node eval/exclusive-bounds.mjs OUT.ids` writes, through the editor, eight
ranges on the sample house's door (OverallHeight 2100, millimetres) and
checks them here; `python3 eval/crosscheck_ifctester.py OUT.ids
samples/tiny-house.ifc` with ifcopenshell 0.9.0.post1 and ifctester 0.9.0
from PyPI:

| Range | This checker | IfcTester |
| --- | --- | --- |
| >= 2000 and <= 2100 | pass | pass |
| > 2000 and <= 2100 | pass | pass |
| >= 2000 and < 2100 | fail | fail |
| > 2000 and < 2100 | fail | fail |
| >= 2100 | pass | pass |
| > 2100 | fail | fail |
| < 2100 | fail | fail |
| < 2100.5 | pass | pass |

8 of 8 the same verdict and the same failing element. (ifctester 0.8.0 with
ifcopenshell 0.9.0.post1, the pair pip first chose, crashes on attribute
facets; 0.9.0 is the matching release.)

## Checked in the page

Chromium (Playwright), the eight-range file opened with **Open an IDS
file**: 16 bound selects showing what each range was written with; switching
"less than" to "at most" on the third rewrote its `xs:maxExclusive` to
`xs:maxInclusive` in the XML panel; no page errors.

## Not done

- A tolerance note on exclusive bounds: IDS ranges take no tolerance
  (`tolerance/*_exclusive` test cases), so "less than 2100" fails a door
  written 2099.9999999. The row's hint does not say so yet.
- Ranges on duration, date and time bases (the IDS-Audit-tool's kept facets).
