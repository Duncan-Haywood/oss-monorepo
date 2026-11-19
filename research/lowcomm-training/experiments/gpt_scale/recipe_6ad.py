"""Milestone 6ad (H6 mechanism): does keep 1/4 with a dense last sync gain at H = 32? Seeds 4 to 7 of unc, keep 1/4
and keep 1/8, pooled with 6ac's seeds 0 to 3.

6ac left the omega-3 recipe at -0.0059 (se 0.0082) against uncompressed on the fresh batches at H = 32, with a
seed-to-seed spread two to four times wider than at H = 16 or 64 and shared across omegas (seed 1 positive at every
omega, seed 2 negative). Its Next (1): four more seeds of unc and keep 1/4. Keep 1/8 is added because its fresh T
(+0.0016, se 0.0092) has the same spread, and pairing two compressed arms against one unc per seed is how the shared
seed effect is tested. Run and scoring code are 6ac's, unchanged apart from the seeds and the arm list.

Arms, H = 32 (120 syncs), size-2 setup of scale.py, seeds 4 to 7:
  unc   uncompressed (seeds 4 and 5 are in scale.jsonl: the reproduction check);
  rk4, rk8   rand-k keep 1/4, 1/8 (omega 3, 7) for rounds 1 to 119, then fork: the last round *clean* (the recipe)
        and *full* (the noise continuing).
Usage: python3 recipe_6ad.py run | report   (run appends to recipe_6ad.jsonl; report pools with recipe_6ac.jsonl and
scores H6ad-i to vi from LOG.md)."""
import copy, itertools, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 32
PATH = os.path.join(HERE, "recipe_6ad.jsonl")
PRIOR = os.path.join(HERE, "recipe_6ac.jsonl")
KEEP = {"unc": 1.0, "rk2": 0.5, "rk4": 0.25, "rk8": 0.125}
OMEGA = {"unc": 0, "rk2": 1, "rk4": 3, "rk8": 7}
NEW = range(4, 8)
# unc first (the reproduction check), then omega 3 and 7
JOBS = [(n, s) for n in ("unc", "rk4", "rk8") for s in NEW]


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


def pearson(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** .5


def report():
    recs = {(r["noise"], r["seed"]): r for r in map(json.loads, open(PATH))}
    old = {(r["noise"], r["seed"]): r for r in map(json.loads, open(PRIOR))}
    scale = {}
    for l in open(os.path.join(HERE, "scale.jsonl")):
        r = json.loads(l); scale[(r["keep"], r["H"], r["seed"])] = r["loss"]
    print("H6ad-i reproduction of unc on the standard batches against scale.jsonl (H = 32, seeds 4 and 5)")
    ok, n_chk = True, 0
    for s in (4, 5):
        if ("unc", s) not in recs: continue
        a = recs[("unc", s)]["clean_std"]; ref = scale[(1.0, H, s)]
        d = a - ref; ok &= d == 0; n_chk += 1
        print(f"  unc seed {s}: {a:.10f} vs {ref:.10f} ({d:+.1e})  torch {recs[('unc', s)]['torch']}")
    print(f"H6ad-i (bit-exact, {n_chk} checks): {'held' if ok and n_chk == 2 else 'refuted' if not ok else 'incomplete'}")
    allr = {**old, **recs}
    res = {}
    for label, seeds in (("seeds 4-7", list(NEW)), ("seeds 0-3 (6ac)", list(range(4))), ("pooled 0-7", list(range(8)))):
        print(f"\n{label}: paired by seed against unc; T = clean - unc, C = full - unc, b = full - clean (std); fresh T, C")
        for n in ("rk4", "rk8"):
            ss = [s for s in seeds if (n, s) in allr and ("unc", s) in allr]
            if len(ss) < 2: continue
            g = lambda s: allr[(n, s)]; u = lambda s: allr[("unc", s)]
            tf = {s: g(s)["clean_fresh"] - u(s)["clean_fresh"] for s in ss}
            cf = {s: g(s)["full_fresh"] - u(s)["clean_fresh"] for s in ss}
            T = mse([g(s)["clean_std"] - u(s)["clean_std"] for s in ss])
            b = mse([g(s)["full_std"] - g(s)["clean_std"] for s in ss])
            Tf, Cf = mse(list(tf.values())), mse(list(cf.values()))
            p = signflip_p(list(tf.values()))
            res[(label, n)] = dict(Tf=Tf, Cf=Cf, b=b, tf=tf, p=p, ss=ss)
            print(f"  {n} omega {OMEGA[n]} n {len(ss)}: T {T[0]:+.4f} ({T[1]:.4f})  b {b[0]:+.4f} ({b[1]:.4f}) b/omega {b[0] / OMEGA[n]:.4f}"
                  f"  | fresh T {Tf[0]:+.4f} ({Tf[1]:.4f}) sign-flip P {p:.3f}  fresh C {Cf[0]:+.4f} ({Cf[1]:.4f})")
            print("        fresh T per seed " + " ".join(f"{s}:{tf[s]:+.4f}" for s in ss))
    print("\nunc fresh loss per seed " + " ".join(f"{s}:{allr[('unc', s)]['clean_fresh']:.4f}" for s in range(8) if ("unc", s) in allr))
    z = lambda m: m[0] / m[1]
    P = "pooled 0-7"
    if (P, "rk4") in res and len(res[(P, "rk4")]["ss"]) == 8:
        t = res[(P, "rk4")]["Tf"]
        print(f"\nH6ad-ii  (pooled omega 3 recipe below unc on fresh by > 2 se): {'held' if z(t) < -2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
        print(f"H6ad-iii (pooled omega 3 fresh T below zero, point estimate): {'held' if t[0] < 0 else 'refuted'} ({t[0]:+.4f})")
    if (P, "rk8") in res and len(res[(P, "rk8")]["ss"]) == 8:
        t = res[(P, "rk8")]["Tf"]
        print(f"H6ad-iv  (pooled omega 7 fresh T within 2 se of zero): {'held' if abs(z(t)) < 2 else 'refuted'} ({t[0]:+.4f}, {z(t):+.1f} se)")
    N = "seeds 4-7"
    if (N, "rk4") in res and (N, "rk8") in res:
        bo = [res[(N, k)]["b"][0] / OMEGA[k] for k in ("rk4", "rk8")]
        print(f"H6ad-v   (b / omega in [0.0012, 0.0020] for omega 3 and 7 on seeds 4-7): "
              f"{'held' if all(0.0012 <= v <= 0.0020 for v in bo) else 'refuted'} ({', '.join(f'{v:.4f}' for v in bo)})")
    if (P, "rk4") in res and (P, "rk8") in res:
        ss = sorted(set(res[(P, "rk4")]["ss"]) & set(res[(P, "rk8")]["ss"]))
        r = pearson([res[(P, "rk4")]["tf"][s] for s in ss], [res[(P, "rk8")]["tf"][s] for s in ss])
        print(f"H6ad-vi  (per-seed fresh T of omega 3 and omega 7 correlate, Pearson > 0.5, n {len(ss)}): {'held' if r > 0.5 else 'refuted'} (r {r:+.2f})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print(r, flush=True)
