"""buildbot-skills: train the sheet-following skill on plant A, test it on a held-out plant B. Several minutes on a few CPUs."""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src")]
from buildbot_skills import model as M  # noqa: E402
from buildbot_skills.train import train  # noqa: E402

SEEDS = (1, 2, 3, 4)
NOMINAL = {"K": 1000.0, "B": 150.0, "Ki": 0.0}        # buildbot-cohold's nominal impedance setting
N_TEST = 1000
CRIT = {"tilt_peak_deg": 3.0, "tilt_end_deg": 0.5}


def test_sets():
    rng = np.random.default_rng(2024)
    return {k: M.draw_world(rng, N_TEST, k) for k in ("A", "B")}


def evaluate(pol, worlds, **crit):
    out = {}
    for k, w in worlds.items():
        r = M.simulate(w, pol, k)
        ok = M.success(r, **crit)
        out[k] = {"success": float(ok.mean()), "mean_peak_tilt_deg": float(np.nanmean(r["peak_tilt_deg"])),
                  "mean_person_kg": float(np.nanmean(r["person_kg_peak"])), "diverged": float((~r["ok"]).mean())}
    return out


def one_seed(seed):
    return {
        "seed": seed,
        "A_nominal": train(seed, "A", False, **CRIT),
        "A_random": train(seed, "A", True, **CRIT),
        "B_random": train(seed, "B", True, **CRIT),     # reference: trained on the plant it is tested on
    }


def main():
    np.seterr(all="ignore")
    worlds = test_sets()
    out = {"criteria": CRIT, "n_test": N_TEST, "runs": []}
    with ProcessPoolExecutor(len(SEEDS)) as ex:
        trained = list(ex.map(one_seed, SEEDS))
    print("# buildbot-skills: success on %d fresh episodes per plant (peak tilt <= %.1f deg, end tilt <= %.1f deg, person <= NIOSH 23.1 kg)"
          % (N_TEST, CRIT["tilt_peak_deg"], CRIT["tilt_end_deg"]))
    print("policy | seed | K B Ki | train success | test A | test B | B diverged")
    rows = []
    base = evaluate(NOMINAL, worlds, **CRIT)
    print("cohold nominal | - | %g %g %g | - | %.3f | %.3f | %.3f" % (NOMINAL["K"], NOMINAL["B"], NOMINAL["Ki"], base["A"]["success"], base["B"]["success"], base["B"]["diverged"]))
    rows.append({"policy": "cohold_nominal", "seed": None, **NOMINAL, "test": base})
    for t in trained:
        for name in ("A_nominal", "A_random", "B_random"):
            p = t[name]
            ev = evaluate(p, worlds, **CRIT)
            print("%s | %d | %.0f %.0f %.0f | %.3f | %.3f | %.3f | %.3f" % (name, t["seed"], p["K"], p["B"], p["Ki"], p["train_success"],
                                                                         ev["A"]["success"], ev["B"]["success"], ev["B"]["diverged"]))
            rows.append({"policy": name, "seed": t["seed"], **p, "test": ev})
    out["rows"] = rows

    diag = {"A_random": max((r for r in rows if r["policy"] == "A_random"), key=lambda r: r["test"]["A"]["success"]),
            "B_random": max((r for r in rows if r["policy"] == "B_random"), key=lambda r: r["test"]["B"]["success"])}
    print("\n# Diagnostics on plant-B test episodes: A_random = best seed by A-test (no peeking at B); B_random = best seed by B-test")
    out["diagnostics"] = {}
    for name, pol in diag.items():
        w = worlds["B"]
        r = M.simulate(w, pol, "B")
        ok = M.success(r, **CRIT)
        d = {"policy": {k: pol[k] for k in ("K", "B", "Ki", "seed")}, "success_by_tilt_limit": {}}
        for lim in (1.0, 2.0, 3.0, 5.0):
            d["success_by_tilt_limit"][str(lim)] = float(M.success(r, tilt_peak_deg=lim, tilt_end_deg=0.5).mean())
        d["failure_modes"] = {"peak tilt > limit": float(np.mean(r["peak_tilt_deg"] > CRIT["tilt_peak_deg"])),
                              "end tilt > limit": float(np.mean(r["end_tilt_deg"] > CRIT["tilt_end_deg"])),
                              "person > NIOSH": float(np.mean(r["person_kg_peak"] > M.NIOSH_KG)), "diverged": float(np.mean(~r["ok"]))}
        print(name, d["policy"], d["success_by_tilt_limit"], d["failure_modes"])
        bins = {}
        for label, key, edges in (("sheet kg", "m", (6, 8, 15, 23)), ("feedback delay s", "delay", (0, 0.01, 0.02, 0.03)),
                                  ("flex stiffness N m/rad", "kflex", (150, 600, 2000, 6000)), ("lag s", "lag", (0, 0.15, 0.3, 0.5))):
            v = w[key]
            res = []
            for lo, hi in zip(edges[:-1], edges[1:]):
                sel = (v >= lo) & (v <= hi)
                res.append({"range": [lo, hi], "n": int(sel.sum()), "success": float(ok[sel].mean())})
                print("  %s %g-%g: n=%d success %.3f" % (label, lo, hi, sel.sum(), ok[sel].mean()))
            bins[label] = res
        d["bins"] = bins
        out["diagnostics"][name] = d
    json.dump(out, open(HERE / "results.json", "w"), indent=1)


if __name__ == "__main__":
    main()
