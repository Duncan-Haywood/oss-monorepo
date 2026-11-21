"""Step 4c post hoc (written after the score): why does the consistency step not help? Per method at -10 dB:
the pairwise failure share, how often the anchor's other pairs fail when one does (against the marginal, i.e.
independence), and the share of failures that are near misses (under 100 ms off, which least squares can average
into a closed loop). Also the step's session-bootstrap bounds at three decimals.

    python experiments/baselines/consistency_why.py <windows_4c.npz>   # writes consistency_why.txt
"""
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import consistency as C  # noqa: E402

r = np.load(sys.argv[1])["rows"]
out = []
for rt in C.ROOMS:
    out.append(f"== RT60 {rt} s, -10 dB, ten types pooled ==")
    m = (r[:, 0] == rt) & (r[:, 4] == -10.0) & (r[:, 3] >= 0)
    g = r[m]
    key = g[:, 1] * 100 + g[:, 3]
    for k, name in enumerate(C.METHODS):
        e = g[:, 7 + 2 * k]
        bad = ~(np.abs(e) <= C.FRAME)
        near = np.mean((np.abs(e[bad]) < 0.1)) if bad.any() else float("nan")
        # anchor pairs (0,1), (0,2), (0,3) per (trial, type)
        cond, marg = [], float(bad.mean())
        by = {}
        for kk, i, j, b in zip(key, g[:, 5], g[:, 6], bad):
            by.setdefault(kk, {})[(int(i), int(j))] = b
        for d in by.values():
            a = [d[(0, 1)], d[(0, 2)], d[(0, 3)]]
            for x, y in itertools.permutations(range(3), 2):
                if a[x]:
                    cond.append(a[y])
        allfail = np.mean([all(d.values()) for d in by.values()])
        out.append(f"  {name:8s} pair fail {marg:.3f}  P(other anchor pair fails | one does) {np.mean(cond):.3f}  "
                   f"all six pairs fail {allfail:.3f} (independent: {marg ** 6:.4f})  near misses (<100 ms) among failures {near:.3f}")
out.append("")
d = C.place(sys.argv[1])
bad = {k: ~(np.abs(v) <= C.FRAME) for k, v in d.items() if "|" in k and not k.endswith("flag")}
sess = d["sess"].astype(int)
for rt in C.ROOMS:
    mk = (d["rt"] == rt) & (d["snr"] == -10.0) & (d["type"] >= 0)
    def s10(key, ix):
        tot = 0.0
        for ti in range(len(C.TYPES)):
            w = mk & (d["type"] == ti)
            nb = np.array([bad[key][w & (sess == s)].sum() for s in range(10)])
            nn = np.array([(w & (sess == s)).sum() for s in range(10)])
            tot += nb[ix].sum() / nn[ix].sum()
        return tot
    rng = np.random.default_rng(7)
    bs = {"fn direct-trim": [], "fn direct-mst": []}
    for _ in range(2000):
        ix = rng.integers(0, 10, 10)
        fd = s10("fn|direct", ix)
        bs["fn direct-trim"].append(fd - s10("fn|trim", ix))
        bs["fn direct-mst"].append(fd - s10("fn|mst", ix))
    for k, v in bs.items():
        q = np.percentile(v, [2.5, 50, 97.5])
        out.append(f"RT60 {rt} s bootstrap {k}: {q[1]:.3f} [{q[0]:.3f}, {q[2]:.3f}]")
out.append("")
out.append("Flagged failures: among (trial, type) cells at -10 dB where trim flags devices 1-3 and at least one is off,")
out.append("the share where all three are off by the same error (within a frame of each other): the anchor's own window")
out.append("jumped, which shifts every anchor pair alike and closes every loop, so no closure check can see it.")
for rt in C.ROOMS:
    mk = (d["rt"] == rt) & (d["snr"] == -10.0) & (d["type"] >= 0)
    cells = []
    for name in C.METHODS:
        e = d[f"{name}|trim"][mk].reshape(-1, 3)
        f = d[f"{name}|flag"][mk].reshape(-1, 3).astype(bool)
        b = ~(np.abs(e) <= C.FRAME)
        sel = f.all(1) & b.any(1)
        shift = b.all(1) & (np.nanmax(e, 1) - np.nanmin(e, 1) <= C.FRAME)
        cells.append(f"{name} {int(sel.sum())} cells, anchor shift {float(shift[sel].mean()) if sel.any() else float('nan'):.3f}")
    out.append(f"RT60 {rt} s: " + "; ".join(cells))
out.append("")
out.append("Node shifts, any device: among flagged-but-failed devices at -10 dB, the share where some device k (any of 0-3)")
out.append("has all three of its pairs off by the same lag (signed so it shifts k, within a frame of each other, more than")
out.append("a frame from 0). Such a shift is a consistent solution, so loop closure cannot see it.")
for rt in C.ROOMS:
    m = (r[:, 0] == rt) & (r[:, 4] == -10.0) & (r[:, 3] >= 0)
    g = r[m]
    grp = {}
    for row in g:
        grp.setdefault((row[1], row[3]), []).append(row)
    cells = []
    for k, name in enumerate(C.METHODS):
        nflag = nshift = 0
        for kk, rows in grp.items():
            est = np.full((C.NDEV, C.NDEV), np.nan)
            for row in rows:
                est[int(row[5]), int(row[6])] = row[7 + 2 * k]
            t, flag, _ = C.CS.trim(est, C.FRAME)
            failed = flag[1:] & ~(np.abs(t[1:]) <= C.FRAME)
            if not failed.any():
                continue
            nflag += int(failed.sum())
            shifted = False
            for dv in range(C.NDEV):
                v = [est[i, dv] for i in range(dv)] + [-est[dv, j] for j in range(dv + 1, C.NDEV)]
                v = np.array(v)
                if np.all(np.isfinite(v)) and v.max() - v.min() <= C.FRAME and abs(v.mean()) > C.FRAME:
                    shifted = True
            nshift += int(failed.sum()) if shifted else 0
        cells.append(f"{name} {nflag} devices, node shift {nshift / max(nflag, 1):.3f}")
    out.append(f"RT60 {rt} s: " + "; ".join(cells))
open(os.path.join(HERE, "consistency_why.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
