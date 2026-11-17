"""Milestone 6ab (H6 mechanism): does the clean-last-sync recipe have an omega optimum at H = 16, where 6x found the
compressed trunk worse than uncompressed?

At H = 64 the recipe (compress every sync but the last, send the last dense) ends below uncompressed on 6y's fresh
batches at omega 1 (-0.0123), 3 (-0.0185) and 7 (-0.0141), with an interior optimum near omega 3 (6z, 6aa). At H = 16,
6x measured the omega-7 trunk on the standard batches only: T = +0.0156 (se 0.0019), a cost. Fully compressed keep 1/4
at H = 16 (scale.jsonl) sits within a few thousandths of uncompressed. This maps T at H = 16 over omega 1, 3 and 7 on
both batch sets, so a practitioner who syncs often knows whether the recipe still pays.

Arms, all at H = 16 (240 syncs) with the size-2 setup of scale.py, seeds 0 to 3:
  unc   uncompressed (scale.jsonl's run; the reproduction check, now also scored on the fresh batches);
  rk2, rk4, rk8   rand-k keep 1/2, 1/4, 1/8 (omega 1, 3, 7) for rounds 1 to 239, then the state is forked and the last
        round runs *clean* (uncompressed: the recipe) and *full* (the same noise continuing: the stored fully-noised run).
Scored on the standard batches (val_batches(32, 16), seed 12345) and 6y's 64 fresh batches (seed 777).
Usage: python3 recipe_6ab.py run | report   (run appends to recipe_6ab.jsonl; report scores H6ab-i to v from LOG.md)."""
import copy, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 16
PATH = os.path.join(HERE, "recipe_6ab.jsonl")
KEEP = {"unc": 1.0, "rk2": 0.5, "rk4": 0.25, "rk8": 0.125}
OMEGA = {"unc": 0, "rk2": 1, "rk4": 3, "rk8": 7}
# unc first (the reproduction check), then omega 3, 1 and 7
JOBS = [(n, s) for n in ("unc", "rk4", "rk2", "rk8") for s in range(4)]


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
    print("H6ab-i reproduction on the standard batches against scale.jsonl (H = 16)")
    ok, n_chk = True, 0
    for n in ("unc", "rk4", "rk8"):
        for s in seeds:
            if (n, s) not in recs: continue
            r = recs[(n, s)]
            a = r["clean_std"] if n == "unc" else r["full_std"]
            d = a - scale[(KEEP[n], H, s)]; ok &= d == 0; n_chk += 1
            print(f"  {n:4s} seed {s}: {a:.10f} vs {scale[(KEEP[n], H, s)]:.10f} ({d:+.1e})  torch {r['torch']}")
    print(f"H6ab-i (bit-exact, {n_chk} checks): {'held' if ok and n_chk == 12 else 'refuted' if not ok else 'incomplete'}")
    unc = {s: recs[("unc", s)] for s in seeds if ("unc", s) in recs}
    if len(unc) < 4: print("unc incomplete"); return
    z64 = {}  # H = 64 fresh T per seed for the exploratory H contrast
    y = {(r["arm"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "tuned_6y.jsonl")))}
    for f, key in (("recipe_6z.jsonl", "rk4"), ("recipe_6aa.jsonl", "rk2")):
        for r in map(json.loads, open(os.path.join(HERE, f))):
            if r["noise"] == key: z64[(key, r["seed"])] = r["clean_fresh"] - y[("unc", r["seed"])]["fresh"]
    for s in seeds: z64[("rk8", s)] = y[("recipe", s)]["fresh"] - y[("unc", s)]["fresh"]
    print("\nper noise at H = 16, paired by seed against unc: T = clean - unc, C = full - unc, b = full - clean (std); fresh T")
    res = {}
    for n in ("rk2", "rk4", "rk8"):
        ss = [s for s in seeds if (n, s) in recs]
        if len(ss) < 2: continue
        g = lambda s: recs[(n, s)]
        T = mse([g(s)["clean_std"] - unc[s]["clean_std"] for s in ss])
        C = mse([g(s)["full_std"] - unc[s]["clean_std"] for s in ss])
        b = mse([g(s)["full_std"] - g(s)["clean_std"] for s in ss])
        Tf = mse([g(s)["clean_fresh"] - unc[s]["clean_fresh"] for s in ss])
        Cf = mse([g(s)["full_fresh"] - unc[s]["clean_fresh"] for s in ss])
        per = " ".join(f"{g(s)['clean_fresh'] - unc[s]['clean_fresh']:+.4f}" for s in ss)
        th = mse([g(s)["theta2"] for s in ss])[0]
        res[n] = dict(T=T, C=C, b=b, Tf=Tf, ss=ss)
        print(f"  {n:4s} omega {OMEGA[n]} n {len(ss)}: T {T[0]:+.4f} ({T[1]:.4f})  C {C[0]:+.4f} ({C[1]:.4f})  b {b[0]:+.4f} ({b[1]:.4f})"
              f"  | fresh T {Tf[0]:+.4f} ({Tf[1]:.4f}) C {Cf[0]:+.4f} ({Cf[1]:.4f}) per seed {per}  theta2 {th:,.0f}  b/omega {b[0] / OMEGA[n]:.4f}")
        ss64 = [s for s in ss if (n, s) in z64]
        dh = mse([z64[(n, s)] - (g(s)["clean_fresh"] - unc[s]["clean_fresh"]) for s in ss64])
        print(f"        exploratory: fresh T at H = 64 minus at H = 16, paired by seed: {dh[0]:+.4f} ({dh[1]:.4f})")
    print(f"  unc theta2 {mse([unc[s]['theta2'] for s in seeds])[0]:,.0f}  step2 {mse([unc[s]['step2'] for s in seeds])[0]:.2f}")
    z = lambda m: m[0] / m[1]
    if "rk8" in res:
        t = res["rk8"]["Tf"]
        print(f"\nH6ab-ii  (omega 7 recipe above unc on fresh by > 2 se, 6x's cost on new batches): {'held' if z(t) > 2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    if "rk4" in res:
        t = res["rk4"]["Tf"]
        print(f"H6ab-iii (omega 3 recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    if all(k in res for k in ("rk2", "rk4", "rk8")):
        a, c, e = (res[k]["Tf"][0] for k in ("rk2", "rk4", "rk8"))
        print(f"H6ab-iv  (fresh T rises with omega, T(1) < T(3) < T(7), seed means): {'held' if a < c < e else 'refuted'} ({a:+.4f}, {c:+.4f}, {e:+.4f})")
        bo = [res[k]["b"][0] / OMEGA[k] for k in ("rk2", "rk4", "rk8")]
        print(f"H6ab-v   (b / omega in [0.0005, 0.0012] at all three omegas): {'held' if all(0.0005 <= v <= 0.0012 for v in bo) else 'refuted'}"
              f" ({', '.join(f'{v:.4f}' for v in bo)})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
