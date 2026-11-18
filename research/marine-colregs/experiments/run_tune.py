"""Tune the sampling-MPC cost weights: CMA-ES against uniform random search at the same budget.

Train on encounters with offsets +-50 m (sigma_v 0.3 m/s, 1 seed), test on the held-out offsets
-100/0/+100 m (sigma_v 0, 0.3, 0.6; 3 seeds when noisy). Weights are searched in log10 space, [-3, 3].
Loss = 1 - share(safe and compliant) + 0.5 * mean detour / 1000 m. Budget per run: 90 evaluations.
"""
import sys, math, random, statistics as st
from multiprocessing import Pool
sys.path.insert(0, "src")
import cma
import marine_colregs.core as C

W0 = C.MPC_W
OFFS = (-100.0, -50.0, 0.0, 50.0, 100.0)
_lib = C.encounter_library()          # built offset-major: equal blocks per offset
_per = len(_lib) // len(OFFS)
ALL = [dict(e, off=OFFS[i // _per]) for i, e in enumerate(_lib)]
TRAIN = [e for e in ALL if abs(e["off"]) == 50.0]
TEST = [e for e in ALL if abs(e["off"]) != 50.0]
SIGMA_TRAIN, BUDGET, POP = 0.3, 90, 6


def _one(args):
    w, e, sg, sd = args
    C.MPC_W = tuple(w)
    return C.run(e, "mpc", sg, sd)


def score(rs):
    n = len(rs)
    return dict(both=sum(r["safe"] and r["compliant"] for r in rs) / n, safe=sum(r["safe"] for r in rs) / n,
                comp=sum(r["compliant"] for r in rs) / n, detour=st.mean(r["detour"] for r in rs))


def loss_of(rs):
    s = score(rs)
    return 1 - s["both"] + 0.5 * s["detour"] / 1000.0


def evaluate(pool, theta, enc, sg, seeds):
    w = [10 ** t for t in theta]
    return pool.map(_one, [(w, e, sg, sd) for e in enc for sd in seeds], chunksize=4)


def fitness(pool, theta):
    return loss_of(evaluate(pool, theta, TRAIN, SIGMA_TRAIN, [0]))


def run_cma(pool, seed):
    es = cma.CMAEvolutionStrategy([math.log10(x) for x in W0], 0.8,
                                  dict(seed=seed, popsize=POP, bounds=[-3, 3], verbose=-9))
    n, best = 0, (1e9, None)
    while n < BUDGET:
        xs = es.ask(); fs = [fitness(pool, x) for x in xs]; n += len(xs)
        es.tell(xs, fs)
        for x, f in zip(xs, fs):
            if f < best[0]: best = (f, list(x))
    return best


def run_random(pool, seed):
    rng = random.Random(seed); best = (1e9, None)
    for _ in range(BUDGET):
        x = [rng.uniform(-3, 3) for _ in range(3)]; f = fitness(pool, x)
        if f < best[0]: best = (f, x)
    return best


if __name__ == "__main__":
    print(f"train {len(TRAIN)} encounters (offsets +-50), test {len(TEST)} (offsets -100/0/+100); budget {BUDGET} evals per run, "
          f"3 runs per method; default weights {W0}")
    with Pool(4) as pool:
        cfgs = {"default": [math.log10(x) for x in W0]}
        for sd in (1, 2, 3):
            f, x = run_cma(pool, sd); cfgs[f"cma{sd}"] = x; print(f"cma seed {sd}: train loss {f:.4f} w={[round(10**t,3) for t in x]}", flush=True)
        for sd in (1, 2, 3):
            f, x = run_random(pool, sd); cfgs[f"rand{sd}"] = x; print(f"random seed {sd}: train loss {f:.4f} w={[round(10**t,3) for t in x]}", flush=True)
        print("\n== held-out test (offsets -100/0/+100 m)")
        print(f"{'config':9}{'sigma':>6}{'safe %':>8}{'compl %':>9}{'both %':>8}{'detour m':>10}{'loss':>8}")
        agg = {}
        for name, x in cfgs.items():
            for sg in (0.0, 0.3, 0.6):
                rs = evaluate(pool, x, TEST, sg, range(3) if sg else [0])
                s = score(rs); l = loss_of(rs); agg[(name, sg)] = l
                print(f"{name:9}{sg:6.1f}{100*s['safe']:8.1f}{100*s['comp']:9.1f}{100*s['both']:8.1f}{s['detour']:10.1f}{l:8.4f}", flush=True)
        print("\n== mean test loss over sigma {0,0.3,0.6}")
        for name in cfgs:
            print(f"{name:9}{st.mean(agg[(name, sg)] for sg in (0.0,0.3,0.6)):8.4f}")
        for m in ("cma", "rand"):
            v = [st.mean(agg[(f'{m}{i}', sg)] for sg in (0.0, 0.3, 0.6)) for i in (1, 2, 3)]
            print(f"{m}: mean {st.mean(v):.4f} min {min(v):.4f} max {max(v):.4f}")
