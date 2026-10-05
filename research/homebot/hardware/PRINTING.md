# Printing the parts

> **Status: designed, not yet printed.** Every part is generated from `src/homebot/params.py`
> and checked in code (it fits a 220 x 220 x 250 mm bed, the servo pockets are cut from the
> measured STS3215 envelope, the gears mesh without interference in 2D), but none has been
> printed and assembled yet. Expect to adjust clearances after the first test prints; change
> `Print.clearance` or the part functions and rebuild.

STLs are in `stl/` (millimetres); STEP files for editing in other CAD tools are in `step.zip`.
Files ending in `_mirror` are the left-side copies. Rebuild everything with

```bash
pip install cadquery trimesh shapely rtree
PYTHONPATH=src python -m homebot.cad.build          # STL + STEP + mass_properties.json + bed check
```

## Settings

PLA, 0.4 mm nozzle, 0.2 mm layers, 3 perimeters, 4 top / 4 bottom layers, 25 % gyroid infill.
These are the settings the simulator's mass model assumes (`Print` in `params.py`); if you change
them, update `Print` and rebuild so the twin's masses follow.

Exceptions:

- Gears (`gear42`, `pinion`, `elbow_gear`, `elbow_pinion`, `grip_pinion`): 5 perimeters,
  50 % infill, print flat. Grease the teeth (PTFE or lithium grease). Their printed masses will be
  a few grams above the model.
- `jaw`: lay it on the rack's back face, with supports under the carriage and the finger; 5
  perimeters so the rack teeth are solid.
- `pad`: TPU 95A, face down, 100 % infill, slow (about 20 mm/s). The grooves face the object.
- `carriage` halves and `hub`: 4 perimeters (they carry the arms and the mast).

Use tree supports for the servo cradles (`shoulder_block`, `upper_arm_top`, the clevises,
`carriage`). Print the `hand` standing on its two rod end walls, with supports under the rails
and the servo cradle. Test-fit one STS3215 in a cradle before printing the full set: the pocket clearance
is 0.3 mm per side.

## Parts per build stage

See `BOM.md` for the full table with masses and print sizes. Stage C (the mobile robot) uses:

| Part | Count | Notes |
|---|---|---|
| `gear42` | 4 | J1/J2 output gears (42 T, module 2) |
| `pinion` | 4 | 14 T, bolted to a servo horn |
| `elbow_gear`, `elbow_pinion` | 2 each | 2:1 elbow stage (30 T / 15 T, module 1.5) |
| `shoulder_block`, `upper_arm_top`, `upper_arm`, `forearm_clevis`, `forearm`, `wrist_clevis` | 1 + 1 mirror each | one set per arm |
| `hand`, `grip_pinion` | 2 each | parallel gripper (the same on both arms) |
| `jaw`, `pad` | 4 each | two jaws per gripper; pads in TPU |
| `carriage` | 1 + 1 mirror | halves bolt together around the mast |
| `pulley` | 1 | GT2 36 T on the lift servo horn |
| `mast_cap`, `neck`, `head` | 1 each | pan/tilt head |
| `hub` | 1 | centre of the base frame |
| `wheel_mount` | 3 | wheel servo cradles on the spokes |
| `wheel_hub` | 3 | servo horn to AndyMark DuraOmni 4 in wheel |
| `deck` | 6 | 60-degree sectors, half-lap joints |

Stage A (one arm) needs one arm set (the plain, not mirrored, files), one `hand`,
`grip_pinion`, two `jaw`s and two `pad`s, both carriage halves and `post_foot`. Stage B adds the second arm (mirror files) and the head.

Total filament: about 1.1 kg (A), 1.7 kg (B), 2.5 kg (C) of PLA including 15 % for supports and failed
prints (`python -m homebot.analysis.bom`), plus about 4 g of TPU per arm for the pads.
