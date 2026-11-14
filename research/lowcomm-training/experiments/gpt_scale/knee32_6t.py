"""Milestone 6t: is the size-2 compression curve at H = 32 between H = 16's line (6s) and H = 64's hinge (6r)?
Paired excess of rand-k over uncompressed at H = 32 for keep 1/8, 1/16, 1/32 (omega 7, 15, 31), scored against the
hypotheses registered in LOG.md before the runs (written before the runs). Reads scale.jsonl; no training.
Usage: python3 knee32_6t.py"""
import math
from knee16_6s import cells, fit, boot_w0, GRID

if __name__ == "__main__":
    h16 = cells(16, (0.25, 0.125, 0.0625, 1 / 32))
    h32 = cells(32, (0.125, 0.0625, 1 / 32))
    h64 = cells(64, (0.25, 0.125, 1 / 12, 0.0625, 1 / 32))
    get = lambda pts, o: next((p for p in pts if p[0] == o), None)
    res = {}
    for o in (7, 31):
        a, m, b = get(h16, o), get(h32, o), get(h64, o)
        if not m: print(f"omega {o}: H 32 cell missing"); continue
        lo, hi = sorted((a[1], b[1]))
        between = math.isfinite(m[1]) and lo < m[1] < hi
        interp = (a[1] + b[1]) / 2  # H = 32 is the log2 midpoint of 16 and 64
        se = (m[2] ** 2 + (a[2] ** 2 + b[2] ** 2) / 4) ** .5
        z = (m[1] - interp) / se if math.isfinite(m[1]) else float("inf")
        res[o] = (between, abs(z) <= 2)
        print(f"\nomega {o}: H16 {a[1]:+.4f}  H32 {m[1]:+.4f} (se {m[2]:.4f})  H64 {b[1]:+.4f};  log-H midpoint {interp:+.4f}, "
              f"H32 minus midpoint {m[1]-interp:+.4f} ({z:+.1f} se)")
    if 7 in res: print(f"\nH6t-i   (omega 7 at H 32 strictly between H 16 and H 64): {'held' if res[7][0] else 'refuted'}")
    if 31 in res: print(f"H6t-ii  (omega 31 at H 32 strictly between H 16 and H 64): {'held' if res[31][0] else 'refuted'}")
    if len(res) == 2: print(f"H6t-iii (both cells within 2 se of the log-H midpoint): {'held' if res[7][1] and res[31][1] else 'refuted'}")
    if len(h32) == 3 and all(math.isfinite(m) for _, m, _ in h32):
        print("\nH 32 three-cell fits (chi2, a, p):")
        for fm in GRID:
            chi, a, p = fit(fm, h32); print(f"  {fm:7s} chi2 {chi:7.2f} a {a:.6f} p {p:5.2f}")
        for H, pts in ((16, h16), (32, h32), (64, h64)):
            l, md, h = boot_w0(pts); print(f"hinge w0 bootstrap 2.5/50/97.5 at H {H}: {l}/{md}/{h}")
