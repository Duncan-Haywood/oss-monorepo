"""Milestone 3g: outer Nesterov momentum on the 413k-parameter GPT (2g's grid, at the real model). Same model, data, budget (3,840 steps),
M = 4 and inner lr (2e-3) as 3d/3e; H in {16, 64}; outer (lr, momentum) in {(1, 0.1), (1, 0.3), (0.7, 0.9)}, seeds 0 to 2.
The plain rows (outer lr 1, momentum 0) are 3d's runs at lr 2e-3 (retune.jsonl), deterministic per seed.
Usage: python3 momentum.py run   then   python3 momentum.py report. Results append to momentum.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR = 4, 16, 3840, 2e-3
HS, OUTERS, SEEDS = [16, 64], [(1.0, 0.1), (1.0, 0.3), (0.7, 0.9)], [0, 1, 2]
PATH = os.path.join(HERE, "momentum.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    H, olr, mom, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=olr, momentum=mom, nesterov=True)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed)
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"H": H, "olr": olr, "mom": mom, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def report():
    base = {(r["H"], r["seed"]): r["loss"] for r in load(OLD) if r["lr"] == LR and r["seed"] in SEEDS}
    new = {(r["H"], r["olr"], r["mom"], r["seed"]): r["loss"] for r in load(PATH)}
    for H in HS:
        b = [base[(H, s)] for s in SEEDS]
        print(f"H={H} plain (outer lr 1, mom 0): mean {sum(b)/3:.4f}", [round(x, 4) for x in b])
        for olr, mom in OUTERS:
            if not all((H, olr, mom, s) in new for s in SEEDS): continue
            v = [new[(H, olr, mom, s)] for s in SEEDS]; d = [x - y for x, y in zip(v, b)]
            print(f"H={H} outer (lr {olr}, mom {mom}): mean {sum(v)/3:.4f}  paired diff vs plain {[round(x, 4) for x in d]} mean {sum(d)/3:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["H"], r["olr"], r["mom"], r["seed"]) for r in load(PATH)}
    jobs = [(H, o, m, s) for s in SEEDS for H in HS for o, m in OUTERS if (H, o, m, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
