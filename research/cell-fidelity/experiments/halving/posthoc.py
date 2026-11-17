"""Post hoc (after the 5m verdicts, no verdicts): where the ladder lost the best design on the fresh pools, what other
ladders would have done, and how the measured segment times compare with development's k/100 charge.

    python experiments/halving/posthoc.py   # stdlib; reads bench.jsonl, writes posthoc.txt
"""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("halving_run", HERE / "run.py")
H = importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)

LADDERS = {"5m (10->16, 20->8, 50->3)": H.PLAN, "10->16, 20->8, 50->5": ((10, 16), (20, 8), (50, 5)),
           "10->24, 20->8, 50->3": ((10, 24), (20, 8), (50, 3)), "10->16, 20->12, 50->3": ((10, 16), (20, 12), (50, 3)),
           "10->32, 20->16, 50->4": ((10, 32), (20, 16), (50, 4)), "DFN@50 top 3": ((50, 3),)}


def main():
    S = json.loads((HERE / "summary.json").read_text())
    L = ["cell-fidelity milestone 5m, post hoc (after the verdicts; no verdicts)", ""]
    for c in S["kept"]:
        rows = [dict(j=r["j"], wh=r["wh_kg"], m=1.0, score=r["score"], seg=r["seg"], t100=r["t100"]) for r in S["extra"][c]["rows"]]
        idx = list(range(len(rows)))
        b = max(idx, key=lambda i: rows[i]["score"])
        rk = {k: 1 + sorted(idx, key=lambda i: -H.at(rows[i], k)).index(b) for k in (10, 20, 50)}
        frac = [sum(r["seg"][i] for r in rows) / sum(sum(r["seg"]) for r in rows) for i in range(len(H.RUNGS))]
        L.append(f"{c}: pool best design {rows[b]['j']} ranks {rk[10]} at cycle 10, {rk[20]} at 20, {rk[50]} at 50 (of {len(rows)});"
                 f" share of the 100-cycle wall time per segment {[round(f, 3) for f in frac]} (k/100 would be [0.1, 0.1, 0.3, 0.5])")
        t_all = sum(H.cost_to(r, 100) for r in rows)
        for name, plan in LADDERS.items():
            g, _, t, _ = H.halving(rows, plan)
            L.append(f"  {name}: gap {g:.4f}, wall / all-DFN@100 {t / t_all:.3f}")
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
