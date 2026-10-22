"""buildbot-mjsheet: run buildbot-skills' 13 policies on plant B (numpy) and on the same worlds in MuJoCo. A few minutes on 4 CPUs."""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src")]
from buildbot_mjsheet import mjplant as P  # noqa: E402
from buildbot_skills import model as M  # noqa: E402

N = 200
SKILLS = HERE.parent.parent / "buildbot-skills" / "experiments" / "results.json"


def world_slice(w, i):
    return {k: v[i:i + 1] for k, v in w.items()}


def both(args):
    w, pol, i = args
    np.seterr(all="ignore")
    a = M.simulate(world_slice(w, i), pol, "B")
    c = P.episode(w, pol, i)
    return {"np_tilt": float(a["peak_tilt_deg"][0]), "np_end": float(a["end_tilt_deg"][0]), "np_kg": float(a["person_kg_peak"][0]),
            "np_pass": bool(M.success(a)[0]), "np_ok": bool(a["ok"][0]),
            "mj_tilt": c["peak_tilt_deg"], "mj_end": c["end_tilt_deg"], "mj_kg": c["person_kg_peak"],
            "mj_pass": bool(M.success({k: np.array([v]) for k, v in c.items()})[0]), "mj_ok": c["ok"]}


def main():
    rows = json.loads(SKILLS.read_text())["rows"]
    w = M.draw_world(np.random.default_rng(777), N, "B")
    out = {"n": N, "policies": []}
    print("# buildbot-mjsheet: %d plant-B worlds (seed 777), numpy plant B vs MuJoCo, same controller code" % N)
    print("policy | seed | K B Ki | pass numpy | pass MuJoCo | pass-label agreement | unstable numpy | unstable MuJoCo | median |tilt diff| deg (both stable) | max rel tilt diff")
    with ProcessPoolExecutor(4) as ex:
        for r in rows:
            pol = {k: r[k] for k in ("K", "B", "Ki")}
            res = list(ex.map(both, [(w, pol, i) for i in range(N)], chunksize=10))
            g = lambda k: np.array([x[k] for x in res])
            stable = g("np_ok") & g("mj_ok")
            d = np.abs(g("np_tilt") - g("mj_tilt"))[stable]
            rel = (d / np.maximum(g("np_tilt")[stable], 0.05)) if stable.any() else np.zeros(1)
            rec = {"policy": r["policy"], "seed": r["seed"], **pol, "pass_numpy": float(g("np_pass").mean()), "pass_mujoco": float(g("mj_pass").mean()),
                   "label_agreement": float((g("np_pass") == g("mj_pass")).mean()), "unstable_numpy": float((~g("np_ok")).mean()),
                   "unstable_mujoco": float((~g("mj_ok")).mean()), "n_both_stable": int(stable.sum()),
                   "median_abs_tilt_diff_deg": float(np.median(d)) if stable.any() else None,
                   "max_rel_tilt_diff": float(rel.max()) if stable.any() else None,
                   "median_kg_diff": float(np.median(np.abs(g("np_kg") - g("mj_kg"))[stable])) if stable.any() else None}
            out["policies"].append(rec)
            print("%s | %s | %g %g %g | %.3f | %.3f | %.3f | %.3f | %.3f | %s | %s" % (
                rec["policy"], rec["seed"], pol["K"], pol["B"], pol["Ki"], rec["pass_numpy"], rec["pass_mujoco"], rec["label_agreement"],
                rec["unstable_numpy"], rec["unstable_mujoco"],
                "%.4f" % rec["median_abs_tilt_diff_deg"] if stable.any() else "-", "%.3f" % rec["max_rel_tilt_diff"] if stable.any() else "-"), flush=True)
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
