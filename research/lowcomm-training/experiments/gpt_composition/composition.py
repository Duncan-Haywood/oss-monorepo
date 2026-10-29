"""Milestone 6b adds held-out H in {8, 32} (uncompressed and keep 1/16) via `python3 composition.py run8_32`; see LOG.md.
Milestone 6a (H6 pilot): does rand-k compression's excess loss compose additively with the outer delay H on the 413k-parameter GPT?
Same model, data, budget (3,840 steps), M = 4, inner lr 2e-3, plain outer step as 3d/4a. New cells: keep p in {0.25, 0.0625} x H in {4, 64}, seeds 0 to 2.
Existing cells read from gpt_retune_all (uncompressed, H in {4, 16, 64}, lr 2e-3) and gpt_compression (H = 16 rand-k).
Usage: python3 composition.py run   then   python3 composition.py report. Results append to composition.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR = 4, 16, 3840, 2e-3
HOLD = [8, 32]
KEEPS, HS, SEEDS = [0.25, 0.0625], [4, 64], [0, 1, 2]
PATH = os.path.join(HERE, "composition.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
RAND = os.path.join(HERE, "..", "gpt_compression", "compression.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    keep, H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, compress=None if keep == 1.0 else rand_k(keep))
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"keep": keep, "H": H, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def cells():
    """{(H, keep): [losses by seed 0..2]}; keep 1 = uncompressed (seeds 0..2 of 3d)."""
    c = {}
    for r in load(OLD):
        if r["lr"] == LR and r["H"] in (4, 16, 64) and r["seed"] in SEEDS:
            c.setdefault((r["H"], 1.0), {})[r["seed"]] = r["loss"]
    for r in load(RAND):
        if r["keep"] in KEEPS: c.setdefault((16, r["keep"]), {})[r["seed"]] = r["loss"]
    for r in load(PATH): c.setdefault((r["H"], r["keep"]), {})[r["seed"]] = r["loss"]
    return c


def report():
    c = cells()
    mean = lambda d: sum(d.values()) / len(d)
    print("cell (H, keep): n seeds, mean loss")
    for k in sorted(c, key=lambda t: (t[0], -t[1])): print(k, len(c[k]), round(mean(c[k]), 4), {s: round(v, 4) for s, v in sorted(c[k].items())})
    ex = lambda H, p: mean(c[(H, p)]) - mean(c[(H, 1.0)])
    print("\nrand-k excess over the uncompressed cell at the same H (nats):")
    for p in KEEPS:
        print(f"keep {p}: " + "  ".join(f"H={H}: {ex(H, p):+.4f}" for H in (4, 16, 64) if (H, p) in c))
    print("\nadditive rule: excess(H, p) = excess(16, p); worst absolute miss over the corners:")
    worst = 0
    for p in KEEPS:
        for H in HS:
            if (H, p) in c:
                miss = ex(H, p) - ex(16, p); worst = max(worst, abs(miss))
                print(f"H={H} keep {p}: measured {ex(H, p):+.4f} predicted {ex(16, p):+.4f} miss {miss:+.4f}")
    print(f"worst miss {worst:.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["keep"], r["H"], r["seed"]) for r in load(PATH)}
    hs, ks = (HOLD, [1.0, 0.0625]) if sys.argv[1] == "run8_32" else (HS, KEEPS)
    jobs = [(k, H, s) for s in SEEDS for H in hs for k in ks if (k, H, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
