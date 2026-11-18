"""Milestone 4b: does warp/weft anisotropy explain milestone 4a's over-drape?

    python3 experiments/m4b_orthotropic/run.py --phase solve    (about 2 h on 4 cores; resumable)
    python3 experiments/m4b_orthotropic/run.py --phase report   (seconds: results.txt, results.json)
    python3 experiments/m4b_orthotropic/run.py --quick          (7.5 mm, seed 0, F1 and F9)

Why: milestone 4a solved the nine wovens of Petrak et al. (2021) on the isotropic triangle element
with geometric-mean inputs and found an excellent ranker (r 0.965) that over-drapes every fabric
(bias +0.143, RMSE 0.148); one factor of 0.485 on bending rigidity removed the bias (in-sample).
Its Next (b) asks how much of that factor the averaged-away anisotropy carries: FAST warp/weft
bending differs by up to 4.0:1 (F9), 3.1:1 (F8), 2.4:1 (F1) and stretch secants by up to 11:1 (F2).

Method: `ortho.py` (warp along x): stretch EA1, EA2 on E11, E22; hinge weights per edge family,
calibrated on the lattice so cylinders along warp and weft store exactly B1 k^2/2 and B2 k^2/2.
Everything else is 4a's: geometry, start, 2.5 mm lattice, 3d's Newton with the element Hessian
(here the orthotropic membrane block), cap 400, tolerance 1e-5 of the heaviest node weight, and the
EA ladder on the geometric mean (150 N/m, then steps of at most x2), the warp/weft stretch ratio
held fixed along it. Inputs from the paper only, no fitting: B1, B2 FAST warp and weft; EA1, EA2 =
98.07 N/m / E100 warp and weft; G FAST; W Table 1.
  Modes: "both" (B and EA orthotropic; seeds 0, 1, 2; the registered summary is 4a's, the DC of
  the lowest-energy converged seed), "bend" (B only, EA the geometric mean; seed 0), "stretch"
  (EA only, B the geometric mean; seed 0), "iso" (both isotropic through this code; 3.75 mm, seed 0,
  F1 and F2: a check that the code path reproduces 4a's mesh-check rows).
Baselines: 4a's isotropic rows from its results.json (seed 0 and lowest of three, 2.5 mm), and the
paper's eight Optitex columns (RMSE 0.067 to 0.274).

Predictions (written and committed before the first solve of this script):
  O1  Every stage of every chain converges.
  O2  "iso" reproduces 4a's 3.75 mm seed-0 DC within 1e-4 and energy within 1e-9 relative (F1, F2).
  O3  Acceptance (the question): orthotropic inputs ("both", lowest of three) reach RMSE <= 0.08
      against the measured DC. I expect it to FAIL: anisotropy explains less than a third of the
      bias, so
  O4  the "both" bias stays >= +0.10 (4a: +0.143).
  O5  Bending orthotropy lowers the DC (bend seed 0 below 4a's iso seed 0) on at least 7 of 9.
  O6  The DC drop from bending orthotropy grows with the anisotropy: Spearman between |ln B1/B2|
      and (iso - bend) >= 0.6.
  O7  Stretch orthotropy alone moves the DC by less than 0.01 on at least 7 of 9 (seed 0).
  O8  Additivity: |both - iso - (bend - iso) - (stretch - iso)| < 0.01 on at least 7 of 9 (seed 0).
  O9  Ranking survives: Pearson r >= 0.95 for "both" (lowest of three).
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
_saved = sys.modules.get("run")
_s3 = importlib.util.spec_from_file_location("run", EXP / "m3_fem_tier" / "run.py")
_m3 = importlib.util.module_from_spec(_s3)
sys.modules["run"] = _m3
_s3.loader.exec_module(_m3)
try:
    _s = importlib.util.spec_from_file_location("m4a_run", EXP / "m4a_measured_drape" / "run.py")
    m4a = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(m4a)
finally:
    if _saved is not None:
        sys.modules["run"] = _saved
    else:
        sys.modules.pop("run", None)
import ortho  # noqa: E402

fabrics, fem, m3c, cusick = m4a.fabrics, m4a.fem, m4a.m3c, m4a.cusick
MAIN, COARSE, CAP = m4a.MAIN, m4a.COARSE, m4a.CAP
SEEDS = (0, 1, 2)
CACHE = HERE / "cache"
M4A = json.loads((EXP / "m4a_measured_drape" / "results.json").read_text())


def inputs(code):
    """Warp/weft B [N m], EA [N/m] from the paper (Table 2, FAST)."""
    r = fabrics.TABLE[code]
    return dict(B1=r[3] * 1e-6, B2=r[4] * 1e-6, EA1=fabrics.N100 / (r[1] / 100), EA2=fabrics.N100 / (r[2] / 100))


class OrthoDisc(ortho.OrthoMixin, m4a.FabricDisc):
    def __init__(self, code, a, mode):
        m4a.FabricDisc.__init__(self, code, 150.0, a, "fast")
        kb0 = self.kb.copy()
        self.kb_unit = kb0 / fabrics.b_fast(code)
        p = inputs(code)
        self.mode = mode
        bg, eg = math.sqrt(p["B1"] * p["B2"]), math.sqrt(p["EA1"] * p["EA2"])
        self.set_bending(*((p["B1"], p["B2"]) if mode in ("both", "bend") else (bg, bg)))
        if mode == "iso":
            self.kb = kb0                                       # 4a's kb, bit for bit
        self.sr = math.sqrt(p["EA1"] / p["EA2"]) if mode in ("both", "stretch") else 1.0
        self.ea_g = eg
        self.set_ea(150.0)

    def set_ea(self, g):
        self.set_stretch(g * self.sr, g / self.sr)


def mm(a):
    return f"{a * 1000:g}"


def jobs(quick):
    if quick:
        return [(c, 0.0075, 0, m) for c in ("F1", "F9") for m in ("both", "iso")]
    js = [(c, MAIN, s, "both") for s in SEEDS for c in fabrics.CODES]
    js += [(c, MAIN, 0, m) for m in ("bend", "stretch") for c in fabrics.CODES]
    js += [(c, COARSE, 0, "iso") for c in ("F1", "F2")]
    return js


def chain_job(job):
    code, a, seed, mode = job
    out = CACHE / f"chain_{code}_{mm(a)}_{seed}_{mode}.json"
    if out.exists():
        return json.loads(out.read_text())
    sp = OrthoDisc(code, a, mode)
    eas = m4a.ladder(sp.ea_g)
    X = sp.start(seed)
    nw, w = ortho.OrthoNewton(sp, X), fem.GRAV * sp.mass.max()
    base = f"partial_{code}_{mm(a)}_{seed}_{mode}"
    pj, pz = CACHE / f"{base}.json", (lambda k: CACHE / f"{base}_stage{k}.npy")
    rows = []
    if pj.exists():
        rows = json.loads(pj.read_text())
        X = np.load(pz(len(rows) - 1))
    for ea in eas[len(rows):]:
        t = time.time()
        sp.set_ea(ea)
        X, info = m3c.stage(sp, nw, w, X)
        last = ea == eas[-1]
        r = dict(code=code, a=a, seed=seed, mode=mode, ea=ea, ea1=sp.EA1, ea2=sp.EA2, n=sp.n, dc=sp.dc(X),
                 folds=cusick.nodes(X, sp), energy=float(sp.energy_grad(X[sp.free].ravel(), X)[0]),
                 steps=info["iters"], gmax=info["gmax"] / w, sec=time.time() - t)
        r["conv"] = bool(r["gmax"] < 1e-5)
        r["lam"] = m3c.lam_min(sp, nw, X) if (last and r["conv"]) else None
        print(f"{code} {mm(a)}mm seed {seed} {mode} EA {ea:.0f}: DC {r['dc']:.4f} folds {r['folds']} "
              f"E {r['energy']:.8e} steps {r['steps']} conv {r['conv']} lam {r['lam']} {r['sec']:.0f}s", flush=True)
        rows.append(r)
        np.save(pz(len(rows) - 1), X)
        tmp = CACHE / f"{base}.json.tmp"
        tmp.write_text(json.dumps(rows))
        tmp.replace(pj)
    out.write_text(json.dumps(rows))
    return rows


def spearman(x, y):
    return m4a.pearson(m4a.ranks(np.asarray(x)), m4a.ranks(np.asarray(y)))


def report():
    ends = {}
    for p in sorted(CACHE.glob("chain_*.json")):
        rows = json.loads(p.read_text())
        r = rows[-1]
        ends[(r["code"], r["a"], r["seed"], r["mode"])] = dict(r, stages=len(rows), allconv=all(x["conv"] for x in rows))
    C = fabrics.CODES
    meas = [fabrics.kd(c) for c in C]
    iso0 = [M4A["ends"][f"{c}_2.5_0_fast"]["dc"] for c in C]
    iso_low = [M4A["lowest"][c] for c in C]
    L = ["Milestone 4b: orthotropic triangle-FEM Cusick DC against Petrak et al. (2021) Table 3.", "",
         "Inputs (FAST, Table 2): warp/weft B [uN m], ratio, warp/weft EA [N/m], ratio; lattice hinge weights [uN m]"]
    for c in C:
        p = inputs(c)
        w = ortho.weights(p["B1"], p["B2"])
        L.append(f"{c}: B {p['B1']*1e6:5.1f} {p['B2']*1e6:5.1f} ({p['B1']/p['B2']:.2f})  EA {p['EA1']:6.0f} {p['EA2']:6.0f} "
                 f"({p['EA1']/p['EA2']:5.2f})  w {w[0]*1e6:6.2f} {w[1]*1e6:6.2f}")
    phis = [0, math.pi / 8, math.pi / 6, math.pi / 4, math.pi / 3, 3 * math.pi / 8, math.pi / 2]
    prof = ortho.bending_profile(4.0, 1.0, phis)
    L.append("Lattice B(phi)/B2 at B1/B2 = 4, phi = 0, 22.5, 30, 45, 60, 67.5, 90 deg: "
             + " ".join(f"{b:.3f}" for b in prof))
    allc = all(r["allconv"] for r in ends.values())
    L += ["", "End states: fabric, mode, seed: DC, folds, energy J, stages, all converged, lam_min"]
    for k in sorted(ends):
        r = ends[k]
        L.append(f"{k[0]} {mm(k[1])}mm {k[3]:7s} seed {k[2]}: DC {r['dc']:.4f} folds {r['folds']:2d} "
                 f"E {r['energy']:.8e} stages {r['stages']} allconv {r['allconv']} lam {r['lam']}")
    out, pred = {}, []
    both = [[ends.get((c, MAIN, s, "both")) for s in SEEDS] for c in C]
    have_both = all(all(rs) for rs in both)
    if have_both:
        low = []
        L += ["", "Per fabric (both, 2.5 mm): measured, lowest-energy DC [seed interval], 4a iso lowest, change, error"]
        for c, rs, il, m in zip(C, both, iso_low, meas):
            cv = [r for r in rs if r["conv"]] or rs
            b = min(cv, key=lambda r: r["energy"])
            low.append(b["dc"])
            L.append(f"{c}: Kd {m:.3f}  ortho {b['dc']:.4f} [{min(r['dc'] for r in rs):.4f}, {max(r['dc'] for r in rs):.4f}] "
                     f"folds {b['folds']}  iso {il:.4f}  change {b['dc'] - il:+.4f}  err {b['dc'] - m:+.4f}")
        s_both = m4a.scores(low, meas)
        out["both_lowest"] = dict(zip(C, low))
        out["scores_both"] = s_both
        L += ["", "Scores against measured Kd (n = 9):",
              f"orthotropic, lowest of 3 (registered) : {m4a.fmt(s_both)}",
              f"4a isotropic, lowest of 3            : {m4a.fmt(m4a.scores(iso_low, meas))}"]
        pred += [("O3 (acceptance) orthotropic RMSE <= 0.08", s_both["rmse"] <= 0.08),
                 ("O4 orthotropic bias >= +0.10", s_both["bias"] >= 0.10),
                 ("O9 orthotropic Pearson r >= 0.95", s_both["r"] >= 0.95)]
    s0 = {m: [ends.get((c, MAIN, 0, m)) for c in C] for m in ("both", "bend", "stretch")}
    if all(all(v) for v in s0.values()):
        d = {m: [r["dc"] - i for r, i in zip(v, iso0)] for m, v in s0.items()}
        L += ["", "Seed 0, 2.5 mm: iso (4a), bend, stretch, both; changes from iso; additivity residual"]
        for i, c in enumerate(C):
            res = d["both"][i] - d["bend"][i] - d["stretch"][i]
            L.append(f"{c}: iso {iso0[i]:.4f} bend {s0['bend'][i]['dc']:.4f} ({d['bend'][i]:+.4f}) stretch "
                     f"{s0['stretch'][i]['dc']:.4f} ({d['stretch'][i]:+.4f}) both {s0['both'][i]['dc']:.4f} "
                     f"({d['both'][i]:+.4f})  resid {res:+.4f}")
        for m in ("bend", "stretch", "both"):
            L.append(f"seed 0 {m:7s}: {m4a.fmt(m4a.scores([r['dc'] for r in s0[m]], meas))}")
        L.append(f"seed 0 iso (4a): {m4a.fmt(m4a.scores(iso0, meas))}")
        ani = [abs(math.log(inputs(c)["B1"] / inputs(c)["B2"])) for c in C]
        rho = spearman(ani, [-x for x in d["bend"]])
        nlow = sum(x < 0 for x in d["bend"])
        nst = sum(abs(x) < 0.01 for x in d["stretch"])
        nad = sum(abs(d["both"][i] - d["bend"][i] - d["stretch"][i]) < 0.01 for i in range(len(C)))
        L.append(f"Spearman(|ln B1/B2|, iso - bend) = {rho:+.3f}")
        out.update(seed0={m: {c: r["dc"] for c, r in zip(C, v)} for m, v in s0.items()},
                   change=dict((m, dict(zip(C, v))) for m, v in d.items()), spearman_aniso=rho)
        pred += [(f"O5 bending orthotropy lowers DC on >= 7 of 9 ({nlow} of 9)", nlow >= 7),
                 (f"O6 Spearman(|ln B1/B2|, drop) >= 0.6 ({rho:+.3f})", rho >= 0.6),
                 (f"O7 stretch orthotropy moves DC < 0.01 on >= 7 of 9 ({nst} of 9)", nst >= 7),
                 (f"O8 additive within 0.01 on >= 7 of 9 ({nad} of 9)", nad >= 7)]
        # Post hoc (added after the seed-0 "both" and "bend" rows were read): the calibrated lattice's
        # bending profile B(phi) between the axes, averaged over phi in [0, 90 deg], against the
        # geometric mean the isotropic element uses.
        ph = np.linspace(0, math.pi / 2, 31)
        L += ["", "Post hoc: lattice B(phi) averaged over 0-90 deg (arithmetic, harmonic) / geometric mean of B1, B2"]
        avg = []
        for i, c in enumerate(C):
            p = inputs(c)
            prof_c = np.array(ortho.bending_profile(p["B1"], p["B2"], ph))
            gm = math.sqrt(p["B1"] * p["B2"])
            am, hm = float(np.trapezoid(prof_c, ph) / ph[-1]) / gm, float(ph[-1] / np.trapezoid(1 / prof_c, ph)) / gm
            avg.append(am)
            L.append(f"{c}: B1/B2 {p['B1'] / p['B2']:.2f}  mean {am:.3f}  harmonic {hm:.3f}  bend change {d['bend'][i]:+.4f}")
        rho_avg = spearman(avg, d["bend"])
        L.append(f"Spearman(mean B(phi)/gmean, bend - iso) = {rho_avg:+.3f}")
        out["posthoc_profile_mean"] = dict(zip(C, avg))
        out["posthoc_spearman_profile"] = rho_avg
    chk = []
    for c in ("F1", "F2"):
        r = ends.get((c, COARSE, 0, "iso"))
        ref = M4A["ends"].get(f"{c}_3.75_0_fast")
        if r and ref:
            chk.append((abs(r["dc"] - ref["dc"]), abs(r["energy"] / ref["energy"] - 1)))
            L.append(f"iso check {c} 3.75 mm: DC {r['dc']:.6f} vs 4a {ref['dc']:.6f}; E {r['energy']:.10e} vs {ref['energy']:.10e}")
    if len(chk) == 2:
        pred.insert(0, ("O2 iso path reproduces 4a (DC 1e-4, E 1e-9 rel)", all(a < 1e-4 and b < 1e-9 for a, b in chk)))
    pred.insert(0, ("O1 every stage converges", allc))
    L += ["", "Predictions:"] + [f"  {n}: {'held' if ok else 'REFUTED'}" for n, ok in pred]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    js = dict(ends={f"{k[0]}_{mm(k[1])}_{k[2]}_{k[3]}": v for k, v in ends.items()}, measured=dict(zip(C, meas)),
              iso_seed0=dict(zip(C, iso0)), iso_lowest=dict(zip(C, iso_low)), profile_4to1=prof,
              predictions={n: bool(ok) for n, ok in pred}, **out)
    (HERE / "results.json").write_text(json.dumps(js, indent=1) + "\n")
    print("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("solve", "report"), default="solve")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--procs", type=int, default=4)
    a = ap.parse_args()
    global CACHE
    if a.quick:
        CACHE = HERE / "cache_quick"
    CACHE.mkdir(exist_ok=True)
    if a.phase == "solve":
        js = jobs(a.quick)
        order = {"both": 0, "bend": 1, "stretch": 2, "iso": 3}
        js.sort(key=lambda j: (j[2], order[j[3]], -inputs(j[0])["B1"]))   # seed 0 of every mode first
        with mp.Pool(a.procs) as pool:
            for _ in pool.imap_unordered(chain_job, js):
                pass
        if a.quick:
            return
    report()


if __name__ == "__main__":
    main()
