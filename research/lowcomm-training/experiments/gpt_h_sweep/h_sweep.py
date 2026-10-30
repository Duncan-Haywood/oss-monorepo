"""Held-out loss against sync interval H on the 413k-parameter GPT, plain-averaging outer step, inner lr tuned per H
(LOG.md, Milestone 3a). Mirrors numpy_h_sweep/inner_lr_sweep.py on the real transformer.

Usage: python3 h_sweep.py tune|report   (jobs run in 4 processes, one torch thread each; results are appended to
h_sweep_<phase>.jsonl, so a rerun skips finished cells)."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS = 4, 16, 960  # workers, per-worker batch, inner steps per worker (same total samples for every H)
HS = [0, 1, 4, 16, 64, 240]  # 0 = synchronous AdamW, one worker, batch M*B
LRS = [3e-4, 1e-3, 3e-3, 1e-2]  # 3e-4 added after the first tuning pass: 1e-3 was the grid edge pick for most H
TUNE_SEEDS, REPORT_SEEDS = [100, 101], [0, 1, 2]


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, train_sync
    H, lr, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=lr, betas=(0.9, 0.95), weight_decay=0.0)
    t0 = time.time()
    if H == 0:
        train_sync(model, lambda m, rng: m(*data.batch("train", M * B, rng)), STEPS, inner=inner, seed=seed)
    else:
        outer = lambda p: torch.optim.SGD(p, lr=1.0, momentum=0.0)
        d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed)
        for _ in range(STEPS // H):
            d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"H": H, "lr": lr, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


if __name__ == "__main__":
    phase = sys.argv[1]
    path = os.path.join(HERE, f"h_sweep_{phase}.jsonl")
    done = {(r["H"], r["lr"], r["seed"]) for r in map(json.loads, open(path))} if os.path.exists(path) else set()
    if phase == "tune":
        jobs = [(H, lr, s) for H in HS for lr in LRS for s in TUNE_SEEDS]
    else:
        pick = json.load(open(os.path.join(HERE, "picks.json")))
        jobs = [(H, pick[str(H)], s) for H in HS for s in REPORT_SEEDS]
    jobs = [j for j in jobs if j not in done]
    with Pool(4) as p, open(path, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
