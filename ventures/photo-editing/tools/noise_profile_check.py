"""Compare each DNG's NoiseProfile (tag 51041) with the noise the mosaic itself shows.

For every CFA DNG given, the developer is run with ``--demosaic noise-aware`` up to the white-balanced
sensel plane the blend sees (``raw_develop_np._directional`` is intercepted there, so the plane and the
profile carried to it are exactly what ``develop`` uses). On that plane:

- ``profile``: the NoiseProfile carried to the plane (shot x mean gain, read x mean gain^2), and since
  2026-11-16 ``plane_ratios``, the per-plane guard's reading (each colour's pair by its own gain);
- ``estimate``: ``xtrans_demosaic.estimate_noise`` (the in-frame fit, which reads texture as noise, so it
  errs high on detailed frames);
- both as a noise sigma at the plane's median block level and at 18% grey of the white-balanced plane,
  and their ratio (profile over estimate);
- ``profile_ratio``: the guard's reading (``xtrans_demosaic.profile_ratio``: the profile over 1.25 x the
  quietest blocks' spread, in the cleanest brightness bin), and whether the guard scales the profile.

One JSON line per file. Usage (from ``ventures/photo-editing``, numpy installed)::

    PYTHONPATH=src python tools/noise_profile_check.py FILE.dng ... > rows.jsonl

Results: ``eval/noise-profile-real-dngs-2026-11-16.md``.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

from shootflow import raw_develop as rd
from shootflow import raw_develop_np as rnp
from shootflow import xtrans_demosaic as xd


def _text(v) -> str:
    if isinstance(v, (tuple, list, bytes)):
        v = bytes(int(x) & 0xFF for x in v).decode("latin-1")
    return str(v or "").strip("\0 ")


class _Stop(Exception):
    pass


def check(path: Path) -> dict:
    row: dict = {"file": path.name}
    raw = rd.read_raw(path)
    ifd, ifd0 = raw.ifd, raw.ifd0
    row["model"] = _text(ifd0.get(272)) if ifd0 is not None else ""
    row["software"] = _text(ifd0.get(305))[:60] if ifd0 is not None else ""
    prof = rd.noise_profile(ifd, ifd0)
    v = ifd.get(rd.TAG_NOISE_PROFILE) or (ifd0.get(rd.TAG_NOISE_PROFILE) if ifd0 is not None else None)
    row["noise_profile_tag"] = [float(x) for x in v] if v else None
    if prof is None:
        row["skip"] = "no usable NoiseProfile"
        return row
    seen: dict = {}

    def grab(norm, w, h, pat, mults, hi, demosaic="directional", noise=None, *_rest, **_kw):
        seen.update(norm=np.asarray(norm).reshape(h, w).copy(), pat=pat, mults=tuple(mults), noise=noise, hi=hi)
        raise _Stop

    orig = rnp._directional
    rnp._directional = grab
    try:
        rd.develop(raw, rd.DevelopSettings(demosaic="noise-aware", engine="numpy"))
    except _Stop:
        pass
    finally:
        rnp._directional = orig
    if not seen:
        row["skip"] = "the developer did not reach the CFA demosaic (LinearRaw or half size)"
        return row
    pat, mults = seen["pat"], np.asarray(seen["mults"], dtype=np.float64)
    h, w = seen["norm"].shape
    plane = seen["norm"] * mults[xd.colour_map(pat, h, w)]
    raw_planes = xd.as_planes(seen["noise"])  # per colour since 2026-11-16 (rd.noise_profile_planes)
    shot, read = raw_planes.mean(axis=0)
    p_shot, p_read = float(shot) * float(np.mean(mults)), float(read) * float(np.mean(mults * mults))
    t0 = time.perf_counter()
    e_shot, e_read = xd.estimate_noise(plane, pat)
    row["estimate_s"] = round(time.perf_counter() - t0, 2)
    level = xd._block_stat(np.clip(plane, 0.0, None), lambda t: t.mean(axis=-1))
    med = float(np.median(level))
    grey = 0.18 * float(np.mean(mults))

    def sig(g, r, x):
        return float(np.sqrt(max(g * x + r, 0.0)))

    row.update(
        cfa="xtrans" if len(pat) == 36 else "bayer",
        size=[w, h],
        mults=[round(float(m), 4) for m in mults],
        profile=[p_shot, p_read],
        estimate=[e_shot, e_read],
        median_level=round(med, 5),
        sigma_profile_median=sig(p_shot, p_read, med),
        sigma_estimate_median=sig(e_shot, e_read, med),
        sigma_profile_grey=sig(p_shot, p_read, grey),
        sigma_estimate_grey=sig(e_shot, e_read, grey),
    )
    row["ratio_median"] = row["sigma_profile_median"] / max(row["sigma_estimate_median"], 1e-12)
    row["ratio_grey"] = row["sigma_profile_grey"] / max(row["sigma_estimate_grey"], 1e-12)
    # The guard's own reading (xtrans_demosaic.profile_ratio, cleanest brightness bin), and what it does.
    t0 = time.perf_counter()
    used, ratio = xd.guard_profile(plane, pat, (p_shot, p_read))
    row["guard_s"] = round(time.perf_counter() - t0, 2)
    row["profile_ratio"] = ratio
    row["guard_scaled"] = bool(ratio == ratio and ratio > xd.PROFILE_CAP)
    # The per-plane guard the developer runs since 2026-11-16 (eval/noise-aware-planes-luma-2026-11-16.md): each
    # colour's pair carried by its own gain and read against that colour's sensels.
    per = np.stack([raw_planes[:, 0] * mults, raw_planes[:, 1] * mults * mults], axis=1)
    t0 = time.perf_counter()
    pr = xd.plane_ratios(plane, pat, per)
    row["plane_s"] = round(time.perf_counter() - t0, 2)
    row["plane_ratios"] = [None if not v == v else round(float(v), 4) for v in pr]
    row["plane_ratio"] = float(np.nanmax(pr)) if np.isfinite(pr).any() else None
    return row


def main(argv: list[str]) -> int:
    for a in argv:
        try:
            row = check(Path(a))
        except Exception as ex:  # a file the reader refuses is reported, not fatal
            row = {"file": Path(a).name, "error": f"{type(ex).__name__}: {ex}"[:200]}
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
