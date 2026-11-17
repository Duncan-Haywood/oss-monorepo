"""Milestone 6aa (H6 mechanism): does the clean-last-sync gain keep growing as the noise shrinks below omega 3?

6z found that a run compressed on every sync but the last (the "recipe": the last sync sent uncompressed) ends below
uncompressed training at H = 64 by T = -0.0185 (se 0.0020) at rand-k keep 1/4 (omega 3), -0.0141 at keep 1/8
(omega 7), +0.0113 at keep 1/16 (omega 15) and +0.0807 at keep 1/32 (omega 31) on 6y's fresh batches, and that Gaussian
noise with rand-k's per-coordinate variance (`shaped`) gives the same gain as rand-k at omega 7. The best omega tried was
the smallest, and T must return to 0 at omega 0. This places the optimum: rand-k keep 1/2 (omega 1), shaped Gaussian at
omega 3 and 1, and (exploratory, 3 seeds) shaped Gaussian at omega 1/3 (rand-k keep 3/4's variance).

Setup and arms as recipe_6z.py: the size-2 runs of scale.py at H = 64; per (noise, seed) the trunk trains with that
noise for rounds 1 to 59, the state is forked, and the last round runs *clean* (uncompressed: the recipe) and *full*
(the same noise continuing). Scored on the standard batches (val_batches(32, 16), seed 12345) and 6y's 64 fresh batches
(seed 777). Unc comes from `tuned_6y.jsonl`, rand-k omega 3 and 7 from `recipe_6z.jsonl` / `tuned_6y.jsonl`.
A control job reruns 6z's (rk4, seed 0) to check this torch build reproduces 6z bit-exactly.
Usage: python3 recipe_6aa.py run | report   (run appends to recipe_6aa.jsonl; report scores H6aa-i to v from LOG.md)."""
import copy, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 64
PATH = os.path.join(HERE, "recipe_6aa.jsonl")
# noise name -> (kind, parameter): rand-k keep fraction, or Gaussian omega (shaped)
NOISE = {"rk2": ("randk", 0.5), "rk4": ("randk", 0.25), "shaped1": ("shaped", 1.0), "shaped3": ("shaped", 3.0),
         "shaped0.33": ("shaped", 1 / 3)}
OMEGA = {"rk2": 1, "rk4": 3, "rk8": 7, "rk16": 15, "rk32": 31, "shaped0.33": 1 / 3, "shaped1": 1, "shaped3": 3, "shaped7": 7}
# the control first, then the registered core (omega 1 rand-k, shaped 3 and 1), the exploratory omega 1/3 last
JOBS = ([("rk4", 0)] + [(n, s) for n in ("rk2", "shaped3", "shaped1") for s in range(4)]
        + [("shaped0.33", s) for s in range(3)])


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
    new = [json.loads(l) for l in open(PATH)]
    z6 = {(r["noise"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "recipe_6z.jsonl")))}
    y = {(r["arm"], r["seed"]): r for r in map(json.loads, open(os.path.join(HERE, "tuned_6y.jsonl")))}
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    seeds = range(4)
    ctrl = [r for r in new if r["noise"] == "rk4"]
    print("H6aa-i reproduction: the control (rk4, seed 0) against 6z")
    ok = bool(ctrl)
    for r in ctrl:
        ref = z6[("rk4", r["seed"])]
        for k in ("clean_std", "clean_fresh", "full_std", "full_fresh"):
            d = r[k] - ref[k]; ok &= d == 0
            print(f"  {k:11s}: {r[k]:.10f} vs {ref[k]:.10f} ({d:+.1e})  torch {r['torch']} vs {ref['torch']}")
    print(f"H6aa-i (bit-exact): {'held' if ok else 'refuted'}")
    recs = {(r["noise"], r["seed"]): r for r in new if r["noise"] != "rk4"}
    for (n, s), r in z6.items():
        recs[(n, s)] = r
    for s in seeds:
        recs[("rk8", s)] = {"clean_std": y[("recipe", s)]["std"], "clean_fresh": y[("recipe", s)]["fresh"],
                            "full_std": scale[(0.125, H, s)], "theta2": y[("recipe", s)]["theta2"]}
    unc = {s: y[("unc", s)] for s in seeds}
    print("\nper noise, paired by seed against unc (6y): T = clean - unc, C = full - unc, b = full - clean (std); fresh T")
    res = {}
    order = ("shaped0.33", "rk2", "shaped1", "rk4", "shaped3", "rk8", "shaped7", "rk16", "rk32")
    for n in order:
        ss = [s for s in seeds if (n, s) in recs]
        if len(ss) < 2: continue
        g = lambda s: recs[(n, s)]
        T = mse([g(s)["clean_std"] - unc[s]["std"] for s in ss])
        C = mse([g(s)["full_std"] - unc[s]["std"] for s in ss])
        b = mse([g(s)["full_std"] - g(s)["clean_std"] for s in ss])
        Tf = mse([g(s)["clean_fresh"] - unc[s]["fresh"] for s in ss])
        per = " ".join(f"{g(s)['clean_fresh'] - unc[s]['fresh']:+.4f}" for s in ss)
        res[n] = dict(T=T, C=C, b=b, Tf=Tf, ss=ss)
        th = mse([g(s)["theta2"] for s in ss])[0]
        print(f"  {n:10s} omega {OMEGA[n]:5.2f} n {len(ss)}: T {T[0]:+.4f} ({T[1]:.4f})  C {C[0]:+.4f} ({C[1]:.4f})  b {b[0]:+.4f} ({b[1]:.4f})"
              f"  | fresh T {Tf[0]:+.4f} ({Tf[1]:.4f}) per seed {per}  theta2 {th:,.0f}  b/omega {b[0] / OMEGA[n]:.4f}")
    print(f"  unc theta2 {mse([unc[s]['theta2'] for s in seeds])[0]:,.0f}")
    z = lambda m: m[0] / m[1]

    def paired(a, c):  # fresh-batch clean difference a - c, paired by seed
        ss = [s for s in seeds if (a, s) in recs and (c, s) in recs]
        return mse([recs[(a, s)]["clean_fresh"] - recs[(c, s)]["clean_fresh"] for s in ss])
    if "rk2" in res:
        t = res["rk2"]["Tf"]
        print(f"\nH6aa-ii  (omega 1 recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
        d = paired("rk2", "rk4")
        print(f"H6aa-iii (omega 1 recipe above omega 3 on fresh by > 2 se, paired: the gain peaks above omega 1): "
              f"{'held' if z(d) > 2 else 'refuted'} ({d[0]:+.4f}, {z(d):+.1f} se)")
    if "shaped3" in res:
        d = paired("shaped3", "rk4")
        print(f"H6aa-iv  (shaped omega 3 within 2 se of rand-k omega 3 on fresh, paired): {'held' if abs(z(d)) <= 2 else 'refuted'} ({d[0]:+.4f}, {z(d):+.1f} se)")
    if "rk2" in res:
        b1, b3 = res["rk2"]["b"][0], res["rk4"]["b"][0]
        lin = 0.0012 <= b1 <= 0.0024
        print(f"H6aa-v   (b(omega 1) < b(omega 3) and b(1) in [0.0012, 0.0024]): {'held' if b1 < b3 and lin else 'refuted'} ({b1:+.4f} vs {b3:+.4f})")
    if "shaped1" in res:
        d = paired("shaped1", "rk2")
        print(f"exploratory: shaped omega 1 minus rand-k omega 1 on fresh, paired: {d[0]:+.4f} ({d[1]:.4f})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
