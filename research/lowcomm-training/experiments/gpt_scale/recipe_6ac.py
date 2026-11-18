"""Milestone 6ac (H6 mechanism): where between H = 16 and H = 64 does the clean-last-sync trunk gain appear? The recipe
at H = 32 over omega 1, 3 and 7.

At H = 64 the recipe (compress every sync but the last, send the last dense) ends below uncompressed on 6y's fresh
batches at omega 1 (-0.0123), 3 (-0.0185) and 7 (-0.0141) (6y, 6z, 6aa). At H = 16 it is break-even at omega 1 and 3
(-0.0038, -0.0004) and a cost at omega 7 (+0.0141) (6ab). This runs the same arms at H = 32 (the log2 midpoint), so a
practitioner choosing a sync interval knows whether the gain grows smoothly with H or switches on between 32 and 64.

Arms, all at H = 32 (120 syncs) with the size-2 setup of scale.py, seeds 0 to 3:
  unc   uncompressed (scale.jsonl's run; the reproduction check, now also scored on the fresh batches);
  rk2, rk4, rk8   rand-k keep 1/2, 1/4, 1/8 (omega 1, 3, 7) for rounds 1 to 119, then the state is forked and the last
        round runs *clean* (uncompressed: the recipe) and *full* (the same noise continuing: the stored fully-noised run).
Scored on the standard batches (val_batches(32, 16), seed 12345) and 6y's 64 fresh batches (seed 777).
Usage: python3 recipe_6ac.py run | report   (run appends to recipe_6ac.jsonl; report scores H6ac-i to v from LOG.md)."""
import copy, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 32
PATH = os.path.join(HERE, "recipe_6ac.jsonl")
KEEP = {"unc": 1.0, "rk2": 0.5, "rk4": 0.25, "rk8": 0.125}
OMEGA = {"unc": 0, "rk2": 1, "rk4": 3, "rk8": 7}
# unc first (the reproduction check), then omega 3, 7 and 1
JOBS = [(n, s) for n in ("unc", "rk4", "rk8", "rk2") for s in range(4)]


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


def report():
    recs = {(r["noise"], r["seed"]): r for r in map(json.loads, open(PATH))}
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    seeds = range(4)
    print("H6ac-i reproduction on the standard batches against scale.jsonl (H = 32)")
    ok, n_chk = True, 0
    for n in ("unc", "rk8"):
        for s in seeds:
            if (n, s) not in recs: continue
            r = recs[(n, s)]
            a = r["clean_std"] if n == "unc" else r["full_std"]
            d = a - scale[(KEEP[n], H, s)]; ok &= d == 0; n_chk += 1
            print(f"  {n:4s} seed {s}: {a:.10f} vs {scale[(KEEP[n], H, s)]:.10f} ({d:+.1e})  torch {r['torch']}")
    print(f"H6ac-i (bit-exact, {n_chk} checks): {'held' if ok and n_chk == 8 else 'refuted' if not ok else 'incomplete'}")
    unc = {s: recs[("unc", s)] for s in seeds if ("unc", s) in recs}
    if len(unc) < 4: print("unc incomplete"); return
    # fresh T per seed at H = 64 (6y, 6z, 6aa) and H = 16 (6ab) for the H contrasts
    z64, z16 = {}, {}
    y = {(r["arm"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "tuned_6y.jsonl")))}
    for f, key in (("recipe_6z.jsonl", "rk4"), ("recipe_6aa.jsonl", "rk2")):
        for r in map(json.loads, open(os.path.join(HERE, f))):
            if r["noise"] == key: z64[(key, r["seed"])] = r["clean_fresh"] - y[("unc", r["seed"])]["fresh"]
    for s in seeds: z64[("rk8", s)] = y[("recipe", s)]["fresh"] - y[("unc", s)]["fresh"]
    ab = {(r["noise"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "recipe_6ab.jsonl")))}
    for n in ("rk2", "rk4", "rk8"):
        for s in seeds: z16[(n, s)] = ab[(n, s)]["clean_fresh"] - ab[("unc", s)]["clean_fresh"]
    print("\nper noise at H = 32, paired by seed against unc: T = clean - unc, C = full - unc, b = full - clean (std); fresh T")
    res = {}
    for n in ("rk2", "rk4", "rk8"):
        ss = [s for s in seeds if (n, s) in recs]
        if len(ss) < 2: continue
        g = lambda s: recs[(n, s)]
        tf = {s: g(s)["clean_fresh"] - unc[s]["clean_fresh"] for s in ss}
        T = mse([g(s)["clean_std"] - unc[s]["clean_std"] for s in ss])
        C = mse([g(s)["full_std"] - unc[s]["clean_std"] for s in ss])
        b = mse([g(s)["full_std"] - g(s)["clean_std"] for s in ss])
        Tf = mse(list(tf.values()))
        Cf = mse([g(s)["full_fresh"] - unc[s]["clean_fresh"] for s in ss])
        per = " ".join(f"{tf[s]:+.4f}" for s in ss)
        th = mse([g(s)["theta2"] for s in ss])[0]
        mid = mse([(z16[(n, s)] + z64[(n, s)]) / 2 for s in ss])[0]
        res[n] = dict(T=T, C=C, b=b, Tf=Tf, ss=ss, tf=tf, mid=mid)
        print(f"  {n:4s} omega {OMEGA[n]} n {len(ss)}: T {T[0]:+.4f} ({T[1]:.4f})  C {C[0]:+.4f} ({C[1]:.4f})  b {b[0]:+.4f} ({b[1]:.4f})"
              f"  | fresh T {Tf[0]:+.4f} ({Tf[1]:.4f}) C {Cf[0]:+.4f} ({Cf[1]:.4f}) per seed {per}  theta2 {th:,.0f}  b/omega {b[0] / OMEGA[n]:.4f}")
        d64 = mse([z64[(n, s)] - tf[s] for s in ss]); d16 = mse([tf[s] - z16[(n, s)] for s in ss])
        print(f"        exploratory, fresh T paired by seed: H = 64 minus H = 32 {d64[0]:+.4f} ({d64[1]:.4f});"
              f" H = 32 minus H = 16 {d16[0]:+.4f} ({d16[1]:.4f}); midpoint of H = 16 and 64 {mid:+.4f}")
    print(f"  unc theta2 {mse([unc[s]['theta2'] for s in seeds])[0]:,.0f}  step2 {mse([unc[s]['step2'] for s in seeds])[0]:.2f}")
    z = lambda m: m[0] / m[1]
    if "rk4" in res:
        t = res["rk4"]["Tf"]
        print(f"\nH6ac-ii  (omega 3 recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    if "rk8" in res:
        t = res["rk8"]["Tf"]
        print(f"H6ac-iii (omega 7 recipe within 2 se of unc on fresh): {'held' if abs(z(t)) < 2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    if "rk4" in res:
        r = res["rk4"]; dev = mse([r["tf"][s] - (z16[("rk4", s)] + z64[("rk4", s)]) / 2 for s in r["ss"]])
        print(f"H6ac-iv  (omega 3 fresh T within 2 se of the H = 16 / 64 midpoint, paired): {'held' if abs(z(dev)) < 2 else 'refuted'}"
              f" (T {r['Tf'][0]:+.4f}, midpoint {r['mid']:+.4f}, difference {dev[0]:+.4f}, {z(dev):+.1f} se)")
    if all(k in res for k in ("rk2", "rk4", "rk8")):
        bo = [res[k]["b"][0] / OMEGA[k] for k in ("rk2", "rk4", "rk8")]
        print(f"H6ac-v   (b / omega in [0.0008, 0.0016] at all three omegas): {'held' if all(0.0008 <= v <= 0.0016 for v in bo) else 'refuted'}"
              f" ({', '.join(f'{v:.4f}' for v in bo)})")

if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
