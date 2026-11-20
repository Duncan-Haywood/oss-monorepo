"""Milestone 21: is milestone 20's dip real? At phi = 0.25 false ties per true tie placed to close
triangles, census degree discount with one-sided ties at half weight scored worse at kappa = 0.5
(2.43%) than at kappa = 1 (2.19%), where kappa is the share of false ties both ends report.
Milestone 19's cell (phi = 0.5) was monotone in kappa. Five copies could not tell a mechanism from
noise.

Milestone 20's harness unchanged (milestone 6's joint bootstrap, B = 500, S = 100, 100 draws per
randomised rule, every extra randomised rule on its own stream keyed by its name, milestone 12's
primary rules, milestone 15's 47-rule reference never swapped), recall rho = 0.85. One cell
(phi = 0.25, closure), one seeding rule (census degree discount): unfiltered; hard filter (w = 0)
at kappa = 0, 0.5, 1; half weight (w = 0.5) at kappa = 0, 0.25, 0.5, 0.75, 1. Nine rules, ten
copies each (`name#r<j>`, j = 1-9): copies 0-4 of the seven rules milestone 20 ran must reproduce
it; copies 5-9 are new streams.

Contagion always runs on the true network; only the seeding rule sees the noisy one.
Tests H65-H68. Plan in LOG.md (2026-11-20, milestone 21), written before the run.

OMP_NUM_THREADS=1 /usr/bin/python3.13 experiments/m21_kappa_dip/run.py   (about 40 minutes on 4 cores)
"""
import functools
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))

_spec = importlib.util.spec_from_file_location("m20", os.path.join(HERE, "..", "m20_soft_cells", "run.py"))
m20 = importlib.util.module_from_spec(_spec)
sys.modules["m20"] = m20
_spec.loader.exec_module(m20)
m6, m11, m12, m10 = m20.m6, m20.m11, m20.m12, m20.m10

N_COPY = 10
OLD_COPY = 5
PHI, MODE, W = 0.25, "closure", 0.5
HARD_K = [0.0, 0.5, 1.0]
SOFT_K = [0.0, 0.25, 0.5, 0.75, 1.0]
fname = m20.fname

ROWS = [(PHI, MODE, False, 0.0, 0.0)]
ROWS += [(PHI, MODE, True, k, 0.0) for k in HARD_K]
ROWS += [(PHI, MODE, True, k, W) for k in SOFT_K]

ALLFN = {fname("census-dd", *x): functools.partial(m20._dd, phi=x[0], mode=x[1], recip=x[2], joint=x[3], w=x[4])
         for x in ROWS}
KEY = list(ALLFN)
NEWFN = {c: f for c, f in ALLFN.items() if c not in m11.NEW}
FN = {**m10.EXTRA, **m11.NEW, **m12.NEW, **NEWFN}
REPS = {f"{c}#r{j}": FN[c] for c in KEY for j in range(1, N_COPY)}
# undo milestone 20's registration (its module ran at import) and register only this run's rules
_base = {c: f for c, f in m6.EXTRA_RANDOMISED.items() if c not in m20.NEWFN and c not in m20.REPS}
m6.EXTRA_RANDOMISED = {**_base, **NEWFN, **REPS}
m6.PER_RULE_STREAMS = True
m6.NOT_IN_REFERENCE = set(REPS) | set(NEWFN)
m6.OUT_DIR = HERE
U = fname("census-dd", PHI, MODE)
H = {k: fname("census-dd", PHI, MODE, True, k) for k in HARD_K}
S = {k: fname("census-dd", PHI, MODE, True, k, W) for k in SOFT_K}


def main():
    r = m6.main()
    E, rules = r["E"], r["rules"]
    k = {c: i for i, c in enumerate(rules)}
    ref = [c for c in rules if c not in REPS and c not in NEWFN and c not in m20.M15_KEY]
    ref_idx = np.array([k[x] for x in ref])

    def cols(c):
        return [k[x if c == 0 else f"{x}#r{c}"] for x in KEY]

    copies, hits = [], []
    for c in range(N_COPY):
        idx = cols(c)
        w, h = m20.worst_regret(r, ref_idx, lambda q, idx=idx: E[q][idx])
        copies.append(w)
        hits.append(h)
    ki = {x: i for i, x in enumerate(KEY)}

    def pool(cs):
        a = np.array([cols(c) for c in cs])
        return m20.worst_regret(r, ref_idx, lambda q: E[q][a].mean(0))
    pooled, hp = pool(range(N_COPY))
    pooled5, _ = pool(range(OLD_COPY))
    cm = np.array([[float(np.median(w[:, ki[x]])) for x in KEY] for w in copies])
    pm = {x: float(np.median(pooled[:, ki[x]])) for x in KEY}
    pm5 = {x: float(np.median(pooled5[:, ki[x]])) for x in KEY}

    def diff(a, b, cs=range(N_COPY), p=None):
        cs = list(cs)
        d = cm[cs, ki[a]] - cm[cs, ki[b]]
        p = pm if p is None else p
        return p[a] - p[b], float(d.std(ddof=1) / np.sqrt(len(cs)))

    lines = []
    p = lines.append
    p(f"# Milestone 21: the kappa dip, census degree discount at phi = {PHI:g} closure (recall {m20.RHO:g}), "
      f"{N_COPY} Monte Carlo copies of {len(KEY)} rules")
    p(f"B = {copies[0].shape[0]} joint draws; reference = {len(ref)} primary rules (milestone 15's set), never swapped")
    p(f"share of (draw, family, rule) cells where a key rule beats the reference best: copies "
      f"{min(hits):.4f}-{max(hits):.4f}, pooled {hp:.4f}")
    prior = {}
    for m in ("m17_reciprocity", "m18_joint", "m20_soft_cells"):
        prior.update(json.load(open(os.path.join(HERE, "..", m, "verdicts.json")))["rows"])
    shared = [x for x in KEY if x in prior]
    dprior = max(abs(cm[c, ki[x]] - prior[x]["copies"][c]) for x in shared for c in range(OLD_COPY))
    p(f"\n## sanity: the {len(shared)} rules milestone 20 ran, copies 0-4 against its copies, max |difference| {dprior:.2e}")

    p("\n## per rule: joint median per copy (0-9) | pooled 10 [5%, 95%] | pooled copies 0-4 | pooled copies 5-9 | MC se (10)")
    pooled_new, _ = pool(range(OLD_COPY, N_COPY))
    pmn = {x: float(np.median(pooled_new[:, ki[x]])) for x in KEY}
    se = cm.std(0, ddof=1) / np.sqrt(N_COPY)
    rows = {}
    for x in KEY:
        i = ki[x]
        lo, hi = np.percentile(pooled[:, i], [5, 95])
        rows[x] = dict(copies=cm[:, i].round(5).tolist(), pooled=round(pm[x], 5), pooled_0_4=round(pm5[x], 5),
                       pooled_5_9=round(pmn[x], 5), q5=round(float(lo), 5), q95=round(float(hi), 5),
                       se=round(float(se[i]), 5))
        p(f"  {x:44s} " + " ".join(f"{v * 100:.2f}" for v in cm[:, i])
          + f" | {pm[x] * 100:.2f} [{lo * 100:.2f}, {hi * 100:.2f}] | {pm5[x] * 100:.2f} | {pmn[x] * 100:.2f} | {se[i] * 100:.2f}")

    p("\n## contrasts (pooled over 10 copies, MC se from paired copies, z; negative = first is better)")
    con = {}

    def show(tag, a, b):
        d, s_ = diff(a, b)
        dn, sn = diff(a, b, range(OLD_COPY, N_COPY), pmn)
        con[tag] = dict(d=round(d, 5), se=round(s_, 5), d_new=round(dn, 5), se_new=round(sn, 5))
        p(f"  {tag:30s}: {d * 100:+.2f} (se {s_ * 100:.2f}, z {d / s_ if s_ else 0:+.1f}); "
          f"copies 5-9 alone {dn * 100:+.2f} (se {sn * 100:.2f})")
    for kk in SOFT_K:
        show(f"soft k{kk:g} - unfiltered", S[kk], U)
    for kk in HARD_K:
        show(f"hard k{kk:g} - unfiltered", H[kk], U)
        show(f"soft k{kk:g} - hard k{kk:g}", S[kk], H[kk])
    for a, b in zip(SOFT_K, SOFT_K[1:]):
        show(f"soft k{b:g} - soft k{a:g}", S[b], S[a])
    show("soft k0.5 - soft k1", S[0.5], S[1.0])

    worst = {}
    p("\n## worst over kappa of pooled regret")
    for lab, d_ in (("hard", H), ("soft", S)):
        ks = list(d_)
        vals = [pm[d_[x]] for x in ks]
        j = int(np.argmax(vals))
        worst[lab] = [round(vals[j], 5), ks[j]]
        p(f"  {lab}: {vals[j] * 100:.2f} at kappa {ks[j]:g}")
    p(f"  unfiltered: {pm[U] * 100:.2f}")

    # H65: the dip is real: soft at kappa 0.5 worse than soft at kappa 1 by > 2 MC se (10 copies)
    c65 = con["soft k0.5 - soft k1"]
    h65 = bool(c65["d"] > 2 * c65["se"])
    # H66: the new copies alone reproduce milestone 20's sign: soft k0.5 - soft k1 > 0 on copies 5-9
    h66 = bool(c65["d_new"] > 0)
    # H67: milestone 20's H61 refutation survives: soft k0.5 worse than unfiltered by > 2 MC se (10 copies)
    c67 = con["soft k0.5 - unfiltered"]
    h67 = bool(c67["d"] > 2 * c67["se"])
    # H68: the half weight beats the hard filter's worst case over kappa (point estimates, 10 copies)
    h68 = bool(worst["soft"][0] < worst["hard"][0])

    def fmt(v):
        return f"{v['d'] * 100:+.2f} (se {v['se'] * 100:.2f}, z {v['d'] / v['se'] if v['se'] else 0:+.1f})"
    p(f"\nH65 (the dip is real: w = 0.5 at kappa 0.5 worse than at kappa 1 by > 2 MC se, 10 copies): "
      f"{'held' if h65 else 'refuted'}; {fmt(c65)}")
    p(f"H66 (copies 5-9 alone repeat the dip's sign): {'held' if h66 else 'refuted'}; "
      f"{c65['d_new'] * 100:+.2f} (se {c65['se_new'] * 100:.2f})")
    p(f"H67 (w = 0.5 at kappa 0.5 worse than unfiltered by > 2 MC se, 10 copies): "
      f"{'held' if h67 else 'refuted'}; {fmt(c67)}")
    p(f"H68 (worst over kappa: w = 0.5 below the hard filter, point estimates): {'held' if h68 else 'refuted'}; "
      f"soft {worst['soft'][0] * 100:.2f} at kappa {worst['soft'][1]:g}, hard {worst['hard'][0] * 100:.2f} at kappa {worst['hard'][1]:g}")
    txt = "\n".join(lines) + "\n"
    out = "smoke_verdicts" if m6.SMOKE else "verdicts"
    open(os.path.join(HERE, out + ".txt"), "w").write(txt)
    json.dump({"key": KEY, "phi": PHI, "mode": MODE, "w": W, "hard_kappa": HARD_K, "soft_kappa": SOFT_K,
               "rho": m20.RHO, "rows": rows, "contrasts": con, "worst": worst, "sanity_prior": dprior,
               "hits": [hits, hp], "h65": [c65, h65], "h66": h66, "h67": [c67, h67], "h68": h68,
               "unfiltered": U, "hard": H, "soft": S},
              open(os.path.join(HERE, out + ".json"), "w"), indent=1)
    print(txt)


if __name__ == "__main__":
    main()
