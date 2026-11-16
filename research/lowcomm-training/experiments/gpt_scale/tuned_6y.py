"""Milestone 6y (H6 mechanism): is the H = 64 trunk gain of rand-k compression an under-tuned uncompressed baseline?

6x split the cost of rand-k keep 1/8 (omega 7) at H = 64 into a last-round cost (+0.0120) and a trunk cost T = -0.0136
(se 0.0035): a run compressed for every round but the last, whose last round is sent uncompressed, ends below the
uncompressed run on all four seeds. Every uncompressed baseline so far uses plain outer SGD at lr 1 (plain averaging).
Compression noise enlarges the weights and the last outer step (6x, exploratory), so a larger or momentum outer step in the
uncompressed run may buy the same gain without any noise. This runs that baseline.

Setup: the size-2 runs of scale.py (dim 192, 2 layers, 6 heads, M = 4, inner AdamW lr 2e-3, 3,840 inner steps), H = 64,
seeds 0 to 3, five arms:
  unc        uncompressed, outer SGD lr 1 (scale.py's run; reproduction check);
  recipe     rand-k keep 1/8 for rounds 1 to 59, the last round uncompressed, outer SGD lr 1 (6x's comp/clean; check);
  sgd1.5     uncompressed, outer SGD lr 1.5;
  sgd2       uncompressed, outer SGD lr 2;
  nesterov   uncompressed, outer SGD lr 0.7, momentum 0.9, Nesterov (DiLoCo's outer optimiser, Douillard et al. 2023).
Each run is scored on the standard validation batches (val_batches(32, 16), seed 12345, every earlier milestone's number)
and on 64 fresh batches of the same validation split (seed 777), drawn for this milestone. The best tuned baseline is
chosen by its standard-batch seed mean and scored on the fresh batches, so the choice and the test use different batches.
Usage: python3 tuned_6y.py run | report (run appends to tuned_6y.jsonl; report scores H6y-i to iv from LOG.md)."""
import json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, KEEP, H = 4, 16, 3840, 2e-3, 192, 6, 0.125, 64
PATH = os.path.join(HERE, "tuned_6y.jsonl")
ARMS = {"unc": (False, 1.0, 0.0), "recipe": (True, 1.0, 0.0), "sgd1.5": (False, 1.5, 0.0), "sgd2": (False, 2.0, 0.0),
        "nesterov": (False, 0.7, 0.9)}
TUNED = ("sgd1.5", "sgd2", "nesterov")
JOBS = [(a, s) for s in range(4) for a in ARMS]


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    arm, seed = job
    comp, olr, mom = ARMS[arm]
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = (lambda p: torch.optim.SGD(p, lr=olr)) if mom == 0 else (lambda p: torch.optim.SGD(p, lr=olr, momentum=mom, nesterov=True))
    t0 = time.time()
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
               compress=rand_k(KEEP) if comp else None)
    n = STEPS // H
    for r in range(n):
        if comp and r == n - 1:
            d.compress = None  # the recipe: the last sync is sent uncompressed
        d.round()
    model.eval()

    def score(batches):
        with torch.no_grad():
            v = [model(x, y).item() for x, y in batches]
        m = sum(v) / len(v)
        return m if m == m else float("inf")
    std, fresh = score(data.val_batches(32, 16)), score(data.val_batches(32, 64, seed=777))
    with torch.no_grad():
        theta2 = sum(p.pow(2).sum().item() for p in model.parameters())
    return {"arm": arm, "H": H, "seed": seed, "std": std, "fresh": fresh, "theta2": theta2, "torch": torch.__version__,
            "secs": round(time.time() - t0)}


def mse(x):
    mu = sum(x) / len(x)
    return mu, ((sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5 if len(x) > 1 else float("nan"))


def report():
    recs = {(r["arm"], r["seed"]): r for r in map(json.loads, open(PATH))}
    seeds = sorted({s for _, s in recs})
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    six = {(r["trunk"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "lastround_6x.jsonl"))) if r["H"] == H}
    print("reproduction on the standard batches: unc = scale.jsonl (1.0, 64, s); recipe = lastround_6x comp/clean")
    ok = True
    for s in seeds:
        a, b = recs[("unc", s)]["std"], scale[(1.0, H, s)]
        c, e = recs[("recipe", s)]["std"], six[("comp", s)]["clean"]
        ok &= a == b and c == e
        print(f"  seed {s}: unc {a:.10f} vs {b:.10f} ({a - b:+.1e}); recipe {c:.10f} vs {e:.10f} ({c - e:+.1e})")
    print(f"H6y-i (both reproduce bit-exactly): {'held' if ok else 'refuted'}")
    print("\nper arm, seed mean (se): standard batches, fresh batches, ||theta||^2; minutes per run")
    for a in ARMS:
        rs = [recs[(a, s)] for s in seeds if (a, s) in recs]
        st, fr, th = mse([r["std"] for r in rs]), mse([r["fresh"] for r in rs]), mse([r["theta2"] for r in rs])
        print(f"  {a:9s} n {len(rs)}  std {st[0]:.4f} ({st[1]:.4f})  fresh {fr[0]:.4f} ({fr[1]:.4f})  theta2 {th[0]:,.0f}  "
              f"{sum(r['secs'] for r in rs) / len(rs) / 60:.1f} min  per seed std " + " ".join(f"{r['std']:.4f}" for r in rs))

    def paired(a, b, key):
        return mse([recs[(a, s)][key] - recs[(b, s)][key] for s in seeds])
    print("\npaired by seed against unc (arm minus unc), standard / fresh:")
    for a in ARMS:
        if a == "unc": continue
        p, q = paired(a, "unc", "std"), paired(a, "unc", "fresh")
        print(f"  {a:9s} {p[0]:+.4f} ({p[1]:.4f})  /  {q[0]:+.4f} ({q[1]:.4f})")
    best = min(TUNED, key=lambda a: mse([recs[(a, s)]["std"] for s in seeds])[0])
    print(f"\nbest tuned baseline by standard-batch mean: {best}")
    g = paired(best, "unc", "fresh")
    print(f"H6y-ii  (best tuned baseline below unc on fresh batches by more than 2 se): {'held' if g[0] < -2 * g[1] else 'refuted'} ({g[0]:+.4f}, se {g[1]:.4f})")
    t = paired("recipe", "unc", "fresh")
    print(f"H6y-iii (recipe below unc on fresh batches by more than 2 se): {'held' if t[0] < -2 * t[1] else 'refuted'} ({t[0]:+.4f}, se {t[1]:.4f})")
    r = paired("recipe", best, "fresh")
    print(f"H6y-iv  (recipe below the best tuned baseline on fresh batches by more than 2 se): {'held' if r[0] < -2 * r[1] else 'refuted'} ({r[0]:+.4f}, se {r[1]:.4f})")
    print("exploratory: recipe minus each tuned arm, fresh: " + ", ".join(f"{a} {paired('recipe', a, 'fresh')[0]:+.4f} ({paired('recipe', a, 'fresh')[1]:.4f})" for a in TUNED))


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["arm"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
