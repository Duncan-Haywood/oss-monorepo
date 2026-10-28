"""Milestone 5l (training half): k of M = 16 workers (0..k-1) coordinate: each sends 1e3 x (minus the sign of the honest workers' mean delta) per coordinate, the strongest push a median allows. Otherwise as coalition.py. KS=3,4,5,6 SEEDS=0 python3 coordinated.py run, then report.
Usage: python3 coalition.py run   then   python3 coalition.py report."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 16, 16, 3840, 2e-3, 16
SEEDS = [int(x) for x in os.environ.get("SEEDS", "0").split(",")]
KS = [int(x) for x in os.environ.get("KS", "3,4,5,6").split(",")]  # number of coalition members (workers 0..k-1), each sending -10x its own delta
PATH = os.path.join(HERE, "coordinated.jsonl")

load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    k, seed = job
    agg, a = "median", -10.0
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    def attack(ds):
        out = ds.clone()
        out[:k] = -1e3 * ds[k:].mean(0).sign()
        return out
    attack.collective = True
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, aggregate=agg, attack=attack)
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"k": k, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


REF = os.path.join(HERE, "..", "gpt_median_m16", "median_m16_full.jsonl")


def report():
    new = {(r["k"], r["seed"]): r["loss"] for r in load(PATH)}
    ref = {(r["agg"], r["offset"], r["seed"]): r["loss"] for r in load(REF)}
    seeds = sorted({s for _, s in new})
    for k in KS:
        ss = [s for s in seeds if (k, s) in new]
        ex = [new[(k, s)] - ref[("median", 1.0, s)] for s in ss]
        if ex:
            print(f"k={k}: seeds {ss} excess over clean median {[round(e, 4) for e in ex]} mean {sum(ex)/len(ex):+.4f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["k"], r["seed"]) for r in load(PATH)}
    jobs = [(k, s) for s in SEEDS for k in KS if (k, s) not in have]  # KS=5,7 python3 coalition.py run: milestone 5k
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
