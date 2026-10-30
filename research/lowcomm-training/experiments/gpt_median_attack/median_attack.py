"""Milestone 5a: coordinate-wise median versus mean aggregation of worker deltas on the real GPT, with and without one constant-offset
attacker. Same setup as 4b to 4d (3d model, 3,840 steps, M = 4, lr 2e-3, H = 16, plain outer step), seeds 0 to 2. Attacker = worker 0, which
adds `a` times the rms of its own per-tensor delta to every coordinate. M = 4, so the median is the mean of the two middle values.
Uncompressed rows are 3d runs at lr 2e-3. Usage: python3 median_attack.py run   then   python3 median_attack.py report."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 4, 16, 3840, 2e-3, 16
SEEDS, AGGS, OFFSETS = [0, 1, 2], ["mean", "median"], [0.0, 3.0]
PATH = os.path.join(HERE, "median_attack.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    agg, a, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    attack = (lambda d, j: d + a * d.pow(2).mean().sqrt() if j == 0 else d) if a else None
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, aggregate=agg, attack=attack)
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"agg": agg, "offset": a, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def report():
    base = {r["seed"]: r["loss"] for r in load(OLD) if r["lr"] == LR and r["H"] == H and r["seed"] in SEEDS}
    new = {(r["agg"], r["offset"], r["seed"]): r["loss"] for r in load(PATH)}
    b = [base[s] for s in SEEDS]
    print(f"3d uncompressed mean-aggregation: mean {sum(b)/3:.4f}", [round(x, 4) for x in b])
    for a in OFFSETS:
        for g in AGGS:
            if all((g, a, s) in new for s in SEEDS):
                v = [new[(g, a, s)] for s in SEEDS]
                ex = [x - y for x, y in zip(v, b)]
                print(f"offset {a} {g}: mean {sum(v)/3:.4f} excess vs 3d {[round(x, 4) for x in ex]} mean {sum(ex)/3:+.4f}")
        if all((g, a, s) in new for g in AGGS for s in SEEDS):
            d = [new[("mean", a, s)] - new[("median", a, s)] for s in SEEDS]
            print(f"offset {a}: mean-agg minus median-agg loss {[round(x, 4) for x in d]} (positive = median better)")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["agg"], r["offset"], r["seed"]) for r in load(PATH)}
    jobs = [(g, a, s) for s in SEEDS for a in OFFSETS for g in AGGS if (g, a, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
