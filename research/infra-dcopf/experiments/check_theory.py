"""Milestone 7, theory half (research/grid-linopf/theory.md): Theorems 1 to 3 and Proposition 2
evaluated on the recorded traces of the frozen J-m-a repair (results_converge.json, 30 rounds).

No power flow or QP is run. The case files give the initial trust box: P entries
max(0.2 (PMAX - PMIN), 0.1) MW over baseMVA for live units other than the slack (as
converge.traced_slp), V entries vlin.VBOX pu for every bus with a live unit.
Curvature: kappa_k = max_i |e_i|/mu_i / ||d_k||^2 as recorded, a lower bound on the theorem's kappa;
rounds with ||d|| < DMIN are left out of the estimates (remainders there are solver noise; the same
cut as P7c, 2026-11-13). Predictions Q1 to Q7: LOG.md, 2026-11-17 (written before this ran).
Usage: check_theory.py  (writes results_theory.txt and results_theory.json)
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from pypower.idx_gen import PMAX, PMIN  # noqa: E402

DMIN = 1e-4


def box_norm(ppc):
    """2-norm (pu) of the initial trust box over the decision variables."""
    lay = vlin.Layout(ppc)
    g = ppc["gen"]
    pt = np.maximum(0.2 * (g[:, PMAX] - g[:, PMIN]), 0.1) / ppc["baseMVA"]
    use = lay.live.copy()
    use[lay.slack] = False
    return float(math.sqrt((pt[use] ** 2).sum() + lay.nv * vlin.VBOX ** 2))


def kappa_of(rounds):
    ks = [t["kappa"] for t in rounds
          if t.get("dnorm") is not None and t["dnorm"] >= DMIN and np.isfinite(t.get("kappa", np.nan))]
    return max(ks) if ks else float("nan")


def analyse(rec):
    tr = rec["trace"]
    ppc = load_m(case_path(rec["case"], rec["kind"]))
    dn = box_norm(ppc)
    k_case = kappa_of(tr)
    k_1 = kappa_of(tr[:1])
    r_case = k_case ** -0.5 if np.isfinite(k_case) else float("nan")
    r_1 = k_1 ** -0.5 if np.isfinite(k_1) else float("nan")
    hstar = max(1, math.ceil(math.log2(dn / r_case))) if np.isfinite(r_case) else None
    K = rec.get("clean_at")
    diag = [t for t in tr if t.get("dnorm") is not None]
    notclean = [t for t in diag if t["status"] == "not clean"]
    acc = [t for t in notclean if t["accepted"]]
    rej = [t for t in notclean if not t["accepted"]]
    s_a = float(sum(t["dnorm"] for t in acc))
    out = {"case": rec["case"], "kind": rec["kind"], "clean_at": K, "box": dn,
           "kappa_case": k_case, "kappa_1": k_1, "r_case": r_case, "r_1": r_1, "hstar": hstar,
           "halvings": tr[-1]["halvings"], "A": len(acc), "R": len(rej),
           "A_hard": sum(t["qp"] == "hard" for t in acc), "S_A": s_a,
           "all_hard": all(t.get("qp") == "hard" for t in tr),
           "dnorm": [t.get("dnorm") for t in tr], "qp": [t.get("qp") for t in tr],
           "status": [t.get("status") for t in tr]}
    # per-round box norm: P box from round 2 on, halved; round 1 has V box only
    nv = vlin.Layout(ppc).nv
    out["boxk"] = [(dn if t["it"] > 1 else math.sqrt(nv) * vlin.VBOX) * 2.0 ** -t["halvings"] for t in tr]
    return out


def fmt(x, f="{:.2e}"):
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f.format(x)


def main():
    recs = [r for r in json.loads((HERE / "results_converge.json").read_text()) if r.get("trace")]
    rows = [analyse(r) for r in recs]
    fin = [r for r in rows if r["clean_at"]]
    L = ["Milestone 7, theory half: Theorems 1-3 and Proposition 2 (research/grid-linopf/theory.md) on the",
         "recorded traces (results_converge.json). Plan and predictions Q1-Q7: LOG.md 2026-11-17.",
         f"kappa estimates use rounds with ||d|| >= {DMIN:g} pu; r = kappa^-1/2; H* = max(1, ceil(log2(||Delta||/r_case))).",
         "", f"{'case':18s} {'kind':4s} {'K':>3s} {'A':>3s} {'R':>3s} {'h':>3s} {'H*':>3s} {'||Delta||':>9s} "
         f"{'r_case':>9s} {'r_1':>9s} {'d_K':>9s} {'S_A/r':>8s} {'B_new':>5s}"]
    for r in rows:
        dK = r["dnorm"][-1] if r["clean_at"] else None
        sar = r["S_A"] / r["r_case"] if np.isfinite(r["r_case"]) else float("nan")
        r["S_A_over_r"] = sar
        r["B_new"] = 1 + r["A"] + r["hstar"] if r["hstar"] is not None else None
        L.append(f"{r['case']:18s} {r['kind']:4s} {r['clean_at'] or '-':>3} {r['A']:>3d} {r['R']:>3d} "
                 f"{r['halvings']:>3d} {r['hstar'] if r['hstar'] is not None else '-':>3} {fmt(r['box']):>9s} "
                 f"{fmt(r['r_case']):>9s} {fmt(r['r_1']):>9s} {fmt(dK):>9s} {fmt(sar, '{:.1f}'):>8s} "
                 f"{r['B_new'] if r['B_new'] is not None else '-':>5}")
    L.append("")
    v = {}
    # Q1
    ah = [r for r in fin if r["all_hard"]]
    bad = [f"{r['case']} {r['kind']}" for r in ah if r["halvings"] > r["hstar"]]
    v["Q1"] = not bad
    L.append(f"Q1 (T2 consistent): all-hard finishers {len(ah)}; halvings > H*: {len(bad)} {bad} -> "
             f"{'held' if v['Q1'] else 'refuted'}")
    # Q2
    hs = [r["hstar"] for r in fin if r["hstar"] is not None]
    v["Q2"] = max(hs) <= 12
    L.append(f"Q2 (H* <= 12 on all finishers): H* range {min(hs)} to {max(hs)}, median {int(np.median(hs))}; "
             f"over 12: {sum(h > 12 for h in hs)} of {len(hs)} -> {'held' if v['Q2'] else 'refuted'}")
    # Q3
    inside = [r for r in fin if np.isfinite(r["r_case"]) and r["dnorm"][-1] <= r["r_case"]]
    v["Q3"] = len(inside) <= len(fin) / 3
    L.append(f"Q3 (clean step inside r_case on at most a third): {len(inside)} of {len(fin)} "
             f"{[r['case'] + ' ' + r['kind'] for r in inside]} -> {'held' if v['Q3'] else 'refuted'}")
    # Q4
    q4 = [r for r in fin if r["clean_at"] >= 3]
    smaller = [r for r in q4 if r["dnorm"][-1] < max(d for d in r["dnorm"][1:-1] if d is not None)]
    v["Q4"] = len(smaller) >= 0.8 * len(q4)
    L.append(f"Q4 (clean step below the largest step of rounds 2..K-1, on >= 80 %): {len(smaller)} of {len(q4)} "
             f"-> {'held' if v['Q4'] else 'refuted'}")
    ratios = [r["dnorm"][-1] / max(d for d in r["dnorm"][1:-1] if d is not None) for r in q4]
    L.append(f"   clean step / largest earlier step (rounds >= 2): median {np.median(ratios):.3f}, "
             f"range {min(ratios):.2e} to {max(ratios):.2f}")
    # Q5 (all cases with traces, hard rounds k >= 2)
    n5 = c5 = 0
    miss5 = []
    for r in rows:
        if not np.isfinite(r["r_1"]):
            continue
        for k in range(1, len(r["dnorm"])):
            if r["qp"][k] == "hard" and r["dnorm"][k] is not None and r["dnorm"][k] <= r["r_1"]:
                n5 += 1
                if r["status"][k] == "clean":
                    c5 += 1
                else:
                    miss5.append(f"{r['case']} {r['kind']} r{k + 1}")
    v["Q5"] = n5 > 0 and c5 >= 0.9 * n5
    L.append(f"Q5 (hard rounds k>=2 with ||d|| <= r_1 end clean on >= 90 %): {c5} of {n5} clean "
             f"-> {'held' if v['Q5'] else 'refuted'}; not clean: {miss5[:12]}{' ...' if len(miss5) > 12 else ''}")
    # Q6
    q6 = [r for r in fin if r["A"] >= 1 and np.isfinite(r["S_A_over_r"])]
    within = [r for r in q6 if r["S_A_over_r"] <= 10 * r["A"]]
    v["Q6"] = len(within) >= 0.5 * len(q6)
    rr = [r["S_A_over_r"] / r["A"] for r in q6]
    L.append(f"Q6 (S_A/r_case within 10x of A on >= half): {len(within)} of {len(q6)}; ratio median "
             f"{np.median(rr):.1f}, range {min(rr):.2f} to {max(rr):.0f} -> {'held' if v['Q6'] else 'refuted'}")
    # Q7
    c73 = next(r for r in rows if r["case"] == "case73_ieee_rts" and r["kind"] == "api")
    last = [(d, b) for d, b in zip(c73["dnorm"][-10:], c73["boxk"][-10:]) if d is not None]
    full = sum(d >= 0.5 * b for d, b in last)
    v["Q7"] = full > len(last) / 2
    L.append(f"Q7 (case73 API: elastic step fills its box on most of the last 10 rounds): {full} of {len(last)}; "
             f"||d||/box {', '.join(f'{d / b:.2f}' for d, b in last)} -> {'held' if v['Q7'] else 'refuted'}")
    # the new round count against H4's
    tight = [r["B_new"] / r["clean_at"] for r in fin if r["B_new"]]
    L.append("")
    L.append(f"Round count 1 + A + H* against observed K on {len(tight)} finishers: ratio median {np.median(tight):.2f}, "
             f"max {max(tight):.2f}; within 2x on {sum(t <= 2 for t in tight)}. "
             f"(1 + A + H uses the observed A: only H* is a priori.)")
    L.append(f"Halvings H as a share of K-1 on finishers with K >= 2: "
             f"{sum(r['halvings'] for r in fin)} of {sum(r['clean_at'] - 1 for r in fin)} not-clean rounds; "
             f"accepted not-clean rounds: {sum(r['A'] for r in fin)}, of them hard {sum(r['A_hard'] for r in fin)}.")
    txt = "\n".join(L) + "\n"
    (HERE / "results_theory.txt").write_text(txt)
    (HERE / "results_theory.json").write_text(json.dumps({"verdicts": v, "rows": rows}, indent=1, default=float))
    print(txt)


if __name__ == "__main__":
    main()
