"""Time, added peak memory and output digest of the noise-aware develop on one real raw (2026-11-17).

eval/noise-aware-full-frame-cost-2026-11-17.md. Prints one JSON row per file: the file is read with
``read_raw`` and developed at full size on the numpy engine, once with ``demosaic="directional"`` (time
only) and once with ``"noise-aware"`` (no NoiseProfile: the frame-read model), whose time, the peak memory
the develop adds over what was held before it (``tracemalloc``, which numpy reports its buffers to), and a
SHA-256 of the 16-bit output are recorded. Run it once against each version of ``src`` (``PYTHONPATH``)
to compare their cost, and their digests to check the outputs are the same bytes.

    PYTHONPATH=src python tools/noise_aware_cost.py [--keep DIR] FILE [FILE ...] > rows.jsonl
    python tools/noise_aware_cost.py --compare old.jsonl new.jsonl
    python tools/noise_aware_cost.py --codes OLD_DIR NEW_DIR    # 16-bit code differences of kept outputs

``--peaks`` also develops each file a second time with ``demosaic="directional"`` under ``tracemalloc``, so the
row carries directional's own added peak (``added_peak_gb_directional``) next to noise-aware's
(eval/auto-noise-aware-2026-11-19.md).

``--keep DIR`` saves each noise-aware output as ``DIR/<stem>.npy`` (uint16, (h, w, 3)), so two versions whose
digests differ can be compared code by code (``--codes``; eval/noise-aware-float32-2026-11-17.md).

A raw read directly carries no colour matrix; files without one get the sRGB one as a stand-in, as
``tools/noise_fallback_real.py`` does (colour does not enter the blend).
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
import tracemalloc
from pathlib import Path


def one(path: Path, keep: Path | None = None, peaks: bool = False) -> dict:
    from shootflow.raw_develop import TAG_COLOR_MATRIX_1, DevelopSettings, develop, read_raw

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from noise_fallback_real import XYZ_TO_SRGB

    row: dict = {"file": f"{path.parent.name}/{path.name}"}
    try:
        raw = read_raw(path)
    except Exception as e:  # noqa: BLE001 - an unreadable file is a row
        row["error"] = f"read: {type(e).__name__}: {e}"[:200]
        return row
    if raw.ifd.get(TAG_COLOR_MATRIX_1) is None and raw.ifd0.get(TAG_COLOR_MATRIX_1) is None:
        raw.ifd.entries[TAG_COLOR_MATRIX_1] = XYZ_TO_SRGB
    try:
        t = time.perf_counter()
        develop(raw, DevelopSettings(engine="numpy", demosaic="directional"))
        row["t_directional"] = round(time.perf_counter() - t, 2)
        if peaks:  # directional's own added peak, traced in a second run so its time above stays untraced
            tracemalloc.start()
            base = tracemalloc.get_traced_memory()[0]
            develop(raw, DevelopSettings(engine="numpy", demosaic="directional"))
            row["added_peak_gb_directional"] = round((tracemalloc.get_traced_memory()[1] - base) / 1e9, 3)
            tracemalloc.stop()
        tracemalloc.start()
        base = tracemalloc.get_traced_memory()[0]
        t = time.perf_counter()
        w, h, px, rep = develop(raw, DevelopSettings(engine="numpy", demosaic="noise-aware"))
        row["t_noise_aware"] = round(time.perf_counter() - t, 2)
        row["added_peak_gb"] = round((tracemalloc.get_traced_memory()[1] - base) / 1e9, 3)
        tracemalloc.stop()
    except Exception as e:  # noqa: BLE001
        row["error"] = f"develop: {type(e).__name__}: {e}"[:200]
        return row
    row["mp"], row["cfa"], row["used"] = round(w * h / 1e6, 2), rep.cfa, rep.demosaic
    row["sha256"] = hashlib.sha256(bytes(px)).hexdigest()
    if keep is not None:
        import numpy as np

        keep.mkdir(parents=True, exist_ok=True)
        np.save(keep / f"{path.parent.name}__{path.stem}.npy", np.frombuffer(bytes(px), dtype=np.uint16).reshape(h, w, 3))
    return row


def codes(old_dir: Path, new_dir: Path) -> None:
    """Per kept output: the share of 16-bit codes that differ, the largest difference, and the PSNR between the
    two (on the 0-65535 scale; inf when identical)."""

    import numpy as np

    print("| file | codes differing | share | max diff | PSNR dB |")
    print("|---|---|---|---|---|")
    for f in sorted(old_dir.glob("*.npy")):
        g = new_dir / f.name
        if not g.exists():
            continue
        a, b = np.load(f).astype(np.int32), np.load(g).astype(np.int32)
        d = np.abs(a - b)
        n = int((d > 0).sum())
        mse = float((d.astype(np.float64) ** 2).mean())
        psnr = float("inf") if mse == 0 else 10 * np.log10(65535.0 ** 2 / mse)
        print(f"| {f.stem.replace('__', '/')} | {n:,} of {d.size:,} | {n / d.size:.2e} | {int(d.max())} | {psnr:.1f} |")


def compare(old_path: Path, new_path: Path) -> None:
    old = {r["file"]: r for r in map(json.loads, old_path.read_text().splitlines()) if "error" not in r}
    new = {r["file"]: r for r in map(json.loads, new_path.read_text().splitlines()) if "error" not in r}
    print("| file | MP | CFA | noise-aware s, old | new | speed-up | added peak GB, old | new | per MP, new | same bytes |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    same = 0
    for f in sorted(old, key=lambda k: -old[k]["mp"]):
        if f not in new:
            continue
        o, n = old[f], new[f]
        eq = o["sha256"] == n["sha256"]
        same += eq
        print(f"| {f} | {n['mp']:.1f} | {n['cfa']} | {o['t_noise_aware']:.2f} | {n['t_noise_aware']:.2f} | "
              f"{o['t_noise_aware'] / n['t_noise_aware']:.2f}x | {o['added_peak_gb']:.2f} | {n['added_peak_gb']:.2f} | "
              f"{n['added_peak_gb'] / n['mp']:.3f} | {'yes' if eq else 'no'} |")
    both = [f for f in old if f in new]
    print(f"\n{same} of {len(both)} outputs byte-identical")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--compare"]:
        compare(Path(args[1]), Path(args[2]))
    elif args[:1] == ["--codes"]:
        codes(Path(args[1]), Path(args[2]))
    else:
        keep, peaks = None, False
        while args[:1] in (["--keep"], ["--peaks"]):
            if args[0] == "--peaks":
                peaks, args = True, args[1:]
            else:
                keep, args = Path(args[1]), args[2:]
        for a in args:
            print(json.dumps(one(Path(a), keep, peaks)), flush=True)
