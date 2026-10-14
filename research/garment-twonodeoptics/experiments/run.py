"""Do the fabric-optics effects of garment-thermal change when the two-node design choices are the
reference's? Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeoptics import flex
warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

# name: (met, clo, ta, rh, v, tr, solar)   (clo and met as in garment-thermal's scenarios)
SCEN = {
    "cool room 16 C":              (1.2, 0.5, 16, 50, 0.1, 16, 0.0),
    "warm room 28 C":              (1.2, 0.5, 28, 50, 0.1, 28, 0.0),
    "warm air 26 C, hot walls 34": (1.2, 0.5, 26, 50, 0.1, 34, 0.0),
    "sun 32 C, 200 W/m2":          (1.6, 0.5, 32, 40, 1.0, 32, 200.0),
}
# property: (kwargs for the first end, kwargs for the second end); baseline eps .95 tau 0 alpha .5
SPANS = {
    "tau 0 -> 0.8":       (dict(tau=0.0), dict(tau=0.8)),
    "eps 0.95 -> 0.2":    (dict(eps=0.95), dict(eps=0.2)),
    "alpha 0.9 -> 0.15":  (dict(alpha=0.9), dict(alpha=0.15)),
    "clo 0.7 -> 0.3":     (dict(clo=0.7), dict(clo=0.3)),
}
OUT = ("tsk", "dry", "evap")

def effect(sc, span, opts):
    met, clo, ta, rh, v, tr, sol = SCEN[sc]
    a, b = SPANS[span]
    def go(kw):
        kw = dict(kw); c = kw.pop("clo", clo)
        return flex.run(met, c, ta, rh, v=v, opts=opts, tr=tr, solar=sol, **kw)
    ra, rb = go(a), go(b)
    return {k: rb[k] - ra[k] for k in OUT}

P("== A. Effect of moving each property across its span, after 60 min: change in skin temperature (C) and dry heat loss (W/m2) ==")
P("   'ours' = garment-thermal choices, 'ref' = pythermalcomfort 4.6.1 choices; same optical extension in both")
rank = {}
for sc in SCEN:
    P(sc)
    rows = []
    for sp in SPANS:
        eo, er = effect(sc, sp, flex.OURS), effect(sc, sp, flex.REF)
        rows.append((sp, eo, er))
        P(f"   {sp:20s} dTsk ours {eo['tsk']:+.2f} ref {er['tsk']:+.2f} | dDry ours {eo['dry']:+6.1f} ref {er['dry']:+6.1f} | dEvap ours {eo['evap']:+6.1f} ref {er['evap']:+6.1f}")
    rank[sc] = rows

P("\n== B. Does the ranking of properties (by |dry-loss effect|) or any sign change? ==")
for sc, rows in rank.items():
    ro = [r[0] for r in sorted(rows, key=lambda r: -abs(r[1]['dry']))]
    rr = [r[0] for r in sorted(rows, key=lambda r: -abs(r[2]['dry']))]
    flips = [r[0] for r in rows if r[1]['dry'] * r[2]['dry'] < 0 or r[1]['tsk'] * r[2]['tsk'] < 0]
    P(f"{sc}: ours order {ro} | ref order {rr} | same order: {ro == rr} | sign changes: {flips or 'none'}")

P("\n== C. Ratio ref/ours of the dry-loss effect (|ratio| far from 1 = the conclusion's size depends on the implementation) ==")
for sc, rows in rank.items():
    P(sc + ": " + "; ".join(f"{sp} {er['dry'] / eo['dry']:.2f}" if abs(eo['dry']) > 0.5 else f"{sp} n/a (|ours|<0.5)" for sp, eo, er in rows))

P("\n== D. Which single design choice moves the dry-loss effect most? (all others 'ours'; the choice set to 'ref') ==")
for sc in SCEN:
    for sp in SPANS:
        base = effect(sc, sp, flex.OURS)["dry"]
        if abs(base) < 1.0:
            continue
        sh = sorted(((abs(effect(sc, sp, dict(flex.OURS, **{f: 'ref'}))["dry"] - base), f) for f in flex.OURS), reverse=True)
        P(f"{sc} / {sp}: ours {base:+.1f}; largest shifts " + ", ".join(f"{f} {d:.1f}" for d, f in sh[:3]))

try:
    import pythermalcomfort
    P(f"\npythermalcomfort {pythermalcomfort.__version__}")
except Exception:
    P("\npythermalcomfort not importable")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
