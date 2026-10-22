"""buildbot-skillpack: train a cohold-follow skill on a mix of plants A and B, publish it as a skill file with two baselines
and a nailing skill, reload every file from disk and re-score it, including on MuJoCo plant C. Several minutes on 4 CPUs."""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path[:0] = [str(HERE.parent / "src")] + [str(ROOT / d / "src") for d in ("buildbot-skills", "buildbot-fasten", "buildbot-studfind", "buildbot-mjsheet")]
from buildbot_skills import model as M  # noqa: E402
from buildbot_skills.train import sample_policies, score_candidates  # noqa: E402
from buildbot_skillpack import evalpack, pack  # noqa: E402

SEEDS = (1, 2, 3, 4)
CRIT = {"tilt_peak_deg": 3.0, "tilt_end_deg": 0.5}
SCENE = {"test_seed": 2024, "n_episodes": 1000, "plants": ["A", "B"], "lift_m": M.LIFT, "sheet_kg": [6.0, 23.0], "lift_s": [1.0, 4.0]}
N_CAND, N_TRAIN, N_VAL = 300, 120, 400
MJ_N = 200      # plant C episodes (a Python loop over MuJoCo steps)
CAVEATS = ["Simulated; not a rated capability, not a safety case. A robot holding a sheet beside a person is a falling-object and crush hazard (ISO 10218, ISO/TS 15066).",
           "Delay, actuator lag and sheet stiffness ranges are swept, not sourced; nothing was run on a robot.",
           "One 0.3 m lift of a 4x8 sheet in a plane; no walking, grip slip or reacting person."]


def train_mixed(seed):
    """Random search where a candidate's score is its worse pass rate over a randomised A set and a randomised B set; seed picked by a validation set."""
    rng = np.random.default_rng(seed)
    K, B, Ki = sample_policies(rng, N_CAND)
    wa, wb = M.draw_world(rng, N_TRAIN, "A"), M.draw_world(rng, N_TRAIN, "B")
    sa, ta = score_candidates(K, B, Ki, wa, "A", **CRIT)
    sb, tb = score_candidates(K, B, Ki, wb, "B", **CRIT)
    score = np.minimum(sa, sb)
    best = int(np.lexsort((ta + tb, -score))[0])
    pol = {"K": float(K[best]), "B": float(B[best]), "Ki": float(Ki[best])}
    vr = np.random.default_rng(10_000 + seed)
    v = {k: M.simulate(M.draw_world(vr, N_VAL, k), pol, k) for k in ("A", "B")}
    val = {k: float(M.success(r, **CRIT).mean()) for k, r in v.items()}
    return {"seed": seed, **pol, "train_min": float(score[best]), "val": val}


def follow_skill(name, params, note, claimed_from=None):
    return {"schema": pack.SCHEMA, "name": name, "kind": "cohold-follow", "version": "1.0.0", "licence": "MIT",
            "interface": {"observes": ["robot hand height, hand velocity (m, m/s; late by the plant's delay)", "reference height: the person's end after a lag (m)", "sheet mass estimate (kg)"],
                          "commands": ["hand force (N), x and z: Fx = K (L - x) - B vx; Fz = 0.5 m g + K (ref - z) - B vz + Ki integral(ref - z)"]},
            "params": params, "scene": SCENE, "criteria": {**CRIT, "person_peak": "NIOSH load constant 23.1 kg-equivalent"},
            "claimed": {}, "note": note, "caveats": CAVEATS}


def main():
    np.seterr(all="ignore")
    with ProcessPoolExecutor(len(SEEDS)) as ex:
        runs = list(ex.map(train_mixed, SEEDS))
    best = max(runs, key=lambda r: min(r["val"].values()))
    print("# buildbot-skillpack: mixed-plant training, 4 seeds; the seed is picked on a validation set (not the test set)")
    for r in runs:
        print("seed %d | K %.0f B %.0f Ki %.0f | train min %.3f | val A %.3f B %.3f" % (r["seed"], r["K"], r["B"], r["Ki"], r["train_min"], r["val"]["A"], r["val"]["B"]))
    print("picked seed %d" % best["seed"])

    # baselines from buildbot-skills' results.json: the cohold hand-set gains, and the A-random and B-random skills of the best validation seed
    old = json.loads((HERE.parent.parent / "buildbot-skills" / "experiments" / "results.json").read_text())["rows"]
    def old_row(policy, seed):
        return next(r for r in old if r["policy"] == policy and r["seed"] == seed)
    skills = {
        "cohold-follow-mixed": follow_skill("cohold-follow-mixed", {k: best[k] for k in ("K", "B", "Ki")},
                                            "Random search on randomised plants A and B together; score = the worse of the two pass rates."),
        "cohold-follow-nominal": follow_skill("cohold-follow-nominal", {"K": 1000.0, "B": 150.0, "Ki": 0.0}, "buildbot-cohold's hand-set impedance gains."),
    }
    a = max((r for r in old if r["policy"] == "A_random"), key=lambda r: r["test"]["A"]["success"])
    b = max((r for r in old if r["policy"] == "B_random"), key=lambda r: r["test"]["B"]["success"])
    skills["cohold-follow-A"] = follow_skill("cohold-follow-A", {k: a[k] for k in ("K", "B", "Ki")}, "buildbot-skills' best A_random seed (seed %d): trained on randomised plant A only." % a["seed"])
    skills["cohold-follow-B"] = follow_skill("cohold-follow-B", {k: b[k] for k in ("K", "B", "Ki")}, "buildbot-skills' best B_random seed (seed %d): trained on the plant it is tested on." % b["seed"])
    skills["sheathing-nail"] = {
        "schema": pack.SCHEMA, "name": "sheathing-nail", "kind": "sheathing-nail", "version": "1.0.0", "licence": "MIT",
        "interface": {"observes": ["stud positions along the sheet (mm), one read per stud"], "commands": ["62-nail sheathing schedule of buildbot-fasten: nail targets at the stud-face centre line, tool tip placed to the commanded point"]},
        "params": {"s_read_mm": 0.89, "s_tool_mm": 0.9}, "scene": {"sheet": "4x8 on end, studs 16 in o.c., 1.5 in stud face, 0.131 in nails, 3/8 in edge distance", "nails": 62},
        "criteria": {"all_nails_in_window": True}, "claimed": {},
        "note": "A tolerance budget, not a controller: the reading scatter and tool-tip scatter a nailing robot must meet for 95% of sheets to have all 62 nails inside their windows (buildbot-studfind).",
        "caveats": ["Simulated Gaussian error budget; not a rated accuracy.", "No Unitree repeatability figure was found; the 0.9 mm tool scatter is buildbot-studfind's assumed robot term.", "Nailing near people needs a risk assessment (ISO 10218, ISO/TS 15066)."]}

    out_dir = HERE.parent / "skills"
    out = {"seeds": runs, "picked_seed": best["seed"], "files": {}, "rescored": {}}
    for name, s in skills.items():
        if s["kind"] == "cohold-follow":
            got = evalpack.rescore_follow(s, ("A", "B"))
            s["claimed"] = {k: {"success": v["success"], "n": v["n"]} for k, v in got.items()}
        else:
            s["claimed"] = {"sheet_success": evalpack.rescore_nail(s)["sheet_success"]}
        pack.save(s, out_dir / (name + ".json"))
        out["files"][name] = str((out_dir / (name + ".json")).relative_to(HERE.parent))
    # reload from disk (not the in-memory dicts) and score again, adding MuJoCo plant C for the follow skills
    print("\n# reloaded from skills/*.json: pass rate on %d episodes (A, B numpy) and the first %d plant-B worlds in MuJoCo (C)" % (SCENE["n_episodes"], MJ_N))
    print("skill | K B Ki | A | B | C (MuJoCo) | claimed matches")
    loaded = pack.load_all(out_dir)
    jobs = [(n, s) for n, s in loaded.items() if s["kind"] == "cohold-follow"]
    with ProcessPoolExecutor(4) as ex:
        res = list(ex.map(_rescore_with_c, [s for _, s in jobs]))
    for (n, s), got in zip(jobs, res):
        bad = evalpack.compare(s, {k: got[k] for k in ("A", "B")})
        out["rescored"][n] = {**got, "claimed_matches": not bad}
        p = s["params"]
        print("%s | %.0f %.0f %.0f | %.3f | %.3f | %.3f | %s" % (n, p["K"], p["B"], p["Ki"], got["A"]["success"], got["B"]["success"], got["C"]["success"], "yes" if not bad else bad))
    nail = loaded["sheathing-nail"]
    g = evalpack.rescore_nail(nail)
    out["rescored"]["sheathing-nail"] = {**g, "claimed_matches": not evalpack.compare(nail, g)}
    print("sheathing-nail | read %.2f mm, tool %.2f mm | sheet success %.4f (claimed %.4f)" % (nail["params"]["s_read_mm"], nail["params"]["s_tool_mm"], g["sheet_success"], nail["claimed"]["sheet_success"]))
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


def _rescore_with_c(skill):
    np.seterr(all="ignore")
    return evalpack.rescore_follow(skill, ("A", "B", "C"), mujoco_limit=MJ_N)


if __name__ == "__main__":
    main()
