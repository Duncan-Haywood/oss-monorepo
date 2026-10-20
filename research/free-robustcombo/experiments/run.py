"""Power of two-level robust paired statistics under Student-t(2) cells, bad runs, both at once, and Gaussian noise. Writes results.txt/json."""
import json, sys, time
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import robust as R

NS = (50, 100, 200)
TWINS = {"Coulomb -10%": dict(visc=0.1, coul=0.27), "Coulomb -20%": dict(visc=0.1, coul=0.24)}
SEEDS = {"student2": 21, "badruns": 22, "both": 23, "gauss": 24}
REPS, NULL = 400, 400
exact = dict(visc=0.1, coul=0.3)
out, lines = {}, []
t0 = time.time()
for kind, seed in SEEDS.items():
    rng = np.random.default_rng(seed)
    for n in NS:
        null = [R.replicate(rng, n, exact, kind) for _ in range(NULL)]
        thr = {s: R.threshold([v[s] for v in null]) for s in R.STATS}
        fresh = [R.replicate(rng, n, exact, kind) for _ in range(REPS)]
        for s in R.STATS:
            p, lo, hi = R.power([v[s] for v in fresh], thr[s])
            out[f"{kind}|exact|{n}|{s}"] = [p, lo, hi]
            lines.append(f"{kind:8s} exact twin     n={n:4d} {s:12s} reject {p:.3f} [{lo:.3f},{hi:.3f}]")
        for name, tw in TWINS.items():
            alt = [R.replicate(rng, n, tw, kind) for _ in range(REPS)]
            for s in R.STATS:
                p, lo, hi = R.power([v[s] for v in alt], thr[s])
                out[f"{kind}|{name}|{n}|{s}"] = [p, lo, hi]
                lines.append(f"{kind:8s} {name:13s} n={n:4d} {s:12s} power  {p:.3f} [{lo:.3f},{hi:.3f}]")
        print(kind, n, round(time.time() - t0), "s", flush=True)
d = Path(__file__).parent
(d / "results.txt").write_text(f"null replicates {NULL}, test replicates {REPS}, alpha 0.05, seeds {SEEDS}\n" + "\n".join(lines) + "\n")
(d / "results.json").write_text(json.dumps(out, indent=1))
