"""Milestone 2a: a simulated Cusick drape test on the 3D sheet, and whether its drape coefficient
can calibrate bending rigidity.

    python3 experiments/m2_cusick/run.py     (about 25 min on 4 cores; needs numpy)

Milestone 2 asks for the sheet's drape coefficient (DC) against a published table of DC with B and
W for the same fabrics. This session's network could not reach any host holding such a table
(LOG.md, 2026-11-11), so this step builds and characterises the test itself, on the four
`hanger-kes` fabrics (B, W measured, KES-FB) and sweeps around them: what DC the model predicts,
how much of it is solver and seed noise, and which inputs move it. That decides whether DC can be
milestone 4's calibration target for B (the proposal's Method, step 3) before a table is found.

Each case is solved in chunks of 2000 L-BFGS iterations until DC moves under 0.001 over a chunk
(milestone 1b's lesson: stop on the decision quantity, not an iteration cap), up to 40,000.
The seed sets the random out-of-plane noise that picks where the folds form.

Predictions, written before the first run (programme LOG.md, 2026-11-11, milestone 2a):
  C1  Mean DC (5 seeds, EA 150 N/m) orders the fabrics as their bending length c = (B/w)^(1/3):
      A < B < C < D. Refuted by any other order.
  C2  Seed spread: the standard deviation of DC over 5 seeds is at most 0.02 on every fabric.
  C3  Identifiability: at each fabric's W, the 3-seed mean DC rises strictly over B x 1/4, 1/2,
      1, 2, 4, and every doubling of B moves it by at least 3 times that fabric's seed standard
      deviation. Refuted by any non-monotone step or smaller step.
  C4  Collapse: multiplying B and W both by 4 (c unchanged) moves the 3-seed mean DC by under
      0.02 on every fabric. Refuted by a larger move.
  C5  Stretch: EA 40 against 800 N/m moves the 3-seed mean DC by under 0.03 on every fabric.
  C6  Shear: the diagonal spring at 0.03 against 0.3 of EA moves the 3-seed mean DC by at least
      0.03 on at least one fabric (Cusick's finding that shear stiffness matters to drape).
      Refuted if it moves under 0.03 on all four.
  C7  Mesh: 7.5 mm against 5 mm grid moves the 3-seed mean DC by under 0.03 on every fabric.
"""
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
R = HERE.parents[2]
sys.path.insert(0, str(R / "hanger-kes" / "src"))
import cusick  # noqa: E402
from hanger_kes.kes import KES  # noqa: E402

EA = 150.0
FABRICS = sorted(KES)
SEEDS5, SEEDS3 = range(5), range(3)
BFAC = [0.25, 0.5, 2.0, 4.0]


def cases():
    out = []
    for f in FABRICS:
        for s in SEEDS5:
            out.append(("base", f, 1.0, 1.0, EA, cusick.SHEAR, 0.005, s))
        for s in SEEDS3:
            for k in BFAC:
                out.append(("B", f, k, 1.0, EA, cusick.SHEAR, 0.005, s))
            out.append(("scale4", f, 4.0, 4.0, EA, cusick.SHEAR, 0.005, s))
            for ea in (40.0, 800.0):
                out.append(("EA", f, 1.0, 1.0, ea, cusick.SHEAR, 0.005, s))
            for sh in (0.03, 0.3):
                out.append(("shear", f, 1.0, 1.0, EA, sh, 0.005, s))
            out.append(("mesh", f, 1.0, 1.0, EA, cusick.SHEAR, 0.0075, s))
    return out


def solve(case):
    tag, f, kb, kw, ea, sh, h, seed = case
    _, B, W = KES[f]
    t = time.time()
    r = cusick.drape(B * kb, W * kw, ea, seed=seed, h=h, shear=sh)
    keep = tag == "base" and seed == 0
    return case, dict(dc=r["dc"], iters=r["iters"], last=r["last_change"], gmax=r["gmax"],
                      nodes=r["nodes"], drop=r["drop"], sec=time.time() - t, X=r["X"] if keep else None)


def main():
    P = mp.Pool()
    res = dict(P.map(solve, cases(), chunksize=1))
    out = ["hanger-codesign milestone 2a: simulated Cusick drape test (18 cm disc, 30 cm specimen).",
           f"3D sheet, grid 5 mm, isotropic bending, shear spring {cusick.SHEAR} x EA, EA {EA:g} N/m unless stated;",
           "solve: L-BFGS chunks of 2000 until DC moves < 0.001 per chunk (cap 40,000).", "",
           "fabric B(gf.cm2/cm) W(mg/cm2) c(cm)"]
    for f in FABRICS:
        _, B, W = KES[f]
        out.append(f"{f} {B} {W} {cusick.bending_length(B, W):.3f}")

    def m(tag, f, kb=1.0, kw=1.0, ea=EA, sh=cusick.SHEAR, h=0.005, seeds=SEEDS3):
        v = [res[(tag, f, kb, kw, ea, sh, h, s)]["dc"] for s in seeds]
        return float(np.mean(v)), v

    out += ["", "1. base cases (5 seeds)", "fabric seed DC iters last_change gmax nodes drop_cm sec"]
    for f in FABRICS:
        for s in SEEDS5:
            r = res[("base", f, 1.0, 1.0, EA, cusick.SHEAR, 0.005, s)]
            out.append(f"{f} {s} {r['dc']:.4f} {r['iters']} {r['last']:.5f} {r['gmax']:.2e} {r['nodes']} {r['drop']:.2f} {r['sec']:.0f}")
    out += ["", "fabric mean_DC sd_DC (5 seeds) mean_DC_seeds0-2"]
    base, sd, base3 = {}, {}, {}
    for f in FABRICS:
        mu5, v5 = m("base", f, seeds=SEEDS5)
        base[f], sd[f] = mu5, float(np.std(v5, ddof=1))
        base3[f] = float(np.mean(v5[:3]))
        out.append(f"{f} {mu5:.4f} {sd[f]:.4f} {base3[f]:.4f}")

    out += ["", "2. bending rigidity sweep (3-seed means; W as measured)", "fabric " + " ".join(f"Bx{k:g}" for k in [0.25, 0.5, 1, 2, 4])]
    sweep = {}
    for f in FABRICS:
        row = [m("B", f, kb=0.25)[0], m("B", f, kb=0.5)[0], base3[f], m("B", f, kb=2.0)[0], m("B", f, kb=4.0)[0]]
        sweep[f] = row
        out.append(f + " " + " ".join(f"{x:.4f}" for x in row))

    out += ["", "3. other inputs (3-seed means)", "fabric base3 BW_x4 EA40 EA800 shear0.03 shear0.3 mesh7.5mm"]
    other = {}
    for f in FABRICS:
        o = dict(scale=m("scale4", f, kb=4.0, kw=4.0)[0], ea40=m("EA", f, ea=40.0)[0], ea800=m("EA", f, ea=800.0)[0],
                 sh03=m("shear", f, sh=0.03)[0], sh3=m("shear", f, sh=0.3)[0], mesh=m("mesh", f, h=0.0075)[0])
        other[f] = o
        out.append(f"{f} {base3[f]:.4f} {o['scale']:.4f} {o['ea40']:.4f} {o['ea800']:.4f} {o['sh03']:.4f} {o['sh3']:.4f} {o['mesh']:.4f}")

    out += ["", "4. all cases (tag fabric Bx Wx EA shear h seed: DC iters last_change nodes)"]
    for c in cases():
        r = res[c]
        out.append(" ".join(str(x) for x in c) + f": {r['dc']:.4f} {r['iters']} {r['last']:.5f} {r['nodes']}")
    worst = max(r["last"] for r in res.values())
    capped = sum(r["iters"] >= 40000 for r in res.values())
    out.append(f"largest last-chunk DC change {worst:.5f}; cases at the 40,000 cap: {capped} of {len(res)}")

    # verdicts
    order = sorted(FABRICS, key=lambda f: base[f])
    v = ["", "Predictions"]
    v.append(f"C1 order by mean DC {' < '.join(order)}: {'held' if order == FABRICS else 'refuted'}")
    v.append(f"C2 max seed sd {max(sd.values()):.4f}: {'held' if max(sd.values()) <= 0.02 else 'refuted'}")
    c3 = []
    for f in FABRICS:
        steps = np.diff(sweep[f])
        c3.append((f, float(steps.min()), 3 * sd[f]))
    ok3 = all(st > 0 and st >= t3 for _, st, t3 in c3)
    v.append("C3 smallest step per doubling vs 3 sd: " + ", ".join(f"{f} {st:.4f}/{t3:.4f}" for f, st, t3 in c3)
             + f": {'held' if ok3 else 'refuted'}")
    d4 = {f: abs(other[f]["scale"] - base3[f]) for f in FABRICS}
    v.append("C4 |BW x4 - base|: " + ", ".join(f"{f} {d:.4f}" for f, d in d4.items()) + f": {'held' if max(d4.values()) < 0.02 else 'refuted'}")
    d5 = {f: abs(other[f]["ea40"] - other[f]["ea800"]) for f in FABRICS}
    v.append("C5 |EA40 - EA800|: " + ", ".join(f"{f} {d:.4f}" for f, d in d5.items()) + f": {'held' if max(d5.values()) < 0.03 else 'refuted'}")
    d6 = {f: abs(other[f]["sh03"] - other[f]["sh3"]) for f in FABRICS}
    v.append("C6 |shear0.03 - shear0.3|: " + ", ".join(f"{f} {d:.4f}" for f, d in d6.items()) + f": {'held' if max(d6.values()) >= 0.03 else 'refuted'}")
    d7 = {f: abs(other[f]["mesh"] - base3[f]) for f in FABRICS}
    v.append("C7 |7.5mm - 5mm|: " + ", ".join(f"{f} {d:.4f}" for f, d in d7.items()) + f": {'held' if max(d7.values()) < 0.03 else 'refuted'}")
    out += v
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    shapes = {f: res[("base", f, 1.0, 1.0, EA, cusick.SHEAR, 0.005, 0)]["X"] for f in FABRICS}
    np.savez_compressed(HERE / "shapes_seed0.npz", **shapes)
    print("\n".join(out[-9:]))


if __name__ == "__main__":
    main()
