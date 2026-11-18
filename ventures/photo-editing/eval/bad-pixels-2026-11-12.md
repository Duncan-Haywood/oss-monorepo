# FixBadPixelsConstant and FixBadPixelsList (2026-11-12)

What landed: `OpcodeList1` runs the two bad-sensel opcodes (`shootflow.dng_opcodes`,
`parse_bad_pixels_*`, `repair_bad_pixels`, `run_stage1`); `raw_develop.develop` runs them on a
copy of the stored CFA values before either engine reads them. The algorithm and the choices
the specification leaves open are in the module docstring.

## Checks

`tests/test_dng_bad_pixels.py`, 15 tests, all closed form or brute force written in the test:

| check | result |
| --- | --- |
| isolated points on a plane `500 + 3 row + 5 col`, all four Bayer phases | exact |
| a dead column, a dead row (one-wide rectangles), all phases | exact away from the frame edge |
| corners, touching points, 3x4 and 4x1 blocks, random image | equal to the brute-force nearest-ring mean |
| a 20x20 hole (wider than the 8-ring search) | centre left as is, reported |
| constant over 1% of the frame | not run, reported |
| develop with zeroed sensels + either opcode vs the clean file | same bytes |
| numpy vs pure Python develop | same bytes |

The rings were first tested with a dead column and a dead row in the same image; where the
two cross, a red or blue sensel two rows from the dead row loses half its ring and is no longer
exact on a plane. That is the algorithm working as written (the reference agrees), so the test
now checks each line on its own and leaves crossings to the brute-force test.

## Speed

4032 x 3024 frame, 2,000 marked sensels: FixBadPixelsConstant 0.15 s with numpy for the scan,
0.34 s without; FixBadPixelsList (2,000 points and a full-height column) 0.03 s.

## Real files

None yet. The two camera DNGs this venture reads from public test sets carry no `OpcodeList1`
(LG Nexus 5X: four GainMap in `OpcodeList2`; Leica T: one WarpRectilinear in `OpcodeList3`).
Next: a DNG whose writer marks defects (Adobe DNG Converter output from a body with mapped
pixels, or a phone that writes its hot-pixel map) to compare the repair against that writer's
own rendering.
