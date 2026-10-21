"""Push-force and placement-accuracy budgets of a stock G1 / H1 nailing a sheathing sheet.

Writes results.json and prints results.txt. Deterministic (no random draws). Several minutes on one CPU.
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parents[0] / "src")]
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_fasten import model as F  # noqa: E402

TOOL_KG = 3.4                      # Metabo HPT NR90AES1, 7.5 lb (maker's listing)
REACH = [0.3, 0.4, 0.5, 0.6]
HEIGHT = {"g1": [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6], "h1": [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2]}
MUS = [0.3, 0.6]                   # rubber on concrete spans about this range; swept, not chosen
NEED = [20, 50, 100]               # push needed to seat the tool (N); no maker figure found, swept
DEG = math.pi / 180


def fmt(v):
    return "-" if v is None else f"{v:.0f}"


def main():
    for n in fetch.ROBOTS:
        fetch.model_path(n)
    robots = {n: P.load(n) for n in fetch.ROBOTS}
    d0 = {n: P.standing(r) for n, r in robots.items()}
    nails = F.schedule()
    out = {"menagerie_commit": fetch.COMMIT, "tool_kg": TOOL_KG, "nails": len(nails), "push": {}, "tip": {}, "coverage": {}}
    by = {}
    for nl in nails:
        by.setdefault((nl.cls, nl.axis, round(nl.half * 1000, 2)), 0)
        by[(nl.cls, nl.axis, round(nl.half * 1000, 2))] += 1
    print(f"buildbot-fasten: one 4x8 sheet = {len(nails)} nails; tool {TOOL_KG} kg; Menagerie {fetch.COMMIT[:12]}")
    print("A. Nail windows (half-width = how far the nail centre may stray from the window centre)")
    for (cls, axis, hw), k in sorted(by.items()):
        print(f"   {cls:13s} {k:3d} nails, +-{hw:.2f} mm in {axis}")
    for target in (0.5, 0.9, 0.95, 0.99):
        s = F.required_sigma(nails, target)
        print(f"   whole sheet inside its windows with probability {target}: tip sigma <= {s * 1000:.2f} mm (equal y and z)")
    out["sigma_mm"] = {str(t): F.required_sigma(nails, t) * 1000 for t in (0.5, 0.9, 0.95, 0.99)}
    # the same sheet if every vertical-member nail had the whole stud face (no edge-distance band): what binds?
    relaxed = [F.Nail(x.y, x.z, x.cls, x.axis, 17.39e-3 if x.cls == "joint" else x.half) for x in nails]
    out["sigma_mm_no_edge_band"] = F.required_sigma(relaxed, 0.95) * 1000
    print(f"   the same without the 3/8 in edge distance on the joint nails (each +-17.4 mm): 95% needs {out['sigma_mm_no_edge_band']:.2f} mm")
    out["curve"] = [{"sigma_mm": s_, "all": F.sheet_success(nails, s_ / 1000, s_ / 1000),
                     "no_edge_band": F.sheet_success(relaxed, s_ / 1000, s_ / 1000)}
                    for s_ in [0.25 * k for k in range(1, 41)]]
    print()
    for n in ("g1", "h1"):
        r = robots[n]
        # B. push envelope
        for mu in MUS:
            rows = []
            for z in HEIGHT[n]:
                for x in REACH:
                    f, why = F.push_limit(r, d0[n], (x, z), TOOL_KG, mu)
                    rows.append({"z": z, "x": x, "N": f, "limit": why})
            out["push"][f"{n}-mu{mu}"] = rows
            print(f"B. {n} mu={mu}: largest horizontal push (N) by tool height (rows, m) and reach (cols, m); '-' infeasible")
            print("   z \\ x " + "".join(f"{x:>7.1f}" for x in REACH))
            for z in HEIGHT[n]:
                print(f"   {z:>5.1f} " + "".join(f"{fmt(c['N']):>7}" for c in rows if c["z"] == z))
            lim = {}
            for c in rows:
                if c["N"] is not None:
                    lim[c["limit"]] = lim.get(c["limit"], 0) + 1
            print("   binding limit (cells): " + ", ".join(f"{k} {v}" for k, v in sorted(lim.items(), key=lambda t: -t[1])))
            print()
        # C. tip sensitivity (no push; tool pose)
        rows = []
        for z in HEIGHT[n]:
            for x in REACH:
                tip, p = F.tip_jacobian(r, d0[n], (x, z), TOOL_KG)
                if tip is None:
                    rows.append({"z": z, "x": x, "ok": False})
                    continue
                sy, sz = F.tip_sigma(tip, DEG)          # mm per degree of independent joint error
                lo, hi = 1e-6, 0.2
                for _ in range(50):
                    mid = (lo + hi) / 2
                    if F.sheet_success(nails, sy * mid / DEG, sz * mid / DEG) >= 0.95:
                        lo = mid
                    else:
                        hi = mid
                rows.append({"z": z, "x": x, "ok": True, "mm_per_deg_y": sy * 1000, "mm_per_deg_z": sz * 1000,
                             "joint_deg_for_95": lo / DEG})
        out["tip"][n] = rows
        print(f"C. {n}: tip scatter in the wall plane per degree (1 sigma) of independent error on every joint (mm, y/z), and the joint sigma (deg) for a 95% sheet")
        print("   z \\ x " + "".join(f"{x:>22.1f}" for x in REACH))
        for z in HEIGHT[n]:
            cells = []
            for c in rows:
                if c["z"] != z:
                    continue
                cells.append("                     -" if not c["ok"] else f"{c['mm_per_deg_y']:>7.1f}/{c['mm_per_deg_z']:<6.1f} {c['joint_deg_for_95']:>6.3f}")
            print(f"   {z:>5.1f} " + "".join(f"{c:>22}" for c in cells))
        print()
        # E. quantisation of every joint sensor (step 360/2^bits, error step/sqrt(12)) at the stud-height pose
        tip, _ = F.tip_jacobian(r, d0[n], (0.4, 1.0), TOOL_KG)
        out.setdefault("bits", {})[n] = []
        for bits in (10, 11, 12, 13, 14, 16):
            sq = 2 * math.pi / 2 ** bits / math.sqrt(12)
            sy, sz = F.tip_sigma(tip, sq)
            pr = F.sheet_success(nails, sy, sz)
            out["bits"][n].append({"bits": bits, "sigma_y_mm": sy * 1000, "sigma_z_mm": sz * 1000, "sheet": pr})
            print(f"E. {n} at (x 0.4, z 1.0) m: {bits}-bit joint sensors: tip sigma {sy * 1000:.2f}/{sz * 1000:.2f} mm (y/z), whole sheet inside its windows {pr:.3f}")
        print()
        # D. which nails of a sheet can one stance reach, for a needed push
        for mu in MUS:
            rows = out["push"][f"{n}-mu{mu}"]
            for need in NEED:
                ok_z = sorted({c["z"] for c in rows if c["N"] is not None and c["N"] >= need})
                reach = sum(1 for nl in nails if any(abs(nl.z - zz) <= 0.1 for zz in ok_z))
                out["coverage"][f"{n}-mu{mu}-need{need}"] = {"heights": ok_z, "nails": reach}
                span = f"{min(ok_z):.1f}-{max(ok_z):.1f} m" if ok_z else "none"
                print(f"D. {n} mu={mu} needs {need} N: tool heights {span}; {reach}/{len(nails)} nails of a sheet within 0.1 m of one")
    Path(HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
