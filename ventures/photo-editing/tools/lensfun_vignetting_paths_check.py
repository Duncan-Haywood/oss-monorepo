"""liblensfun 0.3.4's other devignetting code paths, measured against its plain float32 one, on every ``pa`` lens.

``tools/lensfun_vignetting_released_check.py`` checked our vignetting against the compiled library through
lensfunpy, which only takes 3-channel images, so it only ever reached the plain ``ModifyColor_DeVignetting_PA``
loop. The release has three more (``mod-color.cpp``, ``AddColorCallbackVignetting``):

- **float SSE** (``mod-color-sse.cpp``, ``ModifyColor_DeVignetting_PA_SSE``): float32 pixels with four
  components, a 16-byte aligned buffer; one pixel per loop;
- **16-bit plain** (``apply_multiplier<lf_u16>``): the gain ``1 / c`` truncated to a 22.10 fixed-point
  ``int(g * 1024)``, capped at ``31 << 10``, then ``(v * c10 + 512) >> 10``;
- **16-bit SSE2** (``mod-color-sse2.cpp``, ``ModifyColor_DeVignetting_PA_SSE2``): uint16 pixels with four
  components, aligned; four pixels per loop, ``_mm_rcp_ps`` for ``1 / c``, truncated to 5.10 fixed point.

This script calls the liblensfun that lensfunpy bundles directly through ``ctypes`` (``lf_modifier_new``,
``lf_modifier_initialize``, ``lf_modifier_apply_color_modification``), so it can hand it RGBA rows, aligned (the
SIMD path) or offset by one sample (the same four-component pixels through the plain loop, as a control). For
each lens and calibration point that the released check uses (calibration points only, both frame shapes) it
devignettes ``--rows`` rows of a flat image and reports, per path, the gap to the plain float32 gain. Read from
tag v0.3.4, the SSE2 loop has two faults this measures:

- **lane drift**: ``r2`` for the four lanes is stepped by ``8 p3 x + 16 p3^2`` with ``x`` the *first* lane's
  coordinate, so lane ``j`` gains ``8 j p3^2`` too little per loop; along a row the error grows linearly;
- **the tail**: the ``count % 4`` pixels left at a row's end go to the plain loop as
  ``(_x + loop_count, _y + loop_count)``, adding a pixel count to coordinates already in normalised units (and
  to ``y`` at all), so they are devignetted as if far outside the frame.

``model_sse2_row`` writes the SSE2 loop out in numpy (float32 ``r2``, the drift and the tail included; the
reciprocal exact, since ``_mm_rcp_ps`` differs between CPUs), and its agreement with the library, within one
fixed-point unit, is reported too: that is the check that the faults above are the cause.

Usage: python3 tools/lensfun_vignetting_paths_check.py [--width 1202] [--value 8192] [--json out.json]
"""

from __future__ import annotations

import argparse
import ctypes as C
import glob
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from shootflow import lens_profiles as lp

LF_PF_U16, LF_PF_F32 = 1, 3
LF_MODIFY_VIGNETTING = 2
CR_UNKNOWN, CR_RED, CR_GREEN, CR_BLUE = 2, 4, 5, 6
CR_RGB = CR_RED | CR_GREEN << 4 | CR_BLUE << 8
CR_RGBA = CR_RGB | CR_UNKNOWN << 12  # LF_CR_4(RED, GREEN, BLUE, UNKNOWN): lensfun's own RGBA example


class Lensfun:
    """The liblensfun shared library that lensfunpy bundles, through its C API."""

    def __init__(self, lib_path: str | None = None, db_dir: str | None = None):
        import lensfunpy

        here = os.path.dirname(lensfunpy.__file__)
        if lib_path is None:
            found = glob.glob(os.path.join(here, "..", "lensfunpy.libs", "liblensfun*"))
            if not found:
                raise OSError("lensfunpy's bundled liblensfun not found")
            lib_path = found[0]
        self.db_dir = db_dir or os.path.join(here, "db_files")
        lib = C.CDLL(lib_path)
        lib.lf_db_new.restype = C.c_void_p
        lib.lf_db_load_file.argtypes = [C.c_void_p, C.c_char_p]
        lib.lf_db_get_lenses.restype = C.POINTER(C.c_void_p)
        lib.lf_db_get_lenses.argtypes = [C.c_void_p]
        lib.lf_modifier_new.restype = C.c_void_p
        lib.lf_modifier_new.argtypes = [C.c_void_p, C.c_float, C.c_int, C.c_int]
        lib.lf_modifier_initialize.argtypes = [C.c_void_p, C.c_void_p, C.c_int] + [C.c_float] * 4 + [C.c_int] * 3
        lib.lf_modifier_apply_color_modification.restype = C.c_int
        lib.lf_modifier_apply_color_modification.argtypes = [C.c_void_p, C.c_void_p, C.c_float, C.c_float] + [C.c_int] * 4
        lib.lf_modifier_destroy.argtypes = [C.c_void_p]
        self.lib = lib
        self.db = lib.lf_db_new()
        for f in sorted(os.listdir(self.db_dir)):
            if f.endswith(".xml"):
                lib.lf_db_load_file(self.db, os.path.join(self.db_dir, f).encode())
        arr = lib.lf_db_get_lenses(self.db)
        self.lenses: list[tuple[str, str, int]] = []
        i = 0
        while arr[i]:
            # lfLens begins with two lfMLstr (char *): Maker, Model; the first string is the default language.
            s = C.cast(arr[i], C.POINTER(C.c_char_p))
            self.lenses.append(((s[0] or b"").decode(), (s[1] or b"").decode(), arr[i]))
            i += 1

    def devignette_row(self, lens_ptr, crop, w, h, focal, aperture, distance, y, values, dtype, channels,
                       aligned=True):
        """One row ``y`` of a ``w`` x ``h`` frame, every sample ``values``, devignetted by lensfun.

        ``aligned`` puts the row on a 16-byte boundary (the SIMD paths need it); otherwise it starts one
        sample past one, which sends the same pixels through the plain loop. Returns (row, applied)."""

        item = np.dtype(dtype).itemsize
        n = w * channels
        raw = np.zeros(n * item + 64, np.uint8)
        off = (-raw.ctypes.data) % 16 + (0 if aligned else item)
        row = raw[off : off + n * item].view(dtype).reshape(w, channels)
        row[:] = values
        m = self.lib.lf_modifier_new(lens_ptr, crop, w, h)
        try:
            fmt = LF_PF_F32 if dtype == np.float32 else LF_PF_U16
            self.lib.lf_modifier_initialize(m, lens_ptr, fmt, focal, aperture, distance, 1.0, 0, LF_MODIFY_VIGNETTING, 0)
            ok = self.lib.lf_modifier_apply_color_modification(
                m, row.ctypes.data, 0.0, float(y), w, 1, CR_RGBA if channels == 4 else CR_RGB, n * item
            )
        finally:
            self.lib.lf_modifier_destroy(m)
        return row.copy(), bool(ok)


def u16_plain(gain32: np.ndarray, v: int) -> np.ndarray:
    """``apply_multiplier<lf_u16>``: 22.10 fixed point, truncated, capped at 31x, rounded on the way out."""

    c10 = np.minimum((gain32.astype(np.float64) * 1024.0).astype(np.int64), 31 << 10)
    return np.clip((v * c10 + 512) >> 10, 0, 65535)


def model_sse2_row(terms, s: float, w: int, h: int, y: int, v: int, released: bool = True) -> np.ndarray:
    """``ModifyColor_DeVignetting_PA_SSE2`` (v0.3.4) for one row of a flat ``v`` image, in numpy.

    ``s`` is the ``pa`` scale in 0.3.4's pixel unit (``released_scale``). float32 throughout as the C code; the
    reciprocal is exact here (``_mm_rcp_ps`` is an approximation that differs between CPUs), so expect the
    library within one 1/1024 step of the fraction. ``released=False`` gives the loop with both faults fixed."""

    f = np.float32
    m = math.hypot((w - 1) / 2.0, (h - 1) / 2.0)
    ns = s / m  # p3: pa units per pixel. ApplyColorModification hands the callback x * NormScale - CenterX, which
    # times param[4] is x_pixel * p3 - centre * p3; the callback only ever sees that product.
    p3 = f(ns)
    x0 = f(f(-(w - 1) / 2.0) * p3)
    yy = f(f(y - (h - 1) / 2.0) * p3)
    p0, p1, p2 = (f(t) for t in terms)
    loops = w // 4
    out = np.empty(w, np.int64)
    # lane start values, as the C code computes them: t_j = x_j^2 + y^2 with x stepped by p3
    xs = [x0]
    for _ in range(3):
        xs.append(f(xs[-1] + p3))
    r2 = np.array([f(f(xj * xj) + f(yy * yy)) for xj in xs], np.float32)
    x2 = np.full(4, x0, np.float32) if released else np.array(xs, np.float32)
    d1_4 = f(4.0 * 2.0 * float(p3))
    p3_4 = f(p3 * f(4.0))
    add_four = f(f(16.0) * p3 * p3)
    for i in range(loops):
        r4 = r2 * r2
        r6 = r4 * r2
        c = ((f(1.0) + p0 * r2) + r4 * p1) + r6 * p2
        frac = np.trunc((1.0 / c.astype(np.float64)) * 1024.0)
        frac = np.clip(frac, -32768, 32767).astype(np.int64)  # _mm_packs_epi32 to signed 16 bit
        frac &= 0xFFFF  # then multiplied as unsigned 16 bit (mullo/mulhi_epu16)
        px = ((v * frac + 512) >> 10) - 32768
        out[4 * i : 4 * i + 4] = np.clip(px, -32768, 32767) + 32768
        r2 = (add_four + r2) + d1_4 * x2
        x2 = x2 + p3_4
    tail = w - 4 * loops
    if tail:
        # the plain loop, from (_x + loop_count, _y + loop_count) in released code, else from the right pixel.
        # The C code adds loop_count before its param[4] factor (1 / AspectRatioCorrection, about 0.55 for 3:2);
        # this model adds it after. Either way the point lies hundreds of pa radii out, where c is huge and the
        # pixel rounds to 0 or saturates, so the modelled tail values match the library's (the tests check it).
        tx = x0 + (4 * loops if released else 4 * loops * ns)
        ty = yy + (4 * loops if released else 0.0)
        for k in range(tail):
            xk = tx + k * ns
            r2t = xk * xk + ty * ty
            c = 1.0 + terms[0] * r2t + terms[1] * r2t**2 + terms[2] * r2t**3
            g = f(1.0) / f(c)
            out[4 * loops + k] = int(u16_plain(np.array([g], np.float32), v)[0])
    return out


RCP_REL = 1.5 * 2.0**-12  # _mm_rcp_ps: Intel's documented bound on the relative error of the approximation


def sse2_tolerance(gain: float, v: int) -> int:
    """Steps the library may differ from ``model_sse2_row``: one 1/1024 fraction unit of truncation, plus what
    ``_mm_rcp_ps``'s relative error does to a fraction of ``gain * 1024``, times ``v / 1024``, plus rounding."""

    return int(math.ceil(v / 1024.0 * (1.0 + gain * 1024.0 * RCP_REL))) + 1


def pcts(xs) -> str:
    xs = np.asarray(xs, float)
    if xs.size == 0:
        return "none"
    return ", ".join(f"p{p} {100 * np.percentile(xs, p):.4g}%" for p in (50, 90, 99, 100))


_W = {}  # per-process state: the library, our database, the arguments


def _init(args) -> None:
    _W["lf"] = Lensfun()
    _W["ours"] = lp.load_db(_W["lf"].db_dir)
    _W["args"] = args


def lens_cases(index: int):
    """Every calibration point of lens ``index`` (in liblensfun's order), both frame shapes: (rows, skipped)."""

    from lensfun_vignetting_released_check import exact_gain, points, released_scale

    lf, ours, args = _W["lf"], _W["ours"], _W["args"]
    maker, model, ptr = lf.lenses[index]
    W, V = args.width, args.value
    rows = []
    mine = [ln for ln in ours.lenses if ln.name == model and (not ln.maker or maker in ln.maker)]
    if len(mine) != 1:
        return rows, 1
    lens = mine[0]
    cs0 = next((c for c in lens.calibrations if c.vignetting), None)
    if cs0 is None:
        return rows, 0
    k = 0
    for aspect, crop in ((1.5, cs0.crop), (4 / 3, cs0.crop * 1.5)):
        H = round(W / aspect)
        ys = np.linspace(0, H - 1, args.rows).round().astype(int)
        for f, a, d, interp in points(cs0):
            if interp:
                continue
            found = lp.interpolate_vignetting(lens, crop, f, a, d)
            if found is None:
                continue
            k += 1
            # the numpy model of the SSE2 loop is slow: run it on one case in model_every, picked by number
            modelled = (index * 7919 + k) % args.model_every == 0
            vig, cs = found
            s3 = released_scale(cs, crop, W, H)
            rec = {"lens": model, "focal": f, "aperture": a, "distance": d, "crop": crop, "aspect": aspect,
                   "sse_f32": 0.0, "alpha_f32": 0.0, "u16_plain_steps": 0.0, "u16_plain_bias": [],
                   "u16_plain_model": 0, "sse2_body_rel": 0.0, "sse2_lane_rel": [0.0] * 4, "sse2_tail_rel": 0.0,
                   "sse2_model_steps": 0, "modelled": modelled, "sse2_fixed_rel": 0.0, "max_gain": 0.0, "skip": False}
            xs = np.arange(W, dtype=np.float64)
            for y in ys:
                ref, ok = lf.devignette_row(ptr, crop, W, H, f, a, d, y, 1.0, np.float32, 3)
                if not ok:
                    rec["skip"] = True
                    break
                g = ref[:, 0].astype(np.float64)
                ex = exact_gain(vig.terms, s3, W, H, xs, np.full(W, float(y)))
                if np.any(ex <= 0) or np.any(ex > 31) or np.any(g * V > 65535):
                    rec["skip"] = True  # near-singular, past the 31x cap, or clipped: not a precision question
                    break
                rec["max_gain"] = max(rec["max_gain"], float(g.max()))
                sse, _ = lf.devignette_row(ptr, crop, W, H, f, a, d, y, 1.0, np.float32, 4, aligned=True)
                rec["sse_f32"] = max(rec["sse_f32"], float(np.max(np.abs(sse[:, 0] / g - 1.0))))
                rec["alpha_f32"] = max(rec["alpha_f32"], float(np.max(np.abs(sse[:, 3] - 1.0))))
                u3, _ = lf.devignette_row(ptr, crop, W, H, f, a, d, y, V, np.uint16, 3)
                e = u3[:, 0].astype(np.float64) - g * V
                rec["u16_plain_steps"] = max(rec["u16_plain_steps"], float(np.max(np.abs(e))))
                rec["u16_plain_bias"].append(float(np.mean(e)))
                rec["u16_plain_model"] = max(rec["u16_plain_model"],
                                             int(np.max(np.abs(u3[:, 0].astype(np.int64) - u16_plain(ref[:, 0], V)))))
                u4, _ = lf.devignette_row(ptr, crop, W, H, f, a, d, y, V, np.uint16, 4, aligned=True)
                rel = u4[:, 0].astype(np.float64) / (g * V) - 1.0
                body = 4 * (W // 4)
                rec["sse2_body_rel"] = max(rec["sse2_body_rel"], float(np.max(np.abs(rel[:body]))))
                for j in range(4):
                    rec["sse2_lane_rel"][j] = max(rec["sse2_lane_rel"][j], float(np.max(np.abs(rel[j:body:4]))))
                if body < W:
                    rec["sse2_tail_rel"] = max(rec["sse2_tail_rel"], float(np.max(np.abs(rel[body:]))))
                if not modelled:
                    continue
                mod = model_sse2_row(vig.terms, s3, W, H, int(y), V)
                tol = sse2_tolerance(float(g.max()), V)
                diff = np.abs(u4[:, 0].astype(np.int64) - mod)
                rec["sse2_model_steps"] = max(rec["sse2_model_steps"], int(diff.max()))
                rec["sse2_model_tol"] = tol
                fixed = model_sse2_row(vig.terms, s3, W, H, int(y), V, released=False)
                rec["sse2_fixed_rel"] = max(rec["sse2_fixed_rel"], float(np.max(np.abs(fixed / (g * V) - 1.0))))
            if rec["skip"]:
                rows.append({"lens": model, "skip": True})
                continue
            rec["u16_plain_bias"] = float(np.mean(rec["u16_plain_bias"]))
            rows.append(rec)
    return rows, 0


def main(argv=None) -> int:
    import multiprocessing

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--width", type=int, default=1202, help="frame width; not a multiple of 4 shows the SSE2 tail")
    ap.add_argument("--rows", type=int, default=5, help="rows per case (evenly spaced, both edges)")
    ap.add_argument("--value", type=int, default=8192, help="flat 16-bit value (gains up to 8x stay unclipped)")
    ap.add_argument("--model-every", type=int, default=25, help="run the numpy SSE2 model on one case in N")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    W, V = args.width, args.value
    n = len(Lensfun().lenses)
    rows, skipped = [], 0
    with multiprocessing.Pool(args.jobs, _init, (args,)) as pool:
        for i, (r, sk) in enumerate(pool.imap(lens_cases, range(n), chunksize=4)):
            rows += r
            skipped += sk
            if i % 200 == 199:
                print(f"  ... {i + 1} of {n} lenses, {len(rows)} cases", flush=True)
    ok = [r for r in rows if not r.get("skip")]
    print(f"cases: {len(ok)} on {len({r['lens'] for r in ok})} lenses, frame {W} px wide, flat 16-bit value {V} "
          f"({len(rows) - len(ok)} skipped: gain over 31x, clipped at {V}, near-singular or not applied; "
          f"{skipped} lens names not matched one to one)")
    print("  float SSE (RGBA, aligned) vs plain float32:       " + pcts([r["sse_f32"] for r in ok]))
    print(f"  float SSE changes the UNKNOWN (alpha) channel in {sum(r['alpha_f32'] > 0 for r in ok)} of {len(ok)} "
          f"cases (plain loop: never); largest change {max(r['alpha_f32'] for r in ok):.3g}")
    print(f"  16-bit plain vs the float gain x {V}: largest {max(r['u16_plain_steps'] for r in ok):.1f} steps, "
          f"mean bias {np.mean([r['u16_plain_bias'] for r in ok]):.2f} steps; model differs by at most "
          f"{max(r['u16_plain_model'] for r in ok)} steps")
    print("  16-bit SSE2, first 4*floor(w/4) pixels (rel.):    " + pcts([r["sse2_body_rel"] for r in ok]))
    for j in range(4):
        print(f"    lane {j}:                                       " + pcts([r["sse2_lane_rel"][j] for r in ok]))
    print("  16-bit SSE2, last w % 4 pixels (rel.):            " + pcts([r["sse2_tail_rel"] for r in ok]))
    md = [r for r in ok if r["modelled"]]
    if md:
        print(f"  model of the SSE2 loop vs the library, {len(md)} cases: largest {max(r['sse2_model_steps'] for r in md)} "
              f"steps (tolerance: one fraction unit, {math.ceil(V / 1024)} steps at {V}, plus _mm_rcp_ps's bound); within it in "
              f"{sum(r['sse2_model_steps'] <= r['sse2_model_tol'] for r in md)}")
        print("  the same loop with both faults fixed (rel.):      " + pcts([r["sse2_fixed_rel"] for r in md]))
    for r in sorted(ok, key=lambda r: -r["sse2_body_rel"])[:5]:
        print(f"  SSE2 body {100 * r['sse2_body_rel']:.3f}% (gain up to {r['max_gain']:.2f})  {r['lens']} @ "
              f"{r['focal']:g} mm f/{r['aperture']:g} {r['distance']:g} m crop {r['crop']:.3g}")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
