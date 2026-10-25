"""Milestone 3h: the DiLoCo-paper outer setting (0.7, 0.9) with the inner lr re-tuned. Same model, data, budget (3,840 steps),
M = 4 and inner lr (2e-3) as 3d/3e; H in {16, 64}; outer (lr, momentum) in {(1, 0.1), (1, 0.3), (0.7, 0.9)}, seeds 0 to 2.
The plain rows (outer lr 1, momentum 0) are 3d's runs at lr 2e-3 (retune.jsonl), deterministic per seed.
Usage: python3 momentum.py run   then   python3 momentum.py report. Results append to retune_outer.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS = 4, 16, 3840
HS, OUTERS, SEEDS, LRS = [16, 64], [(0.7, 0.9)], [100, 101], [1e-3, 4e-3]
PATH = os.path.join(HERE, "retune_outer.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    H, olr, mom, seed, LR = job
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
    return {"H": H, "olr": olr, "mom": mom, "seed": seed, "lr": LR, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def report():
    base = {(r["H"], r["lr"], r["seed"]): r["loss"] for r in load(OLD) if r["seed"] in SEEDS}
    new = {(r["H"], r["lr"], r["seed"]): r["loss"] for r in load(PATH)}
    for H in HS:
        for LR in LRS:
            if not all((H, LR, s) in new for s in SEEDS): continue
            b = [base[(H, LR, s)] for s in SEEDS]; v = [new[(H, LR, s)] for s in SEEDS]; d = [x - y for x, y in zip(v, b)]
            print(f"H={H} inner lr {LR}: plain mean {sum(b)/2:.4f} {[round(x, 4) for x in b]}; (0.7, 0.9) mean {sum(v)/2:.4f} {[round(x, 4) for x in v]}; paired diff {[round(x, 4) for x in d]} mean {sum(d)/2:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["H"], r["olr"], r["mom"], r["seed"], r["lr"]) for r in load(PATH)}
    jobs = [(H, o, m, s, lr) for s in SEEDS for H in HS for lr in LRS for o, m in OUTERS if (H, o, m, s, lr) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
