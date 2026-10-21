"""Step-length envelopes of a stock G1 / H1 carrying lumber, and the carry rate they allow.

Prints results.txt and writes results.json. Deterministic (no random draws). A few minutes on one CPU.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parents[0] / "src")]
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_carry import model as C  # noqa: E402

HAND = (0.3, 0.6)                  # carry pose of buildbot-taskbook: reach 0.3 m, hand height 0.6 m
STUD_KG = 3.8                      # 8 ft SPF 2x4 (buildbot-payload)
LOADS = {"g1": [0.0, 1.0, 2.0, 3.0, STUD_KG, 4.6], "h1": [0.0, STUD_KG, 5.9, 8.0, 11.8, 15.0]}
RISES = [0.0, 0.02, 0.05, 0.10, 0.15, 0.197]   # swing foot lands this much higher (m); 0.197 = IRC R311.7.5.1 riser max 7 3/4 in
MUS = [0.3, 0.4, 0.6]               # rubber sole on concrete or plywood; swept
GAPS = [0.15, 0.2, 0.25]           # lateral distance between the feet (m); a modelling choice, so swept
STEP_TIMES = [0.4, 0.5, 0.6, 0.8]  # s per step; no sourced robot figure, swept
VENDOR_MAX = {"g1": 2.0, "h1": 3.3}  # m/s: Unitree's own claims (G1 launch release May 2024; H1 product page), peak, unloaded
DISTANCES = [5, 15, 30]            # m one way, material pile to the wall being framed
HANDLING = [10, 20, 40]            # s per trip to pick up and set down; same for both, unsourced
LAB_SPEEDS = [0.83, 1.1, 1.4]      # m/s, a labourer with a stud on the shoulder; 0.83 is the 3 km/h of a load-carriage treadmill study, the rest bracket it
LAB_PIECES = [1, 4]                # studs a labourer takes per trip: one, or a bundle of four (3.8 kg each, 15 kg)


def main():
    for n in fetch.ROBOTS:
        fetch.model_path(n)
    out = {"hand": HAND, "stud_kg": STUD_KG, "gap": C.GAP, "envelope": {}, "gap_sweep": {}, "rates": {}}
    robots = {n: P.load(n) for n in fetch.ROBOTS}
    d0 = {n: P.standing(r) for n, r in robots.items()}

    print("A. Longest step (m) before touchdown (mu %.1f), load held at reach %.1f m, height %.1f m, feet %.2f m apart" % (C.MU, *HAND, C.GAP))
    print("   rows: load kg; columns: swing foot lands this much higher (m). 'x' = no step of 0.05 m passes (binding joint at the first fail in the JSON).")
    for n, r in robots.items():
        print(f"  {n.upper()}   " + " ".join(f"{s:>6.3f}" for s in RISES))
        out["envelope"][n] = {}
        for mass in LOADS[n]:
            row = []
            for s in RISES:
                L, why, st = C.max_step(r, d0[n], HAND, mass, s)
                row.append(L)
                out["envelope"][n][f"{mass}|{s}"] = {"L": L, "why": why, "ratio": None if st is None else st.ratio,
                                                      "worst_at_L": None if st is None else st.worst}
            print(f"  {mass:5.1f} " + " ".join(f"{'x' if v is None else f'{v:.2f}':>6}" for v in row))
    print("\n   Binding joint at the longest step on level ground (s = 0):")
    for n in robots:
        print("  " + n.upper() + ": " + "; ".join(
            f"{m} kg: {out['envelope'][n][f'{m}|0.0']['worst_at_L']} ({out['envelope'][n][f'{m}|0.0']['ratio']:.2f})"
            for m in LOADS[n] if out["envelope"][n][f"{m}|0.0"]["L"] is not None))

    print("\nB. Sensitivity of the longest level step (m) to the foot gap and the friction coefficient")
    for n, rb in robots.items():
        for mass in (0.0, STUD_KG):
            cells = {}
            for g in GAPS:
                cells[f"gap {g}"] = C.max_step(rb, d0[n], HAND, mass, 0.0, gap=g)[0]
            for mu in MUS:
                cells[f"mu {mu}"] = C.max_step(rb, d0[n], HAND, mass, 0.0, mu=mu)[0]
            out["gap_sweep"][f"{n}|{mass}"] = cells
            print(f"  {n.upper()} {mass:4.1f} kg: " + ", ".join(f"{k}: {'x' if v is None else v}" for k, v in cells.items()))

    print("\nC. Carry rate of 8 ft 2x4s (pieces/min), robot vs labourer, trips of D m each way")
    print("   robot speed = min(L_max / T, vendor peak); pieces per trip chosen by the robot to maximise its rate")
    for n, r in robots.items():
        lmax = {}
        for k in range(0, 5):
            L, _, _ = C.max_step(r, d0[n], HAND, k * STUD_KG, 0.0)
            lmax[k] = L
        out["rates"][n] = {"lmax_by_pieces": lmax}
        print(f"  {n.upper()} longest level step by studs in hand: " + ", ".join(f"{k}: {v}" for k, v in lmax.items() if k))
        for T in STEP_TIMES:
            def v_of(k, T=T):
                L = lmax.get(k)
                return None if not L else min(C.lipm_speed(L, T), VENDOR_MAX[n])
            row = {}
            for dist in DISTANCES:
                for hs in HANDLING:
                    rr, k, v = C.best_pieces(v_of, dist, hs, nmax=4)
                    labs = {f"{vl}|{ln}": C.carry_rate(ln, vl, dist, hs) for vl in LAB_SPEEDS for ln in LAB_PIECES}
                    row[f"{dist}|{hs}"] = {"robot": rr, "pieces": k, "speed": v, "labourer": labs}
            out["rates"][n][f"T={T}"] = row
            for dist in DISTANCES:
                cell = row[f"{dist}|20"]
                lab1 = cell["labourer"]["1.1|1"]
                lab4 = cell["labourer"]["1.1|4"]
                print(f"    T={T:.1f}s D={dist:>2} m (20 s handling): robot {cell['robot']:.2f}/min "
                      f"({cell['pieces']} stud(s) at {cell['speed']:.2f} m/s) vs labourer 1.1 m/s: {lab1:.2f}/min (1 stud), {lab4:.2f}/min (4 studs); "
                      f"robot/labourer {cell['robot'] / lab1:.2f} and {cell['robot'] / lab4:.2f}")
    Path(HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
