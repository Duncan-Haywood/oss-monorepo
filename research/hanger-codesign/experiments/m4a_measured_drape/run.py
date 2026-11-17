"""Milestone 4a: the top-tier Cusick solver, uncalibrated, against nine measured drape coefficients.

    python3 experiments/m4a_measured_drape/run.py --phase solve    (hours on 4 cores; resumable)
    python3 experiments/m4a_measured_drape/run.py --phase report   (seconds: results.txt, results.json)
    python3 experiments/m4a_measured_drape/run.py --quick          (7.5 mm, seed 0, three fabrics)

Why: every Cusick result in milestones 2 to 3g is simulated: milestone 2 found no reachable table of
measured drape coefficients (DC) with the bending, weight and stretch of the same fabrics, and
milestones 3f and 3g list milestone 4 (a measured DC) as blocked on egress. This session reached
Europe PMC, which serves the CC BY full text of Petrak et al. (2021), *Materials* 14, 6259
(`fabrics.py`): nine wovens with FAST and KES-FB bending, shear, tensile extension and weight, and a
Cusick DC on the same geometry as ours (30 cm specimen, 18 cm disc). Their own commercial CAD
simulation (Optitex) of the same nine is a baseline: its DC moves from 0.08 to 0.85 with the polygon
size and its best column (chosen after the fact among eight) has RMSE 0.067 against the measured DC.

Method: milestone 3a's triangle element and `Disc` geometry, 3c's start, stage and record, 3d's
element-local Newton; nothing in the physics changes. Each fabric's inputs, all from the paper, none
fitted: B = geometric mean of FAST warp and weft bending rigidity (Peirce's overall rigidity); W from
Table 1; G = FAST shear rigidity; EA = geometric mean of the warp and weft secant stiffnesses at
100 gf/cm, 98.07 N/m / E100. The element is isotropic, so the anisotropy of B (warp/weft up to 4:1,
F9) and EA (up to 11:1, F2) is averaged away; that is a limit of the tier, recorded, not repaired.
Continuation in EA as 3b (a stage at 150 N/m from the flat start, then geometric steps of at most
x2 to the fabric's EA), cap 400 Newton steps per stage, tolerance 1e-5 of the heaviest node weight.
  Main: lattice 2.5 mm (3e to 3g: mesh-flat there within 0.01 on both earlier fabrics), seeds 0, 1, 2.
  Mesh check: 3.75 mm, seed 0.
  Input check (not scored for acceptance): 2.5 mm, seed 0, B from the KES-FB2 columns instead (as
  printed; their B is 0.29 to 0.42 of FAST's for seven fabrics and 1.3 to 1.4 for F6 and F7, whose
  printed KES weft values, 0.398 and 0.444, look like a decimal slip).
Summary per fabric (registered): DC of the lowest-energy converged 2.5 mm seed; the seed interval
[min, max] is reported beside it (3g: a single lowest state is a sample).
Scores: Pearson r, Spearman rho, mean signed error (bias), RMSE and max |error| against Table 3's Kd;
the paper's eight Optitex columns scored the same way.

Predictions (written before the first solve of this script; LOG.md, 2026-11-17, milestone 4a):
  M1  Every 2.5 mm stage converges (gmax < tol) on all nine fabrics and three seeds.
  M2  Rank: Spearman rho >= 0.80 between the simulated and the measured DC (FAST inputs, 2.5 mm).
  M3  Linear agreement: Pearson r >= 0.86 (the bottom of the paper's Optitex range, 0.861 to 0.915).
  M4  Acceptance: RMSE <= 0.08 with no parameter fitted (the paper's best post hoc Optitex column:
      0.067; its median column: 0.12).
  M5  Bias: |mean signed error| <= 0.05.
  M6  Mesh: |DC(3.75 mm) - DC(2.5 mm)| < 0.02 (seed 0) on at least 7 of 9 fabrics.
  M7  Input: with KES bending in place of FAST every fabric but F6 and F7 drapes lower (smaller DC),
      and the KES-input RMSE is larger than the FAST-input RMSE.
Added during the run, after reading only the seed-0 KES-bending end states of F1, F4 and F9 (DC 0.211,
0.286, 0.611 against measured 0.222, 0.319, 0.647, while FAST bending gave 0.368, 0.494, 0.777) and
before any other KES-bending result (`--extra`: KES bending, seeds 1 and 2, 2.5 mm, all nine):
  K1  With KES bending, the lowest-energy-of-three DC has RMSE <= 0.05 against the measured DC.
  K2  ... and |bias| <= 0.03, Pearson r >= 0.90.
  K3  ... and its RMSE is below every one of the paper's eight Optitex columns.
These are not blind (three of nine fabrics were seen) and are scored apart from M1 to M7.
Added after the report of M1 to M7 was read (`--verify 0.485`: seed 0, 2.5 mm, FAST bending x 0.485,
the one factor that the post hoc log-B interpolation fits to all nine fabrics):
  V1  The solved DC has RMSE <= 0.06 against the measured DC (interpolated: 0.050 leave-one-out).
  V2  It is within 0.03 of the interpolated DC at that factor on at least 7 of 9 fabrics.
In-sample calibration, not a blind test: the factor was fitted to the same nine measurements.
Acceptance for the milestone is M4: an uncalibrated top tier within 0.08 of measured drape on nine
fabrics is what H3 (does calibration change a choice) needs as its starting point.
"""
import argparse
import importlib.util
import json
import math
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(HERE))
import fabrics  # noqa: E402

_s = importlib.util.spec_from_file_location("m3d_run", EXP / "m3d_local_hessian" / "run.py")
m3d = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3d)
m3c, m3, fem, localhess = m3d.m3c, m3d.m3, m3d.fem, m3d.localhess
cusick = m3.cusick

SEEDS = (0, 1, 2)
MAIN, COARSE = 0.0025, 0.00375
CAP = 400
CACHE = HERE / "cache"
OPTITEX = {  # Petrak et al. 2021, Table 6: simulated Kd by input system and polygon size [cm]
    "FAST 0.2": (.113, .107, .080, .125, .108, .149, .141, .149, .203),
    "FAST 0.4": (.319, .260, .258, .354, .315, .390, .411, .399, .785),
    "FAST 0.6": (.492, .453, .434, .528, .507, .575, .611, .583, .840),
    "FAST 0.8": (.530, .465, .466, .565, .556, .623, .642, .628, .853),
    "KES 0.2": (.182, .153, .256, .226, .224, .274, .289, .328, .491),
    "KES 0.4": (.186, .158, .273, .252, .235, .286, .304, .323, .505),
    "KES 0.6": (.295, .252, .431, .386, .380, .448, .489, .492, .662),
    "KES 0.8": (.329, .270, .457, .402, .403, .479, .490, .536, .669),
}


class FabricDisc(m3.Disc):
    """3a's Cusick specimen with one of Petrak et al.'s fabrics instead of a `hanger-kes` one."""

    def __init__(self, code, ea, a, bsrc="fast"):
        if bsrc.startswith("x"):                        # post hoc check: a factor on FAST bending
            B = float(bsrc[1:]) * fabrics.b_fast(code) / fem.GF_CM2_PER_CM
        else:
            B = (fabrics.b_fast if bsrc == "fast" else fabrics.b_kes)(code) / fem.GF_CM2_PER_CM
        W = fabrics.weight(code) / 10.0                 # g/m^2 -> mg/cm^2
        cut = cusick.R_SPEC + 0.5 * a
        P, T = fem.lattice(a, (-cut - a, cut + a), (-cut - a, cut + a))
        P, T = fem.keep(P, T, np.hypot(P[:, 0], P[:, 1]) <= cut + 1e-12)
        rho = np.hypot(P[:, 0], P[:, 1])
        fem.Mesh.__init__(self, P, T, B, W, ea, fabrics.g_fast(code), rho <= cusick.R_DISC + 1e-12)
        self.rho0 = rho
        self.tris = self.T


def ladder(ea, start=150.0, ratio=2.0):
    """150 N/m, then geometric steps of at most `ratio` ending exactly at `ea`."""
    if ea <= start:
        return (ea,)
    k = math.ceil(math.log(ea / start) / math.log(ratio) - 1e-12)
    return tuple(start * (ea / start) ** (i / k) for i in range(k + 1))


def mm(a):
    return f"{a * 1000:g}"


def jobs(quick, extra=False, verify=None):
    if verify:
        return [(c, MAIN, 0, f"x{verify}") for c in fabrics.CODES]
    if extra:
        return [(c, MAIN, s, "kes") for s in (1, 2) for c in fabrics.CODES]
    if quick:
        return [(c, 0.0075, 0, "fast") for c in ("F1", "F5", "F9")]
    main = [(c, MAIN, s, "fast") for s in SEEDS for c in fabrics.CODES]
    return (main + [(c, COARSE, 0, "fast") for c in fabrics.CODES]
            + [(c, MAIN, 0, "kes") for c in fabrics.CODES])


def chain_job(job):
    code, a, seed, bsrc = job
    out = CACHE / f"chain_{code}_{mm(a)}_{seed}_{bsrc}.json"
    if out.exists():
        return json.loads(out.read_text())
    eas = ladder(fabrics.ea_secant(code))
    sp = FabricDisc(code, eas[0], a, bsrc)
    X = sp.start(seed)
    nw, w = localhess.LocalNewton(sp, X), fem.GRAV * sp.mass.max()
    base = f"partial_{code}_{mm(a)}_{seed}_{bsrc}"
    pj, pz = CACHE / f"{base}.json", (lambda k: CACHE / f"{base}_stage{k}.npy")
    rows = []
    if pj.exists():
        rows = json.loads(pj.read_text())
        X = np.load(pz(len(rows) - 1))
    for ea in eas[len(rows):]:
        t = time.time()
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
        last = ea == eas[-1]
        r = dict(code=code, a=a, seed=seed, bsrc=bsrc, ea=ea, n=sp.n, dc=sp.dc(X), folds=cusick.nodes(X, sp),
                 energy=float(sp.energy_grad(X[sp.free].ravel(), X)[0]), steps=info["iters"],
                 gmax=info["gmax"] / w, sec=time.time() - t)
        r["conv"] = bool(r["gmax"] < 1e-5)
        r["lam"] = m3c.lam_min(sp, nw, X) if (last and r["conv"]) else None
        print(f"{code} {mm(a)}mm seed {seed} {bsrc} EA {ea:.0f}: DC {r['dc']:.4f} folds {r['folds']} "
              f"E {r['energy']:.8e} steps {r['steps']} conv {r['conv']} lam {r['lam']} {r['sec']:.0f}s", flush=True)
        rows.append(r)
        np.save(pz(len(rows) - 1), X)
        tmp = CACHE / f"{base}.json.tmp"
        tmp.write_text(json.dumps(rows))
        tmp.replace(pj)
    out.write_text(json.dumps(rows))
    return rows


def pearson(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    return float(np.corrcoef(x, y)[0, 1])


def ranks(x):
    o = np.argsort(x)
    r = np.empty(len(x))
    r[o] = np.arange(len(x))
    return r


def scores(sim, meas):
    e = np.asarray(sim) - np.asarray(meas)
    return dict(r=pearson(sim, meas), rho=pearson(ranks(sim), ranks(meas)), bias=float(e.mean()),
                rmse=float(np.sqrt((e ** 2).mean())), maxerr=float(np.abs(e).max()))


def fmt(s):
    return f"r {s['r']:+.3f}  rho {s['rho']:+.3f}  bias {s['bias']:+.4f}  RMSE {s['rmse']:.4f}  max|e| {s['maxerr']:.4f}"


def dc_at(f, b0, d0, b1, d1):
    """DC at bending factor f (on FAST B), linear in log B through the two solved points."""
    x0, x1 = math.log(b0), math.log(b1)
    return d0 + (d1 - d0) * (math.log(f) - x0) / (x1 - x0)


def posthoc_factor(seed0, kes):
    """Post hoc, not registered: per fabric the factor on FAST bending that matches the measured DC,
    by log-linear interpolation of the seed-0 DC between FAST B (factor 1) and KES B (factor
    b_kes / b_fast); then one shared factor fitted on eight fabrics (least squares on a grid) and used
    to predict the ninth (leave-one-out)."""
    pts = {}
    for c, rf, rk in zip(fabrics.CODES, seed0, kes):
        pts[c] = (1.0, rf["dc"], fabrics.b_kes(c) / fabrics.b_fast(c), rk["dc"])
    need = {}
    for c, (b0, d0, b1, d1) in pts.items():
        x0, x1 = math.log(b0), math.log(b1)
        need[c] = math.exp(x0 + (fabrics.kd(c) - d0) * (x1 - x0) / (d1 - d0)) if d1 != d0 else float("nan")
    grid = np.exp(np.linspace(math.log(0.05), math.log(2.0), 2001))

    def fit(codes):
        sse = [sum((dc_at(f, *pts[c]) - fabrics.kd(c)) ** 2 for c in codes) for f in grid]
        return float(grid[int(np.argmin(sse))])

    f_all = fit(fabrics.CODES)
    loo = {}
    for c in fabrics.CODES:
        f = fit([d for d in fabrics.CODES if d != c])
        loo[c] = (f, dc_at(f, *pts[c]))
    return need, f_all, loo


def report():
    ends = {}
    for p in sorted(CACHE.glob("chain_*.json")):
        rows = json.loads(p.read_text())
        r = rows[-1]
        ends[(r["code"], r["a"], r["seed"], r["bsrc"])] = dict(r, stages=len(rows),
                                                              allconv=all(x["conv"] for x in rows))
    meas = [fabrics.kd(c) for c in fabrics.CODES]
    L = ["Milestone 4a: triangle-FEM Cusick DC, uncalibrated, against Petrak et al. (2021) Table 3.", ""]
    L.append("Inputs (all from the paper; isotropic geometric means):")
    L.append("fabric  W g/m2   B_fast uNm  B_kes uNm   G N/m   EA N/m   Kd_meas")
    for c in fabrics.CODES:
        L.append(f"{c:6s}  {fabrics.weight(c):7.1f}  {fabrics.b_fast(c)*1e6:9.2f}  {fabrics.b_kes(c)*1e6:9.2f}  "
                 f"{fabrics.g_fast(c):6.1f}  {fabrics.ea_secant(c):7.0f}  {fabrics.kd(c):.3f}")
    L += ["", "End states (FAST inputs, 2.5 mm, seeds 0-2): DC, folds, energy J, steps, converged, lam_min"]
    lowest, lo, hi, means, allc = [], [], [], [], True
    for c in fabrics.CODES:
        rs = [ends.get((c, MAIN, s, "fast")) for s in SEEDS]
        rs = [r for r in rs if r]
        for r in rs:
            allc &= r["allconv"]
            L.append(f"{c} seed {r['seed']}: DC {r['dc']:.4f} folds {r['folds']:2d} E {r['energy']:.8e} "
                     f"steps(last) {r['steps']:3d} allconv {r['allconv']} lam {r['lam']}")
        cv = [r for r in rs if r["conv"]] or rs
        best = min(cv, key=lambda r: r["energy"])
        lowest.append(best["dc"])
        lo.append(min(r["dc"] for r in rs))
        hi.append(max(r["dc"] for r in rs))
        means.append(float(np.mean([r["dc"] for r in rs])))
    L += ["", "Per fabric: measured, lowest-energy seed DC [seed interval], seed mean, error of the lowest"]
    for i, c in enumerate(fabrics.CODES):
        L.append(f"{c}: Kd {meas[i]:.3f}  sim {lowest[i]:.4f} [{lo[i]:.4f}, {hi[i]:.4f}]  mean {means[i]:.4f}  "
                 f"err {lowest[i] - meas[i]:+.4f}")
    s_main = scores(lowest, meas)
    s_mean = scores(means, meas)
    L += ["", "Scores against measured Kd (n = 9):",
          f"FEM 2.5 mm lowest-energy (registered) : {fmt(s_main)}",
          f"FEM 2.5 mm seed mean                  : {fmt(s_mean)}"]
    coarse = [ends.get((c, COARSE, 0, "fast")) for c in fabrics.CODES]
    kes = [ends.get((c, MAIN, 0, "kes")) for c in fabrics.CODES]
    seed0 = [ends.get((c, MAIN, 0, "fast")) for c in fabrics.CODES]
    s_coarse = scores([r["dc"] for r in coarse], meas) if all(coarse) else None
    s_kes = scores([r["dc"] for r in kes], meas) if all(kes) else None
    s_seed0 = scores([r["dc"] for r in seed0], meas) if all(seed0) else None
    if s_seed0:
        L.append(f"FEM 2.5 mm seed 0                     : {fmt(s_seed0)}")
    if s_coarse:
        L.append(f"FEM 3.75 mm seed 0                    : {fmt(s_coarse)}")
    if s_kes:
        L.append(f"FEM 2.5 mm seed 0, KES bending        : {fmt(s_kes)}")
    opt = {k: scores(v, meas) for k, v in OPTITEX.items()}
    for k, s in opt.items():
        L.append(f"Optitex {k:8s} (paper, Table 6)    : {fmt(s)}")
    mesh = []
    if all(coarse) and all(seed0):
        L += ["", "Mesh check (seed 0): DC 3.75 mm, 2.5 mm, change"]
        for c, rc, rm in zip(fabrics.CODES, coarse, seed0):
            mesh.append(rc["dc"] - rm["dc"])
            L.append(f"{c}: {rc['dc']:.4f} {rm['dc']:.4f} {rc['dc'] - rm['dc']:+.4f} (folds {rc['folds']} -> {rm['folds']})")
    kesd = []
    if all(kes) and all(seed0):
        L += ["", "Input check (seed 0, 2.5 mm): DC with FAST bending, with KES bending, change"]
        for c, rk, rm in zip(fabrics.CODES, kes, seed0):
            kesd.append(rk["dc"] - rm["dc"])
            L.append(f"{c}: {rm['dc']:.4f} {rk['dc']:.4f} {rk['dc'] - rm['dc']:+.4f}")
    rm_ = sorted(s["rmse"] for s in opt.values())
    pred = [
        ("M1 every 2.5 mm stage converges", allc),
        ("M2 Spearman >= 0.80", s_main["rho"] >= 0.80),
        ("M3 Pearson >= 0.86", s_main["r"] >= 0.86),
        ("M4 (acceptance) RMSE <= 0.08", s_main["rmse"] <= 0.08),
        ("M5 |bias| <= 0.05", abs(s_main["bias"]) <= 0.05),
    ]
    if mesh:
        pred.append((f"M6 mesh change < 0.02 on >= 7 of 9 ({sum(abs(m) < 0.02 for m in mesh)} of 9)",
                     sum(abs(m) < 0.02 for m in mesh) >= 7))
    if kesd and s_kes:
        low = [d < 0 for c, d in zip(fabrics.CODES, kesd) if c not in ("F6", "F7")]
        pred.append((f"M7 KES bending lowers DC on all 7 others ({sum(low)} of 7) and raises RMSE",
                     all(low) and s_kes["rmse"] > s_seed0["rmse"]))
    post = None
    if all(kes) and all(seed0):
        need, f_all, loo = posthoc_factor(seed0, kes)
        pl = [loo[c][1] for c in fabrics.CODES]
        s_loo = scores(pl, meas)
        L += ["", "Post hoc (not registered; seed 0, DC linear in log B between the FAST and KES solves):",
              "factor on FAST bending that matches each fabric's measured DC (KES/FAST ratio beside it)"]
        for c in fabrics.CODES:
            L.append(f"{c}: needs x{need[c]:.3f}  (KES/FAST {fabrics.b_kes(c) / fabrics.b_fast(c):.3f})  "
                     f"LOO factor {loo[c][0]:.3f} -> DC {loo[c][1]:.4f} vs Kd {fabrics.kd(c):.3f}")
        L.append(f"one factor fitted on all nine: x{f_all:.3f}")
        L.append(f"leave-one-out, one shared factor           : {fmt(s_loo)}")
        post = dict(need=need, f_all=f_all, loo={c: list(v) for c, v in loo.items()}, loo_scores=s_loo)
        vk = sorted({k[3] for k in ends if k[3].startswith("x")})
        for b in vk:
            vr = [ends.get((c, MAIN, 0, b)) for c in fabrics.CODES]
            if not all(vr):
                continue
            f = float(b[1:])
            pts = {c: (1.0, rf["dc"], fabrics.b_kes(c) / fabrics.b_fast(c), rk["dc"])
                   for c, rf, rk in zip(fabrics.CODES, seed0, kes)}
            L += ["", f"V1-V2 (post hoc check, solved): seed 0, 2.5 mm, FAST bending x{f:g}: "
                  "measured, solved DC, interpolated DC, error"]
            near = 0
            for c, r in zip(fabrics.CODES, vr):
                ip = dc_at(f, *pts[c])
                near += abs(r["dc"] - ip) <= 0.03
                L.append(f"{c}: Kd {fabrics.kd(c):.3f}  solved {r['dc']:.4f} (folds {r['folds']}, allconv "
                         f"{r['allconv']})  interp {ip:.4f}  err {r['dc'] - fabrics.kd(c):+.4f}")
            s_v = scores([r["dc"] for r in vr], meas)
            L.append(f"FEM 2.5 mm seed 0, FAST bending x{f:g}   : {fmt(s_v)}")
            post[f"verify_{b}"] = dict(dc={c: r["dc"] for c, r in zip(fabrics.CODES, vr)}, scores=s_v, near=near)
            post["_vpred"] = [(f"V1 solved RMSE <= 0.06 at x{f:g}", s_v["rmse"] <= 0.06),
                              (f"V2 within 0.03 of the interpolation on >= 7 of 9 ({near} of 9)", near >= 7)]
    kes3 = [[ends.get((c, MAIN, s, "kes")) for s in SEEDS] for c in fabrics.CODES]
    s_k3, klow = None, []
    if all(all(rs) for rs in kes3):
        L += ["", "K1-K3 (KES bending, 2.5 mm, seeds 0-2): measured, lowest-energy DC [interval], error"]
        for c, rs in zip(fabrics.CODES, kes3):
            cv = [r for r in rs if r["conv"]] or rs
            b = min(cv, key=lambda r: r["energy"])
            klow.append(b["dc"])
            L.append(f"{c}: Kd {fabrics.kd(c):.3f}  sim {b['dc']:.4f} [{min(r['dc'] for r in rs):.4f}, "
                     f"{max(r['dc'] for r in rs):.4f}] folds {b['folds']} err {b['dc'] - fabrics.kd(c):+.4f}"
                     f"  allconv {all(x['conv'] for x in rs)}")
        s_k3 = scores(klow, meas)
        L.append(f"FEM 2.5 mm KES bending, lowest of 3    : {fmt(s_k3)}")
        pred += [("K1 KES RMSE <= 0.05", s_k3["rmse"] <= 0.05),
                 ("K2 KES |bias| <= 0.03 and r >= 0.90", abs(s_k3["bias"]) <= 0.03 and s_k3["r"] >= 0.90),
                 ("K3 KES RMSE below all eight Optitex columns", s_k3["rmse"] < rm_[0])]
    if post and "_vpred" in post:
        pred += post.pop("_vpred")
    L += ["", "Predictions:"] + [f"  {n}: {'held' if ok else 'REFUTED'}" for n, ok in pred]
    L.append(f"  (Optitex RMSE over its eight columns: {rm_[0]:.3f} to {rm_[-1]:.3f}, median "
             f"{0.5 * (rm_[3] + rm_[4]):.3f})")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    js = dict(ends={f"{k[0]}_{mm(k[1])}_{k[2]}_{k[3]}": v for k, v in ends.items()},
              lowest=dict(zip(fabrics.CODES, lowest)), interval=dict(zip(fabrics.CODES, zip(lo, hi))),
              means=dict(zip(fabrics.CODES, means)), measured=dict(zip(fabrics.CODES, meas)),
              scores=dict(main=s_main, mean=s_mean, seed0=s_seed0, coarse=s_coarse, kes=s_kes, kes3=s_k3,
                          optitex=opt), mesh=dict(zip(fabrics.CODES, mesh)), kes_change=dict(zip(fabrics.CODES, kesd)),
              kes_lowest=dict(zip(fabrics.CODES, klow)),
              posthoc=post,
              optitex={k: list(v) for k, v in OPTITEX.items()},
              predictions={n: bool(ok) for n, ok in pred})
    (HERE / "results.json").write_text(json.dumps(js, indent=1) + "\n")
    print("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("solve", "report"), default="solve")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--extra", action="store_true", help="K1-K3: KES bending, seeds 1 and 2")
    ap.add_argument("--verify", help="V1-V2: seed 0 with FAST bending times this factor (post hoc)")
    ap.add_argument("--procs", type=int, default=4)
    a = ap.parse_args()
    global CACHE
    if a.quick:
        CACHE = HERE / "cache_quick"
    CACHE.mkdir(exist_ok=True)
    if a.phase == "solve":
        js = jobs(a.quick, a.extra, a.verify)
        # longest first: the stiffest, finest chains
        js.sort(key=lambda j: (-1 / j[1], -fabrics.ea_secant(j[0])))
        with mp.Pool(a.procs) as pool:
            for _ in pool.imap_unordered(chain_job, js):
                pass
        if a.quick:
            return
    report()


if __name__ == "__main__":
    main()
