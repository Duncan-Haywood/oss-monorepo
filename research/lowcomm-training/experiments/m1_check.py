"""Milestone 1 checks: engine equivalences, quadratic closed form, first transformer run. Writes results.txt."""
import copy, math, os, statistics, sys, time
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, train_sync

torch.set_num_threads(4)
out = []
def say(s=""):
    print(s, flush=True); out.append(s)

# (a) M=1, H=1 equals the synchronous loop
text = load_shakespeare()
data = CharData(text, block=64)
cfg = GPTConfig(vocab=data.vocab, block=64, layers=2, heads=4, dim=128)
torch.manual_seed(0)
m = GPT(cfg); ref = copy.deepcopy(m)
f = lambda model, rng: model(*data.batch("train", 16, rng))
d = DiLoCo(m, f, workers=1, H=1, outer=lambda p: torch.optim.SGD(p, lr=1.0), seed=1)
a = [d.round() for _ in range(100)]
b = train_sync(ref, f, 100, seed=1)
dl = max(abs(x - y) for x, y in zip(a, b))
dp = max((p - q).abs().max().item() for p, q in zip(m.parameters(), ref.parameters()))
say(f"(a) model {m.n_params()} params, vocab {data.vocab}; M=1,H=1, 100 steps: max |loss diff| {dl:.2e}, max |param diff| {dp:.2e}")

# (b) quadratic closed form (research/noisy-local-sgd)
A = [1.0, 0.3, 0.05]; eta, sigma, M, H, alpha, beta = 0.1, 1.0, 4, 8, 0.8, 0.5
def floor(a_):
    q = 1 - eta * a_; s = 1 - q ** H
    V = eta * eta * sigma * sigma * (1 - q ** (2 * H)) / ((1 - q * q) * M)
    return 0.5 * a_ * alpha * V * (1 + beta) / ((1 - beta) * s * (2 * (1 + beta) - alpha * s))
want = sum(floor(x) for x in A)
at = torch.tensor(A)
class Quad(torch.nn.Module):
    def __init__(s): super().__init__(); s.x = torch.nn.Parameter(torch.zeros(3))
def qloss(model, rng): return 0.5 * (at * model.x ** 2).sum() + sigma * (model.x * torch.randn(3, generator=rng)).sum()
vals = []
for seed in range(8):
    q = Quad()
    dd = DiLoCo(q, qloss, workers=M, H=H, seed=seed, inner=lambda p: torch.optim.SGD(p, lr=eta),
                outer=lambda p: torch.optim.SGD(p, lr=alpha, momentum=beta))
    for _ in range(300): dd.round()
    acc = 0.0
    for _ in range(4000):
        dd.round(); acc += 0.5 * (at * q.x.detach() ** 2).sum().item()
    vals.append(acc / 4000)
mu, sd = statistics.mean(vals), statistics.stdev(vals)
t95 = 2.365  # Student t, 7 dof
say(f"(b) quadratic stationary loss: closed form {want:.5f}; simulated {mu:.5f} +/- {t95*sd/math.sqrt(8):.5f} (95% CI, 8 seeds); ratio {mu/want:.3f}")

# (c) first transformer run, single seed, preliminary
import collections
cnt = collections.Counter(text); n = len(text)
ent = -sum(c / n * math.log(c / n) for c in cnt.values())
say(f"(c) unigram entropy of the corpus: {ent:.3f} nats")
torch.manual_seed(0)
m = GPT(cfg)
vb = data.val_batches(32, 8)
def val(model):
    model.eval()
    with torch.no_grad(): v = sum(model(x, y).item() for x, y in vb) / len(vb)
    model.train(); return v
dd = DiLoCo(m, f, workers=4, H=16, seed=0,
            inner=lambda p: torch.optim.AdamW(p, lr=1e-3, betas=(0.9, 0.95), weight_decay=0.0),
            outer=lambda p: torch.optim.SGD(p, lr=0.7, momentum=0.9, nesterov=True))
t0 = time.time()
for r in range(1, 61):
    dd.round()
    if r % 20 == 0: say(f"    round {r:3d} (inner steps per worker {r*16}): val loss {val(m):.3f}  [{time.time()-t0:.0f} s]")
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
