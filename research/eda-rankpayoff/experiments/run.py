"""Does rank agreement with the mapped objective predict a cheap screen's top-k payoff?  Writes results.txt.

    PYTHONPATH=../src python3 run.py        # seconds, stdlib only
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from eda_rankpayoff import rank as R  # noqa: E402

D = json.load(open(HERE / "data.json"))
ROWS = D["rows"]
N0, TRIALS = 20, 5000
DELAYS = ["unit", "type", "fanout", "le", "max_fanout", "gates"]

TRUTH = {
    "area x latency": [r["area_um2"] * r["cycles"] * r["delay_ps"] for r in ROWS],
    "latency": [r["cycles"] * r["delay_ps"] for r in ROWS],
}


def screens(truth):
    """name -> (family, scores). area x latency screens carry the generic cell count, latency screens do not."""
    out = {}
    base = (lambda r: r["gen_cells"] * r["cycles"]) if truth == "area x latency" else (lambda r: r["cycles"])
    out["none (cells x cycles)" if truth == "area x latency" else "none (cycles)"] = (
        "none", [base(r) for r in ROWS])
    for name in DELAYS:
        out[f"x {name}"] = ("named", [base(r) * r[name] for r in ROWS])
    for i in range(len(ROWS[0]["sweep"])):
        out[f"x le-sweep-{i}"] = ("sweep", [base(r) * r["sweep"][i] for r in ROWS])
    return out


def measure(scores, truth):
    c1, r1 = R.capture(scores, truth, N0, 1, TRIALS, seed=1)
    c3, r3 = R.capture(scores, truth, N0, 3, TRIALS, seed=2)
    return {"spearman": R.spearman(scores, truth), "kendall": R.kendall(scores, truth),
            "top5": R.top_overlap(scores, truth, 5), "best_rank": R.best_rank(scores, truth),
            "cap1": c1, "cap3": c3, "ratio1": r1, "ratio3": r3}


def boot(xs, ys, n=2000, seed=0):
    rng = random.Random(seed)
    idx = list(range(len(xs)))
    v = []
    for _ in range(n):
        s = [rng.choice(idx) for _ in idx]
        a, b = [xs[i] for i in s], [ys[i] for i in s]
        if len(set(a)) > 1 and len(set(b)) > 1:
            v.append(R.spearman(a, b))
    v.sort()
    return v[int(0.025 * len(v))], v[int(0.975 * len(v))]


def main():
    out = [f"eda-rankpayoff results. {D['yosys']}; ABC '{D['script']}'; SKY130 HD at ORFS {D['pdk_commit']}.",
           f"{len(ROWS)} designs; pools of {N0}, {TRIALS} draws per capture figure. Sources: {', '.join(D['sources'])}", ""]
    for tn, truth in TRUTH.items():
        res = {n: (fam, measure(s, truth)) for n, (fam, s) in screens(tn).items()}
        out.append(f"== truth: {tn} ({len(res)} screens)")
        out.append("A. named screens: Spearman, Kendall, top-5 overlap, rank of true best, P(best mapped) at k=1 and 3, mean ratio at k=1")
        for n, (fam, m) in res.items():
            if fam != "sweep":
                out.append(f"{n:24s} {m['spearman']:.3f} {m['kendall']:.3f} {m['top5']:.1f} {m['best_rank']:3d} {m['cap1']:.3f} {m['cap3']:.3f} {m['ratio1']:.3f}")
        out.append("B. does agreement predict payoff? Spearman across all screens (95% bootstrap over screens)")
        vals = list(res.values())
        for payoff in ("cap1", "cap3", "ratio1"):
            sign = -1 if payoff == "ratio1" else 1  # a low ratio is good
            ys = [sign * m[payoff] for _, m in vals]
            for metric in ("spearman", "kendall", "top5", "best_rank"):
                xs = [(-1 if metric == "best_rank" else 1) * m[metric] for _, m in vals]
                lo, hi = boot(xs, ys)
                out.append(f"{payoff:7s} vs {metric:9s} {R.spearman(xs, ys):6.3f}  {lo:6.3f} to {hi:6.3f}")
        out.append("C. sweep screens only: spread of agreement and payoff")
        sw = [m for fam, m in vals if fam == "sweep"]
        for key in ("spearman", "best_rank", "cap1", "cap3"):
            v = sorted(m[key] for m in sw)
            out.append(f"{key:9s} min {v[0]:.3f} median {v[len(v)//2]:.3f} max {v[-1]:.3f}")
        # a concrete pair: highest-agreement screen vs highest-payoff screen
        best_ag = max(res.items(), key=lambda kv: kv[1][1]["spearman"])
        best_pay = max(res.items(), key=lambda kv: (kv[1][1]["cap1"], kv[1][1]["cap3"]))
        out.append("D. highest-Spearman screen vs highest-capture-at-1 screen")
        for lab, (n, (fam, m)) in (("agreement", best_ag), ("payoff", best_pay)):
            out.append(f"{lab:9s} {n:20s} spearman {m['spearman']:.3f} best_rank {m['best_rank']} cap1 {m['cap1']:.3f} cap3 {m['cap3']:.3f}")
        out.append("E. screens that rank >= 0.9 (Spearman) but whose best design is not in the top 3 of the screen order")
        bad = [(n, m) for n, (fam, m) in res.items() if m["spearman"] >= 0.9 and m["best_rank"] > 3]
        out.append(f"{len(bad)} of {sum(1 for _, (f, m) in res.items() if m['spearman'] >= 0.9)} screens with Spearman >= 0.9")
        for n, m in bad[:5]:
            out.append(f"{n:24s} spearman {m['spearman']:.3f} best_rank {m['best_rank']} cap3 {m['cap3']:.3f}")
        out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
