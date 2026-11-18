"""Which card floor to cap on, read from ``sweep --features-only`` rows alone (no demosaic, no PSNR).

For each floor statistic (the lowest scene, the second-lowest, the median scene; the latter two on cards of
three or more kept scenes, the lowest elsewhere), with and without dividing each frame's reading by its own
white-balance noise factor first (``pre``: the row's ``true18``, which within one card, SNR and scenario differs
only by the frame's as-shot gains), and for each cap scale s, it counts the rows where ``s x floor`` would bind
on what ships (``pca18 x 0.8``) and splits them: ``ok`` where the capped sigma stays at or above 0.8 of the truth,
``low`` where it falls below (the cap then removes gain the frame would have had). It also prints the median of
floor / truth per scenario and SNR. eval/noise-card-floor-rank-2026-11-18.md reads it on the two seen sets.

Usage (from ``ventures/photo-editing``)::

    python tools/card_floor_ranks.py eval/noise-card-floor-feats-2026-11-18.jsonl eval/noise-card-floor-fresh-feats-2026-11-18.jsonl
"""

from __future__ import annotations

import collections
import json
import sys

import numpy as np


def floor_of(scenes: dict, stat: str, pre: bool) -> float:
    m = sorted(min(t["feat"]["pca18"] / (t["true18"] if pre else 1.0) for t in ts) for ts in scenes.values())
    if stat == "min" or len(m) < 3:
        return m[0]
    return m[1] if stat == "2nd" else float(np.median(m))


def main(argv=None) -> int:
    paths = argv if argv is not None else sys.argv[1:]
    rows = [json.loads(line) for p in paths for line in open(p)]
    rows = [r for r in rows if "feat" in r and r["feat"].get("pca18")]
    by: dict = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in rows:
        by[(r["card"], r["snr"], r["scenario"])][r["file"]].append(r)
    print("stat pre s | binds ok, binds low (< 0.8 x truth) | median floor / truth by scenario and SNR")
    for pre in (False, True):
        for stat in ("min", "2nd", "med"):
            for s in (1.25, 1.5, 2.0):
                ok = low = 0
                ratios = collections.defaultdict(list)
                for (_, snr, sc), scenes in by.items():
                    fl = floor_of(scenes, stat, pre)
                    for ts in scenes.values():
                        for t in ts:
                            f = fl * (t["true18"] if pre else 1.0)
                            ratios[(sc, snr)].append(f / t["true18"])
                            if t["feat"]["pca18"] * 0.8 > s * f:
                                if s * f < 0.8 * t["true18"]:
                                    low += 1
                                else:
                                    ok += 1
                med = " ".join(f"{a}{b:g}:{np.median(v):.2f}" for (a, b), v in sorted(ratios.items()))
                print(f"{stat} {int(pre)} {s:g} | {ok} {low} | {med}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
