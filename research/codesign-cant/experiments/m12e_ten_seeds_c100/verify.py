"""Milestone 12e reproduction checks, re-read from results.json with NaN-aware equality (writes checks.txt).

run.py's in-run response check compared fresh records with `!=`, which counts any record holding a NaN (an episode that never
settles) as a mismatch, since a computed NaN never equals the stored one (12c: 27 such records); this script re-checks
the stored results, treating NaN as equal to NaN, and reports how many records hold a NaN. Stdlib only. Run from this directory.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))


def same(a, b):
    if isinstance(a, float) and isinstance(b, float) and math.isnan(a) and math.isnan(b):
        return True
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return a == b


def has_nan(r):
    return any(isinstance(v, list) and any(isinstance(x, float) and math.isnan(x) for x in v) for v in r.values())


def main():
    n = json.load(open(os.path.join(HERE, "results.json")))
    o = json.load(open(os.path.join(HERE, "..", "m7ac_ceil125", "results.json")))
    L = [__doc__.split("\n\n")[0], ""]
    for c in n["checks"]:
        L.append(f"in-run check {'ok  ' if c['ok'] else 'FAIL'} {c['what']}: got {c['got']}, want {c['want']}")
    sets = set(n["ceils"])
    sref = {(r["set"], r["geom"], r["seed"], r["law_name"]): r for r in o["runs"] if r["set"] in sets}
    stress = [r for r in n["runs"] if r["seed"] < 6]
    sbad = sum(not all(same(r[k], sref[(r["set"], r["geom"], r["seed"], r["law_name"])][k])
                       for k in r if k.startswith(("dead_", "J_"))) for r in stress)
    rref = {(r["set"], r["geom"], r["seed"], r["law_name"], r["test"]): r for r in o["resp"] if r["set"] in sets}
    resp = [r for r in n["resp"] if r["seed"] < 6]
    rbad = sum(not same(r, rref[(r["set"], r["geom"], r["seed"], r["law_name"], r["test"])]) for r in resp)
    L.append("")
    L.append(f"NaN-aware: stress records of seeds 0-5 differing from 7ac's in a dead_ or J_ field: {sbad} of {len(stress)}")
    L.append(f"NaN-aware: response records of seeds 0-5 differing from 7ac's in any field: {rbad} of {len(resp)}")
    L.append(f"response records of seeds 0-5 holding a NaN (unsettled episodes): {sum(map(has_nan, resp))}")
    ok = sbad == 0 and rbad == 0 and all(c["ok"] for c in n["checks"][:2])
    L.append(f"ME0 {'held' if ok else 'FAILED'}")
    open(os.path.join(HERE, "checks.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
