"""Milestone 4g: why does 2-bit stochastic quantisation + error feedback fail (4e)? Same setup as 4e (3d model, 3,840 steps,
M = 4, lr 2e-3, H = 16, plain outer step), seed 0; logs the relative residual norm ||e|| / ||delta + e|| every round for
2-bit stochastic + EF and scaled-sign + EF. Usage: python3 ef_norm.py run   then   python3 ef_norm.py report."""
import json, os, sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, H, SEED = 4, 16, 3840, 2e-3, 16, 0
BITS = [2, 1]
PATH = os.path.join(HERE, "ef_norm.jsonl")


def run(bits):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, quantize
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(SEED)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=SEED, compress=quantize(bits), error_feedback=True)
    losses = [d.round() for _ in range(STEPS // H)]
    return {"bits": bits, "seed": SEED, "norms": d.ef_norms, "train_loss": losses}


def report():
    for l in open(PATH):
        r = json.loads(l)
        n, T = r["norms"], len(r["norms"])
        q = T // 4
        qs = [sum(n[i * q:(i + 1) * q]) / q for i in range(4)]
        print(f"bits {r['bits']}: rounds {T}; relative residual norm by quarter {[round(x, 3) for x in qs]}; max {max(n):.3f}; "
              f"round 1 {n[0]:.3f}, round 10 {n[9]:.3f}, last {n[-1]:.3f}; train loss first/last {r['train_loss'][0]:.3f}/{r['train_loss'][-1]:.3f}")


if __name__ == "__main__":
    if sys.argv[1] == "report":
        report(); sys.exit()
    with Pool(2) as p, open(PATH, "w") as f:
        for r in p.imap_unordered(run, BITS):
            f.write(json.dumps(r) + "\n"); f.flush()
