"""Milestone 5d: does the median's sign-flip cost fall at M = 8 (one attacker of eight)? 5b/5c setup (3d model, H = 16, inner lr 2e-3, plain outer step, 3,840 steps)
with M = 8. Arms: mean (no attack), median (no attack), median with worker 0 sending -10x its delta. Seeds 0 to 2.
Usage: python3 median_m8.py run   then   python3 median_m8.py report."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 8, 16, 3840, 2e-3, 16
SEEDS = [0, 1, 2]
ARMS = [("mean", 1.0), ("median", 1.0), ("median", -10.0)]  # (aggregation, attacker scale a: sends a x its own delta)
PATH = os.path.join(HERE, "median_m8.jsonl")
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
    attack = lambda d, j: a * d if j == 0 else d
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
    new = {(r["agg"], r["offset"], r["seed"]): r["loss"] for r in load(PATH)}
    if not all((g, a, s) in new for g, a in ARMS for s in SEEDS):
        print("incomplete:", len(new), "of", len(ARMS) * len(SEEDS)); return
    b = [new[("mean", 1.0, s)] for s in SEEDS]
    print(f"M=8 mean, no attack: mean {sum(b)/3:.4f}", [round(x, 4) for x in b])
    for g, a in ARMS[1:]:
        v = [new[(g, a, s)] for s in SEEDS]
        ex = [x - y for x, y in zip(v, b)]
        print(f"{g} a={a}: mean {sum(v)/3:.4f} excess vs M=8 mean {[round(x, 4) for x in ex]} mean {sum(ex)/3:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["agg"], r["offset"], r["seed"]) for r in load(PATH)}
    jobs = [(g, a, s) for s in SEEDS for g, a in ARMS if (g, a, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
