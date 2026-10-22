"""Train the model grid on the original Speech Commands, then compare single models with cascades.

usage: python run.py <features.npz>   (writes models.npz-free results.json and results.txt here)

Per seed: 40 models (segments 7/12 x hidden 8..128 x weight bits 2/3/4/8). Singles are those 40.
Cascades are every ordered pair (small, big) of those 40 with E_small < E_big and a threshold chosen
on VALIDATION only; test accuracy is reported, never selected on. For each validation-accuracy
target the cheapest design (single or cascade) meeting it is picked, separately for singles only
and for singles + cascades, and the two are compared on test.
"""
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-kws", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_kws import cost, mfcc, model  # noqa: E402
from accel_cascade import cascade  # noqa: E402

SEGMENTS = [7, 12]
HIDDEN = [8, 16, 32, 64, 128]
BITS = [2, 3, 4, 8]
SEEDS = [0, 1, 2, 3, 4]
EPOCHS = 40
TARGETS = [0.50, 0.55, 0.60, 0.65, 0.70, 0.72, 0.74]


def logits(m, x):
    return model.int_forward(m, model.quantise_inputs(x, m.mean, m.std))[0]


def train_all(z, seed):
    designs = []
    for seg in SEGMENTS:
        x = {s: mfcc.pool_segments(z[f"{s}_x"].astype(np.float64), seg) for s in ("train", "validation", "test")}
        for h in HIDDEN:
            for b in BITS:
                m = model.train_qat(x["train"], z["train_y"], h, b, epochs=EPOCHS, seed=seed)
                designs.append({
                    "seg": seg, "hidden": h, "bits": b, "macs": model.macs(m.inputs, h),
                    "e_nj": cost.energy_per_inference_nj(model.macs(m.inputs, h), b),
                    "lv": logits(m, x["validation"]), "lt": logits(m, x["test"]),
                })
    return designs


def acc(lg, y):
    return float((lg.argmax(1) == y).mean())


def candidates(designs, yv, yt):
    """All singles and cascades as dicts with energy and val/test accuracy."""
    out = []
    for i, d in enumerate(designs):
        out.append({"kind": "single", "i": i, "e": d["e_nj"], "val": acc(d["lv"], yv), "test": acc(d["lt"], yt)})
    for i, s in enumerate(designs):
        ths = cascade.thresholds(cascade.margin(s["lv"]))
        for j, b in enumerate(designs):
            if b["e_nj"] <= s["e_nj"]:
                continue
            for t in ths[1:-1]:  # 0 and always-escalate reduce to the small / big single
                fv, av = cascade.run(s["lv"], b["lv"], yv, t)
                out.append({"kind": "cascade", "i": i, "j": j, "t": float(t), "esc_val": fv,
                            "e": cascade.energy(s["e_nj"], b["e_nj"], fv), "val": av})
    return out


def pick(cands, target):
    ok = [c for c in cands if c["val"] >= target]
    return min(ok, key=lambda c: (c["e"], -c["val"])) if ok else None


def main(feats):
    z = np.load(feats)
    yv, yt = z["validation_y"], z["test_y"]
    t0 = time.time()
    per_seed = []
    for sd in SEEDS:
        designs = train_all(z, sd)
        cands = candidates(designs, yv, yt)
        for c in cands:  # test numbers for the chosen ones only, computed lazily below
            pass
        row = {"seed": sd, "n_cascades": sum(c["kind"] == "cascade" for c in cands),
               "designs": [{k: d[k] for k in ("seg", "hidden", "bits", "macs", "e_nj")} |
                           {"val": acc(d["lv"], yv), "test": acc(d["lt"], yt)} for d in designs],
               "targets": {}}
        for tg in TARGETS:
            res = {}
            for name, pool in (("single", [c for c in cands if c["kind"] == "single"]), ("any", cands)):
                c = pick(pool, tg)
                if c is None:
                    res[name] = None
                    continue
                if c["kind"] == "cascade":
                    s, b = designs[c["i"]], designs[c["j"]]
                    fr, a = cascade.run(s["lt"], b["lt"], yt, c["t"])
                    c = dict(c, esc_test=fr, e_test=cascade.energy(s["e_nj"], b["e_nj"], fr), test=a)
                else:
                    c = dict(c, e_test=c["e"])
                res[name] = c
            row["targets"][str(tg)] = res
        per_seed.append(row)
        print("seed", sd, f"{time.time()-t0:.0f}s", flush=True)
    json.dump({"epochs": EPOCHS, "seeds": SEEDS, "targets": TARGETS, "numpy": np.__version__,
               "data": json.load(open(feats.replace(".npz", ".json"))), "per_seed": per_seed},
              open(os.path.join(HERE, "results.json"), "w"), indent=1)
    with open(os.path.join(HERE, "results.txt"), "w") as fh:
        fh.write("target | single: energy nJ (test acc)  | best single-or-cascade: energy nJ (test acc) kind | ratio  [per seed, mean]\n")
        for tg in TARGETS:
            e1, e2, a1, a2, nc, rs, n = [], [], [], [], 0, [], 0
            for r in per_seed:
                x = r["targets"][str(tg)]
                if x["single"] is None:
                    continue
                n += 1
                e1.append(x["single"]["e_test"]); a1.append(x["single"]["test"])
                e2.append(x["any"]["e_test"]); a2.append(x["any"]["test"]); nc += x["any"]["kind"] == "cascade"
                rs.append(x["any"]["e_test"] / x["single"]["e_test"])
            if n:
                fh.write(f"{tg:.2f} | n={n}/{len(per_seed)} single {np.mean(e1):7.1f} ({np.mean(a1):.3f}) | "
                         f"any {np.mean(e2):7.1f} ({np.mean(a2):.3f}) cascade picked {nc}/{n} | "
                         f"ratio mean {np.mean(rs):.3f} min {min(rs):.3f} max {max(rs):.3f}\n")
            else:
                fh.write(f"{tg:.2f} | no design reaches the target\n")


if __name__ == "__main__":
    main(sys.argv[1])
