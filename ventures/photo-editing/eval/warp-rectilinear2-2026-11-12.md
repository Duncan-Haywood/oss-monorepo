# WarpRectilinear2 (DNG opcode 14), and what its odd terms buy on 5,440 real lens profiles (2026-11-12)

## What landed

`shootflow.dng_opcodes` now parses and runs `WarpRectilinear2` in `OpcodeList3`, after demosaic and
in list order with the other stage-3 opcodes, in both engines (same bytes). The layout and formula
were read from the DNG specification 1.7.1.0 (September 2023), chapter 7, pages 120-122, fetched
from Adobe's help site, not taken from memory:

| Field | Type | Meaning |
|---|---|---|
| N | LONG | coefficient sets: 1, or one per plane |
| per set: kr0..kr14 | 15 DOUBLE | radial terms on r^0..r^14, odd and even |
| per set: kt0, kt1 | 2 DOUBLE | tangential terms, as WarpRectilinear |
| per set: min_valid_radius, max_valid_radius | 2 DOUBLE | r is clamped to this range before the polynomial |
| cx, cy | 2 DOUBLE | optical centre, as WarpRectilinear |
| reciprocalRadial | LONG | non-zero: divide by f instead of multiplying |

So `4 + 152 N + 20` bytes. With `f(r) = sum kr_p rc^p` and `rc = clamp(r, min, max)`, the
radial source offset is `f * (dx, dy)`, or `(dx, dy) / f` when reciprocal; the tangential part and
everything else (centre, `r = 1` at the farthest corner, the resampling) are WarpRectilinear's.

**The skip rule** (spec p. 105 and 121): a reader that applies a WarpRectilinear2 marked optional
skips the opcode right after it if that is a WarpRectilinear or WarpFisheye, the fallback a writer
leaves for pre-1.6 readers. `plan()` does this and says so in the notes. Two choices the text leaves
open, made here: a WarpRectilinear2 that fails to parse does not trigger the rule (the fallback
then runs, better than no correction), and neither does one this module skips for its
preview-quality flag (see below).

**Checks the parser enforces**: `0 <= min_valid_radius < max_valid_radius <= 1` (the spec's
inequality), finite terms, the centre inside the frame, and for the reciprocal form an `f` that
keeps one sign over the valid range (sampled at 1,025 points), so the division never meets zero.
A file failing these is named in the notes and skipped.

## Tests (`tests/test_dng_warp2.py`, 21)

- The source point equals the specification's formula written out independently in the test
  (plain powers, not Horner) for six cases: identity, odd terms, a clamped barrel off-centre, an
  r^14 term, the division form with tangential terms, and both ends clamped.
- A WarpRectilinear2 with only even terms (kr0, kr2, kr4, kr6) gives WarpRectilinear's source
  points to 1e-10 on 20 random lenses, and develops to within one 8-bit step of the same file
  carrying WarpRectilinear.
- Reciprocal with f = 2 is bit-identical to WarpRectilinear with kr0 = 0.5. Past max_valid_radius
  the factor is f(max) exactly.
- Bilinear sampling of a ramp gives the ramp at the formula's source point (exact).
- The skip rule on the specification's three worked examples, plus: required WarpRectilinear2 does
  not skip; an unreadable or preview-only one keeps the fallback.
- numpy and pure Python give the same bytes, full and half size, both radial forms.

`test_dng_opcodes.py` used WarpRectilinear2 as its example of an opcode that is named and not run;
it now uses FixBadPixelsConstant in OpcodeList3 instead, and checks that a too-short
WarpRectilinear2 is named as unreadable.

## What the odd terms buy: lensfun's profiles (`tools/lensfun_warp_fit.py`)

No camera- or converter-written DNG carrying WarpRectilinear2 has been found, so the formula has
not been checked against Adobe's output. What can be measured is whether the new opcode matters.
Lensfun's database (52 files of `data/db/*.xml`, fetched from raw.githubusercontent.com at run
time; CC BY-SA 3.0, only numbers read, nothing vendored) holds 5,440 distortion calibrations in
Hugin's ptlens model over 1,079 lenses:

    r_d = r_u (a r_u^3 + b r_u^2 + c r_u + 1 - a - b - c),  r = 1 at half the image height

(lensfun `libs/lensfun/modifier.cpp`, "About coordinate systems"). Like a DNG warp it maps a
corrected point to the distorted point it reads from. With `s` the corner distance over half the
height (1.80 on 3:2), it is a WarpRectilinear2 exactly: `kr0 = 1 - a - b - c, kr1 = c s,
kr2 = b s^2, kr3 = a s^3`. The script checks that `warp_source` with those terms lands where
lensfun's formula, written in lensfun's own units, says: the largest gap over 200 entries at six
points each is **1.8e-12 px**.

4,741 of the 5,440 have an odd term (`a` or `c` not zero), which WarpRectilinear (`kr0 + kr1 r^2 +
kr2 r^4 + kr3 r^6`) cannot hold. For each entry the script fits those four even terms to the
displacement over every 40th pixel centre of a frame 6,000 px wide at the lens's calibration aspect
ratio (centre in the middle), and reports the largest displacement left:

| Largest displacement left, 6000 px frame | Least-squares fit | Best minimax fit found (Lawson, 60 rounds) |
|---|---|---|
| median | 1.06 px | 0.30 px |
| 90th percentile | 4.76 px | 1.45 px |
| 99th percentile | 13.2 px | 3.95 px |
| largest | 51.0 px | 14.4 px |
| share over 0.5 px | 66.7% | 37.9% |
| share over 1 px | 51.8% | 17.2% |
| share over 2 px | 32.7% | 5.5% |
| share over 5 px | 9.0% | 0.5% |

Rectilinear lenses only (5,411; lensfun marks 29 ptlens entries as fisheye, which barely moves any
row). The least-squares fit is what a converter fitting coefficients the obvious way would write;
the minimax column is the best fit Lawson's reweighting found for the largest displacement, so the
true best WarpRectilinear is no worse than it. Read the minimax column as the floor: **even
choosing its four terms as well as possible, WarpRectilinear leaves more than a pixel at 24 MP on
about one real lens profile in six, and more than half a pixel on more than a third.**

Largest left (least squares), rectilinear: GoPro Hero3+ at 15 mm 51 px, HD Pentax DA* 16-50mm
at 28 mm 47 px, 1 Nikkor VR 10-30mm at 23.6 mm 32 px, HERO10 Black 30 px, Canon EF 28-80mm at
80 mm 24 px.

What this says: a converter writing a lensfun-grade correction into a DNG for pre-1.6 readers has
to approximate; for about one profile in six even the best approximation leaves more than a pixel
at 24 MP (half of them, fitted by plain least squares), while WarpRectilinear2 carries them
exactly. It also says why the specification's fallback pattern (an optional WarpRectilinear2, then
a WarpRectilinear) exists. What it does not say: whether those
profiles are themselves right to a pixel (lensfun's calibrations are fitted, and the corners of a
3:2 frame are where they are least constrained), nor how Adobe's own lens profiles, which are not
public, compare.

Run it: fetch the XML files into a folder, then
`python3 tools/lensfun_warp_fit.py FOLDER [--minimax] [--json out.json]` (numpy; 5 s, about 3 min
with `--minimax`).

## Not checked

- No real DNG carrying WarpRectilinear2; the formula is checked against the specification's text
  only. A camera or converter file (Adobe's DNG Converter writes warp opcodes from its lens
  profiles) would settle the reading, as the Leica T did for WarpRectilinear.
- The preview-quality flag: `plan()` skips any opcode with flag bit 1 in every develop, but the
  1.7.1 text (p. 105) says such an opcode "can be skipped when doing preview quality processing,
  and only needs to be applied when doing full quality processing", so a full develop should run
  it. Left as it was here, as its own change, since it touches every opcode.
