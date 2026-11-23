"""Milestone 6af (H6 mechanism): does the H = 64 gain of keep 1/4 with a dense last sync hold on a held-out test split
carved from the training text, which no earlier decision has seen?

Every recipe result so far (6x to 6ae) was scored on batches drawn from the validation text: the 16 standard batches,
on which the recipe was found and its omega chosen, and 6y's 64 fresh batches, which are new draws from the same
111k characters. Here the last ninth of the training text (characters 80% to 90% of Tiny Shakespeare) is removed
from training and kept as a test split. Nothing in the programme was trained on it or chosen on it. Training runs on
the first 80%; the validation text is unchanged, so the standard and fresh batches are scored as before for comparison.
Scoring also covers 64 batches from the (reduced) training text, so the recipe's effect on the generalisation gap is
measured directly (the regulariser reading named in `paper/section_recipe.md`).

Arms, H = 64 (60 syncs), size-2 setup of scale.py with the carved training text, seeds 0 to 7:
  unc   uncompressed;
  rk4   rand-k keep 1/4 (omega 3) for rounds 1 to 59, then fork: the last round *clean* (the recipe) and *full*.
Run and scoring code are 6ae's apart from the data split and the two extra batch sets. No run reproduces a stored
one (the training text differs), so there is no bit-exact check; the M = 1 harness tests still run.
Usage: python3 heldout_6af.py run | report   (run appends to heldout_6af.jsonl; report scores H6af-i to vi from LOG.md)."""
import copy, itertools, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 64
PATH = os.path.join(HERE, "heldout_6af.jsonl")
KEEP = {"unc": 1.0, "rk4": 0.25}
OMEGA = {"unc": 0, "rk4": 3}
SEEDS = range(8)
# paired order: each seed's unc and rk4 run in the same wave, so a partial file still pairs
JOBS = [(n, s) for s in SEEDS for n in ("unc", "rk4")]
TEST_SEED, TRAIN_SEED = 4242, 2424  # batch-draw seeds for the test and train-loss sets, fixed before any run


def split(data):
    """Carve the test split: the last ninth of the training ids (80% to 90% of the text). Returns the test ids."""
    import torch
    cut = len(data.train) * 8 // 9
    test = data.train[cut:].clone()
    data.train = data.train[:cut].clone()
    return test


def batches(data, ids, size, n, seed):
    import torch
    g = torch.Generator().manual_seed(seed)
    out = []
    for _ in range(n):
        ix = torch.randint(len(ids) - data.block - 1, (size,), generator=g)
        out.append((torch.stack([ids[i:i + data.block] for i in ix]), torch.stack([ids[i + 1:i + 1 + data.block] for i in ix])))
    return out


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    name, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    test = split(data)
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    comp = None if name == "unc" else rand_k(KEEP[name])
    base = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
                  compress=comp)
    for _ in range(STEPS // H - 1):
        base.round()

    def score(m, bs):
        m.eval()
        with torch.no_grad():
            v = [m(x, y).item() for x, y in bs]
        m.train()
        x = sum(v) / len(v)
        return x if x == x else float("inf")

    sets = {"std": data.val_batches(32, 16), "fresh": data.val_batches(32, 64, seed=777),
            "test": batches(data, test, 32, 64, TEST_SEED), "train": batches(data, data.train, 32, 64, TRAIN_SEED)}
    out = {"noise": name, "omega": OMEGA[name], "H": H, "seed": seed, "train_chars": len(data.train), "test_chars": len(test)}
    if comp is not None:
        full = copy.deepcopy(base)
        full.round()
        for k, bs in sets.items():
            out[f"full_{k}"] = score(full.model, bs)
        del full
    base.compress = None  # the recipe: the last sync is sent uncompressed (a no-op for unc)
    base.round()
    for k, bs in sets.items():
        out[f"clean_{k}"] = score(base.model, bs)
    with torch.no_grad():
        out["theta2"] = sum(p.pow(2).sum().item() for p in base.model.parameters())
    out.update(torch=torch.__version__, secs=round(time.time() - t0))
    return out


def mse(x):
    mu = sum(x) / len(x)
    return mu, ((sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5 if len(x) > 1 else float("nan"))


def signflip_p(x):
    """Exact two-sided paired sign-flip permutation P of the mean (all 2^n sign patterns)."""
    obs = abs(sum(x))
    pats = list(itertools.product((1, -1), repeat=len(x)))
    return sum(abs(sum(s * v for s, v in zip(p, x))) >= obs - 1e-15 for p in pats) / len(pats)


def pearson(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** .5
    return num / den if den else float("nan")


def report():
    recs = {(r["noise"], r["seed"]): r for r in map(json.loads, open(PATH))}
    ss = [s for s in SEEDS if ("unc", s) in recs and ("rk4", s) in recs]
    print(f"paired seeds: {ss}; train chars {recs[('unc', ss[0])]['train_chars']}, test chars {recs[('unc', ss[0])]['test_chars']}")
    u = lambda s: recs[("unc", s)]; g = lambda s: recs[("rk4", s)]
    T, C, b = {}, {}, {}
    print("\nPaired by seed against unc, rand-k keep 1/4 (omega 3) at H = 64 (nats, seed mean (se); P exact sign-flip):")
    for k in ("test", "fresh", "std", "train"):
        T[k] = [g(s)[f"clean_{k}"] - u(s)[f"clean_{k}"] for s in ss]
        C[k] = [g(s)[f"full_{k}"] - u(s)[f"clean_{k}"] for s in ss]
        b[k] = [g(s)[f"full_{k}"] - g(s)[f"clean_{k}"] for s in ss]
        t, c, bb = mse(T[k]), mse(C[k]), mse(b[k])
        print(f"  {k:5s}: T {t[0]:+.4f} ({t[1]:.4f}) P {signflip_p(T[k]):.3f} below zero {sum(v < 0 for v in T[k])} of {len(ss)}"
              f" | C {c[0]:+.4f} ({c[1]:.4f}) | b {bb[0]:+.4f} ({bb[1]:.4f}) b/omega {bb[0] / 3:.4f}")
        print("         T per seed " + " ".join(f"{s}:{v:+.4f}" for s, v in zip(ss, T[k])))
    gap_u = mse([u(s)["clean_test"] - u(s)["clean_train"] for s in ss])
    gap_r = mse([g(s)["clean_test"] - g(s)["clean_train"] for s in ss])
    print(f"\ngeneralisation gap (test - train): unc {gap_u[0]:+.4f} ({gap_u[1]:.4f}), recipe {gap_r[0]:+.4f} ({gap_r[1]:.4f})")
    print("unc loss per seed (test / train): " + " ".join(f"{s}:{u(s)['clean_test']:.4f}/{u(s)['clean_train']:.4f}" for s in ss))
    print("theta2 mean: unc {:.0f}, recipe {:.0f}".format(mse([u(s)["theta2"] for s in ss])[0], mse([g(s)["theta2"] for s in ss])[0]))
    if len(ss) < 8:
        print(f"\nincomplete ({len(ss)} of 8 seeds paired): no verdicts")
        return
    z = lambda m: m[0] / m[1]
    t = mse(T["test"]); p = signflip_p(T["test"])
    print(f"\nH6af-i   (test T below zero by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    print(f"H6af-ii  (test T exact sign-flip P < 0.05): {'held' if p < 0.05 else 'refuted'} (P {p:.3f})")
    ref, ref_se = -0.0134, 0.0026  # 6ae pooled fresh T, eight seeds, full training text
    d, se = t[0] - ref, (t[1] ** 2 + ref_se ** 2) ** .5
    print(f"H6af-iii (test T within 2 se of 6ae's fresh -0.0134): {'held' if abs(d / se) < 2 else 'refuted'} (difference {d:+.4f}, {d / se:+.1f} se)")
    D = mse([a - c for a, c in zip(T["test"], T["train"])])
    print(f"H6af-iv  (regulariser: T(test) - T(train) below zero by > 2 se): {'held' if z(D) < -2 else 'refuted'} ({D[0]:+.4f} ({D[1]:.4f}), {z(D):+.1f} se)")
    bo = mse(b["test"])[0] / 3
    print(f"H6af-v   (b / omega on test in [0.0012, 0.0024]): {'held' if 0.0012 <= bo <= 0.0024 else 'refuted'} ({bo:.4f})")
    r = pearson(T["test"], T["fresh"])
    print(f"H6af-vi  (per-seed T on test and on fresh correlate, r > 0.5): {'held' if r > 0.5 else 'refuted'} (r {r:+.2f}, n {len(ss)})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
