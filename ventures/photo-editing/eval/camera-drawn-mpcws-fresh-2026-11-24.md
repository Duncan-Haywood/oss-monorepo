# The Bayer `mpcws` default, re-checked on 9 camera raws from a fresh source (2026-11-24)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next read it against --noise-read ship on new
camera files"; the last reading of `eval/camera-drawn-mpcws-2026-11-23.md`: "the next camera files ... should be
read with the new default against `--noise-read ship`"). Since 2026-11-23 `shootflow develop` reads frame noise with
`mpcws` on Bayer raws that carry no NoiseProfile. That default passed four tests on 111 HDR+ bursts (one phone) and
on 11 camera raws (76 judged rows). This is the same check on camera files none of those sets, nor any ramp fit,
noise-read selection or tune, has used.

## Pre-registered (committed before any file was scored)

**Arms, tests and rows are those of eval/camera-drawn-mpcws-2026-11-23.md, unchanged:** `opt` (what now ships,
`frame_noise_read(c, pat, "mpcws")` with J4's collapse fallback) against `ship+12` (what `--noise-read ship` gives),
the oracle `true+12` and directional `D`, from `tools/near_clean_gate.py sweep --bayer --ks 12 --option`, judged on
clean truths by `near_clean_gate.py drawn`:

- h1: mean luma and colour gain at least -0.005 dB, every (SNR, scenario) cell at least -0.02 dB;
- h2: no new row losing over 0.1 dB to `D`, and no more such rows;
- h3: mean luma gain at least +0.02 dB;
- h4o: no row more than 0.1 dB under `ship+12` where the oracle is not also more than 0.1 dB under it.

**What a result does.** A pass on all four keeps the default, now on three independent sets. A fail on h1, h2 or
h4o is harm on unseen files under the same bars that made `mpcws` the default, so the default goes back to `ship`
(`--noise-read mpcws` stays as an opt-in) and the failing rows name what to look at. A fail on h3 alone (no harm,
no gain) keeps the default and is reported.

## Data: 9 Bayer raws from github.com/immich-app/test-assets

immich's `formats/raw/` test folder (sparse checkout, `git clone --filter=blob:none --no-checkout`, then
`git checkout HEAD -- formats/raw`; the files are not committed here). No file name in it occurs anywhere in this
venture before today. Four bodies (70D, GH4, A6300, A7 II) also have different files, with different names, in the
2026-11-18 card-floor set (eval/noise-card-floor-files-2026-11-18.json), which fits no noise read; the bodies are
not new, the frames are. raw.pixls.us did not answer this session (connection refused), so the files cannot be
hashed against its archive; if immich took any of them from there under another name, that file may have been in
an earlier sweep. That is the caveat this set carries.

| file | body |
|---|---|
| Canon/EOS_30D.CR2 | Canon EOS 30D |
| Canon/EOS_70D.CR2 | Canon EOS 70D |
| Canon/PowerShot_G12.CR2 | Canon PowerShot G12 |
| Nikon/D700/philadelphia.nef | Nikon D700 |
| Nikon/D80/glarus.nef | Nikon D80 |
| Panasonic/DMC-GH4/4_3.rw2 | Panasonic DMC-GH4 |
| Ricoh/GR3/Ricoh_GR3-450.DNG | Ricoh GR III (the sweep scores the LibRaw truth with drawn noise; the DNG's own NoiseProfile is not used) |
| Sony/ILCE-6300/12bit-compressed-(3_2).arw | Sony A6300 |
| Sony/ILCE-7M2/14bit-uncompressed-(3_2).arw | Sony A7 II |

Left out before scoring: `Fujifilm/X100V_compressed.RAF`, the folder's only X-Trans file. It is one body; the X-Trans
gate in NEXT.md needs six, so it is kept for that set and not read here.

## Result: `opt` passes h1-h3 and fails h4o on one row, so the default goes back to `ship`

120 rows (one 480 tile on six files, three on the GR III, A6300 and A7 II), about 6 minutes on 4 cores; no file was
skipped. 102 have clean truths and are judged. Output: `camera-drawn-mpcws-fresh-2026-11-24.txt`; every row:
`camera-drawn-mpcws-fresh-rows-2026-11-24.jsonl.gz` (`near_clean_gate.py drawn` reads it as is).

| test | reading | bar | |
|---|---|---|---|
| h1 means and cells | luma **+0.199**, colour **+0.124**; worst cell -0.001 (SNR 60 equal luma) | means >= -0.005, cells >= -0.02 | pass |
| h2 losers to `D` | 0, none new (what ships: 0) | no new, no more | pass |
| h3 mean luma | **+0.199** | >= +0.02 | pass |
| h4o over 0.1 dB under `ship+12` where the oracle is not | **1 of 102** | none | **fail** |

The failing row: `4_3.rw2` (Panasonic GH4), tile [192, 336], SNR 60 `equal`: luma **-0.130**, colour -0.060.
There `mpcws` reads sigma 0.0024 at 18% grey, the drawn noise is 0.0030 and the shipped read 0.0034; the oracle is
0.01 dB under `ship+12`. One more row is 0.10 dB under (A7 II [0, 1026], SNR 60 `wb`), but the oracle is too, so
the test does not count it. By the rule committed above, a fail on h4o sends the default back to `ship`.

Gains over D, mean of 102 rows: `ship+12` +0.87 luma / +0.55 colour, `opt` +1.07 / +0.68, the oracle +1.13 / +0.47.
By cell, `opt` minus `ship+12` (luma / colour): SNR 12 wb +0.78 / +0.48, SNR 25 wb +0.33 / +0.15, SNR 60 wb
+0.21 / +0.07, the `equal` cells and SNR 200 -0.001 to +0.07. The collapse fallback fired on 2 judged rows.

## Readings after the verdict (they decide nothing)

- **The size of the gain held.** +0.20 luma / +0.12 colour here against +0.22 / +0.12 on the 11 files of
  2026-11-23: the set replicates the gain and finds one loss the first set did not. Eight of nine files gain on
  average (GH4 +0.44 luma over its six judged rows, the 70D +0.38, the GR III +0.31); the D700 is flat (-0.001).
- **Where the loss is.** It is an under-read on a tile whose truth is near the clean line: the GH4 tile's own grain
  (`truth_sigma18` 0.0028, `truth_grain18` 0.0019) is 0.6 to 0.9 of the 0.0030 drawn at SNR 60, so it is judged clean
  but only just. On the same tile at SNR 200, both reads lose 0.08 dB, and so does the oracle; at SNR 25 and 12 `mpcws`
  gains +0.05 to +1.88. Its read on that tile is 0.0024 at SNR 200 and at SNR 60: it is reading the scene's grain
  floor, not the drawn noise, at the level where the two meet. At SNR 25 and 12 the option reads 0.74 of the drawn
  sigma on average (0.46 to 1.00), what ships 0.65 (0.30 to 1.00).
- **All truths** (`drawn --all-truths`, 120 rows): h1-h3 pass, h4o fails on the same row.
- **Caveat on the data**, as above: the files are new by name, but raw.pixls.us could not be checked for copies.

## What changed

`DevelopSettings.noise_read` and `shootflow develop --noise-read` default to `ship` again: the output before
2026-11-23 for Bayer raws with no NoiseProfile, byte for byte. `--noise-read mpcws` still gives the read that was the
default yesterday. X-Trans and files with a NoiseProfile are unchanged. Tests: `tests/test_demosaic_noise_aware.py`
(`test_flag_and_setting_default_ship`, and the develop test's default bytes now equal `--noise-read ship`).

**Next (pre-register before any run):** the failing row says to look at reads near a tile's own grain floor. A
candidate must say how it treats a read that falls below the shipped one at SNR 60 where the truth's grain is within
the noise added (for example, never read under the shipped read's level unless the frame's texture test says so),
and it must pass the same four tests on the 2026-11-23 rows, these rows, and a third camera set it has never seen.

## Reproduce

```
# the 9 files: git clone --filter=blob:none --no-checkout https://github.com/immich-app/test-assets, then
# git checkout HEAD -- formats/raw (and leave out Fujifilm/X100V_compressed.RAF)
PYTHONPATH=src python tools/near_clean_gate.py sweep --bayer --ks 12 --option --cache /tmp/truths FILES... > rows.jsonl
python tools/near_clean_gate.py drawn rows.jsonl                # the committed judgement (clean truths)
python tools/near_clean_gate.py drawn --all-truths rows.jsonl   # the reading
```
