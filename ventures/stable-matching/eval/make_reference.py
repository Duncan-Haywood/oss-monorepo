"""Produce eval/reference.json: random hospitals/residents instances solved by
the Python `matching` package (Wilde, Knight & Gillard 2020, MIT licence),
both resident-optimal and hospital-optimal. Used only as a reference for the
tests; none of its code is in engine.mjs.

    python3 -m venv venv && venv/bin/pip install matching==1.4.3
    venv/bin/python eval/make_reference.py > eval/reference.json
"""
import json
import random
import sys
from importlib.metadata import version

from matching.games import HospitalResident


def instance(rng, n_res, n_hos, max_cap, p_drop):
    res = {f"r{i}": [] for i in range(n_res)}
    hos = {f"h{j}": [] for j in range(n_hos)}
    for r in res:
        res[r] = [h for h in rng.sample(list(hos), n_hos) if rng.random() > p_drop]
    for h in hos:
        hos[h] = [r for r in rng.sample(list(res), n_res) if rng.random() > p_drop]
    # The package expects consistent lists: keep a pair only if both list it.
    res = {r: [h for h in l if r in hos[h]] for r, l in res.items()}
    hos = {h: [r for r in l if h in res[r]] for h, l in hos.items()}
    cap = {h: rng.randint(1, max_cap) for h in hos}
    return res, hos, cap


def solve(res, hos, cap, optimal):
    # The package rejects players with empty lists. Nobody lists them (lists
    # are mutual), so leaving them out changes no one else's answer; they
    # are recorded as unmatched.
    r2 = {r: l for r, l in res.items() if l}
    h2 = {h: l for h, l in hos.items() if l}
    out = {r: None for r in res}
    if not r2:
        return out
    game = HospitalResident.create_from_dictionaries(r2, h2, {h: cap[h] for h in h2})
    m = game.solve(optimal=optimal)
    assert game.check_stability() and game.check_validity()
    for h, rs in m.items():
        for r in rs:
            out[r.name] = h.name
    return out


def main():
    rng = random.Random(20261117)
    cases = []
    for k in range(250):
        n_res = rng.randint(1, 30)
        n_hos = rng.randint(1, 12)
        res, hos, cap = instance(rng, n_res, n_hos, 1 if k % 2 else 4, 0.0 if k % 3 == 0 else 0.35)
        cases.append({
            "residents": res, "hospitals": hos, "capacity": cap,
            "resident_optimal": solve(res, hos, cap, "resident"),
            "hospital_optimal": solve(res, hos, cap, "hospital"),
        })
    json.dump({"tool": f"matching {version('matching')}", "seed": 20261117, "cases": cases}, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
