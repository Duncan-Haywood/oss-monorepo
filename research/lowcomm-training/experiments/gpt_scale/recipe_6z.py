"""Milestone 6z (H6 mechanism): where in omega does the clean-last-round trunk gain exist, and does it need rand-k?

6x found that a run compressed with rand-k keep 1/8 (omega 7) at H = 64 for every round but the last, with the last round
sent uncompressed (the "recipe"), ends below the uncompressed run (T = -0.0136, se 0.0035); 6y found that the gain survives
the best of five uncompressed outer steps and holds on 64 fresh validation batches (-0.0141, se 0.0063). Both are one
omega and one noise. This maps the recipe across omega (rand-k keep 1/4, 1/16 and 1/32: omega 3, 15, 31) and replaces
rand-k by Gaussian noise with rand-k's own per-coordinate variance (6v's `shaped`, omega 7), whose fully-noised run ended
at -0.0010 against uncompressed (6v).

Setup: the size-2 runs of scale.py (dim 192, 2 layers, 6 heads, M = 4, inner AdamW lr 2e-3, plain outer SGD lr 1, 3,840
inner steps), H = 64, seeds 0 to 3. Per (noise, seed): train the trunk with that noise for rounds 1 to 59, fork the whole
state, and run the last round twice from the same start: *clean* (uncompressed: the recipe) and *full* (the same noise,
the engine's own generator continuing: the stored fully-compressed run, a reproduction check). Both are scored on the
standard validation batches (val_batches(32, 16), seed 12345) and on 6y's 64 fresh batches (seed 777). The uncompressed
baseline and the omega-7 rand-k recipe come from 6y (`tuned_6y.jsonl`, arms unc and recipe), same batches.
Usage: python3 recipe_6z.py run | report   (run appends to recipe_6z.jsonl; report scores H6z-i to v from LOG.md)."""
import copy, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 64
PATH = os.path.join(HERE, "recipe_6z.jsonl")
# noise name -> (kind, parameter): rand-k keep fraction, or Gaussian omega (shaped)
NOISE = {"rk4": ("randk", 0.25), "rk16": ("randk", 0.0625), "shaped7": ("shaped", 7.0), "rk32": ("randk", 0.03125)}
OMEGA = {"rk4": 3, "rk8": 7, "rk16": 15, "rk32": 31, "shaped7": 7}
# omega 3, 15 and shaped first (the registered core); omega 31 last, so a cut-short run still scores H6z-ii to iv
JOBS = [(n, s) for n in ("rk4", "rk16", "shaped7") for s in range(4)] + [("rk32", s) for s in range(4)]


def make(name):
    from lowcomm import rand_k, gauss_noise
    kind, p = NOISE[name]
    return rand_k(p) if kind == "randk" else gauss_noise(p, shaped=True)


def run(job):
    import torch
    torch.set_num_threads(1)
    from lowcomm import DiLoCo, GPT, GPTConfig, CharData, load_shakespeare
    name, seed = job
    data = CharData(load_shakespeare(os.path.join(HERE, "..", "tinyshakespeare.txt")))
    torch.manual_seed(seed)
    model = GPT(GPTConfig(vocab=data.vocab, block=64, layers=2, heads=HEADS, dim=DIM))
    inner = lambda p: torch.optim.AdamW(p, lr=LR, betas=(0.9, 0.95), weight_decay=0.0)
    outer = lambda p: torch.optim.SGD(p, lr=1.0)
    t0 = time.time()
    base = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
                  compress=make(name))
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
    full = copy.deepcopy(base)  # the engine's compressor and generator continue: the stored fully-noised run
    full.round()
    out["full_std"], out["full_fresh"] = score(full.model, std_b), score(full.model, fresh_b)
    del full
    start = [p.detach().clone() for p in base.model.parameters()]
    base.compress = None  # the recipe: the last sync is sent uncompressed
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
    y = {(r["arm"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "tuned_6y.jsonl")))}
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    v6 = {(r["kind"], r["H"], r["seed"]): r["loss"] for r in map(json.loads, open(os.path.join(HERE, "noise_6v.jsonl")))}
    seeds = range(4)
    # the omega-7 rand-k recipe from 6y joins the table; its full run's fresh score was not measured in 6y
    for s in seeds:
        recs[("rk8", s)] = {"noise": "rk8", "seed": s, "clean_std": y[("recipe", s)]["std"], "clean_fresh": y[("recipe", s)]["fresh"],
                            "full_std": scale[(0.125, H, s)], "full_fresh": None, "theta2": y[("recipe", s)]["theta2"]}
    print("H6z-i reproduction: the full arm against the stored fully-noised run (std batches)")
    ok = True
    for n in ("rk4", "rk16", "rk32", "shaped7"):
        for s in seeds:
            if (n, s) not in recs: continue
            kind, p = NOISE[n]
            ref = scale[(p, H, s)] if kind == "randk" else v6[("shaped", H, s)]
            d = recs[(n, s)]["full_std"] - ref
            ok &= d == 0
            print(f"  {n:7s} seed {s}: {recs[(n, s)]['full_std']:.10f} vs {ref:.10f} ({d:+.1e})")
    print(f"H6z-i (bit-exact): {'held' if ok else 'refuted'}")
    unc = {s: y[("unc", s)] for s in seeds}
    print("\nper noise, paired by seed against unc (6y): T = clean - unc, C = full - unc, b = full - clean (std); fresh T")
    res = {}
    for n in ("rk4", "rk8", "shaped7", "rk16", "rk32"):
        ss = [s for s in seeds if (n, s) in recs]
        if len(ss) < 2: continue
        T = mse([recs[(n, s)]["clean_std"] - unc[s]["std"] for s in ss])
        C = mse([recs[(n, s)]["full_std"] - unc[s]["std"] for s in ss])
        b = mse([recs[(n, s)]["full_std"] - recs[(n, s)]["clean_std"] for s in ss])
        Tf = mse([recs[(n, s)]["clean_fresh"] - unc[s]["fresh"] for s in ss])
        per = " ".join(f"{recs[(n, s)]['clean_fresh'] - unc[s]['fresh']:+.4f}" for s in ss)
        res[n] = (T, C, b, Tf)
        th = mse([recs[(n, s)]["theta2"] for s in ss])[0]
        print(f"  {n:7s} omega {OMEGA[n]:2d} n {len(ss)}: T {T[0]:+.4f} ({T[1]:.4f})  C {C[0]:+.4f} ({C[1]:.4f})  b {b[0]:+.4f} ({b[1]:.4f})"
              f"  | fresh T {Tf[0]:+.4f} ({Tf[1]:.4f}) per seed {per}  theta2 {th:,.0f}")
    print(f"  unc theta2 {mse([unc[s]['theta2'] for s in seeds])[0]:,.0f}")
    z = lambda m: m[0] / m[1]
    if "shaped7" in res:
        t = res["shaped7"][3]
        print(f"\nH6z-ii  (shaped Gaussian recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    if "rk4" in res:
        t = res["rk4"][3]
        print(f"H6z-iii (omega 3 recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    if "rk16" in res:
        t = res["rk16"][3]
        print(f"H6z-iv  (omega 15 recipe not above unc on fresh by > 2 se): {'held' if z(t) <= 2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    om = [n for n in ("rk4", "rk8", "rk16", "rk32") if n in res]
    bs = [res[n][2][0] for n in om]
    print(f"H6z-v   (last-round cost b rises with omega, seed means, {', '.join(om)}): "
          f"{'held' if all(a < c for a, c in zip(bs, bs[1:])) else 'refuted'} ({', '.join(f'{v:+.4f}' for v in bs)})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
