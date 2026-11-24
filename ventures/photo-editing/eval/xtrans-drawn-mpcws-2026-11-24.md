# The `mpcws` noise read on X-Trans raws with drawn noise (2026-11-24)

NEXT.md ("From the HDR+ joint checks") ends: "X-Trans has not been tested with either read." Since 2026-11-23
`mpcws` is the default frame noise read for Bayer raws with no NoiseProfile (eval/camera-drawn-mpcws-2026-11-23.md);
on X-Trans `shootflow develop` keeps the shipped read (Chen's eigenvalue read, `xtrans_demosaic.frame_noise`) and says
so in a note. This is the same drawn-noise check, on X-Trans files no noise read has been scored on.

## Pre-registered (written before the sweep ran)

Arms, per tile and per noise cell (SNR 200, 60, 25, 12; noise drawn `equal` or before white balance `wb`):

- `ship`: what ships on X-Trans (Chen's read, the X-Trans colour ramp, no near-detail lift: `NEAR_DETAIL[6]` is None);
- `xopt`: `mpcws` with J4's collapse fallback (under 0.6 x the shipped read's sigma at 18% grey it is exactly `ship`)
  and the X-Trans colour ramp: `frame_noise_read(c, pat, "mpcws", xtrans="own")`;
- `xoptr`: the same with Bayer's `MPCWS_COLOUR_RAMP` (0.3, 1.0), a reading that decides nothing;
- `true`: the oracle (the drawn noise's own model), `D`: directional.

The judged arm is `xopt` against `ship`, on clean-truth rows only (`clean_enough`, as since 2026-11-19), with the
four tests of eval/camera-drawn-mpcws-2026-11-23.md unchanged:

- h1: mean luma and colour gain at least -0.005 dB, no (SNR, scenario) cell under -0.02 dB;
- h2: no new row losing over 0.1 dB to `D`, and no more such rows;
- h3: mean luma gain at least +0.02 dB;
- h4o: no row more than 0.1 dB under `ship` where the oracle `true` is not also more than 0.1 dB under it.

**What a result does.** The set is small (two files), so a pass does not change the X-Trans default by itself: it
adds `xtrans="own"` as the candidate and names a second blind X-Trans set as the gate for a default. A fail on h1,
h2 or h4o closes `mpcws` on X-Trans (Chen's read stays, and NEXT.md says so); a fail only on h3 (no harm, no gain)
also leaves what ships, since there is nothing to buy.

## Data: 2 X-Trans raws no noise read has been scored on

From github.com/darktable-org/darktable-tests `images/` (sparse checkout; not committed here). Neither name occurs
anywhere in this venture before today; the 51 X-Trans bodies of the 2026-11-19 tune came from raw.pixls.us, and
the RAFs of github.com/drewnoakes/metadata-extractor-images are spent for noise-read selection (NEXT.md).
raw.pixls.us refused this session (403 from the proxy).

| file | content |
|---|---|
| mire1-xtrans.raf | darktable's test chart (X-Trans) |
| xtransIV.raf | an X-Trans IV frame |

## Result: `xopt` fails h2 and h4o, so `mpcws` with the X-Trans ramp is closed; X-Trans keeps Chen's read

48 rows (3 tiles of 480 on each binned frame, 8 cells each), about 4 minutes on 4 cores. Truth grain: the raw-grain
reading (`truth_noise_check.raw_grain`) is Bayer only, so every row is judged clean or not on `truth_sigma18`, which
reads texture as grain and drops more rows than needed (10 here, all at SNR 60 and 200). 38 rows judged. Output:
`xtrans-drawn-mpcws-2026-11-24.txt`; every row: `xtrans-drawn-mpcws-rows-2026-11-24.jsonl.gz`.

| test | `xopt` reading | bar | |
|---|---|---|---|
| h1 means and cells | luma **+0.415**, colour **+0.121**; worst cell -0.008 (SNR 60 equal colour) | means >= -0.005, cells >= -0.02 | pass |
| h2 losers to `D` | 1 -> 2, one new | none new, no more | **fail** |
| h3 mean luma | **+0.415** | >= +0.02 | pass |
| h4o under `ship` by 0.1 dB where the oracle is not | **3 of 38** (colour -0.10 to -0.15 on xtransIV's tiles) | none | **fail** |

The collapse fallback fired on no row. At SNR 25 and 12 `mpcws` reads 0.82 of the drawn noise's sigma at 18% grey
on average, Chen's read 0.67: the same under-read Chen's has on Bayer, and the luma gain follows from fixing it
(+0.91 to +1.16 dB in the `wb` cells). The losses are all colour.

## Readings after the verdict (they decide nothing)

- **`xoptr`, the same read with Bayer's colour ramp (0.3, 1.0)**, passes h1 (luma +0.415, colour **+0.286**, worst
  cell +0.007), h2 (losers to `D` 1 -> 0) and h3, and fails h4o on 2 rows: mire1-xtrans's chart, SNR 12 `equal`,
  colour -0.12 dB both, where `xoptr`'s read is within 4% of what ships and the oracle's is 1.4 to 1.7 times
  higher. So the X-Trans colour ramp, not the read, made `xopt`'s colour losses; and the two rows left are a ramp
  question on a chart at the lowest SNR, not an over-read.
- **All truths** (48 rows): `xopt` fails h1 at SNR 200 (luma -0.14 / colour -0.26 equal), from rows whose truth
  is grainier than the noise added; the oracle loses there too, the case the clean-truth rule exists for.
- **Small set.** Two files from one test folder, one of them a test chart. It is enough to close a candidate that
  fails, not to open a default.

## What changed

Nothing a user runs: `shootflow develop` on X-Trans is byte for byte what it was. The evaluation gained
`frame_noise_read(..., xtrans="own" | "ramp")` (develop never passes it), the sweep's `xopt` and `xoptr` arms on
X-Trans with `--option`, and `drawn --xtrans` / `--arm` to judge them with the committed tests. Tests:
`tests/test_demosaic_noise_aware.py::test_read_rules`, `tests/test_near_clean_gate_split.py` (`--xtrans`).

**Next (pre-register before any run):** `xoptr` with h4o as is, on a blind X-Trans set of at least 6 bodies that
are not charts (raw.pixls.us's Fujifilm folders when it answers). A pass there would make `mpcws` with
`MPCWS_COLOUR_RAMP` the X-Trans default too.

## Reproduce

```
# the 2 files: git clone --filter=blob:none --no-checkout https://github.com/darktable-org/darktable-tests, then
# git checkout HEAD -- images/mire1-xtrans.raf images/xtransIV.raf
PYTHONPATH=src python tools/near_clean_gate.py sweep --raf images/xtransIV.raf --ks 12 --option --cache /tmp/truths \
    images/mire1-xtrans.raf images/xtransIV.raf > rows.jsonl
python tools/near_clean_gate.py drawn --xtrans rows.jsonl              # the committed judgement
python tools/near_clean_gate.py drawn --xtrans --arm xoptr rows.jsonl  # the ramp reading
```
