"""Milestone 4d: where is the knee of error feedback? Top-k with error feedback at keep 1/32 and 1/128 of each tensor, same setup as 4b (3d model, 3,840 steps, M = 4, lr 2e-3, H = 16,
plain outer step), seeds 0 to 2. Uncompressed rows are 3d runs at lr 2e-3. Usage: python3 topk_ef_knee.py run   then   python3 topk_ef_knee.py report."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H = 4, 16, 3840, 2e-3, 16
KEEPS, SEEDS, ARMS = [0.03125, 0.0078125], [0, 1, 2], ["topk_ef"]
RAND = os.path.join(HERE, "..", "gpt_compression", "compression.jsonl")
PATH = os.path.join(HERE, "topk_ef_knee.jsonl")
OLD = os.path.join(HERE, "..", "gpt_retune_all", "retune.jsonl")
load = lambda p: [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, top_k
    keep, seed, arm = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed, compress=top_k(keep), error_feedback=(arm == "topk_ef"))
    for _ in range(STEPS // H):
        d.round()
    model.eval()
    with torch.no_grad():
        vals = [model(x, y).item() for x, y in data.val_batches(32, 16)]
    loss = sum(vals) / len(vals)
    return {"arm": arm, "keep": keep, "seed": seed, "loss": loss if loss == loss else float("inf"), "secs": round(time.time() - t0)}


def report():
    base = {r["seed"]: r["loss"] for r in load(OLD) if r["lr"] == LR and r["H"] == H and r["seed"] in SEEDS}
    rnd = {}
    new = {(r["arm"], r["keep"], r["seed"]): r["loss"] for r in load(PATH)}
    b = [base[s] for s in SEEDS]
    print(f"uncompressed: mean {sum(b)/3:.4f}", [round(x, 4) for x in b])
    for k in KEEPS:
        row = {}
        for a in ARMS:
            if all((a, k, s) in new for s in SEEDS): row[a] = [new[(a, k, s)] for s in SEEDS]
        for a, v in row.items():
            ex = [x - y for x, y in zip(v, b)]
            print(f"keep {k} {a}: mean {sum(v)/3:.4f} excess vs uncompressed {[round(x, 4) for x in ex]} mean {sum(ex)/3:+.4f}")
        if "topk" in row and "topk_ef" in row:
            d = [x - y for x, y in zip(row["topk"], row["topk_ef"])]
            print(f"keep {k} EF gain (topk - topk_ef) {[round(x, 4) for x in d]}")
        if False:
            d = [x - y for x, y in zip(row["randk"], row["topk_ef"])]
            print(f"keep {k} topk_ef beats randk by {[round(x, 4) for x in d]}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    have = {(r["arm"], r["keep"], r["seed"]) for r in load(PATH)}
    jobs = [(k, s, a) for s in SEEDS for k in KEEPS for a in ARMS if (a, k, s) not in have]
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, jobs):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
