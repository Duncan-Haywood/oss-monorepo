# liblensfun 0.3.4's SSE, 16-bit and SSE2 devignetting paths (2026-11-14)

Follow-up to `eval/lensfun-vignetting-released-2026-11-13.md`, whose next items were "the SSE path
(four-component float32 images through lensfunpy, if it allows them) and a 16-bit fixed-point output check".

## Why it matters to ShootFlow

ShootFlow corrects vignetting in float64 (`lens_profiles.build_vignette` writes a FixVignetteRadial that the
develop applies to float planes), then rounds to 16 bits once when it writes the master. The released check
showed that our gains match lensfun's plain float32 loop. But a photographer comparing our corners with
another program's isn't comparing with that loop. Lensfun picks its devignetting routine (the plain loop, SSE or SSE2) from the
pixel format, the number of components and the buffer's alignment. darktable hands it four-component float
rows, so it uses the SSE routine. A 16-bit RGBA caller gets the SSE2 one. Before we could say "our corners
match lensfun", we had to know which lensfun.

## How

lensfunpy's `apply_color_modification` only accepts 3-channel images, so it can't reach the four-component
routines. `tools/lensfun_vignetting_paths_check.py` instead loads the liblensfun 0.3.4 that lensfunpy 1.18.0
bundles (`lensfunpy.libs/liblensfun-*.so.0.3.4`, built with SSE and SSE2; `nm -D` lists
`ModifyColor_DeVignetting_PA_SSE` and `_SSE2`) and drives its C API through `ctypes`: `lf_db_load_file` on
the same XML files, `lf_modifier_new`, `lf_modifier_initialize` and `lf_modifier_apply_color_modification`
with `LF_CR_4(RED, GREEN, BLUE, UNKNOWN)`. Each row is placed on a 16-byte boundary, which selects the SIMD
routine. A control copy starts one sample past the boundary, so the same four-component pixels go through
the plain loop.

The cases are every calibration point of the 474 lenses that the released check matches one to one, on a
3:2 frame at the calibration's crop and a 4:3 frame at 1.5 times it. That is 40,730 cases; 168 are skipped
because some pixel's gain is over 31x (the 16-bit cap), the gain times 8,192 clips, or `c` is near zero.
Each case devignettes 5 rows of a flat image: 1.0 in float32, 8,192 in uint16, so gains up to 8x stay
unclipped. Two widths: 1,202 px (4 x 300 + 2, so the SSE2 tail is two pixels) and 6,002 px (3 rows,
4 x 1500 + 2). Runtimes: 43 s and 27 s on 4 CPUs. Raw output: `eval/lensfun-vignetting-paths-1202.out.txt`
and `eval/lensfun-vignetting-paths-6002.out.txt`.

## Source read (tag v0.3.4, fetched 2026-11-14)

- `mod-color.cpp`, `AddColorCallbackVignetting`: `lf_u8` and `lf_u32` get the plain template, `lf_u16` the
  SSE2 routine when the CPU has SSE2, `lf_f32` the SSE routine when it has SSE, and `lf_f64` the plain one.
  Each SIMD routine falls back to the plain loop unless it has exactly four components, each with a role
  above `LF_CR_NEXT`, and a 16-byte aligned buffer.
- `apply_multiplier<lf_u16>`: `c10 = int(g * 1024)`, which truncates, capped at `31 << 10`, then
  `(v * c10 + 512) >> 10`. Plain `apply_multiplier<T>` skips `LF_CR_UNKNOWN`.
- `mod-color-sse.cpp`: one pixel per loop. It multiplies all four lanes by `1 / c`, including the one marked
  `UNKNOWN`.
- `mod-color-sse2.cpp`: four pixels per loop. It computes `_mm_rcp_ps(c) * 1024`, truncates to 5.10 fixed
  point and saturates to signed 16 bits. Two faults:
  - **Lane drift.** The four lanes' `r2` are stepped by `add_four + r2 + d1_4 * x2`, with `x2` the first
    lane's `x` broadcast to all four. Lane `j` needs an extra `8 j p3^2` per loop that it never gets, so its
    radius falls behind linearly along the row.
  - **Tail.** The `count % 4` pixels left over go to the plain loop as `(_x + loop_count, _y + loop_count)`.
    `_x` and `_y` are already in normalised units (`ApplyColorModification` passes
    `x * NormScale - CenterX`), and `y` shouldn't move at all. So those pixels are devignetted as if they
    were hundreds of radii outside the frame.
  - Lensfun's master branch (fetched 2026-11-14) has the same loop body: `x2` is still broadcast and the
    tail call still reads `x + loop_count, y + loop_count`.

## Results

| path (lensfun 0.3.4) | 1,202 px | 6,002 px |
|---|---|---|
| float SSE vs plain float32, median / p99 / largest (relative) | 0.00033% / 0.0052% / 0.045% | 0.00050% / 0.0037% / 0.054% |
| float SSE scales the `UNKNOWN` (alpha) channel | all 40,730 cases, by up to 6.93x | all, up to 6.95x |
| 16-bit plain vs the float gain x 8,192: largest / mean | 8.0 / -3.97 steps | 8.0 / -3.95 steps |
| 16-bit plain vs our model of it | 0 steps | 0 steps |
| 16-bit SSE2, first `4 floor(w/4)` pixels: median / p99 / largest (relative) | 0.36% / 4.2% / 24.8% | 0.14% / 0.91% / 7.1% |
| lane 0 / 1 / 2 / 3, p99 | 0.11 / 1.4 / 2.8 / 4.2% | 0.11 / 0.33 / 0.62 / 0.91% |
| 16-bit SSE2, last `w % 4` pixels | 100% off in every case | 100% off in every case |
| our SSE2 model vs the library, within tolerance | 1,628 of 1,628 sampled cases | 212 of 212 |
| the same loop with both faults fixed, largest (relative) | 0.11% | 0.12% |

- **Float SSE is the plain loop, except for alpha.** The gains agree to float rounding, with a median of
  3 to 5 parts in ten million. But the SSE routine multiplies the fourth channel too, while the plain loop
  leaves an `UNKNOWN` channel alone. Anyone who passes RGBA with an alpha channel and an aligned buffer gets
  the alpha devignetted along with the colour, up to 6.9x on these lenses. A caller who marks the fourth
  channel as a colour, or who unpremultiplies first, won't notice.
- **The 16-bit plain path is a 10-bit gain.** Truncating to 1/1024 loses up to one part in 1,024 (8 steps
  at 8,192, 64 near full scale) and averages half of that. Every devignetted 16-bit pixel comes out 0.05%
  darker on average. Our numpy model of `apply_multiplier<lf_u16>` matches the library to the step in all
  40,730 cases.
- **The 16-bit SSE2 path draws stripes.** Lane 0 is only off by truncation and `rcp` (0.11% at the 99th
  percentile). Lanes 1 to 3 fall further behind with each lane and along the row. Columns repeat with a
  4-pixel period, and the gap grows toward the right edge. Because the error per loop is `8 j p3^2` and
  there are `w / 4` loops, the drift shrinks roughly as `1 / w`: p99 4.2% at 1,202 px and 0.91% at
  6,002 px. The worst case is the Canon PowerShot SX220 HS at 5.6 mm and f/4.1 (CHDK DNG profile, corner
  gain 7.9x): 24.8% and 7.1%.
- **The SSE2 tail is always wrong.** With a width that isn't a multiple of 4, the last 1 to 3 pixels of
  every row come out at 0 or saturated in every case we tried. A width that is a multiple of 4 has no tail.
- **The model confirms the cause.** `model_sse2_row` writes the SSE2 loop out in numpy, both faults
  included, with an exact reciprocal. It matches the library on every sampled case within one fraction
  unit plus `_mm_rcp_ps`'s documented bound (1.5 x 2^-12 relative). With both faults fixed, the same loop
  is within 0.12% of the float gain, which is truncation alone.

## What it means for comparisons

- ShootFlow's vignetting is float64, rounded once when the 16-bit master is written: within half a step of
  the float gain, with no bias and no column pattern. Compared with liblensfun 0.3.4, we match the float
  routines (plain or SSE). Against the 16-bit plain routine, expect our pixels to be about 0.05% brighter,
  by up to 1/1024. Against 16-bit RGBA through the SSE2 routine, expect 4-pixel stripes and a broken last
  column. Those are lensfun's faults, and this file is the evidence.
- No change to ShootFlow's develop: it doesn't call liblensfun. The tool and the tests are the deliverable.
  They say which lensfun a real-frame comparison has to be run against.
- Not filed upstream from here: that would be outward-facing, so it is left to the owner. Searching
  lensfun's issues (2026-11-14) found no existing report of either SSE2 fault.

## Checked

- `tests/test_lensfun_vignetting_paths.py`, 8 tests. Five run with numpy alone: the 16-bit truncation and
  31x cap; the tolerance; the fixed loop exact to one unit; the released loop's lane drift growing with the
  lane and along the row; the tail far off and absent at a width that is a multiple of 4. Three need
  lensfunpy and call the real library: float SSE equals plain except for alpha; the 16-bit plain routine
  equals the model to the step; SSE2 equals the model within tolerance at three rows, including the tail,
  with the misaligned control equal to the plain model. All skip under CI's bare `python3`.
- Seeded faults, each run against the 8 tests. Five of six caught: lane drift removed (2 fail), tail fixed
  (2), 16-bit plain rounding instead of truncating (3), buffers never aligned (2), 16-bit cap at 63x
  instead of 31x (1). Not caught: SSE2 fraction rounded instead of truncated, which is inside the
  `_mm_rcp_ps` tolerance by design, because `rcp` differs between CPUs.
- Ran on one x86-64 cloud CPU. `_mm_rcp_ps` results can differ on another vendor's CPU, within the stated
  bound.
