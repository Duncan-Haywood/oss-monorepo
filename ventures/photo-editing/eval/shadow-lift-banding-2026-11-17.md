# A 3-stop shadow lift on a 16-bit master: the old encode lost up to 39 of 256 screen codes, the new one none (2026-11-17)

Item from the flagship's `buildable:` (left open by eval/srgb-table-interp-2026-11-17.md, "What it does not
settle"): "a real 3-stop shadow lift on a 16-bit master, old vs new, for banding."

**Verdict: the old encode (4,096 entries, nearest) banded visibly under a hard edit; the interpolated one
(16,384 entries, shipped earlier today) does not. Pushed +3 stops, the old masters' unclipped pixels never
reach 1-39 of the 8-bit codes the near-exact reference reaches per channel; the new masters miss none, on all
five public camera DNGs. At +5 stops the old ones lose up to 129 of 256. On a noise-free shadow ramp the old
encode, lifted 3 stops, jumps 2-7 codes at a time below code 70 (21 band edges); the new one steps one code at a
time. Most of the combing that remains in the new masters' histograms is the sensor's own: the reference
shows the same gaps.** No code in the develop changes in this PR; it adds the check, its test and the numbers.

## Method

`tools/shadow_lift_check.py --old <src before #17079> --stops 3|5 FILE ...`, full size, numpy engine. Each
file is developed three times: main before PR #17079 (old: 4,096-entry table, nearest entry), main now
(new: 16,384 entries, interpolated) and main now with a 1,048,576-entry table (reference, within 0.0002 codes
of the exact curve). Each 16-bit master then gets what an editor's exposure slider does in linear light:
decode sRGB, multiply by 2^stops, encode with the exact curve, round to 8 bits for the screen or a JPEG.
Only pixels with every channel still below 1.0 after the lift are scored (`scored`: 14-56% of each frame at
+3, the shadows and lower mid-tones).

- **lost**: 8-bit codes the reference's lifted pixels reach that this master's never do, per channel (R/G/B).
  These are teeth the table adds to the histogram, apart from the sensor's own.
- **gaps**: all empty codes between the darkest and brightest scored code (table plus sensor).
- **off1 / max**: share of scored values 1+ codes from the reference after the lift, and the largest gap.

Files: the camera DNGs of drewnoakes/metadata-extractor-images (free to use, per its README), downloaded
at check time, not committed. Rows: `shadow-lift-banding-2026-11-17.jsonl`.

## +3 stops

| file | scored | lost R/G/B: old | new | gaps R/G/B: old | new = reference | off1: old | new | max: old | new |
|---|---|---|---|---|---|---|---|---|---|
| LG Nexus 5X | 16.7% | **39 / 39 / 39** | 0 / 0 / 0 | 39 / 39 / 39 | 0 / 0 / 0 | 13.0% | 0.002% | 4 | 1 |
| Leica T (Typ 701) | 56.4% | 6 / 1 / **39** | 0 / 0 / 0 | 17 / 1 / 39 | 13 / 0 / 0 | 10.2% | 0.001% | 3 | 1 |
| DJI Phantom 4 | 14.1% | 1 / 0 / 1 | 0 / 0 / 0 | 3 / 33 / 20 | 3 / 34 / 20 | 7.5% | 0.0003% | 1 | 1 |
| Leica X VARIO (Typ 107) | 14.4% | 32 / 11 / 16 | 0 / 0 / 0 | 39 / 47 / 41 | 11 / 39 / 29 | 9.5% | 0.001% | 3 | 1 |
| Pentax Q-S1 | 52.1% | 15 / 19 / 9 | 0 / 0 / 0 | 15 / 42 / 9 | 0 / 26 / 0 | 13.6% | 0.003% | 2 | 1 |

## +5 stops

| file | scored | lost R/G/B: old | new | off1: old | new | max: old | new |
|---|---|---|---|---|---|---|---|
| LG Nexus 5X | 4.8% | **129 / 129 / 129** | 0 / 0 / 0 | 40.9% | 0.01% | 13 | 1 |
| Leica T (Typ 701) | 0.5% | 40 / 4 / 80 | 0 / 0 / 0 | 32.3% | 0.004% | 6 | 1 |
| DJI Phantom 4 | 0.05% | 9 / 11 / 12 | 0 / 0 / 0 | 29.3% | 0 | 1 | 0 |
| Leica X VARIO (Typ 107) | 0.7% | 88 / 55 / 55 | 0 / 0 / 0 | 30.6% | 0.004% | 12 | 1 |
| Pentax Q-S1 | 27.0% | 66 / 71 / 56 | 0 / 0 / 0 | 34.8% | 0.008% | 2 | 1 |

## A noise-free ramp

`tests/test_shadow_lift.py`: linear 0 to 1/8 in 200,001 steps, encoded by the shipped numpy `_encode` and by
the old table, then lifted 3 stops. The exact result uses all 256 codes.

| encode | +3 stops: codes reached | lost | largest error | +5 stops (ramp 0-1/32 unclipped): reached | lost | largest error |
|---|---|---|---|---|---|---|
| old (4,096 nearest) | 217 | 39 (1-5, 7-12, 14-17, ... 59, 63, 69) | 4 | 127 | 129 | 13 |
| new (16,384 interpolated) | 256 | 0 | 1 | 256 | 0 | 1 |

The old ramp jumps by 2 to 7 codes at 21 places below code 70 after the lift: on a smooth gradient (a dusk
sky, a studio backdrop falling into shadow) those are bands a few codes tall, the kind the eye picks up in
dark tones. The Nexus 5X loses exactly the ramp's 39 codes because its master spans the whole shadow range
with sensor levels finer than the old table.

## What it does not settle

- **Seen, not counted.** Real frames carry sensor noise, which dithers bands into grain; whether the old
  masters' lost codes showed as bands on these five frames, rather than as a toothed histogram, needs a
  person looking or a smooth region picked by hand. The noise-free ramp is the upper bound: a denoised or
  heavily smoothed master is where it would have shown.
- **Editors' own curves.** The lift here is a linear-light exposure multiply. Lightroom, darktable and
  Capture One shadow sliders apply their own tone curves; the effect on lost codes should be similar in kind
  (any push spreads the master's shadow steps), not measured.
- **Sensor gaps.** The new masters' remaining gaps (e.g. Leica X VARIO 11/39/29 at +3) match the reference
  code for code: they are the raw file's own levels near black (a 12-bit sensor has few counts there), which
  no encode can add back.
