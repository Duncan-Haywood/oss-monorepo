"""Ablation of the design choices between garment-thermal's two-node model and pythermalcomfort's.
Deterministic. Writes experiments/results.txt."""
import itertools, os, sys, warnings
from importlib.metadata import version
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodealign import flex, base
from pythermalcomfort.models import two_nodes_gagge
warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

GRID = list(itertools.product([18, 24, 30, 36], [30, 60, 80], [1.0, 1.5, 2.0], [0.3, 0.7, 1.0]))
KEYS = [("tsk", "t_skin"), ("tcr", "t_core"), ("evap", "e_skin"), ("dry", "q_sensible")]
REFV = {}
for ta, rh, met, clo in GRID:
    r = two_nodes_gagge(tdb=ta, tr=ta, v=0.1, rh=rh, met=met, clo=clo, round_output=False)
    REFV[(ta, rh, met, clo)] = {k: float(getattr(r, n)) for k, n in KEYS}

def gap(opts):
    """mean |model - reference| over the grid, per quantity."""
    d = {k: [] for k, _ in KEYS}
    for g in GRID:
        o = flex.run(g[2], g[3], g[0], g[1], opts=opts)
        for k, _ in KEYS:
            d[k].append(abs(o[k] - REFV[g][k]))
    return {k: float(np.mean(v)) for k, v in d.items()}

FLAGS = list(flex.OURS)
P("pythermalcomfort", version("pythermalcomfort"), "| numpy", np.__version__, "| grid", len(GRID), "conditions (ta = tr, v 0.1 m/s)")

P("\n== A. endpoint checks: the switchable model with all flags 'ours' / all 'ref' ==")
dm_o = dm_r = 0.0
for g in GRID:
    ours = base.two_node(g[2], base.Fabric(clo=g[3], im=0.45), base.Env(g[0], g[0], 0.1, g[1]), minutes=60)
    a = flex.run(g[2], g[3], g[0], g[1], opts=flex.OURS)
    b = flex.run(g[2], g[3], g[0], g[1], opts=flex.REF)
    dm_o = max(dm_o, *(abs(a[k] - ours[k]) for k in ("tsk", "tcr", "evap", "dry")))
    dm_r = max(dm_r, *(abs(b[k] - REFV[g][k]) for k, _ in KEYS))
P(f"max |all-ours - garment-thermal two_node| = {dm_o:.2e} (t_skin, t_core C; evap, dry W/m2)")
P(f"max |all-ref  - pythermalcomfort|         = {dm_r:.2e}")

base_gap = gap(flex.OURS); ref_gap = gap(flex.REF)
fmt = lambda d: "  ".join(f"{n} {d[k]:.3f}" for k, n in KEYS)
P("\nmean |difference to pythermalcomfort| (t_skin C, t_core C, e_skin W/m2, q_sensible W/m2)")
P("all ours :", fmt(base_gap)); P("all ref  :", fmt(ref_gap))

P("\n== B. one at a time: switch ONE choice from ours to ref (others stay ours) ==")
P(f"{'flag':9s} " + "  ".join(f"{n:>10s}" for _, n in KEYS))
solo = {}
for f in FLAGS:
    solo[f] = gap(dict(flex.OURS, **{f: "ref"}))
    P(f"{f:9s} " + "  ".join(f"{solo[f][k]:10.3f}" for k, _ in KEYS))

P("\n== C. leave one out: all ref except ONE choice kept as ours (gap that choice alone causes) ==")
P(f"{'flag':9s} " + "  ".join(f"{n:>10s}" for _, n in KEYS))
loo = {}
for f in FLAGS:
    loo[f] = gap(dict(flex.REF, **{f: "ours"}))
    P(f"{f:9s} " + "  ".join(f"{loo[f][k]:10.3f}" for k, _ in KEYS))

P("\n== D. greedy cumulative alignment (each step switches the choice that most lowers mean |d t_skin|) ==")
cur = dict(flex.OURS); left = list(FLAGS); P(f"start      t_skin gap {base_gap['tsk']:.3f}")
while left:
    best = min(left, key=lambda f: gap(dict(cur, **{f: "ref"}))["tsk"])
    cur[best] = "ref"; left.remove(best); g = gap(cur)
    P(f"+ {best:9s} " + fmt(g))

P("\n== E. where is the original gap largest? all-ours mean |d t_skin| by air temperature ==")
for ta in (18, 24, 30, 36):
    sub = [g for g in GRID if g[0] == ta]
    d = np.mean([abs(flex.run(g[2], g[3], g[0], g[1], opts=flex.OURS)["tsk"] - REFV[g]["tsk"]) for g in sub])
    P(f"ta {ta} C: all-ours mean |d t_skin| {d:.2f} C")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
