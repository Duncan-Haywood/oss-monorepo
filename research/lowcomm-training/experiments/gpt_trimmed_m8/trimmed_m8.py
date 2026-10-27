"""Milestone 5d: M = 8, one attacker sending -10x its delta; arms in ARMS (mean/median without attack, median and trimmed mean under it). Otherwise 5c exactly. (5c docstring follows.) Milestone 5c: why does the median cost +0.095 under 5b's sign-flip? Median aggregation only; the attacker (worker 0) sends x10 its delta (same sign, 10x) or zeros.
Otherwise 5b exactly. (5b docstring follows.) Milestone 5b: 5a with stronger attacks. Coordinate-wise median versus mean aggregation of worker deltas on the real GPT with one attacker.
Attacks (worker 0): off30 and off300 add 30 / 300 x rms of its own per-tensor delta to every coordinate; flip10 sends -10 x its delta.
Otherwise as 5a. Same setup as 4b to 4d (3d model, 3,840 steps, M = 4, lr 2e-3, H = 16, plain outer step), seeds 0 to 2. Attacker = worker 0, which
adds `a` times the rms of its own per-tensor delta to every coordinate. M = 4, so the median is the mean of the two middle values.
Uncompressed rows are 3d runs at lr 2e-3. Usage: python3 median_attack.py run   then   python3 median_attack.py report."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 8, 16, 3840, 2e-3, 16
SEEDS = [0, 1, 2]
ARMS = [("mean", 1.0), ("median", 1.0), ("median", -10.0), ("trimmed", -10.0)]  # (aggregate, attacker scale): 1.0 = no attack  # attacker sends a x its own delta (a = 10 amplify, a = 0 zeros)
PATH = os.path.join(HERE, "trimmed_m8.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    agg, a, seed = job
    assert M == 8
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
    base = [new.get(("mean", 1.0, s)) for s in SEEDS]
    if None in base:
        print("baseline incomplete"); return
    print(f"M=8 mean, no attack: mean {sum(base)/3:.4f}", [round(x, 4) for x in base])
    for g, a in ARMS[1:]:
        if all((g, a, s) in new for s in SEEDS):
            ex = [new[(g, a, s)] - b for s, b in zip(SEEDS, base)]
            print(f"{g} scale {a}: excess vs mean/no-attack {[round(x, 4) for x in ex]} mean {sum(ex)/3:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["agg"], r["offset"], r["seed"]) for r in load(PATH)}
    jobs = [(g, a, s) for s in SEEDS for g, a in ARMS if (g, a, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
