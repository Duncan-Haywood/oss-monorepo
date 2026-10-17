"""Optics effects after 60 min vs at steady state (1440 min), under 'ours' and 'ref' design choices.
Deterministic; writes experiments/results.txt."""
import os, sys, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodesteady import steady
warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

SCEN = {
    "cool room 16 C":              (1.2, 0.5, 16, 50, 0.1, 16, 0.0),
    "warm room 28 C":              (1.2, 0.5, 28, 50, 0.1, 28, 0.0),
    "warm air 26 C, hot walls 34": (1.2, 0.5, 26, 50, 0.1, 34, 0.0),
    "sun 32 C, 200 W/m2":          (1.6, 0.5, 32, 40, 1.0, 32, 200.0),
}
SPANS = {
    "tau 0 -> 0.8":       (dict(tau=0.0), dict(tau=0.8)),
    "eps 0.95 -> 0.2":    (dict(eps=0.95), dict(eps=0.2)),
    "alpha 0.9 -> 0.15":  (dict(alpha=0.9), dict(alpha=0.15)),
    "clo 0.7 -> 0.3":     (dict(clo=0.7), dict(clo=0.3)),
}
CH = {"ours": steady.OURS, "ref": steady.REF}

def go(sc, kw, opts, minutes):
    met, clo, ta, rh, v, tr, sol = SCEN[sc]
    kw = dict(kw); c = kw.pop("clo", clo)
    return steady.run(met, c, ta, rh, v=v, opts=opts, tr=tr, solar=sol, minutes=minutes, **kw)

def effect(sc, sp, opts, minutes):
    a, b = SPANS[sp]
    ra, rb = go(sc, a, opts, minutes), go(sc, b, opts, minutes)
    return {k: rb[k] - ra[k] for k in ("tsk", "tcr", "dry")}

P("== A. Has the model reached steady state by 1440 min? Largest change in tsk, tcr, dry, evap between 1440 and 2880 min, over all runs below ==")
worst = 0.0
for sc in SCEN:
    for nm, o in CH.items():
        for sp, ends in SPANS.items():
            for kw in ends:
                a, b = go(sc, kw, o, steady.STEADY), go(sc, kw, o, steady.CHECK)
                worst = max(worst, max(abs(a[k] - b[k]) for k in ("tsk", "tcr", "dry", "evap")))
P(f"worst change: {worst:.4f}")

P("\n== B. Effect of each property across its span: 60 min vs steady state. dTsk (C), dTcr (C), dDry (W/m2) ==")
eff = {}
for sc in SCEN:
    P(sc)
    for sp in SPANS:
        row = []
        for nm, o in CH.items():
            for tag, m in (("60", steady.HOUR), ("ss", steady.STEADY)):
                e = effect(sc, sp, o, m); eff[sc, sp, nm, tag] = e
                row.append(f"{nm}@{tag}: {e['tsk']:+.2f} {e['tcr']:+.2f} {e['dry']:+6.1f}")
        P(f"   {sp:19s} " + " | ".join(row))

P("\n== C. Does the ranking of properties by |dry-loss effect| change between 60 min and steady state? ==")
for sc in SCEN:
    for nm in CH:
        r = {t: [s for s in sorted(SPANS, key=lambda s: -abs(eff[sc, s, nm, t]['dry']))] for t in ("60", "ss")}
        sg = [s for s in SPANS if eff[sc, s, nm, '60']['dry'] * eff[sc, s, nm, 'ss']['dry'] < 0]
        P(f"{sc} / {nm}: same order {r['60'] == r['ss']}; order@ss {r['ss']}; dry-effect sign changes {sg or 'none'}")

P("\n== D. Ratio steady/60 min of the dry-loss effect (n/a where either |effect| < 0.5 W/m2) ==")
for sc in SCEN:
    for nm in CH:
        P(f"{sc} / {nm}: " + "; ".join(
            (f"{sp} {eff[sc, sp, nm, 'ss']['dry'] / eff[sc, sp, nm, '60']['dry']:.2f}"
             if min(abs(eff[sc, sp, nm, 'ss']['dry']), abs(eff[sc, sp, nm, '60']['dry'])) > 0.5 else f"{sp} n/a") for sp in SPANS))

P("\n== E. Ref/ours ratio of the dry-loss effect at steady state (compare 60-min ratios in garment-twonodeoptics) ==")
for sc in SCEN:
    P(f"{sc}: " + "; ".join(
        (f"{sp} {eff[sc, sp, 'ref', 'ss']['dry'] / eff[sc, sp, 'ours', 'ss']['dry']:.2f}"
         if abs(eff[sc, sp, 'ours', 'ss']['dry']) > 0.5 else f"{sp} n/a") for sp in SPANS))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
