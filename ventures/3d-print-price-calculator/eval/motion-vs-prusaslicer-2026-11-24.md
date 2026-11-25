# Print time from the moves vs PrusaSlicer's own estimate (2026-11-24)

What was checked: `gcode-motion.mjs`, which times a G-code file from its moves
(lookahead planner, trapezoid speed profiles, Marlin-style jerk cornering,
limits from the file's M201/M203/M204/M205), against the estimate and
filament length PrusaSlicer 2.7.2 writes into the same file.

## How to rerun

```
apt-get install prusa-slicer            # 2.7.2+dfsg-1build2 on Ubuntu 24.04 was used
bash eval/slice-corpus.sh /tmp/gc       # 21 files, about 2 minutes
node eval/motion-vs-prusaslicer.mjs /tmp/gc
```

Models: the shapes PrusaSlicer ships in `/usr/share/PrusaSlicer/shapes`
(3DBenchy, the Stanford bunny, torus, box, sphere, an M3 nut, a recycling
symbol) and one part from this repository
(`research/homebot/hardware/stl/upper_arm_top.stl`). Settings: PrusaSlicer's
built-in defaults (`_default`, RepRap flavour, no limits in the file); the
same with Marlin 2 flavour and the limits emitted as M201-M205
(`_marlin2`); and Benchy with fast limits (4,000 mm/s², jerk 8, 120-250 mm/s),
slow limits (500 mm/s², jerk 20), arc fitting (G2/G3), relative E, and a
spiral-vase bunny. Each file was read whole by the estimator, which ignores
comments, so the slicer's summary played no part in our figure.

## Result (run here, 2026-11-24)

| file | PrusaSlicer | ours | diff | filament PrusaSlicer mm | ours mm | ms |
|---|---|---|---|---|---|---|
| 3DBenchy_default.gcode | 1h 06m 03s | 1h 05m 54s | -0.2% | 4441.35 | 4439.35 | 160 |
| 3DBenchy_marlin2.gcode | 1h 05m 37s | 1h 05m 54s | +0.4% | 4441.35 | 4439.35 | 120 |
| M3_hex_nut_default.gcode | 0h 00m 35s | 0h 00m 35s | +0.6% | 25.94 | 23.94 | 1 |
| M3_hex_nut_marlin2.gcode | 0h 00m 35s | 0h 00m 35s | +0.6% | 25.94 | 23.94 | 1 |
| PLA_recycling_symbol_default.gcode | 0h 00m 22s | 0h 00m 22s | -0.8% | 34.16 | 32.16 | 1 |
| PLA_recycling_symbol_marlin2.gcode | 0h 00m 22s | 0h 00m 22s | -0.8% | 34.16 | 32.16 | 1 |
| benchy_arcs.gcode | 1h 05m 36s | 1h 05m 47s | +0.3% | 4441.08 | 4439.08 | 99 |
| benchy_fast.gcode | 0h 54m 22s | 0h 54m 33s | +0.3% | 4441.35 | 4439.35 | 111 |
| benchy_rel.gcode | 1h 05m 36s | 1h 05m 53s | +0.4% | 4441.35 | 4439.35 | 115 |
| benchy_slow.gcode | 1h 07m 35s | 1h 08m 44s | +1.7% | 4441.35 | 4439.35 | 91 |
| box.gcode | 0h 22m 36s | 0h 22m 34s | -0.2% | 2607.72 | 2605.72 | 7 |
| box_default.gcode | 0h 22m 36s | 0h 22m 34s | -0.2% | 2607.72 | 2605.72 | 7 |
| box_marlin2.gcode | 0h 22m 32s | 0h 22m 34s | +0.1% | 2607.72 | 2605.72 | 7 |
| bunny_default.gcode | 4h 19m 49s | 4h 19m 27s | -0.1% | 34399.36 | 34397.36 | 141 |
| bunny_marlin2.gcode | 4h 18m 59s | 4h 19m 27s | +0.2% | 34399.36 | 34397.36 | 187 |
| bunny_vase.gcode | 0h 58m 17s | 0h 58m 16s | -0.0% | 4336.06 | 4334.06 | 18 |
| homebot_upper.gcode | 2h 22m 19s | 2h 22m 26s | +0.1% | 12148.73 | 12146.73 | 70 |
| sphere_default.gcode | 0h 22m 23s | 0h 22m 20s | -0.2% | 2487.43 | 2485.43 | 36 |
| sphere_marlin2.gcode | 0h 22m 17s | 0h 22m 20s | +0.2% | 2487.43 | 2485.43 | 36 |
| torus_default.gcode | 0h 06m 10s | 0h 06m 10s | -0.1% | 582.95 | 580.95 | 10 |
| torus_marlin2.gcode | 0h 06m 08s | 0h 06m 10s | +0.4% | 582.95 | 580.95 | 11 |

21 files; median |diff| 0.2%, worst 1.7%

Filament: ours is 2.00 mm below PrusaSlicer's on every file. Each file ends
on a 2 mm retraction with no re-prime; PrusaSlicer's total keeps that 2 mm, the
net sum of the E moves (ours) does not. At 1.75 mm that is 0.006 g.

Two corrections were made while running this, both measured on the same set:

| change | median abs. diff | worst |
|---|---|---|
| first version: jerk read as the plain change in each axis's speed | 0.7% | 11.7% (a 22 s print) |
| jerk on a reversal held to the larger side, as Marlin's classic planner reads it | 0.3% | 11.7% |
| G28 timed as a move back to 0 (PrusaSlicer does the same; the tiny prints end with `G28 X0`) | 0.2% | 1.7% |

The largest remaining gap is Benchy with slow limits (+1.7%: 500 mm/s²,
jerk 20). Not modelled, and possibly the cause: PrusaSlicer's own planner
details beyond the classic jerk rule. Its source was not read or copied; the
model here is written from the published behaviour of Marlin's planner.

## A file without its printer's limits

Most files carry no M201-M205 (Cura and PrusaSlicer's default flavour do not
emit them). The estimator then uses PrusaSlicer's built-in defaults (1,500
mm/s² printing and travel, jerk 10 mm/s on X and Y). How much that costs, with
the two Benchy files read with `ignoreFileLimits: true`:

| file | PrusaSlicer | ours, file limits | ours, defaults |
|---|---|---|---|
| benchy_fast (4,000 mm/s², jerk 8) | 3,262 s | +0.3% | +9.2% |
| benchy_slow (500 mm/s², jerk 20) | 4,055 s | +1.7% | -2.5% |

So for a file that does not state its limits, read the figure as within about
10% for a printer tuned well away from the defaults.

## Cura files from public GitHub repositories

`node eval/motion-vs-cura.mjs DIR` on 15 Cura files people committed to public
repositories (found with GitHub code search for `;TIME:` and
`Generated with Cura_SteamEngine`; read here, not committed; listed by
repository and path in the first column). Cura's own estimate uses the machine
settings in the user's Cura profile, which the file usually does not carry,
so the time column shows how far two printer-blind estimates land from each
other, not the error of either.

| file | flavor | M201-M205 lines | Cura time | ours | diff | Cura filament mm | ours mm |
|---|---|---|---|---|---|---|---|
| Meebleeps_MeeBleeps-Freaq-FM-Synth-enclosure_LED_Matrix_Lid. | Marlin | 0 | 2052 s | 1895 s | -7.6% | 1366.0 | 1385.5 |
| Snipercaine_home_assistant_config-octoprint_uploads_433Shade | Marlin | 1 | 342 s | 325 s | -5.1% | 909.4 | 900.4 |
| Snipercaine_home_assistant_config-octoprint_uploads_LTAZ5M_p | Marlin | 1 | 322 s | 318 s | -1.4% | 711.1 | 702.1 |
| YouMakeTech_klipper-ender3-demo_xyzCalibration_cube.gcode | Marlin | 0 | 870 s | 536 s | -38.3% | 1082.1 | 1107.1 |
| denisarissa_hexapod-model_gcode_M_kyds.gcode | RepRap | 0 | n/a s | 18 s | n/a | n/a | 9.0 |
| femtoduino_femto-beacon-Cura_Files_MSMV_femtoBeacon_r2.0.3_L | Marlin | 0 | 528 s | 603 s | 14.1% | 406.0 | 411.0 |
| femtoduino_femu-hardware-3d-models_femu-stencil-jig.gcode | Marlin | 0 | 260 s | 542 s | 108.6% | 108.2 | 117.7 |
| foehnsturm_Mark2-calibration_xy_calibration.V03.gcode | UltiGCode | 34 | 355 s | 342 s | -3.7% | n/a | 557.9 |
| gentlegiantJGC_GCode-Sequencer-gcode_cube.gcode | Marlin | 3072 | 615 s | 592 s | -3.7% | 380.1 | 375.1 |
| heyvye_DXU-Calibration_XY_calibration.gcode | UltiGCode | 0 | 355 s | 316 s | -11.0% | n/a | 557.9 |
| svenpetersen1965_C64-WiFi-Modem-User-Port-Case_for_PCB_Rev._ | Marlin | 661 | 350 s | 496 s | 41.7% | 111.9 | 116.7 |
| tuorum_Toybox-3D-Printer-Info-tb2.gcode | Marlin | 0 | 6666 s | 943 s | -85.8% | 0.0 | 986.6 |
| verlab_hero_common-hero_resources_3d_printer_AA8_cover_usb.g | Marlin | 2 | 168 s | 200 s | 19.2% | 83.8 | 81.3 |
| verlab_hero_common-hero_resources_3d_printer_AA8_motor_gear. | Marlin | 2 | 271 s | 298 s | 10.0% | 75.0 | 72.5 |
| xreef_MKS_WIFI_upgrade_with_BeePrint_web_interface-testSTL_F | Marlin | 606 | 235 s | 250 s | 6.2% | 54.2 | 63.6 |

What the outliers are:

- `femu-stencil-jig` (+108.6%): its end G-code waits five minutes (`G4 S300`).
  We count the dwell; Cura leaves start and end G-code out of `;TIME:`.
  Without it ours is 242 s against Cura's 260 s.
- `tb2` (-85.8%): its header is Cura's unfilled template (`;TIME:6666`,
  `;Filament used: 0m`, bounds of 2.14748e+06), not figures. Before this change
  the calculator read it as a 1.85 h print with no filament; it now sets the
  template aside and times the moves (0.26 h, 2.94 g).
- `xyzCalibration_cube` (-38.3%) and `plunger_7mm` (+41.7%): printer-blind
  defaults on both sides; the cube's Ender 3 profile in Cura is slower than
  1,500 mm/s².
- UltiGCode files: E is in cubic millimetres (volumetric), so Cura writes no
  length; ours is read as mm³.
- Filament (where Cura gives one): ours runs from 3.3% below Cura's to 17%
  above it. The files above it prime the nozzle in their start G-code (the
  5 mm cube draws 20 mm of prime lines, the stencil jig 15 mm), which Cura
  does not count. The ones a few mm below begin or end on a retraction that
  is never re-primed (`G1 F1500 E-6.5`); that cause was read off the files, not
  measured on a printer. Either way ours is what the file pushes through the
  nozzle.
