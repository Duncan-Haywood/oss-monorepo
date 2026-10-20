"""Score naive, human-only and prediction-powered (PPI) estimates of a qualitative code's
prevalence against a known truth. Writes experiments/results.txt.

    python3 experiments/run.py

Seeded and stdlib only; about 30 s on a laptop CPU.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import qualml as q  # noqa: E402

REPS = 1000
N = 5000


def summarise(rows, key):
    ests = [r[key] for r in rows]
    bias = q.mean([e[0] - r["truth"] for e, r in zip(ests, rows)])
    cov = q.mean([q.covers(e, r["truth"]) for e, r in zip(ests, rows)])
    width = q.mean([2 * q.Z95 * e[1] for e in ests])
    return bias, cov, width


def e1(out):
    prev, sens, spec = 0.30, 0.75, 0.95
    acc = prev * sens + (1 - prev) * spec
    out.append(f"E1. Prevalence of one code. N={N} answers, true share {prev}, LLM coder sens {sens} spec {spec} "
               f"(accuracy {acc:.3f}), {REPS} simulated studies per row")
    out.append("n_gold  naive_bias naive_cov naive_width  human_bias human_cov human_width  "
               "ppi_bias ppi_cov ppi_width  kappa  ppi_effective_n")
    for n_gold in (50, 100, 200, 400, 800):
        rng = q.seeded(1000 + n_gold)
        rows, kap, effn = [], [], []
        for _ in range(REPS):
            truth, llm = q.simulate_corpus(N, prev, sens, spec, rng)
            idx = q.gold_sample(N, n_gold, rng)
            hg, lg = [truth[i] for i in idx], [llm[i] for i in idx]
            r = {"truth": q.mean(truth), "naive": q.naive(llm), "human": q.human_only(hg), "ppi": q.ppi(llm, lg, hg)}
            rows.append(r)
            kap.append(q.cohen_kappa(hg, lg))
            effn.append(q.effective_n(r["ppi"][1], r["human"][1], n_gold))
        cells = [f"{n_gold:6d}"]
        for k in ("naive", "human", "ppi"):
            b, c, w = summarise(rows, k)
            cells.append(f"{b:+.4f} {c:.3f} {w:.4f}")
        cells.append(f"{q.mean(kap):.3f}")
        cells.append(f"{q.mean(effn):.0f}")
        out.append("  ".join(cells))
    out.append("")


def e2(out):
    na = nb = N // 2
    n_gold = 200
    pa, pb = 0.30, 0.34
    sa, sb, spec = 0.85, 0.65, 0.95
    out.append(f"E2. Gap between two groups (A - B). {na} answers each, true shares A {pa} B {pb} (true gap {pa - pb:+.2f}); "
               f"LLM sens A {sa} B {sb}, spec {spec} both; {n_gold} hand-coded per group; {REPS} studies")
    out.append("estimator  mean_gap  bias  coverage  width  share_significant_wrong_sign")
    rng = q.seeded(2024)
    res = {"naive": [], "human": [], "ppi": []}
    truths = []
    for _ in range(REPS):
        ra = q.run_once(na, pa, sa, spec, n_gold, rng)
        rb = q.run_once(nb, pb, sb, spec, n_gold, rng)
        t = ra["truth"] - rb["truth"]
        truths.append(t)
        for k in res:
            res[k].append(q.gap(ra[k], rb[k]))
    for k, gs in res.items():
        mg = q.mean([g[0] for g in gs])
        bias = q.mean([g[0] - t for g, t in zip(gs, truths)])
        cov = q.mean([q.covers(g, t) for g, t in zip(gs, truths)])
        width = q.mean([2 * q.Z95 * g[1] for g in gs])
        wrong = q.mean([g[0] - q.Z95 * g[1] > 0 for g in gs])  # truth is negative
        out.append(f"{k:9s}  {mg:+.4f}  {bias:+.4f}  {cov:.3f}  {width:.4f}  {wrong:.3f}")
    out.append("")


def e3(out):
    prev, n_gold, reps = 0.30, 200, 500
    out.append(f"E3. Coder quality sweep. N={N}, true share {prev}, sens = spec = accuracy, {n_gold} hand-coded, {reps} studies")
    out.append("accuracy  naive_cov  human_width  ppi_width  ppi_cov  ppi_effective_n")
    for acc in (0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.98):
        rng = q.seeded(int(acc * 1000))
        rows, effn = [], []
        for _ in range(reps):
            r = q.run_once(N, prev, acc, acc, n_gold, rng)
            rows.append(r)
            effn.append(q.effective_n(r["ppi"][1], r["human"][1], n_gold))
        _, nc, _ = summarise(rows, "naive")
        _, _, hw = summarise(rows, "human")
        _, pc, pw = summarise(rows, "ppi")
        out.append(f"{acc:.2f}  {nc:.3f}  {hw:.4f}  {pw:.4f}  {pc:.3f}  {q.mean(effn):.0f}")
    out.append("")


def main():
    out = ["qual-correction results (seeded; regenerate with python3 experiments/run.py)", ""]
    e1(out)
    e2(out)
    e3(out)
    (HERE / "results.txt").write_text("\n".join(out))
    print("\n".join(out))


if __name__ == "__main__":
    main()
