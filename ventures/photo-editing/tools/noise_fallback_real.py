"""Develop real raws with ``--demosaic noise-aware`` and no NoiseProfile: does the frame-noise fallback run on
every reader, what does it cost, and does what it reads follow the camera's ISO?

There is no truth on these frames, so this is not a quality test (that is eval/noise-pca-estimator-2026-11-17.md
and eval/xtrans-noise-pca-12-2026-11-17.md, synthetic noise on binned real scenes). It is the check that the
fallback is safe to turn on by default: each file is developed at full size twice on the numpy engine,
``demosaic="directional"`` and ``demosaic="noise-aware"`` (frame noise), and the row records the times, the
model ``frame_noise`` read (sigma at 18% grey on the white-balanced plane), the EXIF ISO, and how far the two
outputs differ (PSNR on the 16-bit output, share of pixels moved by over 1/255).

Usage (from ``ventures/photo-editing``, numpy installed)::

    find mei/{arw,cr2,nef,orf,rw2,srw,raf,pef,dng} -type f ! -path '*metadata*' -print0 \
        | PYTHONPATH=src xargs -0 -P 2 -n 1 python tools/noise_fallback_real.py > rows.jsonl
    python tools/noise_fallback_real.py --summary rows.jsonl

Results: eval/noise-fallback-real-2026-11-17.md.
"""

from __future__ import annotations

import json
import math
import resource
import sys
import time
from pathlib import Path

import numpy as np

from shootflow import xtrans_demosaic
from shootflow.raw_develop import TAG_COLOR_MATRIX_1, DevelopSettings, develop, noise_profile_planes, read_raw

# A raw read directly carries no colour matrix (``develop`` asks for a .dcp). Colour does not enter the demosaic
# or the noise model, so files without one get the sRGB XYZ -> linear RGB matrix as a stand-in: the colours are
# wrong, the mosaic, white balance, demosaic and noise reading are the file's own.
XYZ_TO_SRGB = (3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.2040, 1.0570)

TAG_ISO = 34855  # ExifTag ISOSpeedRatings / PhotographicSensitivity


def _iso(raw) -> int | None:
    for ifd in (raw.exif, raw.ifd0, raw.ifd):
        if ifd is None:
            continue
        v = ifd.get(TAG_ISO)
        if v is None:
            continue
        v = v[0] if isinstance(v, (tuple, list)) else v
        try:
            v = int(v)
        except (TypeError, ValueError):
            continue
        if v > 0:
            return v
    return None


def one(path: Path) -> dict:
    row: dict = {"file": f"{path.parent.name}/{path.name}"}
    try:
        raw = read_raw(path)
    except Exception as e:  # noqa: BLE001 - a reader that cannot open the file is a row, not a crash
        row["error"] = f"read: {type(e).__name__}: {e}"[:200]
        return row
    row["source"], row["iso"] = raw.source, _iso(raw)
    if raw.ifd.get(TAG_COLOR_MATRIX_1) is None and raw.ifd0.get(TAG_COLOR_MATRIX_1) is None:
        raw.ifd.entries[TAG_COLOR_MATRIX_1] = XYZ_TO_SRGB
        row["stand_in_matrix"] = True
    row["has_profile"] = noise_profile_planes(raw.ifd, raw.ifd0) is not None
    seen: list = []
    real = xtrans_demosaic.frame_noise

    def spy(c, pat, **kw):
        out = real(c, pat, **kw)
        seen.append(out)
        return out

    xtrans_demosaic.frame_noise = spy
    try:
        outs = {}
        for demosaic in ("directional", "noise-aware"):
            t = time.perf_counter()
            w, h, px, rep = develop(raw, DevelopSettings(engine="numpy", demosaic=demosaic))
            row[f"t_{demosaic}"] = round(time.perf_counter() - t, 2)
            outs[demosaic] = np.frombuffer(px, dtype=np.uint16 if px.typecode == "H" else np.float64).astype(np.float64)
            row[f"used_{demosaic}"] = rep.demosaic
            if demosaic == "noise-aware":
                row["notes"] = [n for n in rep.notes if "noise" in n.lower()]
        row["w"], row["h"], row["cfa"] = w, h, rep.cfa
    except Exception as e:  # noqa: BLE001
        row["error"] = f"develop: {type(e).__name__}: {e}"[:200]
        return row
    finally:
        xtrans_demosaic.frame_noise = real
    if seen:
        shot, read = seen[0]
        row["sigma18"] = math.sqrt(max(shot * 0.18 + read, 0.0))
    a, b = outs["directional"], outs["noise-aware"]
    peak = 65535.0 if a.max() > 2.0 else 1.0
    mse = float(np.mean((a - b) ** 2))
    row["psnr"] = round(10 * math.log10(peak * peak / mse), 2) if mse > 0 else None
    row["moved"] = round(float(np.mean(np.abs(a - b) > peak / 255.0)), 5)
    return row


def _rank(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    for k, i in enumerate(order):
        r[i] = float(k)
    return r


def summary(path: Path) -> None:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    ok = [r for r in rows if "error" not in r]
    print(f"{len(rows)} files, {len(ok)} developed, {len(rows) - len(ok)} errors")
    for r in rows:
        if "error" in r:
            print("  error:", r["file"], r["error"])
    fell = [r for r in ok if r.get("used_noise-aware") != "noise-aware"]
    print(f"noise-aware requested, other demosaic used: {len(fell)}", [r["file"] for r in fell][:10])
    prof = [r for r in ok if r["has_profile"]]
    print(f"files with a NoiseProfile (profile used, no frame read): {len(prof)}; frame read on those: "
          f"{sum(1 for r in prof if 'sigma18' in r)}")
    frame = [r for r in ok if "sigma18" in r]
    if frame:
        mp = [r["w"] * r["h"] / 1e6 for r in frame]
        extra = [r["t_noise-aware"] - r["t_directional"] for r in frame]
        ratio = [r["t_noise-aware"] / r["t_directional"] for r in frame]
        print(f"frame model read on {len(frame)}: extra time median {np.median(extra):.1f} s "
              f"(max {max(extra):.1f}), x{np.median(ratio):.2f} directional's; "
              f"{np.median([e / m for e, m in zip(extra, mp)]):.2f} s per MP")
        rss = [(r["peak_rss_gb"] / m, r) for m, r in zip(mp, frame) if "peak_rss_gb" in r]
        if rss:
            print(f"peak memory (whole process, both develops): median {np.median([x for x, _ in rss]):.3f} GB per MP, "
                  f"max {max(r['peak_rss_gb'] for _, r in rss):.1f} GB")
        ps = [r["psnr"] for r in frame if r["psnr"] is not None]
        print(f"noise-aware vs directional output: PSNR median {np.median(ps):.1f} dB, min {min(ps):.1f}; "
              f"pixels moved > 1/255 median {np.median([r['moved'] for r in frame]):.4f}, "
              f"max {max(r['moved'] for r in frame):.4f}")
        iso = [r for r in frame if r.get("iso")]
        if len(iso) >= 5:
            ri, rs = _rank([r["iso"] for r in iso]), _rank([r["sigma18"] for r in iso])
            rm = _rank([r["moved"] for r in iso])
            rho = float(np.corrcoef(ri, rs)[0, 1])
            rho_m = float(np.corrcoef(ri, rm)[0, 1])
            print(f"with EXIF ISO: {len(iso)}; Spearman ISO vs sigma18 {rho:+.2f}, ISO vs pixels moved {rho_m:+.2f}")
        print("file | src | ISO | MP | sigma18 x1e3 | t dir | t na | PSNR | moved")
        for r in sorted(frame, key=lambda r: (r.get("iso") or 0, r["file"])):
            print(f"{r['file']} | {r['source']} | {r.get('iso')} | {r['w'] * r['h'] / 1e6:.1f} | "
                  f"{r['sigma18'] * 1e3:.2f} | {r['t_directional']} | {r['t_noise-aware']} | {r['psnr']} | {r['moved']}")


def main(argv: list[str]) -> int:
    if argv[:1] == ["--summary"]:
        summary(Path(argv[1]))
        return 0
    for a in argv:
        row = one(Path(a))
        row["peak_rss_gb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6, 2)  # Linux: kB
        print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
