"""Milestone 6x (H6 mechanism): what does the last round's rand-k noise cost, in an uncompressed run and in a compressed one?

6w found that one round of rand-k keep 1/8 (omega 7) injected at mid-training costs +0.0063 nats at H = 16 and +0.0121 at
H = 64 right after the round, yet a whole run compressed at omega 7 ends at +0.0220 (H = 16) and -0.0016 (H = 64) against
uncompressed. A compressed run's last outer step carries a fresh round of rand-k noise, so either the single-round cost is
much smaller at the end of training, or a run compressed throughout adapts to the noise. This separates the two.

Setup: the size-2 runs of scale.py (dim 192, 2 layers, 6 heads, M = 4, inner AdamW lr 2e-3, plain outer SGD lr 1, 3,840
inner steps). Two trunks per (H, seed): "unc" trains uncompressed, "comp" trains with rand-k keep 1/8, both exactly as
scale.py builds them, for all rounds but the last. Then the whole state is forked and the last round is run in 1 + 1 + 7
arms from the same start:
  clean   the last round uncompressed (compress=None, scale.py's path);
  draw 0  the last round rand-k with the engine's own generator continuing (for the comp trunk this is scale.py's run);
  draw 1-7 the last round rand-k with a fresh generator (seed 1,000,000 + 100 seed + k).
The workers' inner steps in the last round are the same in every arm, so arms differ only by that round's aggregation.
We record each arm's validation loss (scale.py's 16 val batches of 32) and D = ||theta_arm - theta_clean||^2.
Reproduction checks: unc/clean and comp/draw 0 are exactly scale.py's (1.0, H, s) and (0.125, H, s) runs and should
reproduce scale.jsonl's losses.
Usage: python3 lastround_6x.py run | report (run appends to lastround_6x.jsonl; report scores H6x-i to iv from LOG.md)."""
import copy, json, math, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, KEEP, DRAWS = 4, 16, 3840, 2e-3, 192, 6, 0.125, 8
PATH = os.path.join(HERE, "lastround_6x.jsonl")
JOBS = [(t, H, s) for H in (64, 16) for s in range(4) for t in ("unc", "comp")]


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    trunk, H, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    base = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
                  compress=None if trunk == "unc" else rand_k(KEEP))
    for _ in range(STEPS // H - 1):
        base.round()

    def val(m):
        m.eval()
        with torch.no_grad():
            v = [m(x, y).item() for x, y in data.val_batches(32, 16)]
        m.train()
        return sum(v) / len(v)

    def arm(draw):
        d = copy.deepcopy(base)
        if draw is None:
            d.compress = None
        else:
            d.compress = rand_k(KEEP)
            if draw > 0:
                d.cgen = torch.Generator().manual_seed(1_000_000 + 100 * seed + draw)
        d.round()
        return d

    clean = arm(None)
    vc = val(clean.model)
    with torch.no_grad():
        theta2 = sum(p.pow(2).sum().item() for p in clean.model.parameters())
        start = list(base.model.parameters())
        step2 = sum((a - b).pow(2).sum().item() for a, b in zip(clean.model.parameters(), start))
    vals, D = [], []
    for k in range(DRAWS):
        d = arm(k)
        vals.append(val(d.model))
        with torch.no_grad():
            D.append(sum((a - b).pow(2).sum().item() for a, b in zip(d.model.parameters(), clean.model.parameters())))
        del d
    return {"trunk": trunk, "H": H, "seed": seed, "clean": vc, "draws": vals, "D": D, "theta2": theta2, "step2": step2,
            "torch": torch.__version__, "secs": round(time.time() - t0)}


def mse(x):
    mu = sum(x) / len(x)
    return mu, ((sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5 if len(x) > 1 else float("nan"))


def report():
    recs = {(r["trunk"], r["H"], r["seed"]): r for r in map(json.loads, open(PATH))}
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    print("reproduction (scale.jsonl): unc/clean = (1.0, H, s), comp/draw 0 = (0.125, H, s)")
    for (t, H, s), r in sorted(recs.items()):
        ref = scale.get((1.0 if t == "unc" else KEEP, H, s)); got = r["clean"] if t == "unc" else r["draws"][0]
        print(f"  {t:4s} H {H:2d} seed {s}: {got:.10f} vs {ref:.10f}  diff {got - ref:+.2e}  ({r['secs']} s, {r['torch']})")
    seeds = range(4)
    cost = {}  # (trunk, H) -> per-seed last-round cost: mean over the 8 draws minus clean
    print("\nper run: clean loss, last-round cost (draw mean - clean) with within-run sd over 8 draws, D/||theta||^2, D/||step||^2")
    for H in (64, 16):
        for t in ("unc", "comp"):
            cs = []
            for s in seeds:
                r = recs.get((t, H, s))
                if r is None: continue
                c = [v - r["clean"] for v in r["draws"]]; m = sum(c) / len(c); sd = (sum((v - m) ** 2 for v in c) / (len(c) - 1)) ** .5
                cs.append(m)
                Dm = sum(r["D"]) / len(r["D"])
                print(f"  H {H:2d} {t:4s} seed {s}: clean {r['clean']:.4f}  cost {m:+.4f} (sd {sd:.4f}, range {min(c):+.4f} to {max(c):+.4f})  "
                      f"D {Dm / r['theta2']:.2e} of theta2, {Dm / r['step2']:.2f} x last step2")
            cost[(t, H)] = cs
    print("\nseed mean (se) of the last-round cost, nats:")
    for k, v in cost.items():
        m, e = mse(v); print(f"  {k[0]:4s} H {k[1]:2d}: {m:+.4f} ({e:.4f})")

    def diff(a, b):
        (ma, ea), (mb, eb) = mse(a), mse(b); return ma - mb, (ea ** 2 + eb ** 2) ** .5
    m, e = mse(cost[("unc", 64)])
    print(f"\nH6x-i   (unc trunk, H 64: last-round cost above 0 by more than 2 se): {'held' if m > 2 * e else 'refuted'} ({m:+.4f}, se {e:.4f})")
    d, e = diff(cost[("unc", 64)], cost[("unc", 16)])
    print(f"H6x-ii  (unc trunk: cost at H 64 above H 16 by more than 2 se): {'held' if d > 2 * e else 'refuted'} ({d:+.4f}, se {e:.4f})")
    d, e = diff(cost[("unc", 64)], cost[("comp", 64)])
    print(f"H6x-iii (H 64: comp trunk's cost below unc trunk's by more than 2 se): {'held' if d > 2 * e else 'refuted'} ({-d:+.4f}, se {e:.4f})")
    d, e = diff(cost[("unc", 16)], cost[("comp", 16)])
    print(f"H6x-iv  (H 16: comp trunk's cost below unc trunk's by more than 2 se): {'held' if d > 2 * e else 'refuted'} ({-d:+.4f}, se {e:.4f})")

    print("\ndecomposition, seed mean (se, paired by seed): full cost C = comp/draw0 - unc/clean; trunk cost T = comp/clean - unc/clean; "
          "last-round share b = comp/draw0 - comp/clean (C = T + b); T8 uses the 8-draw mean in place of draw 0")
    for H in (64, 16):
        C = [recs[("comp", H, s)]["draws"][0] - recs[("unc", H, s)]["clean"] for s in seeds]
        T = [recs[("comp", H, s)]["clean"] - recs[("unc", H, s)]["clean"] for s in seeds]
        b = [recs[("comp", H, s)]["draws"][0] - recs[("comp", H, s)]["clean"] for s in seeds]
        C8 = [t + c for t, c in zip(T, cost[("comp", H)])]
        print(f"  H {H:2d}: C {mse(C)[0]:+.4f} ({mse(C)[1]:.4f})  T {mse(T)[0]:+.4f} ({mse(T)[1]:.4f})  b {mse(b)[0]:+.4f} ({mse(b)[1]:.4f})  "
              f"C with 8-draw last round {mse(C8)[0]:+.4f} ({mse(C8)[1]:.4f})")
    print("\nexploratory: injected energy D (8-draw mean) relative to ||theta||^2 and to the clean last step, seed mean")
    for H in (64, 16):
        for t in ("unc", "comp"):
            rs = [recs[(t, H, s)] for s in seeds]
            a = mse([sum(r["D"]) / len(r["D"]) / r["theta2"] for r in rs])[0]; b2 = mse([sum(r["D"]) / len(r["D"]) / r["step2"] for r in rs])[0]
            st = mse([r["step2"] for r in rs])[0]
            print(f"  H {H:2d} {t:4s}: D/theta2 {a:.2e}  D/step2 {b2:.2f}  ||last clean step||^2 {st:.3f}")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["trunk"], r["H"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print({k: v for k, v in r.items() if k not in ("D", "draws")}, flush=True)
