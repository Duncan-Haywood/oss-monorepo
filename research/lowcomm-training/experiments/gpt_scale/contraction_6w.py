"""Milestone 6w (H6 mechanism): do long inner loops wash out an outer-step perturbation faster than short ones?

6u and 6v left one candidate for why rand-k at keep 1/8 (omega 7) costs +0.022 nats at H = 16 and nothing at H = 64:
how much of one round's compression noise survives the inner loops that follow it. This measures it directly.

Setup: the size-2 runs of scale.py (dim 192, 2 layers, 6 heads, M = 4, inner AdamW lr 2e-3, plain outer SGD lr 1).
Train uncompressed to step 1,920 (half the 3,840-step budget). Then fork the whole state (global model, workers, inner
AdamW moments, data generators): the reference and the fork run the *same* next round, the reference averaging the
deltas as they are (through the compressor path with the identity), the fork averaging rand-k keep-1/8 compressed
deltas. The workers' inner steps in that round are identical, so the only difference between the two global models is
that round's rand-k noise. Both then continue uncompressed, with identical data, for 256 more inner steps (16 rounds at
H = 16, 4 at H = 64). After the injection round and after every later round we record
  D_k = ||theta_fork - theta_ref||^2 over all parameters, and s_k = D_k / D_0, the share of the injected energy that survives,
plus the validation loss of both models at k = 0 and at the end of the window (exploratory).
A control job (H = 16, seed 0, injection at round 10, identity in both forks) must give D = 0 exactly; it checks the fork.
Usage: python3 contraction_6w.py run | report (run appends to contraction_6w.jsonl; report scores H6w-i to iii from LOG.md)."""
import copy, json, math, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, KEEP, WINDOW = 4, 16, 3840, 2e-3, 192, 6, 0.125, 256
PATH = os.path.join(HERE, "contraction_6w.jsonl")
JOBS = [("control", 16, 0)] + [("inject", H, s) for s in range(4) for H in (64, 16)]


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    kind, H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    ref = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed)
    r0 = 10 if kind == "control" else STEPS // 2 // H
    window = 4 * H if kind == "control" else WINDOW
    for _ in range(r0):
        ref.round()
    fork = copy.deepcopy(ref)  # one memo: the fork's optimisers point at the fork's worker parameters
    ident = lambda x, gen: x
    ref.compress = ident
    fork.compress = ident if kind == "control" else rand_k(KEEP)
    ref.round(); fork.round()
    ref.compress = fork.compress = None

    def dist():
        with torch.no_grad():
            return sum((a - b).pow(2).sum().item() for a, b in zip(ref.model.parameters(), fork.model.parameters()))

    def val(m):
        m.eval()
        with torch.no_grad():
            v = [m(x, y).item() for x, y in data.val_batches(32, 16)]
        m.train()
        return sum(v) / len(v)

    with torch.no_grad():
        norm = sum(p.pow(2).sum().item() for p in ref.model.parameters())
    D = [dist()]
    v0 = (val(ref.model), val(fork.model))
    for _ in range(window // H):
        ref.round(); fork.round(); D.append(dist())
    v1 = (val(ref.model), val(fork.model))
    return {"kind": kind, "H": H, "seed": seed, "r0": r0, "D": D, "theta2": norm, "val0": v0, "val1": v1,
            "torch": torch.__version__, "secs": round(time.time() - t0)}


def mse(x):
    mu = sum(x) / len(x)
    return mu, ((sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5 if len(x) > 1 else float("nan"))


def report():
    recs = [json.loads(l) for l in open(PATH)]
    for r in recs:
        if r["kind"] == "control":
            print(f"control (H 16, seed 0, identity in both forks): D = {r['D']} -> {'pass' if max(r['D']) == 0 else 'FAIL'}")
    inj = {H: sorted([r for r in recs if r["kind"] == "inject" and r["H"] == H], key=lambda r: r["seed"]) for H in (16, 64)}
    print("\nper run: D_0 (injected energy), D_0 / ||theta||^2, survival s_k = D_k / D_0 at 64, 128, 256 inner steps after the injection round")
    for H, rs in inj.items():
        for r in rs:
            s = [d / r["D"][0] for d in r["D"]]
            at = lambda steps: s[steps // H]
            print(f"  H {H} seed {r['seed']}: D_0 {r['D'][0]:.4e} ({r['D'][0] / r['theta2']:.2e});  s @64 {at(64):.3f}  @128 {at(128):.3f}  "
                  f"@256 {at(256):.3f};  after 1 round {s[1]:.3f};  {r['secs']} s ({r['torch']})")
    log1 = {H: [math.log(r["D"][1] / r["D"][0]) for r in rs] for H, rs in inj.items()}
    log64 = {H: [math.log(r["D"][64 // H] / r["D"][0]) for r in rs] for H, rs in inj.items()}
    print("\nseed mean of log s (se), back-transformed in brackets:")
    for name, L in (("after one round", log1), ("after 64 inner steps", log64)):
        for H in (16, 64):
            m, e = mse(L[H]); print(f"  {name}, H {H}: {m:+.3f} ({e:.3f})  [s {math.exp(m):.3f}]")

    def test(L):
        (a, ea), (b, eb) = mse(L[64]), mse(L[16]); d, e = a - b, (ea ** 2 + eb ** 2) ** .5
        return d, e, d < -2 * e
    d, e, ok = test(log1)
    print(f"\nH6w-i   (after one round, log s lower at H = 64 by more than 2 se): {'held' if ok else 'refuted'} (difference {d:+.3f}, se {e:.3f}, {d / e:+.1f} se)")
    d, e, ok = test(log64)
    print(f"H6w-ii  (after 64 inner steps, log s lower at H = 64 by more than 2 se): {'held' if ok else 'refuted'} (difference {d:+.3f}, se {e:.3f}, {d / e:+.1f} se)")
    allc = all(r["D"][-1] < r["D"][0] for rs in inj.values() for r in rs)
    print(f"H6w-iii (s < 1 after 256 inner steps in every run): {'held' if allc else 'refuted'}")

    print("\nexploratory: validation loss, fork minus reference (nats), right after injection and 256 inner steps later")
    for H, rs in inj.items():
        a, b = mse([r["val0"][1] - r["val0"][0] for r in rs]), mse([r["val1"][1] - r["val1"][0] for r in rs])
        print(f"  H {H}: at injection {a[0]:+.4f} ({a[1]:.4f}); after 256 steps {b[0]:+.4f} ({b[1]:.4f})")
    print("\nexploratory: accumulated load per inner step, A(H) = (D_0 / H) x sum_k s_k over the window's rounds "
          "(injected energy per step times how many rounds it persists, measured over 256 steps); seed mean (se)")
    for H, rs in inj.items():
        m, e = mse([r["D"][0] / H * sum(d / r["D"][0] for d in r["D"]) for r in rs]); print(f"  H {H}: {m:.4e} ({e:.1e})")
    print("\nseed-mean trajectory of s_k per round:")
    for H, rs in inj.items():
        n = len(rs[0]["D"]); print(f"  H {H}: " + " ".join(f"{sum(r['D'][k] / r['D'][0] for r in rs) / len(rs):.3f}" for k in range(n)))


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["kind"], r["H"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print({k: v for k, v in r.items() if k != "D"}, flush=True)
