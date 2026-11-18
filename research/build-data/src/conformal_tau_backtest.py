"""Milestone 23 analysis (H2g): choose the tau pair with a one-year backtest.

  python3 src/conformal_tau_backtest.py [city ...] [--i2c]    (default: chicago sf; session 28 adds austin)

Reads results/conformal_tau_drift_{city}_a2i_{Y}.json (written by conformal_tau_drift_run.py, full grids).
For test year Y a pair is eligible if (a) its calibration coverage in Y is >= 0.78 (the session 23 rule) and
(b) its realised TEST coverage in the previous test year Y-1 (same procedure, one year earlier) was >= 0.77.
The narrowest eligible pair by calibration width is chosen; with none eligible it falls back to (0.1, 0.9).
Caveat: at the start of Y, the outcomes of slow permits issued late in Y-1 are not all known, so (b) is
slightly optimistic about what a user could compute; it is disclosed, not corrected.
"""
import json, os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
import sys
TARGET = "i2c" if "--i2c" in sys.argv else "a2i"
CITIES = tuple(a for a in sys.argv[1:] if not a.startswith("--")) or ("chicago", "sf")
YEARS = (2022, 2023, 2024)


def load(c, y):
    return json.load(open(os.path.join(R, f"conformal_tau_drift_{c}_{TARGET}_{y}.json")))["grid"]


def choose(G, prev, thr_cal=0.78, thr_prev=0.77):
    ok = {k: v for k, v in G.items() if v["cal_coverage"] >= thr_cal and prev[k]["test_coverage"] >= thr_prev}
    return (min(ok, key=lambda k: ok[k]["cal_width"]), True) if ok else ("0.1_0.9", False)


if __name__ == "__main__":
    inside = narrow = 0
    for c in CITIES:
        for y in YEARS:
            G, prev = load(c, y), load(c, y - 1)
            k, found = choose(G, prev)
            v, ref = G[k], G["0.1_0.9"]
            gain = 1 - v["test_width"] / ref["test_width"]
            i, n = 0.77 <= v["test_coverage"] <= 0.83, gain >= 0.15
            inside += i; narrow += n
            print(f"{c} {TARGET} {y} pair {k}{'' if found else ' (fallback)'} cov {v['test_coverage']:.3f} "
                  f"[{v['test_lo']:.3f},{v['test_hi']:.3f}] w {v['test_width']:.1f} vs ref {ref['test_width']:.1f} "
                  f"({gain:+.0%}) inside={i} narrower15={n}")
    print("inside 77-83%:", inside, "of", len(CITIES) * 3, "; narrower by 15%:", narrow, "of", len(CITIES) * 3)
