"""Post hoc (not registered), milestone 44: why the per-pose preload leaves 0.17 mm at H1 (1.4 m, -0.15 m).

For beta in {0, 0.25, 0.5, 0.9} and hose drag H in {0, 5} N ('braked', |e| 0.2 N, S 10 N, every hose direction and
sensor axis, milestone 41's sweep): the worst residual along the wall at each of the two poses separately, how many
cases have a plan, and, at the worst case, how many moving joints flip between the planned and the settled torques
(milestone 37's mechanism: a joint whose torque crosses the friction band takes up its gear backlash) by kind.
Writes posthoc.txt. Imports run.py (about 100 s)."""
import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m44", os.path.join(HERE, "run.py"))
R = importlib.util.module_from_spec(spec)
sys.modules["m44"] = R
spec.loader.exec_module(R)
M1 = R.M1


def task(args):
    beta, H = args
    R.set_beta(beta)
    M1.GAPR = R.R43.gaps(M1, "h1", "braked")
    best = {k: None for k in R.DROPPED}
    n_ok = {k: 0 for k in R.DROPPED}
    n_all = 0
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for a in M1.AXES:
            e = R.B_E * a
            rg = M1.residuals("h1", H, phi, e, R.S_STAR)
            n_all += 1
            for k in R.DROPPED:
                if k in rg:
                    n_ok[k] += 1
                    y = abs(rg[k]["y"][0]) / M1.MM
                    if best[k] is None or y > best[k][0]:
                        best[k] = (y, phi, e)
    rows = []
    for k in R.DROPPED:
        if best[k] is None:
            rows.append((k, None, n_ok[k], n_all, None))
            continue
        y, phi, e = best[k]
        ta, tp = M1.plan(k, M1.hose_f(k, H, phi), e, R.S_STAR)[:2]
        cnt = {"hold": 0, "leg": 0, "waist": 0, "arm": 0}
        for j in np.flatnonzero(M1.PL.flips(ta, tp, M1.TAUF) & M1.POSE[k].rows[2]):
            cnt[M1.kind("h1", j)] += 1
        rows.append((k, (y, round(math.degrees(phi))), n_ok[k], n_all, cnt))
    return beta, H, rows


if __name__ == "__main__":
    jobs = [(b, H) for H in (0.0, 5.0) for b in R.BETAS]
    with M1.mp.get_context("fork").Pool(4) as pool:
        res = pool.map(task, jobs, chunksize=1)
    L = ["Worst residual along the wall at each of the two poses ('braked', |e| 0.2 N, S 10 N): beta | H (N) | pose | "
         "m_k (N m) | worst |y| (mm, at phi) | cases with a plan | flipped moving joints at the worst case "
         "(hold/leg/waist/arm)"]
    for beta, H, rows in res:
        R.set_beta(beta)
        for k, w, ok, na, cnt in rows:
            L.append(f"  {beta:4.2f} | {H:4.1f} | {list(k[1:])} | {R.MLEG.get(k, R.M_SPEC):.4f} | "
                     + ("-" if w is None else f"{w[0]:.3f} (phi {w[1]})") + f" | {ok} of {na} | "
                     + ("-" if cnt is None else "/".join(str(cnt[x]) for x in ("hold", "leg", "waist", "arm"))))
    open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
