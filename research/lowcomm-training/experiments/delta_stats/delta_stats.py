"""Milestone 5h: what do the real worker deltas look like (tail weight, mu/sigma)? Decides which row of 5g's table applies.
5d/5e setup (3d model, M = 8, H = 16, inner lr 2e-3, plain outer step, 3,840 steps, mean aggregation, no attack), seeds 0 to 2.
At rounds SNAP the engine's `attack` hook (identity) records each worker's per-tensor delta. Per tensor, with m the across-worker mean
and r_j = d_j - m: mu/sigma = rms(m) / (rms(r) sqrt(M/(M-1))); excess kurtosis of r/rms(r) pooled over coordinates and workers; Hill
tail index of |r| on the top 5%. Also the same two numbers for a Gaussian of equal size (the sampling baseline).
Usage: python3 delta_stats.py run [seed]   then   python3 delta_stats.py report."""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 8, 16, 3840, 2e-3, 16
SNAP = {1, 10, 60, 120, 240}
PATH = os.path.join(HERE, "delta_stats.jsonl")


def stats(ds):
    """ds: array (M, n) of one tensor's worker deltas."""
    m = ds.mean(0)
    r = ds - m
    rms = np.sqrt((r ** 2).mean())
    ms = np.sqrt((m ** 2).mean()) / (rms * np.sqrt(M / (M - 1)))
    z = (r / rms).ravel()
    kurt = float((z ** 4).mean() - 3)
    a = np.sort(np.abs(z))[::-1]
    k = max(10, int(0.05 * a.size))
    hill = float(1 / np.mean(np.log(a[:k] / a[k])))
    return ms, kurt, hill, ds.shape[1]


def run(seed):
    import torch
    torch.set_num_threads(2)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    cur = []  # filled only on snapshot rounds
    rec = [False]
    def attack(d, j):
        if rec[0]:
            cur.append(d.flatten().numpy().copy())
        return d
    eng = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, aggregate="mean", attack=attack)
    out = []
    for rd in range(1, STEPS // H + 1):
        rec[0] = rd in SNAP
        cur.clear()
        eng.round()
        if rd in SNAP:
            # per tensor: M consecutive entries (worker 0..M-1)
            tens = [np.stack(cur[i:i + M]) for i in range(0, len(cur), M)]
            res = [stats(t) for t in tens]
            n = np.array([x[3] for x in res], float)
            rng = np.random.default_rng(seed)
            g = [stats(rng.standard_normal((M, int(k)))) for k in n[:]]
            w = n / n.sum()
            out.append({"seed": seed, "round": rd, "tensors": len(res),
                        "musigma_median": float(np.median([x[0] for x in res])), "musigma_weighted": float((w * np.array([x[0] for x in res])).sum()),
                        "kurt_median": float(np.median([x[1] for x in res])), "kurt_weighted": float((w * np.array([x[1] for x in res])).sum()),
                        "kurt_max": float(max(x[1] for x in res)),
                        "hill_median": float(np.median([x[2] for x in res])), "hill_weighted": float((w * np.array([x[2] for x in res])).sum()),
                        "gauss_kurt_weighted": float((w * np.array([x[1] for x in g])).sum()), "gauss_hill_weighted": float((w * np.array([x[2] for x in g])).sum())})
            print(out[-1], flush=True)
    with open(PATH, "a") as f:
        for o in out:
            f.write(json.dumps(o) + "\n")


def report():
    rows = [json.loads(l) for l in open(PATH)]
    print("round  musigma(med/wtd)  excess kurt(med/wtd/max)  Hill(med/wtd)  | Gaussian baseline kurt, Hill (wtd)   [mean over seeds]")
    for rd in sorted({r["round"] for r in rows}):
        s = [r for r in rows if r["round"] == rd]
        f = lambda k: np.mean([r[k] for r in s])
        print(f"{rd:5d}  {f('musigma_median'):.3f}/{f('musigma_weighted'):.3f}   {f('kurt_median'):.2f}/{f('kurt_weighted'):.2f}/{f('kurt_max'):.1f}   {f('hill_median'):.2f}/{f('hill_weighted'):.2f}   | {f('gauss_kurt_weighted'):.2f}, {f('gauss_hill_weighted'):.2f}  (n={len(s)})")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report()
    else:
        run(int(sys.argv[2]) if len(sys.argv) > 2 else 0)
