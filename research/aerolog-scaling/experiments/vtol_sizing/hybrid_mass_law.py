"""Milestone 10e: where does a hybrid cargo VTOL stop closing once the engine and tank have mass?

Predictions (written before the first run):
 (P1) with engine specific power 1 kW/kg (piston class), tank = 0.25 of fuel mass, chain efficiency 0.20 and
      non-energy fraction 0.479 (NASA side-by-side, 10b), the hybrid still beats a 250 Wh/kg battery aircraft
      beyond 100 km but now has a finite maximum range below 1,500 km;
 (P2) the hybrid's max range is set mostly by engine specific power at short range and by chain efficiency at long;
 (P3) the hybrid-over-battery break-even range at 250 Wh/kg rises by at least 3x compared with 10a (20 km).
Model: 10a's energy model. Non-energy fraction f_non fixed (airframe + motors + fixed systems). Hybrid adds
generator+engine mass Ph*1.2/p_eng (sized for hover power, no battery buffer), fuel mass 1.2*E/(e_fuel*eta_chain),
tank = k_tank * fuel. Jet fuel 43 MJ/kg is standard; everything else is swept, no engine datasheet is fitted.
"""
import itertools
from run import fractions, G, E_FUEL, RESERVE
import math

def hyb_free(R, fnon, p_eng, k_tank, eta_chain, DL=150.0, LD=12.0):
    fs, fp, fe = fractions(R, 250, hybrid=True, eta_chain=eta_chain, p_gen=1e12, p_spec=1e12, DL=DL, LD=LD)
    ph = G * math.sqrt(DL / (2 * 1.225)) / (0.7 * 0.85)
    eng = RESERVE * ph / 1000.0 / p_eng          # engine+generator kg per kg MTOW (p_eng in kW/kg)
    return 1 - fnon - eng - fe * (1 + k_tank)

def bat_free(R, fnon, e_cell=250):
    return 1 - fnon - fractions(R, e_cell)[2]

def maxr(fn, fmin=0.15, cap=1500e3):
    ok = lambda R: fn(R) >= fmin
    if not ok(1.0): return 0.0
    if ok(cap): return cap / 1e3
    lo, hi = 0.0, cap
    for _ in range(60):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if ok(m) else (lo, m)
    return lo / 1e3

def breakeven(fnon, p_eng, k_tank, eta):
    for Rk in range(1, 1501):
        R = Rk * 1e3
        if hyb_free(R, fnon, p_eng, k_tank, eta) > bat_free(R, fnon):
            return Rk
    return None

def main():
    print("Milestone 10e: hybrid cargo VTOL with engine and tank mass (one-way, 20% reserve, payload >= 15% MTOW)")
    print("\nA. Max range km, hybrid. f_non=0.479, tank 0.25 of fuel; rows engine kW/kg, cols chain efficiency")
    etas = (0.12, 0.18, 0.25, 0.30)
    print("p_eng |" + "".join(f"{e:>8}" for e in etas))
    for p in (0.5, 1, 2, 4, 8):
        print(f"{p:5} |" + "".join(f"{maxr(lambda R: hyb_free(R, .479, p, .25, e)):8.0f}" for e in etas))
    print("\nB. Same, f_non 0.402 (10a) and 0.583 (NASA quadrotor), p_eng 1 kW/kg, eta 0.20")
    for f in (0.402, 0.479, 0.583):
        print(f"f_non {f}: hybrid {maxr(lambda R: hyb_free(R, f, 1, .25, .20)):.0f} km, battery 250 Wh/kg {maxr(lambda R: bat_free(R, f)):.0f} km, battery 500 Wh/kg {maxr(lambda R: bat_free(R, f, 500)):.0f} km")
    print("\nC. Break-even range km (hybrid has larger payload fraction), f_non 0.479, battery 250 Wh/kg")
    print("p_eng k_tank eta -> km")
    for p, k, e in itertools.product((0.5, 1, 4), (0.15, 0.5), (0.12, 0.2, 0.3)):
        print(f"{p:5} {k:6} {e:4} -> {breakeven(.479, p, k, e)}")
    print("\nD. Sensitivity of hybrid max range (km), base p_eng 1, tank 0.25, eta 0.20, f_non 0.479")
    base = dict(p_eng=1, k_tank=.25, eta_chain=.20)
    for k, vals in (("p_eng", (0.5, 1, 2)), ("k_tank", (0.1, .25, .6)), ("eta_chain", (.12, .2, .3))):
        out = []
        for v in vals:
            a = dict(base); a[k] = v
            out.append(maxr(lambda R: hyb_free(R, .479, **a)))
        print(f"{k}: {vals} -> " + " ".join(f"{x:.0f}" for x in out))

if __name__ == "__main__":
    main()
