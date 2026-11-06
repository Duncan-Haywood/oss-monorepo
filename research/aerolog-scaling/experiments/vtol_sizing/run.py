"""Milestone 10a: where does a battery-electric lift-plus-cruise cargo VTOL stop closing, and what does a hybrid buy?

Predictions (written before the first run):
 (1) at 250 Wh/kg cell, L/D 12, payload fraction at least 0.15, the battery aircraft reaches a one-way range
     (20% reserve) between 80 and 200 km;
 (2) range at fixed payload fraction rises about linearly with cell specific energy (the mass budget is linear);
 (3) a hybrid (turbogenerator + jet fuel) overtakes the battery aircraft beyond 150 km at 250 Wh/kg.

Model (stdlib, all fractions of MTOW W; disk loading fixed so hover power is linear in W):
  hover power  Ph = W g sqrt(DL / (2 rho)) / (FM eta_h)            (momentum theory with figure of merit)
  hover time   2 x 60 s (takeoff + landing); cruise energy  Ec = W g R / (LD eta_c)  (V cancels)
  battery:     mb = 1.2 (Eh + Ec) / (e_cell kpack u)               (1.2 = reserve; u = usable depth of discharge)
  propulsion:  mp = 1.2 Ph / p_spec ; structure+systems fs W ; fixed avionics/safety m0
  hybrid:      fuel mf = 1.2 (Eh+Ec) / (e_fuel eta_chain); generator mg = Ph/p_gen; small battery for hover reserve ignored
Closure: W = (P + m0) / (1 - fs - fp - fb).  Max range = largest R with payload fraction >= f_min.
Sourced: jet fuel 43 MJ/kg (11.94 kWh/kg, standard value); g, rho ISA sea level.  Everything else is assumed and swept
(no single published cargo VTOL is fitted here): see results.txt.
"""
import itertools
import math

G, RHO = 9.80665, 1.225
E_FUEL = 43.0e6 / 3600.0       # Wh/kg jet fuel lower heating value
T_HOVER = 120.0                 # s, takeoff plus landing
RESERVE = 1.2

def fractions(R, e_cell, LD=12.0, DL=150.0, fs=0.35, FM=0.7, eta_h=0.85, eta_c=0.85,
              kpack=0.7, u=0.9, p_spec=3000.0, hybrid=False, eta_chain=0.25, p_gen=2000.0):
    """Non-payload mass fractions of MTOW for range R (m). Returns (fs, fprop_or_gen, fenergy)."""
    ph_over_w = G * math.sqrt(DL / (2 * RHO)) / (FM * eta_h)         # W per kg MTOW
    eh_over_w = ph_over_w * T_HOVER / 3600.0                          # Wh per kg
    ec_over_w = G * R / (LD * eta_c) / 3600.0                         # Wh per kg
    etot = RESERVE * (eh_over_w + ec_over_w)
    if hybrid:
        fe = etot / (E_FUEL * eta_chain)
        fp = RESERVE * ph_over_w / p_spec + ph_over_w / p_gen         # motors plus generator
    else:
        fe = etot / (e_cell * kpack * u)
        fp = RESERVE * ph_over_w / p_spec
    return fs, fp, fe

def mtow(P, R, e_cell, m0=2.0, **kw):
    fs, fp, fe = fractions(R, e_cell, **kw)
    free = 1 - fs - fp - fe
    return None if free <= 0 else (P + m0) / free

def max_range(P, e_cell, fmin=0.15, m0=2.0, **kw):
    """Largest one-way range (km) with payload/MTOW >= fmin, by bisection."""
    lo, hi = 0.0, 1500e3
    def ok(R):
        W = mtow(P, R, e_cell, m0, **kw)
        return W is not None and P / W >= fmin
    if not ok(1.0):
        return 0.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return lo / 1000.0

def main():
    print("Milestone 10a: cargo VTOL sizing, battery against hybrid (one-way range, 20% reserve, payload >= 15% of MTOW)")
    base = dict(LD=12.0, DL=150.0, fs=0.35)
    print("\nA. Base case (L/D 12, DL 150 N/m2, structure 0.35, FM 0.7): max range km vs payload and cell Wh/kg")
    print("payload kg | " + " ".join(f"{e:>6d}" for e in (200, 250, 300, 400, 500)) + " | hybrid, chain eff 0.12 0.18 0.25 (cap 1500 km)")
    for P in (5, 25, 100, 250, 500):
        row = [max_range(P, e, **base) for e in (200, 250, 300, 400, 500)]
        h = [max_range(P, 250, hybrid=True, eta_chain=c, **base) for c in (0.12, 0.18, 0.25)]
        print(f"{P:10d} | " + " ".join(f"{r:6.0f}" for r in row) + " | " + " ".join(f"{x:5.0f}" for x in h))
    print("\nB. Cell specific energy needed (Wh/kg) for 100, 200, 300 km at payload 100 kg, 15% payload fraction, over the sweep")
    print("LD  DL  fs   | 100km 200km 300km")
    for LD, DL, fs in itertools.product((10, 12, 16), (100, 200), (0.30, 0.35, 0.45)):
        need = []
        for Rk in (100, 200, 300):
            e = None
            for cand in range(100, 2001, 5):
                if max_range(100, cand, LD=LD, DL=DL, fs=fs) >= Rk:
                    e = cand
                    break
            need.append(e)
        print(f"{LD:3d} {DL:3d} {fs:.2f} | " + " ".join(f"{(str(x) if x else '>2000'):>5}" for x in need))
    print("\nC. Hybrid break-even: shortest one-way range (km) beyond which hybrid has the larger payload fraction, 100 kg payload")
    for e in (250, 350, 500):
        cross = None
        for Rk in range(5, 1000, 5):
            R = Rk * 1000.0
            Wb, Wh = mtow(100, R, e, **base), mtow(100, R, e, hybrid=True, **base)
            if Wb is None and Wh is not None or (Wb and Wh and Wh < Wb):
                cross = Rk
                break
        print(f"cell {e} Wh/kg: hybrid lighter from {cross} km (chain efficiency 0.25)")
    print("\nD. Linearity check (prediction 2): range at 100 kg per 100 Wh/kg of cell energy (base case)")
    r = [max_range(100, e, **base) for e in (200, 300, 400, 500)]
    print("ranges " + " ".join(f"{x:.0f}" for x in r) + "  steps " + " ".join(f"{b-a:.0f}" for a, b in zip(r, r[1:])))
    print("\nE. Sensitivity of base-case 250 Wh/kg range (100 kg) to each input, one at a time, low / base / high")
    for name, vals in (("LD", (10, 12, 16)), ("DL", (100, 150, 250)), ("fs", (0.30, 0.35, 0.45)),
                       ("FM", (0.6, 0.7, 0.75)), ("kpack", (0.6, 0.7, 0.8))):
        kw = dict(base)
        out = []
        for v in vals:
            kw2 = dict(kw)
            kw2[name] = v
            out.append(max_range(100, 250, **kw2))
        print(f"{name:6s} {vals} -> " + " ".join(f"{x:.0f}" for x in out) + " km")

if __name__ == "__main__":
    main()
