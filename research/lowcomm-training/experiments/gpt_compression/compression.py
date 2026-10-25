"""Milestone 4a: unbiased rand-k compression of each worker's delta on the 413k-parameter GPT (H3). Same model, data, budget
(3,840 steps), M = 4, inner lr 2e-3, plain outer step (lr 1, no momentum) as 3d/3e. H = 16; keep fraction p in {0.5, 0.25, 0.125, 0.0625},
omega = 1/p - 1; seeds 0 to 2. The uncompressed rows (p = 1, omega = 0) are 3d's runs at lr 2e-3 (retune.jsonl).
Usage: python3 compression.py run   then   python3 compression.py report. Results append to compression.jsonl."""
import json, math, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 4, 16, 3840, 2e-3, 16
KEEPS, SEEDS = [0.5, 0.25, 0.125, 0.0625], [0, 1, 2]
PATH = os.path.join(HERE, "compression.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    keep, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, compress=rand_k(keep))
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"keep": keep, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def fit(xs, ys):
    n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs); sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx; a = my - b * mx
    ss = sum((y - a - b * x) ** 2 for x, y in zip(xs, ys)); st = sum((y - my) ** 2 for y in ys)
    return a, b, 1 - ss / st


def report():
    base = {r["seed"]: r["loss"] for r in load(OLD) if r["lr"] == LR and r["H"] == H and r["seed"] in SEEDS}
    new = {(r["keep"], r["seed"]): r["loss"] for r in load(PATH)}
    b = [base[s] for s in SEEDS]
    print(f"uncompressed (omega 0): mean {sum(b)/3:.4f}", [round(x, 4) for x in b])
    xs, ys = [], []
    for k in KEEPS:
        if not all((k, s) in new for s in SEEDS): continue
        v = [new[(k, s)] for s in SEEDS]; ex = [x - y for x, y in zip(v, b)]
        om = 1 / k - 1
        print(f"keep {k} (omega {om:g}, 1+omega {1/k:g}): mean {sum(v)/3:.4f}  excess vs uncompressed {[round(x, 4) for x in ex]} mean {sum(ex)/3:+.4f}")
        xs.append(1 / k); ys.append(sum(ex) / 3)
    if len(xs) >= 4:
        a, s, r2 = fit(xs, ys)
        print(f"linear fit excess = {a:+.4f} + {s:.5f} (1+omega): R^2 {r2:.3f}")
        pos = [(x, y) for x, y in zip(xs, ys) if y > 0]
        if len(pos) >= 3:
            _, sl, r2l = fit([math.log(x) for x, _ in pos], [math.log(y) for _, y in pos])
            print(f"log-log slope of excess on (1+omega), {len(pos)} positive points: {sl:.2f} (R^2 {r2l:.3f})")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["keep"], r["seed"]) for r in load(PATH)}
    jobs = [(k, s) for s in SEEDS for k in KEEPS if (k, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
