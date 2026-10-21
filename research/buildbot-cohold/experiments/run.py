"""buildbot-cohold: a person leads a 4x8 sheet up, a Unitree G1 or H1 follows. Deterministic; a few minutes on one CPU."""
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parent / "src")]
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_cohold import model as C  # noqa: E402

LB = 0.45359237
NIOSH_KG = 51 * LB                      # NIOSH load constant (Waters et al. 1993)
OSB_MID = 1.5 * 32 * LB                 # 7/16 in OSB, 1.4-1.6 lb/ft2 retail listings (buildbot-payload)
DRYWALL = 1.6 * 32 * LB                 # 1/2 in drywall, 1.6 lb/ft2 (USG product comparison)
L = 2.44                                # 8 ft sheet
HAND0 = (0.3, 0.6)                      # reach, height of the robot's hands at the start (buildbot-payload's carry pose)
NOMINAL = dict(K=1000.0, B=150.0, lag=0.2, T=2.0)
out = {"menagerie_commit": fetch.COMMIT}
P_ = lambda *a: print(*a)  # noqa: E731


def stats(m, **kw):
    r = C.simulate(m, L=L, **kw)
    s = m * C.G / 2
    peak_v = float(np.abs(r["Rdot"]).max())
    return r, {"tilt_end_deg": math.degrees(r["theta"][-1]), "tilt_peak_deg": math.degrees(np.abs(r["theta"]).max()),
               "robot_fz_peak_over_static": float(r["FR"][:, 1].max() / s), "robot_fx_peak_N": float(np.abs(r["FR"][:, 0]).max()),
               "person_fz_peak_over_static": float(r["FP"][:, 1].max() / s), "person_fx_peak_N": float(np.abs(r["FP"][:, 0]).max()),
               "person_kg_peak": float(r["FP"][:, 1].max() / C.G), "hand_speed_peak": peak_v}


def main():
    P_("# buildbot-cohold: person-led lift of a 4x8 sheet, lift 0.30 m of the person's end, sheet 22.0 kg unless stated")
    P_("# A. Following dynamics (no robot model): sweep of lift time T, stiffness K, damping B, lag")
    sweep = []
    P_("T_s K_N/m B_Ns/m lag_s | tilt_end_deg tilt_peak_deg | robot_Fz/static robot_Fx_N | person_Fz/static person_kg_peak | hand_speed_peak_m/s")
    for T in (0.5, 1.0, 2.0, 4.0):
        for K in (200.0, 1000.0, 5000.0):
            for B in (50.0, 150.0, 400.0):
                for lag in (0.0, 0.2, 0.5):
                    _, s = stats(22.0, T=T, K=K, B=B, lag=lag)
                    sweep.append({"T": T, "K": K, "B": B, "lag": lag, **s})
                    P_("%.1f %6.0f %4.0f %.1f | %6.2f %6.2f | %.3f %5.1f | %.3f %5.2f | %.3f" % (
                        T, K, B, lag, s["tilt_end_deg"], s["tilt_peak_deg"], s["robot_fz_peak_over_static"], s["robot_fx_peak_N"],
                        s["person_fz_peak_over_static"], s["person_kg_peak"], s["hand_speed_peak"]))
    out["sweep"] = sweep
    w = max(sweep, key=lambda r: r["robot_fz_peak_over_static"])
    P_("# worst robot vertical force over the sweep: %.3f x static (T=%.1f K=%.0f B=%.0f lag=%.1f)" % (
        w["robot_fz_peak_over_static"], w["T"], w["K"], w["B"], w["lag"]))
    P_("# no-follow baseline (K=0, B=100, lag=0): the robot end sinks, tilt_end %.1f deg" % stats(22.0, T=2.0, K=0.0, B=100.0, lag=0.0)[1]["tilt_end_deg"])

    for n in fetch.ROBOTS:
        fetch.model_path(n)
    robots = {n: P.load(n) for n in fetch.ROBOTS}
    d0 = {n: P.standing(r) for n, r in robots.items()}

    P_("# B. Whole-body torque check along the lead (nominal control and a fast 0.5 s lead), worst joint over the path")
    P_("robot sheet_kg T_s | max_torque/limit joint | feet_ok | verdict")
    feas = []
    grid = [4, 6, 8, 10, 12, 14, 16, 18, OSB_MID, DRYWALL]
    for rn in ("g1", "h1"):
        rob = robots[rn]
        for T in (2.0, 0.5):
            for m in grid:
                r, _ = stats(m, **{**NOMINAL, "T": T})
                idx = np.linspace(0, len(r["t"]) - 1, 10).astype(int)
                peak = int(np.argmax(r["FR"][:, 1]))
                idx = sorted(set(idx.tolist() + [peak]))
                worst, joint, feet_ok, q = 0.0, "", True, None
                reach_ok = True
                for i in idx:
                    hx = HAND0[0] + (L - r["R"][i, 0])
                    hz = HAND0[1] + r["R"][i, 1]
                    load_fz = float(r["FR"][i, 1])
                    pz = P.pose(rob, d0[rn], (hx, hz), load_fz / C.G, "palm", q)
                    if not pz.ok:
                        reach_ok = False
                        break
                    q = pz.qpos
                    ratio, jn, ff = C.wrench_torques(P, rob, pz.qpos, float(r["FR"][i, 0]), load_fz)
                    if ratio > worst:
                        worst, joint = ratio, jn
                    feet_ok &= ff > 0
                ok = reach_ok and worst <= 1.0 and feet_ok
                feas.append({"robot": rn, "T": T, "sheet_kg": m, "ratio": worst if reach_ok else None, "joint": joint if reach_ok else "reach",
                             "feet_ok": bool(feet_ok), "ok": bool(ok)})
                P_("%s %5.1f %.1f | %s %s | %s | %s" % (rn, m, T, ("%.2f" % worst) if reach_ok else "-", joint if reach_ok else "reach", feet_ok,
                                                       "ok" if ok else "NO"))
    out["feasibility"] = feas
    for rn in ("g1", "h1"):
        for T in (2.0, 0.5):
            okm = [f["sheet_kg"] for f in feas if f["robot"] == rn and f["T"] == T and f["ok"]]
            P_("# %s, T=%.1f s: heaviest sheet on the grid that the robot's half-share passes: %s kg" % (rn, T, max(okm) if okm else "none"))

    P_("# C. ISO/TS 15066 speed limits at the robot's end of the sheet, against the hand speed of the person-led lift")
    iso = {}
    for rn in ("g1", "h1"):
        rob = robots[rn]
        pz = P.pose(rob, d0[rn], HAND0, 11.0 / 1.0, "palm")
        for direction, name in (((0, 0, 1), "vertical"), ((1, 0, 0), "forward")):
            lam = C.reflected_mass(P, rob, pz.qpos, direction)
            iso[f"{rn}_{name}_reflected_mass_kg"] = lam
            P_("%s reflected mass at one hand, %s: %.2f kg (arm and waist only, base locked)" % (rn, name, lam))
    out["iso"] = {"reflected": iso, "v_safe": {}}
    for m in (11.0, 22.0, DRYWALL):
        for rn in ("g1", "h1"):
            mr = iso[f"{rn}_vertical_reflected_mass_kg"] + m / 2
            row = {reg: C.v_safe(reg, mr) for reg in C.BODY}
            out["iso"]["v_safe"][f"{rn}_{m:.1f}"] = {"m_robot": mr, **row}
    P_("region | F_max_N k_N/mm | v_safe m/s for robot end (reflected mass + half the sheet): g1 22 kg sheet, h1 22 kg sheet")
    for reg, (f, k, mh) in C.BODY.items():
        P_("%-28s | %4d %4d | %.2f %.2f" % (reg, f, k, out["iso"]["v_safe"]["g1_22.0"][reg], out["iso"]["v_safe"]["h1_22.0"][reg]))
    peaks = {T: stats(22.0, **{**NOMINAL, "T": T})[1]["hand_speed_peak"] for T in (0.5, 1.0, 2.0, 4.0)}
    out["iso"]["hand_speed_peak"] = peaks
    P_("# peak robot-hand speed in a lead of 0.30 m, by lead time T: " + ", ".join("%.1fs %.2f m/s" % kv for kv in peaks.items()))
    quasi = stats(22.0, **NOMINAL)[0]
    fpk = float(np.hypot(quasi["FR"][:, 0], quasi["FR"][:, 1]).max())
    out["iso"]["robot_force_peak_N"] = fpk
    P_("# peak robot hand force on a 22 kg sheet (nominal): %.0f N; weakest quasi-static region limit (abdomen) %d N, the sheet's own weight share is %.0f N" % (
        fpk, C.BODY["abdomen"][0], 22 * C.G / 2))
    out["person"] = {"niosh_kg": NIOSH_KG, "alone_kg": {"osb": OSB_MID, "drywall": DRYWALL}}
    P_("# person alone: OSB %.1f kg, drywall %.1f kg vs NIOSH constant %.1f kg" % (OSB_MID, DRYWALL, NIOSH_KG))
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
