"""Experiments for garment-thermal. Deterministic; no random numbers. Writes experiments/results.txt."""
import itertools, os, sys, warnings
from dataclasses import replace
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_thermal.model import Fabric, Env, pmv, ppd, two_node, comfort_equivalent_shift, dry_loss

warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

BASE = Fabric(clo=0.5, eps_out=0.95, tau_ir=0.0, alpha_sol=0.5, im=0.4)
SCEN = {
    "cool room (16 C, still air)":        (Env(16, 16, 0.1, 50, 0.0), 1.2),
    "warm room (28 C)":                   (Env(28, 28, 0.1, 50, 0.0), 1.2),
    "warm air, hot walls (26 / 34 C)":    (Env(26, 34, 0.1, 50, 0.0), 1.2),
    "sunny outdoors (32 C, 200 W/m2 on body)": (Env(32, 32, 1.0, 40, 200.0), 1.6),
}

# A. validation against pythermalcomfort (PMV only)
P("== A. PMV validation against pythermalcomfort ==")
try:
    from pythermalcomfort.models import pmv_ppd_iso
    mx, n = 0.0, 0
    for ta, rh, v, met, clo in itertools.product([16, 22, 28, 34], [30, 60, 80], [0.1, 0.3], [1.0, 1.6], [0.3, 0.7, 1.0]):
        b = pmv_ppd_iso(tdb=ta, tr=ta, vr=v, rh=rh, met=met, clo=clo)
        b = b["pmv"] if isinstance(b, dict) else b.pmv
        a = pmv(met, Fabric(clo=clo), Env(ta, ta, v, rh))
        mx = max(mx, abs(a - b)); n += 1
    P(f"{n} combinations (ta 16-34 C, rh 30-80%, v 0.1-0.3, 1.0-1.6 met, 0.3-1.0 clo, no optics): max |dPMV| = {mx:.4f}")
except Exception as e:
    P("pythermalcomfort not available:", e)
P(f"ISO 7730 style check, 22 C / 1.2 met / 0.5 clo / 0.1 m/s / 60%: PMV = {pmv(1.2, BASE, Env(22, 22, 0.1, 60)):.2f}, PPD = {ppd(pmv(1.2, BASE, Env(22, 22, 0.1, 60))):.1f}%")

# B. heat budget for the baseline fabric
P("\n== B. Dry-heat budget, baseline (cotton-like) fabric, skin at comfort temperature ==")
for name, (env, met) in SCEN.items():
    tsk = 35.7 - 0.028 * met * 58.15
    q, tcl = dry_loss(tsk, BASE, env)
    P(f"{name}: skin {tsk:.1f} C, cloth surface {tcl:.1f} C, dry loss {q:.1f} W/m2, PMV {pmv(met, BASE, env):+.2f}")

# C. fabric presets and comfort-equivalent shifts
FABRICS = {
    "baseline (eps .95, tau 0, alpha .5)":   BASE,
    "IR-transparent (tau .8)":               replace(BASE, tau_ir=0.8),
    "IR-opaque low-e outside (eps .2)":      replace(BASE, eps_out=0.2),
    "white (alpha .15)":                     replace(BASE, alpha_sol=0.15),
    "dark (alpha .9)":                       replace(BASE, alpha_sol=0.9),
    "white + IR-transparent":                replace(BASE, alpha_sol=0.15, tau_ir=0.8),
}
P("\n== C. PMV and comfort-equivalent shift (C) by scenario; shift > 0 means 'feels like the baseline in a room that much warmer' ==")
for name, (env, met) in SCEN.items():
    P(name)
    for fn, fab in FABRICS.items():
        P(f"   {fn:38s} PMV {pmv(met, fab, env):+.2f}  shift {comfort_equivalent_shift(met, BASE, fab, env):+.2f} C")

# D. one-at-a-time ranking over plausible ranges
RANGES = {
    "tau_ir 0 -> 0.8":        lambda f, hi: replace(f, tau_ir=0.8 if hi else 0.0),
    "eps_out 0.95 -> 0.2":    lambda f, hi: replace(f, eps_out=0.2 if hi else 0.95),
    "alpha_sol 0.9 -> 0.15":  lambda f, hi: replace(f, alpha_sol=0.15 if hi else 0.9),
    "clo 0.7 -> 0.3":         lambda f, hi: replace(f, clo=0.3 if hi else 0.7),
}
P("\n== D. Range of comfort-equivalent shift (C) across each property's plausible span, other properties at baseline ==")
P("shift is of the second end of the span relative to the first end; larger magnitude = property matters more")
rank = {}
for name, (env, met) in SCEN.items():
    P(name)
    rows = []
    for rn, mk in RANGES.items():
        a, b = mk(BASE, False), mk(BASE, True)
        rows.append((rn, comfort_equivalent_shift(met, a, b, env)))
    for rn, s in sorted(rows, key=lambda r: -abs(r[1])):
        P(f"   {rn:24s} {s:+.2f} C")
    rank[name] = rows

# E. gated infrared textile: bounds from the two fixed states (toy; no switching dynamics)
P("\n== E. Bounds for an infrared-gating textile: two-node end state after 3 h for closed (tau .15) and open (tau .8) ==")
for room, env in [("hot room 31 C / 50%", Env(31, 31, 0.1, 50, 0.0)), ("cool room 16 C / 50%", Env(16, 16, 0.1, 50, 0.0))]:
    for label, tau in [("closed tau .15", 0.15), ("open tau .8", 0.8)]:
        r = two_node(1.2, replace(BASE, tau_ir=tau), env, minutes=180)
        P(f"   {room:20s} {label:15s} skin {r['tsk']:.2f} C core {r['tcr']:.2f} C wettedness {r['wet']:.2f} sweat {r['sweat_g']:.0f} g")

# F. two-node, hot humid, by fabric (includes moisture permeability)
P("\n== F. Two-node model, 3 h at 1.2 met, 34 C air and radiant, 60% rh, v 0.1 ==")
env = Env(34, 34, 0.1, 60, 0.0)
FAB2 = dict(FABRICS)
FAB2["baseline, im .2 (poor vapour)"] = replace(BASE, im=0.2)
FAB2["baseline, im .6 (breathable)"] = replace(BASE, im=0.6)
FAB2["IR-transparent, im .6"] = replace(BASE, tau_ir=0.8, im=0.6)
for fn, fab in FAB2.items():
    r = two_node(1.2, fab, env, minutes=180)
    P(f"   {fn:38s} skin {r['tsk']:.2f} C core {r['tcr']:.2f} C wettedness {r['wet']:.2f} sweat {r['sweat_g']:.0f} g")
P("\n== G. Two-node, cool room 16 C, 3 h, 1.2 met ==")
env = Env(16, 16, 0.1, 50, 0.0)
for fn, fab in list(FABRICS.items())[:3]:
    r = two_node(1.2, fab, env, minutes=180)
    P(f"   {fn:38s} skin {r['tsk']:.2f} C core {r['tcr']:.2f} C")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
