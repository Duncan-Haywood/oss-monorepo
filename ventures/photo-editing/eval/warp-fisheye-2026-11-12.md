# WarpFisheye (DNG opcode 2) in OpcodeList3 (2026-11-12)

What landed: `shootflow.dng_opcodes` parses and runs `WarpFisheye` in `OpcodeList3`, beside
`WarpRectilinear`, in list order, through the same bilinear resampler (`warp_source`,
`warp_rgb`, `warp_planes`). `raw_develop.develop` runs it on the clipped, white-balanced
linear image after demosaic, in both engines; `--no-opcodes` turns it off. Before this the
opcode was named in the report as "1 x WarpFisheye (required) not applied".

The model, as the module docstring states it: per plane four radial terms `kr0..kr3`, then the
optical centre `(cx, cy)` as fractions of the image. For an output pixel at normalised radius
`r` (1 at the farthest corner), `t = atan(r)`, `rd = kr0 t + kr1 t^3 + kr2 t^5 + kr3 t^7`, and
the pixel reads from `centre + m (rd / r) (dx, dy)`; at `r = 0` the ratio's limit `kr0` is used.
With `kr0 = 1` this maps an ideal equidistant fisheye (radius proportional to the angle off
axis) to a pinhole image (radius proportional to its tangent).

## Where the formula comes from, and what that means

The formula is the DNG 1.4 specification's (chapter 7), written from this session's knowledge
of the specification and of Adobe's DNG SDK (`dng_warp_params_fisheye::Evaluate` returns
`t (k0 + t^2 (k1 + t^2 (k2 + t^2 k3)))` with `t = atan(r)`). Neither text could be fetched
from this session: the specification PDF and the SDK source are not on any host the proxy
allows. darktable (`src/common/dng_opcode.c`, master, read 2026-11-12) runs GainMap,
WarpRectilinear and FixVignetteRadial only, so there is no second open implementation to
compare with; ExifTool and PiDNG name the opcode without its parameters. So the formula is
checked against itself written twice, not against Adobe: a reader with the SDK should check
`Evaluate` and the ratio at `r = 0`.

No camera-written DNG carrying WarpFisheye has been found. It is written by converters for
fisheye lenses with a lens profile (an Adobe DNG Converter export of a fisheye frame would be
the test file).

## Checks

`tests/test_dng_warp_fisheye.py`, 13 tests:

| check | result |
| --- | --- |
| parse round trip, a plane past the count, five malformed parameter blocks | pass |
| `plan` runs it, notes "1 WarpFisheye applied (fisheye unwrap)", skips an unreadable one with a note, keeps list order beside a WarpRectilinear | pass |
| source point vs the formula written out again in the test, 4 term sets x 2 sizes x 4 pixels | 9 places |
| `kr0 = 1`: source radius is `atan(r)` along the same ray, 4 pixels on a 4000 x 3000 frame; the corner reads from `pi/4` of the corner distance | 12 places |
| the pixel exactly on the centre (odd frame, `r = 0`) reads itself, every term set | exact |
| horizontal ramp: every in-frame pixel equals the ramp at the formula's source point (bilinear is exact on a ramp) | 9 places, over half the frame each |
| per-plane terms move red and blue opposite ways, green unchanged | pass |
| develop: the warp changes the image and is reported; `opcodes=False` gives the plain bytes | pass |
| numpy vs pure Python, develop at full and half size, and `warp_planes` vs `warp_rgb` with a centre pixel | same bytes |

The numpy engine takes `atan` with `math.atan` per pixel rather than `np.arctan`, because a
vectorised arctan may differ from the C library's in the last bit and the two engines must give
the same bytes. The radius and angle are taken once per band and shared by the three planes.
Speed: a 3 MP (2000 x 1500) linear image warps in 0.95 s, against 0.70 s for a WarpRectilinear.

`tests/test_dng_opcodes.py` used opcode 2 as its example of a required opcode left undone; it
now uses opcode 6 (TrimBounds), which still is.
