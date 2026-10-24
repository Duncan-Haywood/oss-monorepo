"""Stances per 4x8 sheet lying flat on a table for a standing G1 with a nailer, from the reach grid in reach.json.

Pure NumPy after `reach.py`. Deterministic. Prints results.txt and writes results.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT / "buildbot-custom" / "src"), str(HERE.parent / "src")]
from buildbot_flatsheet import model as M  # noqa: E402

T_FIRE = 0.1                         # trigger-and-seat per nail (s), as buildbot-nailseq
SPEEDS = [(0.5, 2.0), (4.0, 10.0)]   # tip speed (m/s) and acceleration (m/s2), as buildbot-nailseq
T_STANCE = [2.0, 5.0, 10.0, 20.0, 40.0]   # time to re-stance (s); 2 s is a mobile base, no G1 figure found, swept
OFFS = [0.2, 0.3]                    # hand height above the sheet (m): the nailer's length in the hands, not measured, swept
TABLES = [round(0.1 * k, 1) for k in range(2, 12)]   # table-top heights tried (m)
STANDOFFS = [0.15, 0.25]             # feet centre to table edge (m): a foot is ~0.1 m long, the rest is clearance, swept
HAND = 372.0                          # buildbot-taskbook's hand estimate (s); not a time study


def main():
    d = M.load(HERE / "reach.json")
    xs, dys = d["xs"], d["dys"]
    pts = M.nails()
    out = {"menagerie_commit": d["menagerie_commit"], "tool_kg": d["tool_kg"], "cases": [], "time": []}
    ag, tot = M.mirror_agreement(d, 50.0, 0.6)
    out["mirror"] = [ag, tot]
    print(f"buildbot-flatsheet: G1 with a {d['tool_kg']} kg nailer, Menagerie {d['menagerie_commit'][:12]}; "
          f"the sheet's {len(pts)} nails, 4x8 ft flat on a table, pushed straight down")
    print(f"A. Left/right mirror check at 50 N, mu 0.6, all heights: {ag}/{tot} cells agree")
    print()
    print("B. Reachable hand points (#) at hand height 1.0 m, push 50 N, mu 0.6 (reach x down, sideways dy across)")
    ok = M.reachable(d, 1.0, 50.0, 0.6)
    print("   x \\ dy " + "".join(f"{dy:>5.1f}" for dy in dys))
    for x in xs:
        print(f"   {x:>5.1f}  " + "".join(f"{'#' if (round(x, 6), round(dy, 6)) in ok else '.':>5}" for dy in dys))
    print()
    print("C. Held cells (of %d) by hand height and push, mu 0.6" % (len(xs) * len(dys)))
    print("   hand z (m)  " + "".join(f"{n:>9.0f} N" for n in d["needs"]))
    for z in d["zs"]:
        print(f"   {z:>9.1f}   " + "".join(f"{len(M.reachable(d, z, n, 0.6)):>11}" for n in d["needs"]))
    print()
    print("D. Stances to cover the 62 nails (greedy, four sides of the table), by table height; push 50 N, mu 0.6; (all-four-corners rule / generous rule)")
    print("   offset  standoff  " + "  ".join(f"H={h:.1f}" for h in TABLES))
    for off in OFFS:
        for s in STANDOFFS:
            row = []
            for h in TABLES:
                z = round(h + off, 6)
                if z > d["zs"][-1] + 1e-9:
                    row.append((None, None, None, None))
                    continue
                ok = M.reachable(d, z, 50.0, 0.6)
                st, cov, _ = M.plan(ok, xs, dys, pts, s)
                st2, cov2, _ = M.plan(ok, xs, dys, pts, s, rule="nearest")
                row.append((len(st), cov, len(st2), cov2))
                out["cases"].append({"off": off, "standoff": s, "table": h, "need": 50.0, "mu": 0.6,
                                     "stances": len(st), "covered": cov, "generous_stances": len(st2),
                                     "generous_covered": cov2})
            print(f"   {off:>6.1f}  {s:>8.2f}  " + "  ".join(
                f"{'-':>5}" if r[0] is None else f"{r[0]:>2}/{r[2]:<2}" + ("" if r[1] == 62 else "*") for r in row))
    print("   (* not every nail reachable under the conservative rule; table heights with a hand height above the grid are '-')")
    print()
    print("E. Push to seat a nail, best table height (fewest stances, 62 covered), off 0.2 m, standoff 0.25 m")
    out["push"] = []
    for need in d["needs"]:
        best = None
        for h in TABLES:
            z = round(h + 0.2, 6)
            if z > d["zs"][-1] + 1e-9:
                continue
            ok = M.reachable(d, z, need, 0.6)
            st, cov, _ = M.plan(ok, xs, dys, pts, 0.25)
            key = (-cov, len(st))
            if best is None or key < best[0]:
                best = (key, h, len(st), cov)
        out["push"].append({"need": need, "table": best[1], "stances": best[2], "covered": best[3]})
        print(f"   {need:>4.0f} N: table {best[1]:.1f} m -> {best[3]} nails in {best[2]} stances")
    print()
    # F. time at the best case against the wall (13 stances) and the hand
    cases = [c for c in out["cases"] if c["off"] == 0.2 and c["standoff"] == 0.25 and c["covered"] == 62]
    out["time"] = []
    if cases:
        c = min(cases, key=lambda c: (c["stances"], c["table"]))
        ok = M.reachable(d, round(c["table"] + 0.2, 6), 50.0, 0.6)
        st, cov, _ = M.plan(ok, xs, dys, pts, 0.25)
        print(f"F. Whole sheet on a table {c['table']:.1f} m high (off 0.2 m, standoff 0.25 m, 50 N): {cov} nails in {len(st)} stances; seconds per sheet")
        for v, a in SPEEDS:
            row = [M.sheet_time(pts, st, v, a, T_FIRE, t) for t in T_STANCE]
            base = M.sheet_time(pts, st, v, a, T_FIRE, 0.0)
            be = (HAND - base) / (len(st) - 1) if len(st) > 1 else None
            out["time"].append({"table": c["table"], "stances": len(st), "v": v, "a": a, "by_t_stance": dict(zip(map(str, T_STANCE), row)),
                                "nailing_s": base, "break_even_vs_hand_s": be})
            print(f"   {v:>4.1f}, {a:>4.1f} m/s, m/s2: " + "  ".join(f"{t:>4.0f} s: {r:>6.1f}" for t, r in zip(T_STANCE, row))
                  + f"   hand {HAND:.0f} s" + (f"; equal to hand at {be:.1f} s per re-stance" if be else ""))
    Path(HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
