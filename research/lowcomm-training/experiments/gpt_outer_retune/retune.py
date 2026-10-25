"""Milestone 3h: joint inner-lr x outer re-tune for the DiLoCo-paper outer setting (3g's Next). H=16, M=4, 3,840 steps, seeds 0 to 2;
inner lr in {5e-4, 1e-3}, outer (lr, Nesterov momentum) in {(0.7, 0.9), (0.3, 0.9)}. Compared with plain averaging at its tuned 2e-3 (3d)
and 3g's (0.7, 0.9) at 2e-3. Usage: python3 retune.py run   then   python3 retune.py report. Results append to retune.jsonl."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, H = 4, 16, 3840, 16
LRS, OUTERS, SEEDS = [5e-4, 1e-3], [(0.7, 0.9), (0.3, 0.9)], [0, 1, 2]
PATH = os.path.join(HERE, "retune.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
MOM = os.path.join(HERE, "..", "gpt_outer_momentum", "momentum.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    lr, olr, mom, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=lr, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=olr, momentum=mom, nesterov=True)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed)
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"lr": lr, "olr": olr, "mom": mom, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def report():
    plain = [r["loss"] for r in sorted(load(OLD), key=lambda r: r["seed"]) if r["H"] == H and r["lr"] == 2e-3 and r["seed"] in SEEDS]
    p97 = [r["loss"] for r in sorted(load(MOM), key=lambda r: r["seed"]) if r["H"] == H and (r["olr"], r["mom"]) == (0.7, 0.9)]
    print(f"H={H} plain at 2e-3: mean {sum(plain)/3:.4f}", [round(x, 4) for x in plain])
    print(f"H={H} (0.7, 0.9) at 2e-3 (3g): mean {sum(p97)/3:.4f}", [round(x, 4) for x in p97])
    new = {(r["lr"], r["olr"], r["mom"], r["seed"]): r["loss"] for r in load(PATH)}
    for lr in LRS:
        for olr, mom in OUTERS:
            if not all((lr, olr, mom, s) in new for s in SEEDS): continue
            v = [new[(lr, olr, mom, s)] for s in SEEDS]; d = [x - y for x, y in zip(v, plain)]
            print(f"H={H} inner {lr} outer ({olr}, {mom}): mean {sum(v)/3:.4f}  paired diff vs plain@2e-3 {[round(x, 4) for x in d]} mean {sum(d)/3:+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["lr"], r["olr"], r["mom"], r["seed"]) for r in load(PATH)}
    jobs = [(lr, o, m, s) for s in SEEDS for lr in LRS for o, m in OUTERS if (lr, o, m, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
