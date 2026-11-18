"""Milestone 3k: marine_hull.holtrop against the numerical example of Holtrop and Mennen (1982), p. 170.

    PYTHONPATH=src python3 experiments/run_holtrop_1982.py > experiments/results_holtrop_1982.txt

The published values are those tabulated in the MIT-licensed Archibald validation script
(julesricheux/Archibald, examples/01 - Validation/holtrop_1982_example.py), which transcribes p. 170
of the paper. They are a second-hand copy of the paper, not the paper itself.
"""
import math
from marine_hull.holtrop import hm_resistance

L, B, T, V = 205.0, 32.0, 10.0, 37500.0
CM, CWP, LCB, CSTERN, S = 0.980, 0.750, -0.75, 10.0, 7381.45
VMS = 25 * 1852 / 3600
C2, C5 = 0.7595, 0.9592           # published bulb and transom factors (not computed by this module)
PUB = {"Fn": 0.2868, "1+k1": 1.156, "RW [kN]": 557.11, "CA": 0.000352, "RA [kN]": 221.98}

for form, kf in (("m2", "1984"), ("m2", "1982"), ("m4", "1982")):
    r = hm_resistance(VMS, L, B, T, V, CM, CWP, lcb_pct=LCB, c_stern=CSTERN, rho=1025.0, nu=1.1883e-6,
                      low_form=form, s=S, c2=C2, c5=C5, k_form=kf)
    mine = {"Fn": r["Fn"], "1+k1": r["1+k1"], "RW [kN]": r["RW"] / 1e3, "CA": r["CA"], "RA [kN]": r["RA"] / 1e3}
    print(f"-- low-speed wave form {form}, form factor {kf} --")
    print(f"{'quantity':10s} {'published':>10s} {'marine_hull':>12s} {'diff %':>8s}")
    for k, pv in PUB.items():
        print(f"{k:10s} {pv:10.6g} {mine[k]:12.6g} {(mine[k]/pv-1)*100:+8.2f}")
    rf_pub = 869.63
    rt = rf_pub * mine["1+k1"] + mine["RW [kN]"] + mine["RA [kN]"] + 0.049
    print(f"RF x (1+k1) + RW + RA + RB, with published RF 869.63 and RB 0.049: {rt:.1f} kN "
          f"(published sum without RAPP and RTR 0: {869.63*1.156+557.11+0.049+221.98:.1f}; {(rt/(869.63*1.156+557.11+0.049+221.98)-1)*100:+.2f}%)")
    print(f"RF from this module's ITTC-57 on S = {S}: {r['RF']/1e3:.2f} kN against 869.63 ({(r['RF']/1e3/869.63-1)*100:+.2f}%)")
