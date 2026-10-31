"""Milestone 6h (H6 scale-up): does the 6f composition rule keep its form at a second model size, with its constants refitted?

Same data, budget (3,840 steps), M = 4, inner lr 2e-3, plain outer step as gpt_composition; only the width changes, dim 128 -> 192
(2 layers, 6 heads). Cells: uncompressed and rand-k keep 1/16 at H in {4, 16, 64}, plus keep 1/4 at H = 16; seeds 0 and 1.
Usage: python3 scale.py run [extra] | report (extra = 6i seeds 2 to 5 on the two H = 64 cells; report averages the seeds each cell has). Results append to scale.jsonl. Reads the size-1 cell means from ../gpt_composition/composition_results.txt."""
import json, os, re, sys, time, math, itertools
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS = 4, 16, 3840, 2e-3, 192, 6
PATH = os.path.join(HERE, "scale.jsonl")
CELLS = [(1.0, 4), (1.0, 16), (1.0, 64), (0.0625, 4), (0.0625, 16), (0.0625, 64), (0.25, 16)]
SEEDS = [0, 1]
EXTRA = [(1.0, 64), (0.0625, 64)]  # 6i: the two H = 64 cells get seeds 2 to 5 (6h left them weakly identified)
EXTRA_SEEDS = [2, 3, 4, 5]
HSHAPE = [(k, H) for H in (32, 128) for k in (1.0, 0.0625)]  # 6j: does the excess keep growing in H at size 2? three seeds each
HSHAPE_SEEDS = [0, 1, 2]
HFILL = [(k, H, s) for H, seeds in ((16, (2, 3, 4, 5)), (32, (3, 4, 5))) for k in (1.0, 0.0625) for s in seeds]  # 6k: seeds to 6 at H = 16 and 32
HFILL128 = [(k, 128, s) for k in (1.0, 0.0625) for s in (3, 4, 5)]  # 6l: seeds to 6 at H = 128
KEEP64 = [(0.25, 64, s) for s in range(6)]  # 6n: second keep level at H = 64, six seeds (pairs with the six uncompressed H = 64 runs)
KEEP64B = [(k, 64, s) for s in range(4) for k in (0.125, 0.03125)]  # 6o: keep 1/8 and 1/32 at H = 64, seeds 0 to 3 (pair with uncompressed H = 64)
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []
omega = lambda p: 1 / p - 1


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    keep, H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    nparams = sum(p.numel() for p in model.parameters())
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
               compress=None if keep == 1.0 else rand_k(keep))
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"keep": keep, "H": H, "seed": seed, "loss": loss if loss == loss else float("inf"), "params": nparams, "secs": round(time.time() - t0)}


def size1():
    out = {}
    for line in open(os.path.join(HERE, "..", "gpt_composition", "composition_results.txt")):
        m = re.match(r"\((\d+), ([0-9.]+)\) 3 ([0-9.]+) ", line)
        if m: out[(int(m[1]), float(m[2]))] = float(m[3])
    return out


def solve2(A, y):
    n = len(A[0])
    Mx = [[sum(r[i] * r[j] for r in A) for j in range(n)] + [sum(r[i] * t for r, t in zip(A, y))] for i in range(n)]
    for i in range(n):
        p = max(range(i, n), key=lambda k: abs(Mx[k][i])); Mx[i], Mx[p] = Mx[p], Mx[i]
        if abs(Mx[i][i]) < 1e-12: return None
        for k in range(n):
            if k != i:
                f = Mx[k][i] / Mx[i][i]; Mx[k] = [a - f * b for a, b in zip(Mx[k], Mx[i])]
    return [Mx[i][n] / Mx[i][i] for i in range(n)]


def fit_rule(tr):
    """tr: {(H, p): loss}. loss = L0 + a omega (H/16)^b, grid over b. Returns (L0, a, b)."""
    y = list(tr.values()); best = None
    for b in [i / 20 for i in range(-20, 41)]:
        A = [[1, omega(p) * (H / 16) ** b] for (H, p) in tr]
        w = solve2(A, y)
        if w:
            s = sum((w[0] * r[0] + w[1] * r[1] - t) ** 2 for r, t in zip(A, y))
            if best is None or s < best[0]: best = (s, w[0], w[1], b)
    return best[1:]


def report():
    rows = load(PATH); c = {}
    for r in rows: c.setdefault((r["H"], r["keep"]), {})[r["seed"]] = r["loss"]
    mean = lambda d: sum(d.values()) / len(d)
    print("params:", sorted({r["params"] for r in rows}), " mean secs per run:", round(sum(r["secs"] for r in rows) / len(rows)))
    print("size-2 cell (H, keep): n, mean, per seed")
    for k in sorted(c, key=lambda t: (t[0], -t[1])): print(k, len(c[k]), round(mean(c[k]), 4), {s: round(v, 4) for s, v in sorted(c[k].items())})
    print("\nexcess of keep 1/16 over uncompressed, by H (6j; sd of the paired seed differences where seeds match):")
    for H in sorted({h for h, _ in c}):
        if (H, 1.0) in c and (H, 0.0625) in c:
            common = sorted(set(c[(H, 1.0)]) & set(c[(H, 0.0625)]))
            d = [c[(H, 0.0625)][s] - c[(H, 1.0)][s] for s in common]
            mu = sum(d) / len(d); sd = (sum((x - mu) ** 2 for x in d) / (len(d) - 1)) ** .5 if len(d) > 1 else float("nan")
            print(f"  H={H}: {mu:+.4f} (n={len(d)} paired seeds, sd {sd:.4f})")
    m2 = {k: mean(v) for k, v in c.items() if len(v) >= len(SEEDS) and (k[0] in (4, 16, 64))}
    s1 = size1(); m1 = {k: s1[k] for k in m2 if k in s1}
    for name, m in (("size 1 (413k, dim 128), same 7 cells", m1), ("size 2 (dim 192)", m2)):
        if len(m) < 7: continue
        unc = {H: m[(H, 1.0)] for H in (4, 16, 64)}
        ex = {(H, p): m[(H, p)] - unc[H] for (H, p) in m if p < 1}
        L0, a, b = fit_rule({k: v for k, v in m.items()})
        print(f"\n{name}: rule L0={L0:.4f} a={a:.5f} b={b:.2f};  uncompressed H=4/16/64: " + "/".join(f"{unc[H]:.4f}" for H in (4, 16, 64)))
        print("  excess over uncompressed: " + "  ".join(f"H={H},p={p}: {v:+.4f}" for (H, p), v in sorted(ex.items())))
        # leave-one-cell-out MAPE, compressed cells only (the rule has 3 constants, 7 cells)
        errs = []
        for k in m:
            tr = {j: v for j, v in m.items() if j != k}
            try: L0_, a_, b_ = fit_rule(tr)
            except TypeError: continue
            pred = L0_ + a_ * omega(k[1]) * (k[0] / 16) ** b_
            errs.append((k, pred - m[k], abs(pred - m[k]) / m[k] * 100))
        print("  leave-one-cell-out:", ", ".join(f"{k}:{e:+.4f}" for k, e, _ in errs), f"; MAPE {sum(x for *_, x in errs) / len(errs):.2f}%")
    if len(m2) == 7 and len(m1) == 7:
        # borrowed vs refitted: fit size-1 rule on its 7 cells, predict the size-2 compressed excess, then rescale a
        L0, a, b = fit_rule(m1)
        ex1 = {k: m1[k] - m1[(k[0], 1.0)] for k in m1 if k[1] < 1}
        ex2 = {k: m2[k] - m2[(k[0], 1.0)] for k in m2 if k[1] < 1}
        ratio = sum(ex2[k] * ex1[k] for k in ex2) / sum(ex1[k] ** 2 for k in ex2)
        print(f"\nsize-2 excess = {ratio:.3f} x size-1 excess (one constant, through origin); residuals: " + ", ".join(f"{k}:{ex2[k] - ratio * ex1[k]:+.4f}" for k in sorted(ex2)))
        print("size-1 excess borrowed unchanged, residuals: " + ", ".join(f"{k}:{ex2[k] - ex1[k]:+.4f}" for k in sorted(ex2)))


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["keep"], r["H"], r["seed"]) for r in load(PATH)}
    jobs = [(k, H, s) for s in SEEDS for (k, H) in CELLS if (k, H, s) not in have]
    if len(sys.argv) > 2 and sys.argv[2] == "extra":
        jobs = [(k, H, s) for s in EXTRA_SEEDS for (k, H) in EXTRA if (k, H, s) not in have]
    if len(sys.argv) > 2 and sys.argv[2] == "hshape":
        jobs = [(k, H, s) for s in HSHAPE_SEEDS for (k, H) in HSHAPE if (k, H, s) not in have]
    if len(sys.argv) > 2 and sys.argv[2] == "hfill":
        jobs = [j for j in HFILL if j not in have]
    if len(sys.argv) > 2 and sys.argv[2] == "h128":
        jobs = [j for j in HFILL128 if j not in have]
    if len(sys.argv) > 2 and sys.argv[2] == "keep64":
        jobs = [j for j in KEEP64 if j not in have]
    if len(sys.argv) > 2 and sys.argv[2] == "keep64b":
        jobs = [j for j in KEEP64B if j not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
