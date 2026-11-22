# Two more Lake Kegonsa exports, and elements replaced in place, 2026-11-22

**Question.** The change report was run on two practices' Revit series on
2026-11-20 (`revision-diff-2026-11-20.md`, `units-repair-2026-11-20.md`).
`flagships.yaml` listed two more series to run: OpeningDesign's Lake Mills
Residence Expansion, and a "Lake_Kegonsa_Home_2015.ifc pair" in the Kegonsa
repository. What do they add, and what does the report get wrong on them?

## Data

- **Lake Mills Residence Expansion** (`github.com/OpeningDesign/Lake_Mills_Residence_Expansion`):
  `lake_mills_residence_expansion.ifc` is added once (`4010e39`, 2017-11-15)
  and deleted in the next commit (`ec9ed5d`). The other IFC files in the repo
  are a 133-line test wall, a 183-line test window and a "broken model".
  **There is no revision series here**; take it off the list.
- **Lake Kegonsa Home** (`github.com/OpeningDesign/Lake_Kegonsa_Home`, no
  licence file, so the models are **not committed**). Listing every commit
  that touches an `.ifc` turns up three exports the 2026-11-20 run did not use:

  | Export | Commit | Date | Path | Exporter |
  |---|---|---|---|---|
  | 0 | `34fb457` | 2014-07-21 | `Model/Project1.ifc` | EDM 5.01, Exporter 2013 |
  | 3b | `7a3fc98` | 2014-10-21 ("structural collaboration") | `Model/Lake_Kegonsa_Home_2015.ifc` | EDM 5.02, Exporter 15.2 |
  | 4 | `935511d` | 2014-10-23 ("snapshot") | same | EDM 5.02, Exporter 15.2 |

  `935511d`'s file is byte-identical to `dd375a5`'s (the commit that renamed
  it back; MD5 `ac4c0468...`), so the old run's export 4 was in fact the
  10-23 one. The new exports are 0 (July, the earliest model: 129 elements)
  and 3b, which falls between export 3 (10-14, the faulty 'INCH') and 4.

Rerun: `git show <commit>:<path>` from a blob-less clone, then
`node eval/revision-diff.mjs 0.ifc 1.ifc 2.ifc 3.ifc 3b.ifc 4.ifc 5.ifc`
(output in `revision-diff-kegonsa-2026-11-22.txt` and `.json`).

## What export 3b shows: the exporter switch and the design step separate

On 2026-11-20 step 3 -> 4 was read as "mostly an export setting": 301
elements changed classification and 227 storey alongside the real edits.
With 3b in between, the two come apart:

| Step | Exporter | Unchanged / changed | Classification changed | Storey changed |
|---|---|---|---|---|
| 3 -> 3b (10-14 -> 10-21) | 3.2 -> 15.2 | 71 / 521 | 306 | 196 |
| 3b -> 4 (10-21 -> 10-23) | 15.2 -> 15.2 | 551 / 141 | 0 | 0 |

The two-day step with one exporter is the cleanest design step in the
series: four in five matched elements unchanged, nothing reclassified. That
made the next fault easy to see.

## What it got wrong: windows deleted and placed again

In step 3b -> 4 the report (before this change) listed **12 windows removed
and 13 added**. Every one had a new GlobalId *and* a new Tag (Revit
ElementId), so neither the GlobalId nor the Tag step could pair them, and
their boxes moved or changed size by more than the geometry step's 10 mm.
Drawn side by side (`box`, `vol` from the takeoff):

- five 31-1/2" x 59-7/8" casements on the 3rd floor: same type and volume,
  each 22 mm lower and 13 to 54 mm along the wall;
- two awnings and two tall casements on the 1st floor: same types, each 64 mm
  further out with a deeper frame (0.0397 -> 0.0414 m3, 0.0842 -> 0.0878 m3);
- two 33-5/8" x 48-7/8" double-hungs replaced, in the same openings, by
  31-1/2" x 48" casements;
- one double-hung whose replacement stands a metre along the wall, and one
  new 31-1/2" x 71-7/8" casement elsewhere.

So 11 of the 13 "added" windows stand where a "removed" one stood. An
estimator reading 12 removed and 13 added would price 13 new windows; the
change is two swapped for another size and nine re-placed.

## The rule: "replaced in place"

`diffTakeoffs` (`diff.mjs`) gets a fifth pairing, after GlobalId, Tag,
geometry and the parts/host groups, on what is still unpaired:

- same class and same storey;
- world boxes overlapping by at least half their union (intersection volume
  over union volume, `placeOverlap`, default 0.5; 0 turns it off);
- volumes within 25% (a swapped window differs by a few percent; a host and
  its thickest layer by a third or more);
- exactly one candidate each way;
- no other unpaired element of the class centred inside either box (the mark
  of a host and its parts, which the group step handles when the volumes sum).

A pair is reported as **replaced in place** (`how: "place"`), always under
"changed" even when nothing measurable differs, because it *is* a new
element; its type change, move and resize are listed as for any change. The
summary carries `replacedInPlace`; `matched` and `byGlobalId` no longer
count these. The page shows a "Replaced in place" card and row label, the
changes CSV labels the row "replaced in place" with "new element in the same
place (box overlap)" under "Matched by", and the CLI's `--compare` line
counts them.

## Result

| Step | Added / removed before | After | Replaced in place |
|---|---|---|---|
| 0 -> 1 (07-21 -> 09-13) | 373 / 100 | 372 / 99 | 1 |
| 1 -> 2 (09-13 -> 09-25) | 156 / 68 | 150 / 62 | 6 |
| 2 -> 3 (09-25 -> 10-14) | 221 / 71 | 195 / 45 | 26 |
| 3 -> 3b (10-14 -> 10-21) | 109 / 53 | 105 / 49 | 4 |
| 3b -> 4 (10-21 -> 10-23) | 33 / 19 | 18 / 4 | 15 |
| 4 -> 5 (10-23 -> 2015-07-30) | 469 / 252 | 429 / 212 | 40 |
| **Kegonsa, all steps** | | | **92 (184 records)** |
| Aalseth, 4 steps | 242 / 579 | 241 / 578 | 1 (a spiral duct, 4 -> 5) |
| HHS Office, 3 control pairs | 0 / 0 | 0 / 0 | 0 |

What the 92 are, read one by one in the `.txt`:

- **Windows and a door re-placed** (40: 39 windows, 1 door): same type, moved 19 to 163 mm, or
  re-hosted in a thicker wall (box and volume a few percent larger); and
  type swaps (33-5/8" x 48-7/8" -> 31-1/2" x 48"; 29-5/8" -> 25-5/8" x
  88-7/8").
- **Walls redrawn** (26): "Foundation - 14" Concrete" -> "Foundation - 12"",
  "Foundation - 8" with rigid" -> "10" with rigid", "Exterior Wall-New" ->
  "Exterior Wall-2x6", and walls of one type redrawn a little longer or
  shorter. The type swaps are what a change order prices.
- **Curtain-wall mullions regenerated** (18, step 2 -> 3): "Screenwall"
  members re-created at the same places with 0.0043 -> 0.0044 m3.
- **Footings, a glulam beam, proxies** (8: 3 footings, 1 beam, 4 proxies including a fireplace face): re-created at the
  same place, footings resized with their walls.

The controls hold: the HHS pairs, whose one edit each is known, get no new
pair; on Aalseth the parts and hosts are paired exactly as before (the group
step runs first) and one duct is the only addition.

**Seeded faults.** Removing the storey test, the volume band, or the
crowding test each fails a test in `diff.test.mjs` (the window case built
from these Kegonsa boxes, and a wall host with a core layer filling two
thirds of its box). The one-candidate count on the near side is covered by
the crowding test (two boxes each overlapping a third by half put a centre
inside it), so removing it alone fails nothing.

## What this does not show

The 50% overlap, 25% volume band and crowding rule were set on this house
and checked on two others; nobody who prices change orders has said whether
"replaced in place" is the line they want (it still needs a person). A
window moved a metre is still removed and added, by design: whether that is
"the same window moved" is a judgement the box cannot make. The 0 -> 1 step
pairs one foundation wall whose volume grew 22%, near the band's edge. These
are one practice's files from 2014; other authoring tools re-create
elements in other ways.
