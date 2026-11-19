"""The decision rule of eval/auto-noise-aware-2026-11-19.md, applied to its rows: should `--demosaic auto` pick
noise-aware? Prints each test with its number and PASS/FAIL, then the verdict.

    python tools/auto_noise_aware_rule.py \
        --quality eval/noise-card-floor-cap-2026-11-18.jsonl eval/noise-card-floor-fresh-cap-2026-11-18.jsonl \
                  eval/noise-card-floor-fourth-cap-2026-11-18.jsonl \
        --cost eval/auto-noise-aware-cost-2026-11-19.jsonl

Quality rows are the 2026-11-18 sweeps' (`D` directional against `pcaguard@0.8`, what noise-aware ships for a raw
with no NoiseProfile); cost rows are ``tools/noise_aware_cost.py --peaks`` output. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

ARM, BASE = "pcaguard@0.8", "D"


def quality(paths: list[Path]) -> list[tuple[str, bool, str]]:
    cells: dict[tuple, list] = defaultdict(list)
    rows = 0
    lose = 0
    lose_by_set: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    win200 = lose200 = 0
    for p in paths:
        for line in p.read_text().splitlines():
            r = json.loads(line)
            gl = r["lpsnr"][ARM] - r["lpsnr"][BASE]
            gc = r["cpsnr"][ARM] - r["cpsnr"][BASE]
            cells[(p.name, r["snr"], r["scenario"])].append((gl, gc))
            rows += 1
            bad = min(gl, gc) < -0.1
            lose += bad
            lose_by_set[p.name][0] += bad
            lose_by_set[p.name][1] += 1
            if r["snr"] == 200.0:
                win200 += gl > 0.1
                lose200 += bad
    worst_cell = min(min(sum(g[0] for g in v) / len(v), sum(g[1] for g in v) / len(v)) for v in cells.values())
    per_set = ", ".join(f"{k}: {a} of {n} ({a / n:.2%})" for k, (a, n) in sorted(lose_by_set.items()))
    return [
        ("q1 mean luma and colour gain > 0 in every set x SNR x scenario cell", worst_cell > 0,
         f"{len(cells)} cells, lowest cell mean {worst_cell:+.3f} dB"),
        ("q2 at most 1% of rows lose over 0.1 dB", lose <= 0.01 * rows,
         f"{lose} of {rows} ({lose / rows:.2%}); per set {per_set}"),
        ("q3 at SNR 200, wins over 0.1 dB luma >= 5x losses over 0.1 dB", win200 >= 5 * lose200,
         f"{win200} wins, {lose200} losses ({win200 / max(lose200, 1):.1f} to 1)"),
    ]


def cost(path: Path) -> list[tuple[str, bool, str]]:
    ok = [r for r in map(json.loads, path.read_text().splitlines()) if "error" not in r]
    tr = statistics.median(r["t_noise_aware"] / r["t_directional"] for r in ok)
    add = statistics.median((r["t_noise_aware"] - r["t_directional"]) / r["mp"] for r in ok)
    mr = [r["added_peak_gb"] / r["added_peak_gb_directional"] for r in ok]
    return [
        ("c1 median time <= 1.5x directional and added time <= 0.1 s per MP", tr <= 1.5 and add <= 0.1,
         f"{len(ok)} files, {tr:.2f}x, {add:.3f} s per MP"),
        ("c2 median added peak <= 1.5x directional's, none over 2x", statistics.median(mr) <= 1.5 and max(mr) <= 2,
         f"median {statistics.median(mr):.3f}x, max {max(mr):.3f}x"),
    ]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--quality", nargs="+", type=Path, required=True)
    ap.add_argument("--cost", type=Path, required=True)
    a = ap.parse_args(argv)
    tests = quality(a.quality) + cost(a.cost)
    for name, ok, detail in tests:
        print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")
    passed = all(ok for _, ok, _ in tests)
    print("verdict:", "auto picks noise-aware" if passed else "auto stays directional")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
