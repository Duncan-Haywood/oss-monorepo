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

## Result

(filled in after the run)
