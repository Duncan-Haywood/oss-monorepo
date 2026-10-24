"""Naive, human-only and DSL estimates of a regression coefficient on an LLM-coded regressor, and
PPI shares for a 3-class code, against a known truth. Writes experiments/results.txt.

    python3 experiments/run.py      # about 1-2 minutes, stdlib only, seeded
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import qualreg as q  # noqa: E402

N, PI, BETAS, SIGMA = 3000, 0.07, (0.0, 1.0, 0.5), 1.0
Z = q.Z95


def study(rng, sens, spec, sens_by_z=None):
    ys, lr, gold, gt, tr = q.simulate(N, 0.3, sens, spec, BETAS, SIGMA, PI, rng, sens_by_z)
    out = {"naive": q.ols(lr, ys)}
    if len(gold) > 10:
        out["human"] = q.ols([tr[i] for i in gold], [ys[i] for i in gold])
        out["dsl"] = q.dsl(lr, ys, gold, gt, PI)
    return out, len(gold)


def block(out, title, reps, seed, sens, spec, sens_by_z=None):
    rng = q.random.Random(seed)
    res = {k: [[], []] for k in ("naive", "human", "dsl")}
    ng = []
    for _ in range(reps):
        s, n = study(rng, sens, spec, sens_by_z)
        ng.append(n)
        for k, (th, se) in s.items():
            res[k][0].append(th)
            res[k][1].append(se)
    out.append(title + f" ({reps} studies, about {q.mean(ng):.0f} hand-coded of {N})")
    out.append("coef  estimator  true  mean_est  bias  coverage  width")
    for j, name in ((1, "code(b1)"), (2, "z(b2)")):
        for k in ("naive", "human", "dsl"):
            ests = [t[j] for t in res[k][0]]
            ses = [s[j] for s in res[k][1]]
            tr = BETAS[j]
            cov = q.mean([abs(e - tr) <= Z * s for e, s in zip(ests, ses)])
            out.append(f"{name:8s}  {k:6s}  {tr:.2f}  {q.mean(ests):.3f}  {q.mean(ests) - tr:+.3f}  "
                       f"{cov:.3f}  {q.mean([2 * Z * s for s in ses]):.3f}")
    out.append("")


def e3(out, reps=1000):
    shares = [0.30, 0.40, 0.30]
    conf = [[0.85, 0.10, 0.05], [0.10, 0.80, 0.10], [0.30, 0.10, 0.60]]
    acc = sum(s * conf[i][i] for i, s in enumerate(shares))
    n, ng = 5000, 200
    out.append(f"E3. Three-class code. N={n}, true shares {shares}, LLM confusion rows {conf} (accuracy {acc:.3f}), "
               f"{ng} hand-coded, {reps} studies")
    out.append("class  true  naive_bias naive_cov  ppi_bias ppi_cov ppi_width  human_width")
    rng = q.random.Random(33)
    nv, pp, hw = [[] for _ in range(3)], [[] for _ in range(3)], [[] for _ in range(3)]
    tru = [[] for _ in range(3)]
    for _ in range(reps):
        truth, llm = q.simulate_classes(n, shares, conf, rng)
        idx = rng.sample(range(n), ng)
        hg, lg = [truth[i] for i in idx], [llm[i] for i in idx]
        a, b = q.class_shares_naive(llm, 3), q.class_shares_ppi(llm, lg, hg, 3)
        for c in range(3):
            t = truth.count(c) / n
            tru[c].append(t)
            nv[c].append((a[c], t))
            pp[c].append((b[c], t))
            p = hg.count(c) / ng
            hw[c].append(2 * Z * math.sqrt(p * (1 - p) / (ng - 1)))
    for c in range(3):
        nb = q.mean([e[0] - t for e, t in nv[c]])
        nc = q.mean([q.covers(e, t) for e, t in nv[c]])
        pb = q.mean([e[0] - t for e, t in pp[c]])
        pc = q.mean([q.covers(e, t) for e, t in pp[c]])
        pw = q.mean([2 * Z * e[1] for e, _ in pp[c]])
        out.append(f"{c}  {shares[c]:.2f}  {nb:+.4f} {nc:.3f}  {pb:+.4f} {pc:.3f} {pw:.4f}  {q.mean(hw[c]):.4f}")
    out.append("")


def main():
    out = ["qual-regression results (seeded; regenerate with python3 experiments/run.py)", "",
           f"Model: y = {BETAS[0]} + {BETAS[1]}*code + {BETAS[2]}*z + N(0, {SIGMA}); true code share 0.30; z ~ N(0,1); "
           f"each item hand-coded with known probability {PI}.", ""]
    block(out, "E1. Coder with sens 0.70, spec 0.95, error independent of z", 300, 11, 0.70, 0.95)
    block(out, "E2. Same coder, but sensitivity falls with z (0.70 + 0.15*z, clipped to [0,1]): errors correlated with the covariate",
          300, 22, 0.70, 0.95, 0.15)
    e3(out)
    (HERE / "results.txt").write_text("\n".join(out))
    print("\n".join(out))


if __name__ == "__main__":
    main()
