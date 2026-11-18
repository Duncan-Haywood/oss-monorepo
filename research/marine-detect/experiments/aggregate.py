"""Collect experiments/runs/*.json into experiments/results.txt (mean and 95% t-interval over seeds).

    python3 experiments/aggregate.py > experiments/results.txt
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
T95 = {1: float("nan"), 2: 12.706, 3: 4.303, 4: 3.182, 5: 2.776}
MODELS = ["pixel-clean", "lraspp-clean", "lraspp-aug"]
AREA = (0, 8, 16, 32, 64, 256, 10 ** 9)
DROWS = (-10 ** 9, 5, 10, 20, 40, 10 ** 9)
CONDS = ["fog t=1.0", "fog t=0.7", "fog t=0.5", "fog t=0.3", "fog t=0.15", "glint g=0.3", "glint g=0.6", "glint g=0.9"]


def ms(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if not xs:
        return float("nan"), float("nan")
    m = sum(xs) / len(xs)
    if len(xs) < 2:
        return m, float("nan")
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))
    return m, T95.get(len(xs), 2.0) * sd / math.sqrt(len(xs))


def main():
    runs = defaultdict(list)
    for f in sorted((HERE / "runs").glob("*.json")):
        r = json.loads(f.read_text())
        runs[r["model"]].append(r)
    any_r = next(iter(runs.values()))[0]
    print("marine-detect milestone 9a: MaSTr1325, block split "
          f"(train {any_r['n_train']}, test {any_r['n_test']} frames), {any_r['size'][0]}x{any_r['size'][1]}")
    print("seeds per model: " + ", ".join(f"{m} {len(runs[m])}" for m in MODELS if m in runs))
    print("values: mean +- 95% t-interval half-width over seeds")
    print()
    for key, label in [("miou", "mIoU (obstacle, water, sky)"), ("iou_obstacle", "obstacle IoU"),
                       ("recall", "floating-obstacle recall (>=50% of pixels found)"),
                       ("false_alarms_per_frame", "false alarms per frame (obstacle blobs >= 4 px on water)")]:
        print(f"== {label}")
        print("condition".ljust(14) + "".join(m.rjust(22) for m in MODELS if m in runs))
        for c in CONDS:
            row = c.ljust(14)
            for m in MODELS:
                if m not in runs:
                    continue
                mu, hw = ms([r["conditions"][c][key] for r in runs[m]])
                row += f"{mu:.3f} +- {hw:.3f}".rjust(22)
            print(row)
        print()
    for lo, hi, lab in [(16, 10 ** 9, "at least 16 px (41 px at 512x384)"), (0, 16, "under 16 px: distant buoys and swimmers, and fragments of thin structures")]:
        n = sum(1 for o in any_r["conditions"]["fog t=1.0"]["objects"] if lo <= o[1] < hi)
        print(f"== floating-obstacle recall, objects {lab} (n = {n})")
        print("condition".ljust(14) + "".join(m.rjust(22) for m in MODELS if m in runs))
        for c in CONDS:
            row = c.ljust(14)
            for m in MODELS:
                if m not in runs:
                    continue
                vals = []
                for r in runs[m]:
                    sel = [o[2] for o in r["conditions"][c]["objects"] if lo <= o[1] < hi]
                    vals.append(sum(sel) / len(sel) if sel else None)
                mu, hw = ms(vals)
                row += f"{mu:.3f} +- {hw:.3f}".rjust(22)
            print(row)
        print()
    hz = json.loads((HERE / "horizon_rows.json").read_text())["water_edge_row"]
    for title, fn, bins in [
        ("area (pixels at 320x240; multiply by 2.56 for the 512x384 originals)", lambda o: o[1], AREA),
        ("rows between the obstacle's waterline and the frame's water edge (small = far)",
         lambda o: o[4] - hz[o[0]], DROWS),
    ]:
        print(f"== floating-obstacle recall by {title}")
        for c in ["fog t=1.0", "fog t=0.5", "fog t=0.15", "glint g=0.9"]:
            print(f"-- {c}")
            print("bin".ljust(12) + "n".rjust(6) + "".join(m.rjust(22) for m in MODELS if m in runs))
            objs0 = any_r["conditions"][c]["objects"]
            for lo, hi in zip(bins[:-1], bins[1:]):
                n = sum(1 for o in objs0 if lo <= fn(o) < hi)
                row = (f"<{hi}" if lo < -10 ** 8 else f"{lo}-{hi}" if hi < 10 ** 8 else f">={lo}").ljust(12) + str(n).rjust(6)
                for m in MODELS:
                    if m not in runs:
                        continue
                    vals = []
                    for r in runs[m]:
                        sel = [o[2] for o in r["conditions"][c]["objects"] if lo <= fn(o) < hi]
                        vals.append(sum(sel) / len(sel) if sel else None)
                    mu, hw = ms(vals)
                    row += f"{mu:.3f} +- {hw:.3f}".rjust(22)
                print(row)
            print()
    print("train seconds (4 CPU cores): " + ", ".join(
        f"{m} {sum(r['train_seconds'] for r in runs[m]) / len(runs[m]):.0f}" for m in MODELS if m in runs))


if __name__ == "__main__":
    main()
