"""Milestone 10k: does adding climb and transition to the cruise-sized hybrid (10j) move its break-even or max range?

Predictions (written before the first run):
 (P1) base case (engine 1 kW/kg, eta_chain 0.20, tank 0.25, climb 100 m at 2 m/s, transition 30 s at 0.6 x hover
      power): the break-even against the 250 Wh/kg battery aircraft rises from 10j's 35 km, but stays under 45 km;
 (P2) max range at the base case stays within 10% of 10j's 1,468 to 1,500 km (cap 1,500);
 (P3) the battery's extra mass is set by peak power (p_batt), not energy: the 1.5 kW/kg pack gives a lower payload
      fraction than a 3 kW/kg pack at 150 km by more than 0.02.
Model: 10j (imports it). The battery now covers hover (2 x 60 s, as 10j) plus a climb phase of h / v_c seconds at
power ph + g v_c / (eta_fm eta_p) per kg (hover power plus the potential-energy rate through the same 0.7 x 0.85
chain 10j uses for hover) plus a transition of t_tr seconds at f_tr x ph. In each phase the engine delivers 1.2 x its
cruise power and the battery covers the shortfall. Battery mass = max(energy / (e_cell kpack u), peak shortfall / p_batt).
All of h, v_c, t_tr, f_tr are swept; none is from a datasheet (10j's limits: no part-load penalty, fixed f_non).
"""
import itertools, math
from run import G, RESERVE, E_FUEL, T_HOVER
from hybrid_mass_law import maxr, bat_free
from cruise_sized_hybrid import hyb_cruise as hyb10j

ETA_HOVER = 0.7 * 0.85

def hyb_ct(R, fnon, p_eng, k_tank, eta_chain, V=30.0, DL=150.0, LD=12.0, e_cell=250, kpack=0.7, u=0.9,
           p_batt=1500.0, eta_c=0.85, h=100.0, vc=2.0, t_tr=30.0, f_tr=0.6):
    ph = G * math.sqrt(DL / (2 * 1.225)) / ETA_HOVER
    pc = RESERVE * G * V / (LD * eta_c)
    p_climb = ph + G * vc / ETA_HOVER
    phases = [(ph, T_HOVER)]                                         # (W per kg, seconds)
    if h > 0:
        phases.append((p_climb, h / vc))
    if t_tr > 0:
        phases.append((f_tr * ph, t_tr))
    short = [(max(p - pc, 0.0), t) for p, t in phases]
    eh = sum(s * t for s, t in short) / 3600.0
    peak = max(s for s, _ in short)
    mb = max(RESERVE * eh / (e_cell * kpack * u), peak / p_batt)
    eng = pc / 1000.0 / p_eng
    ec = G * R / (LD * eta_c) / 3600.0
    fuel = RESERVE * ec / (E_FUEL * eta_chain)
    return 1 - fnon - eng - mb - fuel * (1 + k_tank)

def breakeven(fnon, **kw):
    for Rk in range(1, 1501):
        if hyb_ct(Rk * 1e3, fnon, **kw) > bat_free(Rk * 1e3, fnon):
            return Rk
    return None

def main():
    print("Milestone 10k: climb and transition added to the cruise-sized hybrid (one-way, 20% reserve)")
    b = dict(p_eng=1, k_tank=.25, eta_chain=.20)
    print(f"\nCheck: with h=0, t_tr=0 the model should reproduce 10j (hover only; note T_HOVER counts 2 x 60 s there)")
    print(f"10j break-even {__import__('cruise_sized_hybrid').breakeven(.479, **b)} km; "
          f"10k with no climb and no transition: {breakeven(.479, h=0.0, t_tr=0.0, **b)} km")
    print(f"10j payload at 150 km {hyb10j(150e3,.479,**b):.4f}; 10k {hyb_ct(150e3,.479,h=0.0,t_tr=0.0,**b):.4f}")
    print("\nA. Break-even km vs 250 Wh/kg battery aircraft (f_non 0.479), rows climb h m / vc m/s / transition s / f_tr")
    print("h   vc  t_tr f_tr p_eng -> km  payload@150km")
    for h, vc, tt, ft, p in itertools.product((100, 300), (1, 2, 4), (30, 60), (0.6, 1.0), (1, 4)):
        print(f"{h:3} {vc:3} {tt:4} {ft:4} {p:4} -> {breakeven(.479, p_eng=p, k_tank=.25, eta_chain=.2, h=h, vc=vc, t_tr=tt, f_tr=ft)}"
              f"  {hyb_ct(150e3,.479,p,.25,.2,h=h,vc=vc,t_tr=tt,f_tr=ft):.3f}")
    print("\nB. Max range km (cap 1500), base case, sensitivity")
    for k, vals in (("p_eng", (0.5, 1, 2)), ("eta_chain", (.12, .2, .3)), ("p_batt", (800, 1500, 3000)),
                    ("e_cell", (200, 250, 400)), ("h", (100, 300, 600)), ("vc", (1, 2, 4))):
        out = []
        for v in vals:
            a = dict(b); a[k] = v
            out.append(maxr(lambda R: hyb_ct(R, .479, **a)))
        print(f"{k}: {vals} -> " + " ".join(f"{x:.0f}" for x in out))
    print("\nC. Payload fraction at 150 km vs pack peak power and energy density (base case)")
    for pb, ec in itertools.product((800, 1500, 3000, 6000), (250, 400)):
        print(f"p_batt {pb:5} e_cell {ec}: {hyb_ct(150e3,.479,p_batt=pb,e_cell=ec,**b):.3f}")
    print(f"battery aircraft {bat_free(150e3,.479):.3f}")

if __name__ == "__main__":
    main()
