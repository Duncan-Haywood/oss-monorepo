# The change report scored against stated edits through Archicad, and rooms compared, 2026-11-23

**Question.** `flagships.yaml` asked for the change report (`diff.mjs`) to be
run on a revision series from Archicad or Vectorworks after the Revit
(Aalseth, Kegonsa) and BlenderBIM (Tulpstraat) series. Commit messages were
the only answer key on those, and a commit message is a person's summary. Is
there a public Archicad series where each step comes with a list of exactly
what it changed, and what does the report get right and wrong on it?

## Data

**EngiWorld** (`github.com/Hongcheng-Gao/EngiWorld`, MIT licence, commit
`e10788b`, 2026-11-19): a benchmark of engineering tasks for software agents.
Its folder `task/single-software-execution/cli/archicad/` holds 20 tasks.
Each has `init_file/init.ifc`, `ground_truth/result.ifc` and `task-NN.json`.
The instruction in the JSON describes a brief ("two small bookable quiet pods
near the first-floor study rooms") and ends with a JSON list the task's own
checker (`eval.py`) holds the result to: the **products** to add (class,
name, storey, property tokens) and the **annotations** on rooms that already
exist (tokens their properties must carry). That list is the answer key here.

What the files are, read from them:

- `init.ifc` is written by IfcOpenShell 0.8.5 (its header says so): small
  made-up buildings (a site office, a library, a clinic, a hotel floor), 2 to
  117 elements and 1 to 20 rooms.
- `result.ifc` is written back through Archicad 27's IFC writer ("The EXPRESS
  Data Manager", which Archicad's exports name) after the edit, so every
  STEP id is renumbered (`#2` becomes `#12`, ...) and some new entities are
  written in mixed case (`#682=IfcSpace(...)`), which the reader takes.

So this is not an architect's project history: the buildings are synthetic
and the edits are small. What it has that no other public series has is a
written list of what each step had to change, on files that went through
Archicad's writer. Fetch it with

```
git clone --filter=blob:none --no-checkout https://github.com/Hongcheng-Gao/EngiWorld.git
cd EngiWorld && git sparse-checkout set --no-cone '/task/single-software-execution/cli/archicad/' && git checkout
node eval/engiworld-archicad-diff.mjs EngiWorld/task/single-software-execution/cli/archicad --json out.json
```

(2.3 MB, 40 files). Output: `engiworld-archicad-diff-2026-11-23.txt` and
`.json`. The models are MIT but are not committed; the script and the
fetch steps are enough to rerun it.

## Before: the report was blind to rooms

Run as it was (`eval/revision-diff.mjs init.ifc result.ifc` on each task):

- Elements: all 20 pairs matched 100% of their elements by GlobalId; the
  renumbered STEP ids made no difference. Every door, window and wall the
  lists name (43) was reported added, under its name and class, and nothing
  was reported changed, removed or added that the list does not name.
- Rooms: **none of the 44 rooms the lists add and none of the 42 room
  annotations appeared anywhere.** Task 04 ("add two quiet pods, note the
  gallery") came out as "5 elements -> 5, unchanged 5": no change at all. The
  report compared elements only, and IfcSpace is not an element; the room
  schedule (`rooms.mjs`) was read on each revision and never compared.

A brief changes rooms as often as walls, and an estimator prices finishes,
fit-out and cleaning by room, so this was a real gap: a change order built
from the report would have missed every room in these 20 edits.

## The rule

`takeoff` now keeps on each room its Description, its PredefinedType and its
single-value properties (`properties`, `{"Pset.Property": text}`; lists,
references and quantities left out). `diffRooms(roomsA, roomsB)` in `diff.mjs`
compares two room lists, and `diffTakeoffs(rowsA, rowsB, { rooms: [A, B] })`
returns it as `rooms` (and `summary.rooms`):

- **Matched** by GlobalId, then, for a room re-exported under a new GlobalId,
  by number, name and storey when that is unique on both sides.
- **Changed** when the number, name, description, storey or type differs; a
  property is added, removed or given another value; the floor area,
  perimeter, net wall area or volume (measured, else stored) moves past 0.5%;
  or the count of doors and windows in its walls changes.
- **Added / removed**: the rest.

The page lists room lines in the change list ("Room added", "Room changed:
BriefRole added: QUIET POD ...") with a card for rooms added / removed /
changed; the changes CSV has "room added", "room removed", "room changed"
and "same room, new GlobalId" rows, with the room's volume and floor area in
the volume and area columns; `cli.mjs --compare` prints the room counts.

## Result

| | Listed | Reported |
|---|---|---|
| Rooms added | 44 | 44 (0 before) |
| Doors, windows, walls added | 43 | 43 (43 before) |
| Room annotations (every token in the changed properties) | 42 | 42 (0 before) |
| Changes the list does not name | 0 | 14 |

The 14 extra changes are all one kind: an existing room whose net wall area
fell and whose door-and-window count rose, in a task that added a door or a
window (e.g. task 03: WAITING, 1 opening, -1.99 m2 wall). In every task the
rooms gaining openings are no more than the doors and windows added, and the
wall area only falls. They are the listed doors and windows as the rooms on
either side see them: a finishes estimate needs that, so they are reported
on purpose, not counted as errors.

Two things this run saw and did not change:

- **The new rooms carry 0 openings** even where the list adds a door named for
  them (SICK-BAY-DOOR): the added rooms are drawn as boxes inside existing
  rooms with no walls of their own, so no wall's opening reaches them. Three
  tasks (09, 10, 16) put the new door in a new screen wall that bounds no
  existing room, and no room gains it.
- **The task checkers' property sets** (`Pset_EngiWorld_Task_*`, with a
  TaskTag and a DeliveryNote on every touched room) are what made the
  annotations visible; a real model's room data sheet would change values
  in a set that already exists, which the rule treats the same way (a value
  "changed" instead of "added"). The unit test covers both.

## Left

- A real Archicad or Vectorworks project history (several issues of one
  building by an architect): none found on GitHub on 2026-11-23 (code search
  for `ARCHICAD extension:ifc` and `Vectorworks extension:ifc`; the hits are
  single exports, roundtrip tests and this benchmark). `lkraider/vwx-rosetta`
  has Vectorworks exports of one-feature files (a wall, a door, a slab), not
  revisions.
- EngiWorld's other Archicad folders have more files not read here:
  `single-software-execution/gui/archicad` (35 IFC files) and the
  cross-software tasks (`archicad--openstudio` 30, `revit--archicad--openstudio`
  40, `revit--archicad--abaqus` 74). The same script reads any folder laid out
  as `task-NN/{init_file,ground_truth}`.
- Rooms in the bill-of-quantities delta: the BoQ change lines still sum
  elements only; a "by room" grouping of the delta would put the 14 opening
  changes on their rooms' lines.
