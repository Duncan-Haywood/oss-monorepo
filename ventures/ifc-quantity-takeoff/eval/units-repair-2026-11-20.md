# A Revit 'INCH' 144 times too long, and the change report on a second house, 2026-11-20

**Question.** The change report (`diff.mjs`) was checked on one house's
revisions (the Aalseth Residence, `revision-diff-2026-11-20.md`). Does it
hold on a second practice's series, and what breaks?

**Data.** OpeningDesign's **Lake Kegonsa Home**
(`github.com/OpeningDesign/Lake_Kegonsa_Home`; no licence file in the repo,
so the models are **not committed**): five Revit IFC2X3 exports of one
house renovation, fetched with `git show <commit>:<path>` from a blob-less
clone.

| # | Commit | Date | Path | Exporter |
|---|---|---|---|---|
| 1 | `6d82e39` | 2014-09-13 | `Model/Lake_Kegonsa_Home.ifc` | EDM 5.01 |
| 2 | `7e77485` | 2014-09-25 | same | EDM 5.01 |
| 3 | `86b76d3` | 2014-10-14 | same | EDM 5.01 |
| 4 | `dd375a5` | 2014-10-23 (committed 2015-01-06) | same | EDM 5.02 |
| 5 | `ea059de` | 2015-07-30 (committed 2017-05-31, "before Boat House") | `Model/Lake_Kegonsa.ifc` | EDM 5.02 |

`5ed083f` and `e3574ae` (`Model/Lake_Kegonsa.ifc`, 2015-01-06) are
byte-identical to #4 (same MD5) and were dropped.

## What broke: export 3 declares an inch of 3.6576 m

The first run reported **every** matched element of steps 2 -> 3 and 3 -> 4
as changed (420 of 420, 568 of 568), every volume by a factor near
2,985,984 = 144^3. Export 3's unit assignment reads

```
#44= IFCMEASUREWITHUNIT(IFCRATIOMEASURE(3.6576),#42);   -- #42 is METRE
#45= IFCCONVERSIONBASEDUNIT(#43,.LENGTHUNIT.,'INCH',#44);
```

3.6576 m is 144 inches (0.0254 x 144, or the foot factor 0.3048 x 12). The
coordinates are in real inches, and the file itself says so:

- the same window (GlobalId `0ikb9KYwTApf7Am_xqJAr6`, "33-5/8" x 48-7/8"")
  has OverallHeight 4.677 in export 2 (unit FOOT, 0.3048) and 56.125 in
  export 3: 12 times, an inch count of the same height;
- stair RiserHeight properties read 0.625 (ft) in export 2 and 7.5 in
  export 3: 7.5 inches;
- the area and volume units in the same file are declared correctly (square
  foot 0.09290304, cubic foot 0.028316846592).

Taken at its word, the factor makes every length 144 times too long and
every volume 2,985,984 times too big; a takeoff of export 3 gives a
2 x 6 joist as 0.07 m3 x 3 million.

**The repair (`qto.mjs`, `NAMED_UNITS`).** A conversion-based unit whose name
is one IFC uses (INCH, FOOT, YARD, MILE; SQUARE INCH/FOOT/YARD, ACRE, SQUARE
MILE; CUBIC INCH/FOOT/YARD, LITRE; POUND, OUNCE; DEGREE; any case) but whose
factor is more than 0.1% from that name's exact value is read at the exact
value, and the takeoff's `units.repairs` lists it. The page's status line and
the CLI (stderr) say so in one sentence: "'INCH' is declared as 3.6576 m (144
times the real inch); the exact 0.0254 m was used". Names that differ
between countries (gallon, ton) and names not in the table (US survey foot)
keep their declared factor. `--trust-declared-units` on the CLI, and
`trustDeclaredUnits` in `takeoff()`, keep the declared factors.

**Checks.**

| Pair (elements with the same GlobalId and a volume) | Declared factors | Repaired |
|---|---|---|
| export 2 -> 3: median volume ratio | 2,985,984 | 1.0000 |
| export 2 -> 3: volume within 0.5% | 0 of 402 | 254 of 402 |
| export 3 -> 4: median volume ratio | 0.0000 (1/144^3) | 1.0000 |
| export 3 -> 4: volume within 0.5% | 0 of 549 | 331 of 549 |

(`ratio` probe in this run's scratch, the same `takeoff` and `rowQuantities`
the page uses.) The remaining changes are real edits: the house was being
designed between these exports.

**False repairs.** Four other public files with conversion-based units were
read: `LTplus-AG/bxmid03-hs26` `Demo_Holzrahmen_korrigiert.ifc` and
`_fehlerhaft.ifc` (lower-case 'square inch' at a rounded 0.0006452, 0.006%
off, 'cubic inch', 'pound', 'degree'), `buildingSMART/ifc-gherkin-rules`
`pass-ifc106-pgsuper_materialproperties.ifc` ('inch' 0.0254, 'square foot',
'ksi') and `CyrilWaechter/IfcRelSpaceBoundary_TestFiles`
`ExternalEarth_R20_IFC2X3.ifc` ('DEGREE'): no repair in any. The venture's 88 tests,
which include the earlier SI and foot-unit fixtures, pass unchanged. The 12
public models of the area and volume checks were not re-run this session.

**Tests** (`engine.test.mjs`): the faulty INCH is read as 0.0254 and the
repair reported; `trustDeclared` keeps 3.6576; a factor 0.00004% off, an inch
built on a millimetre base (25.4 mm) and a US survey foot are left alone; a
10 x 4 x 100 inch column in a faulty-inch file measures 0.254 x 0.1016 x
2.54 m, and 144^3 times that with the declared factor. Widening the
tolerance so the repair never fires fails two of them.

## The change report on the series (repaired)

Output: `revision-diff-kegonsa-2026-11-20.txt` and `.json`
(`node eval/revision-diff.mjs <five files>`).

| Step | Elements | GlobalId-only: added / removed | This report: added / removed | Same element, new GlobalId | Parts/hosts | Unchanged / changed |
|---|---|---|---|---|---|---|
| 1 -> 2 (09-13 -> 09-25) | 402 -> 491 | 171 / 82 | 156 / 68 | 13 (Tag) | 1 wall split in 2 | 171 / 162 |
| 2 -> 3 (09-25 -> 10-14) | 491 -> 641 | 239 / 89 | 221 / 71 | 18 (Tag) | 0 | 205 / 215 (0 / 420 before the repair) |
| 3 -> 4 (10-14 -> 10-23) | 641 -> 714 | 165 / 92 | 144 / 71 | 21 (19 Tag, 2 geometry) | 0 | 123 / 447 (0 / 568 before) |
| 4 -> 5 (10-23 -> 2015-07-30) | 714 -> 920 | 479 / 273 | 469 / 252 | 8 (6 Tag, 2 geometry) | 13 parts merged into 2 walls | 30 / 419 |

Across the four steps a GlobalId-only comparison lists **138 element records
as added or removed that are the same building element**: 60 elements under a
new GlobalId (two records each) and 18 records that are a wall and its parts.
That is fewer than the Aalseth Residence's 190 because this practice
exported "with parts" only once.

What the rows show:

- **Windows and doors get new GlobalIds in every export,** as on the Aalseth
  house: 8 to 13 windows and 5 doors per step, matched by their Revit
  ElementId in the Tag. Same exporter family, five years earlier, same fault.
- **Step 3 -> 4 is mostly an export setting:** 301 elements changed
  classification and 227 changed storey (the EDM 5.02 exporter, a new storey
  set), alongside 181 resized and 49 moved; 11 moved 0.52 m together in -y.
- **Step 4 -> 5 spans nine months of design**: 249 beams and 47 windows
  added, 64 members and 43 windows removed, 41 elements raised 0.02 m.
  Two walls exported as parts in 4 come back whole in 5 (a fireplace trim
  wall from 11 parts, 0.311 -> 0.316 m3).

**What this does not show.** No estimator read these reports. The house has
no stored quantity sets, so the volumes are checked only against each other
across revisions, not against the authoring tool. The 0.1% tolerance for
named units was set to pass rounded factors seen in public files; a file with
a deliberately non-standard unit under a standard name would be "repaired"
wrongly, and the status line says so whenever it happens.
