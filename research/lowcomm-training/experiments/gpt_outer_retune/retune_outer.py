"""Milestone 3h: does re-tuning the inner lr rescue the DiLoCo paper's outer setting (lr 0.7, Nesterov 0.9) on the 413k GPT?
3g found it worse than plain averaging at inner lr 2e-3 (tuned for plain). Here inner lr in {5e-4, 1e-3, 2e-3} for H in {16, 64},
picked on tuning seeds 100, 101 (mean validation loss) with the paper outer setting; report seeds 0 to 2 at the pick, paired against
plain averaging at its own 3d pick (2e-3). 3g's seed 0-2 runs at 2e-3 are reused.
Usage: python3 retune_outer.py run   then   python3 retune_outer.py report. Results append to retune_outer.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS = 4, 16, 3840
HS, LRS, TUNE, SEEDS, OUTER = [16, 64], [5e-4, 1e-3, 2e-3], [100, 101], [0, 1, 2], (0.7, 0.9)
PATH = os.path.join(HERE, "retune_outer.jsonl")
PLAIN = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
MOM = os.path.join(HERE, "..", "gpt_outer_momentum", "momentum.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    H, lr, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=lr, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=OUTER[0], momentum=OUTER[1], nesterov=True)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed)
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"H": H, "lr": lr, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def table():
    t = {(r["H"], r["lr"], r["seed"]): r["loss"] for r in load(PATH)}
    for r in load(MOM):  # 3g's paper-setting runs at 2e-3 on seeds 0 to 2
        if (r["olr"], r["mom"]) == OUTER: t[(r["H"], 2e-3, r["seed"])] = r["loss"]
    return t


def report():
    t = table(); plain = {(r["H"], r["seed"]): r["loss"] for r in load(PLAIN) if r["lr"] == 2e-3}
    for H in HS:
        means = {lr: sum(t[(H, lr, s)] for s in TUNE) / len(TUNE) for lr in LRS if all((H, lr, s) in t for s in TUNE)}
        for lr, m in means.items(): print(f"H={H} tuning lr {lr}: mean {m:.4f}")
        if len(means) < len(LRS): continue
        pick = min(means, key=means.get)
        v = [t[(H, pick, s)] for s in SEEDS if (H, pick, s) in t]
        if len(v) < len(SEEDS): continue
        b = [plain[(H, s)] for s in SEEDS]; d = [x - y for x, y in zip(v, b)]
        print(f"H={H} pick {pick}: paper-setting mean {sum(v)/3:.4f} {[round(x,4) for x in v]}; plain(2e-3) mean {sum(b)/3:.4f}; paired diff {[round(x,4) for x in d]} mean {sum(d)/3:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["H"], r["lr"], r["seed"]) for r in load(PATH)} | {k for k in table()}
    jobs = [(H, lr, s) for s in TUNE for H in HS for lr in LRS if (H, lr, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
    # second stage: the pick per H on tuning seeds, then report seeds at that pick
    t = table(); jobs = []
    for H in HS:
        means = {lr: sum(t[(H, lr, s)] for s in TUNE) / len(TUNE) for lr in LRS}
        pick = min(means, key=means.get)
        jobs += [(H, pick, s) for s in SEEDS if (H, pick, s) not in t]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
