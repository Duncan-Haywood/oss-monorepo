"""Milestone 6ae (H6 mechanism): does the headline H = 64 gain of keep 1/4 with a dense last sync survive four more
seeds? Seeds 4 to 7 of unc and rand-k keep 1/4, pooled with 6y's unc and 6z's keep 1/4 on seeds 0 to 3.

6z's -0.0185 (se 0.0020) on the fresh batches at H = 64, keep 1/4, is the programme's largest recipe gain and rests on
four seeds, where an exact sign-flip test cannot go below P = 0.125. Written for the paper draft
(`paper/section_recipe.md`), which names this cell as the one its claims lean on. Run and scoring code are 6ad's,
unchanged apart from H, the seeds, the arm list and the files pooled in the report.

Arms, H = 64 (60 syncs), size-2 setup of scale.py, seeds 4 to 7:
  unc   uncompressed (seeds 4 and 5 are in scale.jsonl: the reproduction check);
  rk4   rand-k keep 1/4 (omega 3) for rounds 1 to 59, then fork: the last round *clean* (the recipe) and *full*
        (the noise continuing; seeds 4 and 5 are in scale.jsonl: the reproduction check).
Usage: python3 recipe_6ae.py run | report   (run appends to recipe_6ae.jsonl; report pools with tuned_6y.jsonl and
recipe_6z.jsonl and scores H6ae-i to v from LOG.md)."""
import copy, itertools, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 64
PATH = os.path.join(HERE, "recipe_6ae.jsonl")
KEEP = {"unc": 1.0, "rk2": 0.5, "rk4": 0.25, "rk8": 0.125}
OMEGA = {"unc": 0, "rk2": 1, "rk4": 3, "rk8": 7}
NEW = range(4, 8)
# unc first (the reproduction check), then omega 3
JOBS = [(n, s) for n in ("unc", "rk4") for s in NEW]


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare, rand_k
    name, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
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

    def score(m, batches):
        m.eval()
        with torch.no_grad():
            v = [m(x, y).item() for x, y in batches]
        m.train()
        x = sum(v) / len(v)
        return x if x == x else float("inf")

    std_b, fresh_b = data.val_batches(32, 16), data.val_batches(32, 64, seed=777)
    out = {"noise": name, "omega": OMEGA[name], "H": H, "seed": seed}
    if comp is not None:
        full = copy.deepcopy(base)  # the engine's compressor and generator continue: the stored fully-noised run
        full.round()
        out["full_std"], out["full_fresh"] = score(full.model, std_b), score(full.model, fresh_b)
        del full
    start = [p.detach().clone() for p in base.model.parameters()]
    base.compress = None  # the recipe: the last sync is sent uncompressed (a no-op for unc)
    base.round()
    out["clean_std"], out["clean_fresh"] = score(base.model, std_b), score(base.model, fresh_b)
    with torch.no_grad():
        out["theta2"] = sum(p.pow(2).sum().item() for p in base.model.parameters())
        out["step2"] = sum((a - b).pow(2).sum().item() for a, b in zip(base.model.parameters(), start))
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



def report():
    recs = {(r["noise"], r["seed"]): r for r in map(json.loads, open(PATH))}
    old = {}
    for r in map(json.loads, open(os.path.join(HERE, "tuned_6y.jsonl"))):
        if r["arm"] == "unc":
            old[("unc", r["seed"])] = {"clean_std": r["std"], "clean_fresh": r["fresh"]}
    for r in map(json.loads, open(os.path.join(HERE, "recipe_6z.jsonl"))):
        if r["noise"] == "rk4":
            old[("rk4", r["seed"])] = r
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    print("H6ae-i reproduction on the standard batches against scale.jsonl (H = 64, seeds 4 and 5)")
    ok, n_chk = True, 0
    for n, key, keep in (("unc", "clean_std", 1.0), ("rk4", "full_std", 0.25)):
        for s in (4, 5):
            if (n, s) not in recs: continue
            a = recs[(n, s)][key]; ref = scale[(keep, H, s)]
            d = a - ref; ok &= d == 0; n_chk += 1
            print(f"  {n} {key} seed {s}: {a:.10f} vs {ref:.10f} ({d:+.1e})  torch {recs[(n, s)]['torch']}")
    print(f"H6ae-i (bit-exact, {n_chk} checks): {'held' if ok and n_chk == 4 else 'refuted' if not ok else 'incomplete'}")
    allr = {**old, **recs}
    res = {}
    for label, seeds in (("seeds 4-7", list(NEW)), ("seeds 0-3 (6y, 6z)", list(range(4))), ("pooled 0-7", list(range(8)))):
        ss = [s for s in seeds if ("rk4", s) in allr and ("unc", s) in allr]
        if len(ss) < 2: continue
        g = lambda s: allr[("rk4", s)]; u = lambda s: allr[("unc", s)]
        tf = {s: g(s)["clean_fresh"] - u(s)["clean_fresh"] for s in ss}
        cf = {s: g(s)["full_fresh"] - u(s)["clean_fresh"] for s in ss}
        T = mse([g(s)["clean_std"] - u(s)["clean_std"] for s in ss])
        C = mse([g(s)["full_std"] - u(s)["clean_std"] for s in ss])
        b = mse([g(s)["full_std"] - g(s)["clean_std"] for s in ss])
        Tf, Cf = mse(list(tf.values())), mse(list(cf.values()))
        p = signflip_p(list(tf.values()))
        res[label] = dict(Tf=Tf, Cf=Cf, b=b, tf=tf, p=p, ss=ss)
        print(f"\n{label}, rk4 omega 3, n {len(ss)}, paired by seed against unc:")
        print(f"  std: T {T[0]:+.4f} ({T[1]:.4f})  C {C[0]:+.4f} ({C[1]:.4f})  b {b[0]:+.4f} ({b[1]:.4f})  b/omega {b[0] / 3:.4f}")
        print(f"  fresh: T {Tf[0]:+.4f} ({Tf[1]:.4f}) sign-flip P {p:.3f}  C {Cf[0]:+.4f} ({Cf[1]:.4f})  below zero {sum(v < 0 for v in tf.values())} of {len(ss)}")
        print("  fresh T per seed " + " ".join(f"{s}:{tf[s]:+.4f}" for s in ss))
    print("\nunc fresh loss per seed " + " ".join(f"{s}:{allr[('unc', s)]['clean_fresh']:.4f}" for s in range(8) if ("unc", s) in allr))
    z = lambda m: m[0] / m[1]
    P, N, O = "pooled 0-7", "seeds 4-7", "seeds 0-3 (6y, 6z)"
    if P in res and len(res[P]["ss"]) == 8:
        t = res[P]["Tf"]
        print(f"\nH6ae-ii  (pooled recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
        print(f"H6ae-iii (pooled exact sign-flip P < 0.05): {'held' if res[P]['p'] < 0.05 else 'refuted'} (P {res[P]['p']:.3f})")
    if N in res and O in res and len(res[N]["ss"]) == 4:
        a, c = res[N]["Tf"], res[O]["Tf"]
        d, se = a[0] - c[0], (a[1] ** 2 + c[1] ** 2) ** .5
        print(f"H6ae-iv  (seeds 4-7 fresh T within 2 se of seeds 0-3): {'held' if abs(d / se) < 2 else 'refuted'} "
              f"(new {a[0]:+.4f} against old {c[0]:+.4f}, difference {d:+.4f}, {d / se:+.1f} se)")
        bo = res[N]["b"][0] / 3
        print(f"H6ae-v   (b / omega on seeds 4-7 in [0.0012, 0.0022]): {'held' if 0.0012 <= bo <= 0.0022 else 'refuted'} ({bo:.4f})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
