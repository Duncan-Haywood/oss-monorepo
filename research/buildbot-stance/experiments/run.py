"""Stances per 4x8 sheet for a standing G1 with a nailer, from the reach grid in reach.json.

Pure NumPy after `reach.py`. Deterministic. Prints results.txt and writes results.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT / "buildbot-custom" / "src"), str(HERE.parent / "src")]
from buildbot_custom import model as C  # noqa: E402
from buildbot_stance import model as M  # noqa: E402

T_FIRE = 0.1                         # trigger-and-seat per nail (s), as buildbot-nailseq
SPEEDS = [(0.5, 2.0), (4.0, 10.0)]   # tip speed (m/s) and acceleration (m/s2), as buildbot-nailseq
T_STANCE = [5.0, 10.0, 20.0, 40.0]   # time to re-stance (s); no figure found for the G1, swept
HEIGHTS = [round(0.1 * k, 1) for k in range(0, 15)]   # platform heights the robot may stand at (m)


def grid(d, x, need, mu):
    return M.reachable(d, x, need, mu)


def show(ok, d, title):
    print(title)
    print("   z \\ dy " + "".join(f"{dy:>5.1f}" for dy in d["dys"]))
    for z in reversed(d["zs"]):
        print(f"   {z:>5.1f}  " + "".join(f"{'#' if (round(dy, 6), round(z, 6)) in ok else '.':>5}" for dy in d["dys"]))


def main():
    d = M.load(HERE / "reach.json")
    dys, zs = d["dys"], d["zs"]
    pts = M.nails()
    out = {"menagerie_commit": d["menagerie_commit"], "tool_kg": d["tool_kg"], "cases": {}, "time": []}
    ag, tot = M.mirror_agreement(d, 0.4, 50.0, 0.6)
    out["mirror"] = [ag, tot]
    print(f"buildbot-stance: G1 with a {d['tool_kg']} kg nailer, Menagerie {d['menagerie_commit'][:12]}; "
          f"the sheet's {len(pts)} nails, 4x8 ft standing on end (lower edge at the floor unless stated)")
    print(f"A. Left/right mirror check at x 0.4 m, 50 N, mu 0.6: {ag}/{tot} cells agree")
    print()
    for need in d["needs"]:
        for mu in d["mus"]:
            if need == 0 and mu != d["mus"][0]:
                continue
            for x in d["xs"]:
                ok = grid(d, x, need, mu)
                if x == 0.4 and mu == 0.6:
                    show(ok, d, f"B. reachable tool points (#) at reach 0.4 m, push {need:.0f} N, mu {mu}: {len(ok)} of {len(dys) * len(zs)} cells")
                    print()
                # best single floor stance
                best = max(((len(M.stance_cover(ok, dys, zs, pts, y, 0.0)), y)
                            for y in [round(0.05 * k, 2) for k in range(-8, 33)]), default=(0, 0))
                st, cov, left = M.plan(ok, dys, zs, pts)
                hs = M.plan(ok, dys, zs, pts, heights=HEIGHTS)
                key = f"x{x}-need{need:.0f}-mu{mu}"
                out["cases"][key] = {"cells": len(ok), "best_single": best[0], "best_single_y": best[1],
                                     "floor_stances": len(st), "floor_covered": cov,
                                     "floor_left": [list(pts[i]) for i in left],
                                     "platform_stances": len(hs[0]), "platform_covered": hs[1],
                                     "platform_heights": sorted({s[1] for s in hs[0]})}
    print("C. Floor only (platform height 0): nails one stance covers at best, stances to cover all that can be covered, nails no floor stance reaches")
    print("   reach x  push N   mu   cells   best stance   stances   covered   never reached")
    for key, c in out["cases"].items():
        x, n, m = key[1:].split("-")
        print(f"   {x:>6}  {n[4:]:>6}  {m[2:]:>4}  {c['cells']:>5}  {c['best_single']:>11}  {c['floor_stances']:>8}  {c['floor_covered']:>8}  {62 - c['floor_covered']:>13}")
    print()
    print("D. With a platform of any height 0 to 1.4 m in 0.1 m steps: stances to cover all 62 nails (greedy), and the heights it uses")
    print("   reach x  push N   mu   covered   stances   heights (m)")
    for key, c in out["cases"].items():
        x, n, m = key[1:].split("-")
        print(f"   {x:>6}  {n[4:]:>6}  {m[2:]:>4}  {c['platform_covered']:>7}  {c['platform_stances']:>8}   {c['platform_heights']}")
    print()
    print("D2. The same at 50 N, mu 0.6 with the generous grid rule (only the nearest grid point must be reachable) instead of all four corners")
    print("   reach x   floor: best stance / stances / covered     platform: covered / stances")
    out["generous"] = {}
    for x in d["xs"]:
        ok = grid(d, x, 50.0, 0.6)
        best = max(len(M.stance_cover(ok, dys, zs, pts, y, 0.0, "nearest")) for y in [round(0.05 * k, 2) for k in range(-8, 33)])
        st, cov, _ = M.plan(ok, dys, zs, pts, rule="nearest")
        hs = M.plan(ok, dys, zs, pts, heights=HEIGHTS, rule="nearest")
        out["generous"][str(x)] = {"best_single": best, "floor_stances": len(st), "floor_covered": cov,
                                   "platform_covered": hs[1], "platform_stances": len(hs[0])}
        print(f"   {x:>6}   {best:>20} / {len(st):>2} / {cov:>2}          {hs[1]:>14} / {len(hs[0]):>2}")
    print()
    # F. a whole sheet with platforms, against the hand and gantry times of buildbot-custom
    ok = grid(d, 0.3, 50.0, 0.6)
    pl, pc, _ = M.plan(ok, dys, zs, pts, heights=HEIGHTS)
    HAND, GANTRY = 372.0, 61.0           # buildbot-taskbook's estimate; buildbot-custom's 1 m/s, 3 m/s2, 0.5 s per nail gantry
    print(f"F. Whole sheet at reach 0.3 m, 50 N, mu 0.6: {pc} nails in {len(pl)} stances at {len(set(s[1] for s in pl))} platform heights; the nails alone take:")
    out["whole"] = []
    for v, a in SPEEDS:
        row = [M.sheet_time(pts, pl, v, a, T_FIRE, t) for t in T_STANCE]
        be = (HAND - M.sheet_time(pts, pl, v, a, T_FIRE, 0.0)) / (len(pl) - 1)
        out["whole"].append({"v": v, "a": a, "by_t_stance": dict(zip(map(str, T_STANCE), row)), "break_even_vs_hand_s": be})
        print(f"   {v:>4.1f}, {a:>4.1f} m/s, m/s2: " + "  ".join(f"{t:>4.0f} s: {r:>6.1f}" for t, r in zip(T_STANCE, row)) + f"   hand {HAND:.0f} s, gantry {GANTRY:.0f} s; equal to hand at {be:.1f} s per re-stance")
    print()
    # E. time per sheet for the most useful case with 50 N, mu 0.6, x 0.4 (as buildbot-fasten) on the floor-reachable nails
    ok = grid(d, 0.4, 50.0, 0.6)
    st, cov, left = M.plan(ok, dys, zs, pts)
    reach_idx = set(range(len(pts))) - set(left)
    ref = [(pts[i][0], pts[i][1], 0.0, "y", "joint") for i in sorted(reach_idx)]
    print(f"E. Time per sheet for the {cov} nails a G1 can reach from the floor at 0.4 m, 50 N, mu 0.6, in {len(st)} stance(s)")
    print("   speed (m/s, m/s2)   gantry-like single stance   then + re-stance time:  " + "  ".join(f"{t:>4.0f} s" for t in T_STANCE))
    for v, a in SPEEDS:
        one = C.sheet_cycle(ref, v, a, T_FIRE, home=(ref[0][0], ref[0][1]))[0]
        row = [M.sheet_time(pts, st, v, a, T_FIRE, t) for t in T_STANCE]
        out["time"].append({"v": v, "a": a, "single": one, "by_t_stance": dict(zip(map(str, T_STANCE), row))})
        print(f"   {v:>4.1f}, {a:>4.1f}      {one:>14.1f} s            " + "  ".join(f"{t:>6.1f}" for t in row))
    Path(HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
