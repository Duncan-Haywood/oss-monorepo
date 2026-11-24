"""Milestone 6ag (H6 mechanism): when, during training, does the H = 64 gain of keep 1/4 with a dense last sync appear?
A per-round trace of unc and the rand-k keep 1/4 trunk, eight seeds.

6af ruled out the regulariser reading: the recipe lowers training loss more than held-out loss, so its gain is an
optimisation effect. Every figure so far is an end point (round 60). This trace scores both runs after every sync, on
fixed training-text batches and on validation batches, so the gain's onset and shape can be read, and turned into
"rounds saved".

One trajectory per arm. With the plain outer step (SGD, lr 1, no momentum) a dense sync sets the global model to the
workers' mean end point, computed exactly as DiLoCo does it (p - (p - mean)). Rand-k's generator is consumed only when
deltas are compressed, so the workers' end points in round r do not depend on how round r is synced. Hence, for the
compressed trunk, after each round r:
  full_r  = the global model the compressed sync produced (the trunk; at r = 60 it is the stored *full* arm);
  clean_r = the model a dense sync would have produced instead (at r = 60 it is the stored *recipe*, bit for bit).
clean_r is the recipe stopped at round r: rand-k for rounds 1 to r - 1, a dense sync at round r. For unc the two
coincide. Scoring runs in eval mode under no_grad on batches drawn from their own generators, so it does not change
the trajectory; the round-60 scores on the standard 16 and fresh 64 batches are checked against the stored runs.

Arms, H = 64 (60 syncs), size-2 setup of scale.py (full training text), seeds 0 to 7: unc; rk4 (rand-k keep 1/4,
omega 3) every round. Per round: loss on 16 training batches (draw seed 2424, 32 x 64 characters each) and on the
first 16 fresh validation batches (seed 777), for unc's model and for rk4's clean_r and full_r; the round's mean inner
loss (the workers' own training loss during the round); ||theta||^2; the squared norm of the mean delta.
Usage: python3 trace_6ag.py run | report   (run appends to trace_6ag.jsonl; report scores H6ag-i to vi from LOG.md)."""
import itertools, json, os, sys, time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
M, B, STEPS, LR, DIM, HEADS, H = 4, 16, 3840, 2e-3, 192, 6, 64
R = STEPS // H
PATH = os.path.join(HERE, "trace_6ag.jsonl")
KEEP = {"unc": 1.0, "rk4": 0.25}
SEEDS = range(8)
JOBS = [(n, s) for s in SEEDS for n in ("unc", "rk4")]  # paired order: a partial file still pairs
TRAIN_SEED = 2424  # 6af's training-loss draw seed, fixed before any run


def run(job):
    import torch, copy
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
    d = DiLoCo(model, lambda m, rng: m(*data.batch("train", B, rng)), workers=M, H=H, inner=inner, outer=outer, seed=seed,
               compress=comp)
    g = torch.Generator().manual_seed(TRAIN_SEED)
    sets = {"train": [data.batch("train", 32, g) for _ in range(16)], "fresh": data.val_batches(32, 16, seed=777)}
    final = {"std": data.val_batches(32, 16), "fresh64": data.val_batches(32, 64, seed=777)}
    shadow = copy.deepcopy(model)  # holds clean_r

    def score(m, bs):
        m.eval()
        with torch.no_grad():
            v = [m(x, y).item() for x, y in bs]
        m.train()
        x = sum(v) / len(v)
        return x if x == x else float("inf")

    trace = []
    d._prev = [p.data.clone() for p in model.parameters()]  # round 1's common start
    for r in range(1, R + 1):
        inner_loss = d.round()
        row = {"r": r, "inner": inner_loss}
        with torch.no_grad():
            # clean_r: what a dense sync would have produced this round, computed as DiLoCo's dense branch does
            # (avg over workers, grad = p_prev - avg, SGD lr 1: p_prev - grad). p_prev = full_r + compressed grad is
            # not stored, so rebuild it from the workers' common start: every worker loaded the pre-round global model.
            prev = d._prev
            for i, (sp, wp) in enumerate(zip(shadow.parameters(), zip(*[w.parameters() for w in d.workers]))):
                avg = torch.stack(list(wp)).mean(0)
                sp.data.copy_(prev[i] - (prev[i] - avg))
            dn = sum((prev[i] - sp.data).pow(2).sum().item() for i, sp in enumerate(shadow.parameters()))
        row["delta2"] = dn
        row["theta2_full"] = sum(p.pow(2).sum().item() for p in model.parameters())
        row["theta2_clean"] = sum(p.pow(2).sum().item() for p in shadow.parameters())
        for k, bs in sets.items():
            row[f"clean_{k}"] = score(shadow, bs)
            row[f"full_{k}"] = score(model, bs) if comp is not None else row[f"clean_{k}"]
        trace.append(row)
        d._prev = [p.data.clone() for p in model.parameters()]  # the next round's common start
    out = {"noise": name, "H": H, "seed": seed, "trace": trace}
    for k, bs in final.items():
        out[f"clean_{k}"] = score(shadow, bs)
        out[f"full_{k}"] = score(model, bs)
    out.update(torch=torch.__version__, secs=round(time.time() - t0))
    return out


def mse(x):
    mu = sum(x) / len(x)
    return mu, ((sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5 if len(x) > 1 else float("nan"))


def signflip_p(x):
    obs = abs(sum(x))
    pats = list(itertools.product((1, -1), repeat=len(x)))
    return sum(abs(sum(s * v for s, v in zip(p, x))) >= obs - 1e-15 for p in pats) / len(pats)


def pearson(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    den = (sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b)) ** .5
    return num / den if den else float("nan")


def stored():
    """Round-60 scores of the same runs from earlier milestones: {(arm, seed): {field: value}}."""
    out = {}
    for f in ("tuned_6y.jsonl", "recipe_6z.jsonl", "recipe_6ae.jsonl"):
        for r in map(json.loads, open(os.path.join(HERE, f))):
            if r.get("H") != 64: continue
            if f == "tuned_6y.jsonl" and r.get("arm") == "unc":
                out[("unc", r["seed"])] = {"clean_std": r["std"], "clean_fresh64": r["fresh"]}
            elif r.get("noise") == "unc":
                out[("unc", r["seed"])] = {"clean_std": r["clean_std"], "clean_fresh64": r["clean_fresh"]}
            elif r.get("noise") == "rk4":
                out[("rk4", r["seed"])] = {"clean_std": r["clean_std"], "clean_fresh64": r["clean_fresh"],
                                           "full_std": r["full_std"], "full_fresh64": r["full_fresh"]}
    return out


def equiv_round(curve, target):
    """First (fractional, linear interpolation) round at which a seed-mean loss curve reaches `target`; None if never."""
    for i, v in enumerate(curve):
        if v <= target:
            if i == 0: return 1.0
            a = curve[i - 1]
            return i + (a - target) / (a - v)  # rounds are 1-indexed: curve[i] is round i + 1
    return None


def report():
    recs = {(r["noise"], r["seed"]): r for r in map(json.loads, open(PATH))}
    ss = [s for s in SEEDS if ("unc", s) in recs and ("rk4", s) in recs]
    print(f"paired seeds: {ss}; torch {sorted({r['torch'] for r in recs.values()})}; mean secs {sum(r['secs'] for r in recs.values()) / len(recs):.0f}")
    st = stored(); checks = []
    for (n, s), r in sorted(recs.items()):
        for k, v in st.get((n, s), {}).items():
            checks.append((n, s, k, r[k] == v, r[k] - v))
    bad = [c for c in checks if not c[3]]
    print(f"round-60 reproduction: {len(checks) - len(bad)} of {len(checks)} bit-exact" + (f"; mismatches {bad}" if bad else ""))
    u = lambda s: recs[("unc", s)]["trace"]; g = lambda s: recs[("rk4", s)]["trace"]
    T = {k: [[g(s)[i][f"clean_{k}"] - u(s)[i][f"clean_{k}"] for s in ss] for i in range(R)] for k in ("train", "fresh")}
    Tf = {k: [[g(s)[i][f"full_{k}"] - u(s)[i][f"clean_{k}"] for s in ss] for i in range(R)] for k in ("train", "fresh")}
    I = [[g(s)[i]["inner"] - u(s)[i]["inner"] for s in ss] for i in range(R)]
    print("\nper round (seed mean (se)): T = recipe stopped at r - unc; Tfull = trunk - unc; inner = rk4 - unc mean inner loss; unc losses")
    for i in range(R):
        if (i + 1) % 4 and i + 1 not in (1, 2, 3, R): continue
        tt, tf, tff, ii = mse(T["train"][i]), mse(T["fresh"][i]), mse(Tf["train"][i]), mse(I[i])
        ut = mse([u(s)[i]["clean_train"] for s in ss])[0]; uf = mse([u(s)[i]["clean_fresh"] for s in ss])[0]
        d2 = mse([g(s)[i]["delta2"] / u(s)[i]["delta2"] for s in ss])[0]
        print(f"  r={i + 1:2d}: T train {tt[0]:+.4f} ({tt[1]:.4f}) fresh {tf[0]:+.4f} ({tf[1]:.4f}) | Tfull train {tff[0]:+.4f}"
              f" | inner {ii[0]:+.4f} ({ii[1]:.4f}) | unc train {ut:.4f} fresh {uf:.4f} | delta2 rk4/unc {d2:.3f}")
    win = lambda X, a, b: mse([sum(X[i][j] for i in range(a - 1, b)) / (b - a + 1) for j in range(len(ss))])
    ucurve = {k: [mse([u(s)[i][f"clean_{k}"] for s in ss])[0] for i in range(R)] for k in ("train", "fresh")}
    rcurve = {k: [mse([g(s)[i][f"clean_{k}"] for s in ss])[0] for i in range(R)] for k in ("train", "fresh")}
    Tm = [mse(T["train"][i])[0] for i in range(R)]
    onset = next((i + 1 for i in range(R) if all(v < 0 for v in Tm[i:])), None)
    saved = {k: R - equiv_round(rcurve[k], ucurve[k][-1]) if equiv_round(rcurve[k], ucurve[k][-1]) else None for k in ucurve}
    print(f"\nonset: first round from which the seed-mean T(train) stays below zero through r = {R}: {onset}")
    print("rounds saved (unc's round-60 seed-mean loss, reached by the recipe-stopped-at-r curve at round x; saved = 60 - x): "
          + ", ".join(f"{k} {v:.1f}" if v is not None else f"{k} n/a" for k, v in saved.items()))
    print("theta2 at r = 15/30/45/60, unc vs rk4 clean: " + "; ".join(
        f"{r}: {mse([u(s)[r - 1]['theta2_clean'] for s in ss])[0]:.0f} vs {mse([g(s)[r - 1]['theta2_clean'] for s in ss])[0]:.0f}" for r in (15, 30, 45, 60)))
    if len(ss) < 8:
        print(f"\nincomplete ({len(ss)} of 8 seeds paired): no verdicts")
        return
    z = lambda m: m[0] / m[1]
    print(f"\nH6ag-i   (round-60 scores reproduce the stored runs bit-exactly): {'held' if not bad and checks else 'refuted'} ({len(checks) - len(bad)} of {len(checks)})")
    e = win(T["train"], 1, 15)
    print(f"H6ag-ii  (no early gain: T(train) over rounds 1 to 15 not below zero by > 2 se): {'held' if z(e) >= -2 else 'refuted'} ({e[0]:+.4f} ({e[1]:.4f}), {z(e):+.1f} se)")
    l = win(T["train"], 46, 59)
    print(f"H6ag-iii (late gain: T(train) over rounds 46 to 59 below zero by > 2 se): {'held' if z(l) < -2 else 'refuted'} ({l[0]:+.4f} ({l[1]:.4f}), {z(l):+.1f} se)")
    print(f"H6ag-iv  (onset in the second half, r* > 30): {'held' if onset and onset > 30 else 'refuted'} (r* {onset})")
    rr = pearson([mse(T['train'][i])[0] for i in range(15, R)], [mse(T['fresh'][i])[0] for i in range(15, R)])
    print(f"H6ag-v   (seed-mean T(train) and T(fresh) traces correlate over rounds 16 to 60, r > 0.7): {'held' if rr > 0.7 else 'refuted'} (r {rr:+.2f})")
    il = win(I, 46, 60)
    print(f"H6ag-vi  (workers' inner loss lower in the rk4 trunk over rounds 46 to 60 by > 2 se): {'held' if z(il) < -2 else 'refuted'} ({il[0]:+.4f} ({il[1]:.4f}), {z(il):+.1f} se)")
    sv = saved["fresh"]
    print(f"H6ag-vii (the recipe reaches unc's round-60 fresh loss at least 4 rounds early): {'held' if sv is not None and sv >= 4 else 'refuted'} ({sv})")


if __name__ == "__main__":
    if sys.argv[1] == "report": report(); sys.exit()
    have = {(r["noise"], r["seed"]) for r in map(json.loads, open(PATH))} if os.path.exists(PATH) else set()
    with Pool(4) as p, open(PATH, "a") as f:
        for r in p.imap_unordered(run, [j for j in JOBS if j not in have]):
            f.write(json.dumps(r) + "\n"); f.flush(); print({k: v for k, v in r.items() if k != "trace"}, flush=True)
