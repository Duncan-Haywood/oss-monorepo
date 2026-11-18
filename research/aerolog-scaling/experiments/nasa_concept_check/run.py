"""Milestone 10b: check the 10a sizing model against published NASA concept-vehicle weights.

Source (read this session from the NTRS full text): Johnson, Silva and Solis, "Concept vehicles for VTOL air taxi
operations", AHS Technical Conference 2018, NTRS 20180003381, Tables 9 and 10 (electric quadrotor, electric
side-by-side helicopter; NDARC sizing, 400 Wh/kg installed battery, 5000 ft ISA+20 C). Mission: 2 min hover to take
off and 2 min to land per 50 nm leg, cruise at best-range speed, reserve 20 min at cruise speed.

Predictions (written before the first run):
 (P1) Calibrate the usable fraction u of the 400 Wh/kg installed pack on the quadrotor's published battery fraction
      (0.217); the energy model then predicts the side-by-side's published battery fraction (0.306) within 10%.
 (P2) The published non-energy, non-payload fraction (empty weight less battery, over gross weight) of both electric
      designs is above 0.45, so 10a's assumed 0.40 (structure 0.35 plus motors 0.05) was optimistic.
 (P3) With the published fractions, a 250 Wh/kg pack at 15% payload fraction reaches less than half of 10a's 203 km.

Inputs from the tables (aircraft values, taken as overall efficiencies): quadrotor DL 2.5 lb/ft2, FM 0.71,
L/De = WV/P 5.24, cruise 70 kn, payload 250 lb, 50 nm, DGW 1252 lb, battery/GW 0.217, (WO-battery)/GW 0.583;
side-by-side electric DL 3.5, FM 0.69, L/De 7.32, 100 kn, payload 1200 lb, 100 nm (two 50 nm legs), DGW 5585 lb,
battery/GW 0.306, (WO-battery)/GW 0.479. Air density at 5000 ft ISA+20 C from p/(R T): 0.985 kg/m3.
"""
import math

G, LB, FT, NM, KN = 9.80665, 0.45359237, 0.3048, 1852.0, 0.514444
RHO = 84300.0 / (287.05 * 298.24)   # 5000 ft: p = 84.3 kPa (ISA), T = 278.24 + 20 K

DESIGNS = {
    "quadrotor": dict(dl=2.5, fm=0.71, lde=5.24, vkn=70, payload_lb=250, legs=1, dgw_lb=1252, fb=0.217, fne=0.583),
    "side-by-side": dict(dl=3.5, fm=0.69, lde=7.32, vkn=100, payload_lb=1200, legs=2, dgw_lb=5585, fb=0.306, fne=0.479),
}

def energy_per_kg(d, range_m=None, legs=None):
    """Wh per kg of gross weight: 4 min hover per leg + cruise + 20 min reserve at cruise speed."""
    legs = d["legs"] if legs is None else legs
    R = range_m if range_m is not None else legs * 50 * NM
    dl = d["dl"] * LB * G / FT**2                      # N/m2
    ph = G * math.sqrt(dl / (2 * RHO)) / d["fm"]       # W/kg
    v = d["vkn"] * KN
    return (ph * 240.0 * legs + G * R / d["lde"] * 1.0 + G * v / d["lde"] * 1200.0) / 3600.0

def batt_frac(d, e_installed, u, range_m=None):
    return energy_per_kg(d, range_m) / (e_installed * u)

def max_range_km(d, e_installed, u, fne, fmin=0.15):
    """Largest one-way range with payload/GW >= fmin when non-energy fraction is fne (one 4 min hover pair)."""
    lo, hi = 0.0, 2000e3
    for _ in range(60):
        mid = (lo + hi) / 2
        dd = dict(d, legs=1)   # one hover pair; the range itself is mid
        fb = energy_per_kg(dd, mid) / (e_installed * u)
        ok = 1 - fne - fb >= fmin
        lo, hi = (mid, hi) if ok else (lo, mid)
    return lo / 1000.0

def main():
    print("Milestone 10b: 10a model against NASA concept vehicles (Johnson et al. 2018, Tables 9 and 10)")
    print(f"air density {RHO:.3f} kg/m3 (5000 ft, ISA+20 C)\n")
    print("A. Energy model: battery fraction at installed 400 Wh/kg")
    print("design        | Wh/kg GW | published fb | u implied | fb at u=1  fb at u=0.8")
    u_imp = {}
    for n, d in DESIGNS.items():
        e = energy_per_kg(d)
        u_imp[n] = e / (400.0 * d["fb"])
        print(f"{n:13s} | {e:8.1f} | {d['fb']:.3f}        | {u_imp[n]:.3f}     | {e/400:.3f}      {e/320:.3f}")
    u = u_imp["quadrotor"]
    pred = batt_frac(DESIGNS["side-by-side"], 400.0, u)
    pub = DESIGNS["side-by-side"]["fb"]
    print(f"\nP1: u calibrated on the quadrotor = {u:.3f}; predicted side-by-side battery fraction {pred:.3f} vs published {pub:.3f} "
          f"({100*(pred/pub-1):+.1f}%)")
    print("\nB. Gross weight closure at u calibrated on the quadrotor, using each design's published non-energy fraction")
    for n, d in DESIGNS.items():
        P = d["payload_lb"] * LB
        fb = batt_frac(d, 400.0, u)
        W = P / (1 - d["fne"] - fb)
        print(f"{n:13s} predicted DGW {W/LB:7.0f} lb vs published {d['dgw_lb']} ({100*(W/LB/d['dgw_lb']-1):+.1f}%)")
    # cross-use: quadrotor's non-energy fraction on the side-by-side and the reverse
    print("\nB2. Swapping non-energy fractions (does one design's fraction transfer?)")
    for n, m in (("side-by-side", "quadrotor"), ("quadrotor", "side-by-side")):
        d = DESIGNS[n]
        P = d["payload_lb"] * LB
        fb = batt_frac(d, 400.0, u)
        W = P / (1 - DESIGNS[m]["fne"] - fb)
        print(f"{n:13s} with {m}'s fraction {DESIGNS[m]['fne']:.3f}: DGW {W/LB:7.0f} lb vs published {d['dgw_lb']} ({100*(W/LB/d['dgw_lb']-1):+.1f}%)")
    print("\nC. Published non-energy fractions against 10a's assumed 0.40")
    for n, d in DESIGNS.items():
        print(f"{n:13s} {d['fne']:.3f}")
    print("\nD. Max one-way range (km), 15% payload fraction, one hover pair, 20 min reserve, u from A, base 10a gave 203 km at 250 Wh/kg")
    print("design        fne    | 250 Wh/kg   400 Wh/kg  (installed)")
    for n, d in DESIGNS.items():
        for fne in (d["fne"], 0.40):
            r = [max_range_km(d, e, u, fne) for e in (250.0, 400.0)]
            print(f"{n:13s} {fne:.3f} | {r[0]:8.0f}   {r[1]:8.0f}")

if __name__ == "__main__":
    main()
