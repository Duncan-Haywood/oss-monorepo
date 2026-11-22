"""Does develop's frame noise read change when the border outside the camera's crop is left out? (2026-11-22)

``develop`` reads ``--noise-from-frame`` (``xtrans_demosaic.frame_noise``) from the mosaic of the whole
ActiveArea. shootflow's ORF, RW2, ARW, SRW and PEF readers keep the whole sensor as the ActiveArea and put the
camera's picture in DefaultCrop, so on those files the read also sees the border: masked sensels, zero fill and
lit edge lines (eval/optical-black-shootflow-readers-2026-11-22.md). For each raw with a DefaultCrop smaller
than its ActiveArea, this fits the patch-PCA model with develop's Bayer default (``eig="mpcw"``) on both areas
of the normalised mosaic and reports sigma at 1%, 10% and 50% of white under each.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/frame_noise_crop_area.py FILES... > rows.jsonl
    python tools/frame_noise_crop_area.py --summary rows.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np

LEVELS = (0.01, 0.1, 0.5)


def _sigma(shot: float, read: float, level: float) -> float:
    return math.sqrt(max(shot * level + read, 0.0))


def row_for(path: str, eig: str = "mpcw") -> dict:
    from optical_black_floor import _shootflow_sensor

    from shootflow.noise_pca import estimate_noise_pca

    name = path.rsplit("/", 1)[-1]
    got = _shootflow_sensor(path)
    if isinstance(got, str):
        return {"file": name, "skipped": got}
    raw, _colors, black, white, active, crop, pat, source, _lin = got
    if crop is None:
        return {"file": name, "reader": source, "skipped": "no DefaultCrop inside the ActiveArea"}
    span = white - black
    out = {"file": name, "reader": source, "active": active, "crop": crop}
    # control: the crop inset on all sides until it loses the border's share of the active area, so a shift
    # the border causes can be told from the estimator's own spread over a smaller sample of the picture
    share = 1 - (crop[2] * crop[3]) / (active[2] * active[3])
    k = math.sqrt(1 - share)
    ih, iw = int(crop[2] * k) // 2 * 2, int(crop[3] * k) // 2 * 2
    inset = (crop[0] + (crop[2] - ih) // 4 * 2, crop[1] + (crop[3] - iw) // 4 * 2, ih, iw)
    out["inset"] = inset
    for key, (t, l, h, w) in (("active", active), ("crop", crop), ("inset", inset)):
        dy, dx = (t - active[0]) % 2, (l - active[1]) % 2
        p = tuple(pat[((y + dy) % 2) * 2 + (x + dx) % 2] for y in range(2) for x in range(2))
        c = (raw[t : t + (h // 2) * 2, l : l + (w // 2) * 2].astype(np.float64) - black) / span
        shot, read = estimate_noise_pca(c, p, eig=eig)
        out[f"shot_{key}"], out[f"read_{key}"] = shot, read
    for lv in LEVELS:
        a = _sigma(out["shot_active"], out["read_active"], lv)
        b = _sigma(out["shot_crop"], out["read_crop"], lv)
        i = _sigma(out["shot_inset"], out["read_inset"], lv)
        out[f"ratio_{lv:g}"] = a / b if b > 0 else None
        out[f"control_{lv:g}"] = i / b if b > 0 else None
    return out


def summary(path: str) -> int:
    rows = [json.loads(line) for line in open(path) if line.strip()]
    ok = [r for r in rows if "skipped" not in r]
    print(f"{len(ok)} raws with a crop inside the ActiveArea, {len(rows) - len(ok)} skipped")
    if not ok:
        return 0
    print()
    print("| file | reader | border share | sigma active / crop at 1% | at 10% | at 50% | control (inset / crop) at 1% | at 10% | at 50% |")
    print("|---|---|---:|---:|---:|---:|---:|---:|---:|")
    for r in sorted(ok, key=lambda r: -abs(math.log(r["ratio_0.1"] or 1e-9))):
        at, ct = r["active"], r["crop"]
        share = 1 - (ct[2] * ct[3]) / (at[2] * at[3])
        cells = " | ".join(f"{r[f'ratio_{lv:g}']:.2f}" if r[f"ratio_{lv:g}"] else "-" for lv in LEVELS)
        ctrl = " | ".join(f"{r[f'control_{lv:g}']:.2f}" if r.get(f"control_{lv:g}") else "-" for lv in LEVELS)
        print(f"| {r['file']} | {r['reader']} | {share:.1%} | {cells} | {ctrl} |")
    for key in ("ratio", "control"):
        for lv in LEVELS:
            v = np.array([r[f"{key}_{lv:g}"] for r in ok if r.get(f"{key}_{lv:g}")])
            print(f"{key} at {lv:g} of white: median {np.median(v):.3f}, |log| median {np.median(np.abs(np.log(v))):.3f}, "
                  f"off by over 5%: {int((np.abs(v - 1) > 0.05).sum())} of {len(v)}, over 20%: {int((np.abs(v - 1) > 0.2).sum())}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="*")
    ap.add_argument("--summary", metavar="ROWS")
    ap.add_argument("--eig", default="mpcw", help="noise_pca eigenvalue read (develop's Bayer default: mpcw)")
    args = ap.parse_args(argv)
    if args.summary:
        return summary(args.summary)
    for p in args.files:
        try:
            rec = row_for(p, eig=args.eig)
        except Exception as exc:  # noqa: BLE001
            rec = {"file": p.rsplit("/", 1)[-1], "skipped": f"{type(exc).__name__}: {exc}"}
        print(json.dumps(rec), flush=True)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    sys.exit(main())
