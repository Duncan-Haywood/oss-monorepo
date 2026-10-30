"""Pilot for milestone 6d: measure the realised omega = E||C(x)-x||^2 / ||x||^2 of quantise(levels) on real outer deltas
(first 20 rounds at H = 16, one seed), so the levels can be chosen to span omega 3 to 31 before any loss is read."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import torch
torch.set_num_threads(1)
from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, quantise, rand_k

def probe(levels, rounds=20, H=16):
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(0)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128))
    acc = [0.0, 0.0]
    base = quantise(levels) if levels else rand_k(1 / 16)
    def c(x, gen):
        y = base(x, gen); acc[0] += ((y - x) ** 2).sum().item(); acc[1] += (x ** 2).sum().item(); return y
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", 16, rng)), workers=4, H=H,
               inner=lambda p: torch.optim.AdamW(p, lr=2e-3, betas=(0.9, 0.95), weight_decay=0.0),
               outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=0, compress=c)
    for _ in range(rounds): d.round()
    return acc[0] / acc[1]

if __name__ == "__main__":
    for lv in [None, 1, 2, 3, 7]:
        print("rand_k(1/16)" if lv is None else f"quantise({lv})", "omega", round(probe(lv), 2), flush=True)
