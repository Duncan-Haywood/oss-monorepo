"""All experiments for hanger-fold; writes results.txt (deterministic) and population.json.

PYTHONPATH=src python3 experiments/run.py      about 3 minutes on 4 cores
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_fold import model as M  # noqa: E402
from hanger_fold.learn import FEATURE_SETS, Logistic, Tree, cross_validate, sample_population, score_choice, sense  # noqa: E402
from hanger_fold.pop import simulate_all  # noqa: E402

HERE = Path(__file__).resolve().parent
N = 600
out = []


def say(s=""):
    print(s)
    out.append(s)


def costs(fabrics, sims, lam=M.LAMBDA, **kw):
    h = np.array([M.hang_cost(f, s, lam, **kw) for f, s in zip(fabrics, sims)])
    c = np.array([M.fold_defect(f) for f in fabrics])
    return h, c


# ---- A. archetypes -----------------------------------------------------------------------------
say("A. Archetypes, size M (cm of shape-error equivalent; lower is better)")
say(f"{'fabric':8s} {'mass g':>6s} {'shoulder strain':>15s} {'set cm':>7s} {'shape err':>9s} {'hang':>6s} {'fold':>6s}  choice")
arch_rows = {}
for a in M.ARCHETYPES:
    f = M.make("M", a)
    s = M.simulate_hang(f)
    hc, fc = M.hang_cost(f, s), M.fold_defect(f)
    arch_rows[a] = dict(hang=hc, fold=fc)
    say(f"{a:8s} {f.mass:6.0f} {s['shoulder_strain']:15.3f} {M.hang_set(f, s):7.3f} {s['err']:9.2f} {hc:6.2f} {fc:6.2f}  {M.decide(f, s)}")

# ---- B. population -----------------------------------------------------------------------------
fabrics = sample_population(N, seed=1)
sims = simulate_all(fabrics)
h, c = costs(fabrics, sims)
y = (h <= c).astype(float)
say()
say(f"B. Synthetic population (N={N}, lognormal spread on every constant, seed 1)")
say(f"{'archetype':8s} {'n':>4s} {'share hung':>10s} {'mean hang':>9s} {'mean fold':>9s}")
for a in M.ARCHETYPES:
    m = np.array([f.name == a for f in fabrics])
    say(f"{a:8s} {m.sum():4d} {y[m].mean():10.2f} {h[m].mean():9.2f} {c[m].mean():9.2f}")
say(f"all: hang is better for {y.mean():.0%}; always-hang regret {np.mean(h - np.minimum(h, c)):.3f} cm, "
    f"always-fold regret {np.mean(c - np.minimum(h, c)):.3f} cm; oracle cost {np.minimum(h, c).mean():.3f} cm")

# ---- C. learned rules --------------------------------------------------------------------------
say()
say("C. Learned hang-or-fold rule, 5-fold cross-validation, noisy sensing (size sd 1 cm, mass 5%, stretch 10% + 0.002)")
say(f"{'features':22s} {'learner':12s} {'accuracy':>8s} {'regret cm':>9s}")
X = sense(fabrics, sims, seed=2)
base = {
    "always hang": score_choice(np.ones(N), y, h, c),
    "always fold": score_choice(np.zeros(N), y, h, c),
}
for k, v in base.items():
    say(f"{k:22s} {'-':12s} {v['acc']:8.3f} {v['regret']:9.3f}")
cv = {}
for name, cols in FEATURE_SETS.items():
    idx = [{"half_shoulder": 0, "mass": 1, "stretch": 2, "class": 3}[k] for k in cols]
    Xs = X[:, idx]
    for ln, mk in (("tree d2", lambda: Tree(2)), ("tree d3", lambda: Tree(3)),
                   ("logistic", lambda: Logistic())):
        if name == "all + fabric class" and ln == "logistic":
            continue   # class is categorical; the tree handles it as an ordinal split
        r = cross_validate(mk, Xs, y, h, c)
        cv[(name, ln)] = r
        say(f"{name:22s} {ln:12s} {r['acc']:8.3f} {r['regret']:9.3f}")
oracle = score_choice(y, y, h, c)
say(f"{'oracle (true model)':22s} {'-':12s} {oracle['acc']:8.3f} {oracle['regret']:9.3f}")

full = Tree(2).fit(X[:, :3], y)
say()
say("Rule from a depth-2 tree on size, mass and stretch (fit on all N; features: 0 = shoulder cm, 1 = mass g, 2 = lift stretch):")
say(full.describe(["shoulder_cm", "mass_g", "lift_stretch"]).rstrip())

# ---- D. robustness -----------------------------------------------------------------------------
say()
say("D. How the decision moves with the assumptions (share of the same 600 garments better hung; "
    "'flips' = garments whose best action differs from the baseline in B)")
say(f"{'assumption':34s} {'share hung':>10s} {'flips':>6s}")
sweeps = [("baseline", dict())]
sweeps += [(f"lambda = {l:g} (stretch penalty)", dict(lam=l)) for l in (0.3, 1.0, 10.0, 30.0)]
sweeps += [(f"hang time {t:g} h", dict(t_hang=t)) for t in (4.0, 48.0)]
sweeps += [(f"set_gain x{k:g}", dict(set_gain_scale=k)) for k in (0.25, 4.0)]
for label, kw in sweeps:
    kw = dict(kw)
    lam = kw.pop("lam", M.LAMBDA)
    sg = kw.pop("set_gain_scale", None)
    hh = np.array([M.hang_cost(f, s, lam, **({"set_gain": f.set_gain * sg} if sg else {}), **kw)
                   for f, s in zip(fabrics, sims)])
    yy = (hh <= c).astype(float)
    say(f"{label:34s} {yy.mean():10.2f} {int((yy != y).sum()):6d}")
fold_sweeps = [("fold crease depth x0.5", dict(depth=0.5)), ("fold crease depth x2", dict(depth=2.0)),
               ("stack time 6 h", dict(t_stack=6.0)), ("fold radius 1 cm (loose stack)", dict(radius=1.0))]
for label, kw in fold_sweeps:
    cc = np.array([M.fold_defect(f, **kw) for f in fabrics])
    yy = (h <= cc).astype(float)
    say(f"{label:34s} {yy.mean():10.2f} {int((yy != y).sum()):6d}")

# ---- E. transfer across lambda -----------------------------------------------------------------
say()
say("E. A rule learned at lambda = 3 and used where the true lambda differs (tree d3, size+mass+stretch; "
    "train on 400, test on 200)")
say(f"{'true lambda':>11s} {'rule acc':>8s} {'rule regret':>11s} {'always-fold regret':>18s} {'always-hang regret':>18s}")
tr, te = np.arange(400), np.arange(400, N)
rule = Tree(3).fit(X[tr, :3], y[tr])
pred = rule.predict(X[te, :3])
for lam in (0.3, 1.0, 3.0, 10.0, 30.0):
    hh, cc = costs(fabrics, sims, lam)
    yy = (hh <= cc).astype(float)
    r = score_choice(pred, yy[te], hh[te], cc[te])
    rf = score_choice(np.zeros(len(te)), yy[te], hh[te], cc[te])
    rh = score_choice(np.ones(len(te)), yy[te], hh[te], cc[te])
    say(f"{lam:11g} {r['acc']:8.3f} {r['regret']:11.3f} {rf['regret']:18.3f} {rh['regret']:18.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
json.dump(dict(archetypes=arch_rows,
               population=[dict(name=f.name, size=f.garment.half_shoulder, mass=f.mass,
                                stretch=s["shoulder_strain"], hang=float(a), fold=float(b))
                           for f, s, a, b in zip(fabrics, sims, h, c)]),
          open(HERE / "population.json", "w"))
