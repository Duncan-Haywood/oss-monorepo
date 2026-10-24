"""Sheet time of a G1 on a drive-and-lift base, on the buildbot-stance reach grid. Deterministic, a few seconds.

Prints results.txt and writes results.json. Needs ../buildbot-stance/experiments/reach.json (from reach.py there).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
for p in ("buildbot-custom", "buildbot-stance", "buildbot-mobilebase"):
    sys.path.insert(0, str(ROOT / p / "src"))
from buildbot_stance import model as S  # noqa: E402
from buildbot_mobilebase import model as M  # noqa: E402

T_FIRE = 0.1
SPEEDS = [(0.5, 2.0), (4.0, 10.0)]          # tip speed and acceleration, as buildbot-nailseq
V_DRIVE = [0.2, 0.5, 1.0]                   # base drive speed along the wall (m/s), swept
V_LIFT = [0.05, 0.1, 0.2, 0.5]              # platform lift speed (m/s), swept
SETTLE = [0.0, 2.0]                         # stop, level and steady after each move (s), swept
HEIGHTS = [round(0.1 * k, 1) for k in range(15)]
HAND, GANTRY = 372.0, 61.0                  # buildbot-taskbook estimate, buildbot-custom gantry


def main():
    d = S.load(ROOT / "buildbot-stance" / "experiments" / "reach.json")
    dys, zs = d["dys"], d["zs"]
    pts = S.nails()
    ok = S.reachable(d, 0.3, 50.0, 0.6)
    stances, covered, _ = S.plan(ok, dys, zs, pts, heights=HEIGHTS)
    n = len(stances)
    ys = [s[0] for s in stances]
    hs = [s[1] for s in stances]
    out = {"stances": [[s[0], s[1], sorted(s[2])] for s in stances], "covered": covered, "rows": []}
    print(f"buildbot-mobilebase: the {covered} nails in {n} stances (reach 0.3 m, 50 N, mu 0.6, buildbot-stance grid)")
    print(f"A. Stances (y along the wall m, standing height m, nails): " + "; ".join(f"({y:.2f}, {h:.1f}, {len(i)})" for y, h, i in stances))
    print(f"   wall span {min(ys):.2f} to {max(ys):.2f} m, heights {min(hs):.1f} to {max(hs):.1f} m")
    print()
    print("B. Re-stance time of the best visiting order (s), drive and lift in parallel / one after the other")
    print("   drive m/s  lift m/s  settle s   parallel   in turn")
    for vd in V_DRIVE:
        for vl in V_LIFT:
            for st in SETTLE:
                _, mp, _ = M.sheet_time(pts, stances, 4.0, 10.0, T_FIRE, vd, vl, st, True)
                _, ms, _ = M.sheet_time(pts, stances, 4.0, 10.0, T_FIRE, vd, vl, st, False)
                out["rows"].append({"v_drive": vd, "v_lift": vl, "settle": st, "parallel": mp, "serial": ms})
                print(f"   {vd:>8.1f}  {vl:>8.2f}  {st:>8.1f}  {mp:>9.1f}  {ms:>8.1f}")
    print()
    print("C. Whole sheet (s) = nailing + re-stancing, drive and lift in parallel, settle 2 s; hand 372 s, gantry 61 s")
    out["whole"] = []
    for v, a in SPEEDS:
        nail = M.nailing_time(pts, stances, v, a, T_FIRE)
        print(f"   tip {v:g} m/s, {a:g} m/s2: nailing and tip moves {nail:.1f} s")
        print("      drive m/s \\ lift m/s " + "".join(f"{vl:>8.2f}" for vl in V_LIFT))
        for vd in V_DRIVE:
            row = [M.sheet_time(pts, stances, v, a, T_FIRE, vd, vl, 2.0, True)[0] for vl in V_LIFT]
            out["whole"].append({"v": v, "a": a, "nailing": nail, "v_drive": vd, "by_v_lift": dict(zip(map(str, V_LIFT), row))})
            print(f"      {vd:>20.1f} " + "".join(f"{t:>8.1f}" for t in row))
    print()
    print("D. Break-even: the mean seconds per re-stance at which the sheet equals the gantry (61 s) and the hand (372 s)")
    out["breakeven"] = []
    for v, a in SPEEDS:
        nail = M.nailing_time(pts, stances, v, a, T_FIRE)
        be_g = (GANTRY - nail) / (n - 1)
        be_h = (HAND - nail) / (n - 1)
        out["breakeven"].append({"v": v, "a": a, "gantry_s": be_g, "hand_s": be_h})
        print(f"   tip {v:g} m/s: gantry {be_g:.2f} s per re-stance, hand {be_h:.1f} s per re-stance ({n - 1} re-stances)")
    walk = {str(t): M.nailing_time(pts, stances, 4.0, 10.0, T_FIRE) + (n - 1) * t for t in (5.0, 20.0)}
    out["walking"] = walk
    print(f"   a walking G1 at 5 s / 20 s per re-stance, tip 4 m/s: {walk['5.0']:.1f} s / {walk['20.0']:.1f} s")
    Path(HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
