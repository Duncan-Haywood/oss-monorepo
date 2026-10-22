"""Re-score a loaded skill on the scene it names and compare with the success rates it claims."""
import numpy as np

from buildbot_skills import model as M


def worlds(scene, kind):
    """The scene's test episodes for one plant. Seeds are in the skill file so that anyone can regenerate them."""
    return M.draw_world(np.random.default_rng(scene["test_seed"]), scene["n_episodes"], kind)


def rescore_follow(skill, plants=("A", "B"), mujoco_limit=None):
    """Pass rate of a cohold-follow skill per plant. Plants A and B are numpy; C is MuJoCo (needs buildbot-mjsheet and mujoco).

    Plant C is slow (a Python loop over episodes), so `mujoco_limit` runs only its first n episodes of the plant-B worlds."""
    pol, crit, scene = skill["params"], skill["criteria"], skill["scene"]
    out = {}
    for p in plants:
        if p == "C":
            from buildbot_mjsheet import mjplant as P
            w = worlds(scene, "B")
            n = mujoco_limit or scene["n_episodes"]
            r = P.run_batch(w, pol, range(n))
            out["C"] = {"n": int(n), "success": float(M.success(r, crit["tilt_peak_deg"], crit["tilt_end_deg"]).mean())}
        else:
            r = M.simulate(worlds(scene, p), pol, p)
            out[p] = {"n": int(scene["n_episodes"]), "success": float(M.success(r, crit["tilt_peak_deg"], crit["tilt_end_deg"]).mean())}
    return out


def rescore_nail(skill):
    """Sheet success of a sheathing-nail skill, from buildbot-studfind's quadrature, and the stud-read budget it implies."""
    from buildbot_studfind import model as S
    p = skill["params"]
    got = S.sheet_success_analytic(p["s_read_mm"] / 1000.0, p["s_tool_mm"] / 1000.0)
    return {"sheet_success": float(got)}


def compare(skill, got, tol=0.0):
    """List of (key, claimed, got) that differ by more than tol. The pack is deterministic, so tol 0 is the default."""
    bad = []
    for k, v in skill["claimed"].items():
        if k in got and isinstance(v, dict):
            if abs(v["success"] - got[k]["success"]) > tol:
                bad.append((k, v["success"], got[k]["success"]))
        elif k in got and isinstance(v, (int, float)) and abs(v - got[k]) > tol:
            bad.append((k, v, got[k]))
    return bad
