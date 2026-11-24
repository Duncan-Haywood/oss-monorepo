# Rooms renamed, split, merged and carved: EngiWorld's gui and cross-software Archicad folders, 2026-11-24

**Question.** The 2026-11-23 run
([engiworld-archicad-diff-2026-11-23.md](engiworld-archicad-diff-2026-11-23.md))
taught the change report to compare rooms, on EngiWorld's 20 Archicad CLI
tasks. Its "Left" list named the benchmark's other Archicad folders: the gui
tasks and the cross-software chains. What does the report say on those, and
where does it leave a room as "removed" or "added" when the brief says the
room was renamed or subdivided?

## Data

**EngiWorld** (`github.com/Hongcheng-Gao/EngiWorld`, MIT, commit `e10788b`).
Read from the files themselves (the FILE_NAME header names the writer):

| Set | Folder | Pairs | Writers |
|---|---|---|---|
| gui | `single-software-execution/gui/archicad` | 15 init -> result (5 more tasks start blank) | IfcOpenShell 0.8.5 on both sides: the ground truth was generated, not saved from Archicad |
| ac-os | `cross-software-coordination/cli/archicad--openstudio` | 10 init -> stage1 | Archicad 27 or IfcOpenShell -> Archicad's writer (EXPRESS Data Manager) |
| rv-ac | `cross-software-coordination/cli/revit--archicad--openstudio` | 10 init -> stage1, 10 stage1 -> stage2 | Revit 2025 (ODA SDAI) -> Revit; then Revit -> Archicad's writer |

The briefs: gui tasks say which rooms the result must hold ("split OPEN
STUDIO with a real internal wall into STUDIO and MEETING"); rv-ac stage 1
says which room Revit splits or renames ("split the east expansion bay ...
create QUIET-COUNSELLING"); rv-ac stage 2 is Archicad loading Revit's file
and saving it again, with no stated change at all.

Fetch and rerun:

```
git clone --filter=blob:none --no-checkout https://github.com/Hongcheng-Gao/EngiWorld.git
cd EngiWorld && git sparse-checkout set --no-cone '/task/single-software-execution/gui/archicad/' '/task/cross-software-coordination/cli/archicad--openstudio/' '/task/cross-software-coordination/cli/revit--archicad--openstudio/' && git checkout
node eval/engiworld-gui-cross.mjs EngiWorld/task --json out.json
```

Output: `engiworld-gui-cross-2026-11-24.txt` and `.json` (0.6 s for all 45
pairs). The models are MIT but not committed.

## Before: rooms that were renamed or split came out as removed and added

Rooms were matched by GlobalId, then by number, name and storey. That misses
two things every brief here does:

- **Renamed under a new GlobalId.** All 15 gui results regenerate every
  GlobalId (0 of 171 elements kept theirs). Task 06 ("rename the
  unclassified office zone") came out as "room added: OFFICE; room removed:
  UNCLASSIFIED", same box, same 25.31 m2.
- **Subdivided.** Task 08's OPEN STUDIO (29.06 m2) became STUDIO and MEETING
  (14.06 m2 each): one removed, two added. Revit's stage 1 did the same six
  times; and in three more tasks Revit kept the old room's GlobalId for the
  part that keeps a number (Ground Lab 66.64 -> 47.60 m2) and drew the rest
  as new rooms (L1-PREP, 19.04 m2), reported as plain additions.

Rooms reported only as removed or added, with nothing saying where their
floor came from: **29 in gui, 1 in ac-os, 33 in rv-ac stage 1.**

## The rules (diff.mjs, diffRooms)

After GlobalId and number+name, three more steps, each on the same storey:

1. **Geometry** (`how: "geometry"`): boxes overlapping by at least 90% of
   their union (`roomOverlap`), floor areas within 5%, one candidate both
   ways. Listed as changed, the name change first ("number: UNCLASSIFIED ->
   OFFICE").
2. **Split / merged** (`groups`): one room whose plan box holds the plan
   centres of two or more unpaired rooms on the other side, their floor
   areas summing to 85-102% of its own (the new partition takes floor).
3. **Carved** (`carved`): a matched room that lost floor, and added rooms
   whose plan centres lie in its earlier box and outside its later one,
   summing to 85-102% of what it lost. They stay "added" (they are new
   records); the line says what they were carved from.

`roomGroups: false` and `roomOverlap: 0` turn them off (the script runs
both ways to give the before numbers). The page lists "Room split" /
"Rooms merged" lines and "carved from ..." on added rooms; the changes CSV
has "room split (1 into N)" / "room merged (N into 1)" rows and the
carved-from note; `cli.mjs --compare` and `eval/revision-diff.mjs` print the
counts.

## Result

| Set, step | Rooms before | Renamed (new GlobalId) | Split | Merged | Carved rooms | Left removed/added: before -> after |
|---|---|---|---|---|---|---|
| gui init -> result | 35 | 7 | 2 | 0 | 2 | 29 -> 7 |
| ac-os init -> stage1 | 84 | 0 | 0 | 0 | 1 | 1 -> 0 |
| rv-ac init -> stage1 | 19 | 2 | 6 | 1 | 7 | 33 -> 0 |
| rv-ac stage1 -> stage2 | 32 | 0 | 0 | 0 | 0 | 0 -> 0 |

Each match read against its brief:

- **rv-ac stage 1, all 10 tasks:** every split, merge, rename and carve is
  the one the brief describes (task 01 Activity Room -> COMMUNITY-ACTIVITY +
  QUIET-COUNSELLING, 51.04 m2 both sides; task 05 Lobby + Multipurpose Room
  -> GROUND-PUBLIC and Upper Activity -> UPPER-ACTIVITY + UPPER-READING;
  task 06 Workshop -> three rooms; tasks 07 to 09 carved rooms whose areas
  equal the floor their parent lost to the hundredth).
- **gui:** renames in tasks 06, 09 (three zones), 17, 18 and 19; splits in
  08 and 20; carves in 16 (MEETING drawn in the half of the old WC that the
  WC lost, STORAGE in the half OPEN OFFICE lost: the result file redraws
  both rooms smaller, so the room names moved; that is what the file says).
- **rv-ac stage 2, the Archicad round trip:** 114 of 114 elements kept
  their GlobalId, 0 changed, 0 added, 0 removed; 32 of 32 rooms unchanged.
  Archicad 27's writer loading and saving a Revit 2025 file changes nothing
  the report measures.

The 7 left in gui, read by hand:

- Task 15 (dental clinic conversion): the result redraws the whole plan
  (RECEPTION, STAFF and WC each 5.5 m2 smaller and moved). EXAM's box holds
  the centre of STERILIZATION but not of CHAIR, so no split is claimed:
  EXAM removed, CHAIR and STERILIZATION added is the honest reading.
- Task 16: MEETING and STORAGE carved (above), so 0 there; tasks 17 and 19:
  KITCHEN and OFFICE added where no room lost floor (2).
- Task 20: the ground truth puts UPPER ROOM on the ground floor and STAIR on
  Level 2, against its own brief ("STAIR on the lower storey and UPPER ROOM
  on the upper storey"). Read as the file stands: LOWER split into LOBBY +
  UPPER ROOM on the ground floor, UPPER removed and STAIR added on Level 2.
  The report is right about the file; the file disagrees with its brief.

**No false matches** in the 45 pairs: no rename, split, merge or carve
contradicts its brief or the files. The 20 CLI pairs of 2026-11-23 give the
same score as before (87 of 87, 42 of 42, 14 extra).

## Seen and not changed

- **gui doors carry no box.** The ground-truth door body mixes metres in its
  profile with millimetre-sized extrusion depths (25, 1015), so the door's
  geometry is not read; its count and name still are. Generated data, not
  an exporter's habit: not chased.
- **Revit's room property sets** (Area, Perimeter, Volume, lighting loads)
  are dropped on the stage-1 rooms and the task's own set added: the report
  lists each removed property, which makes the room lines long. A grouping
  ("38 Revit properties removed") would read better; not done.

## Left

- A by-room grouping of the BoQ delta (still elements only).
- Carved and split rooms on a real project history (these are benchmark
  edits). Still none public from Archicad or Vectorworks.
- EngiWorld's `revit--archicad--abaqus` folder (structural; 74 IFC files)
  not read here.
