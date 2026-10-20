"""Fault injection on three reference protocols, and Monte Carlo of a serial dilution.

    PYTHONPATH=src python3 experiments/run.py      # writes experiments/results.txt
"""
import copy, random, statistics
from pathlib import Path
from osrobot_lab.model import check, structural
from osrobot_lab.protocols import PROTOCOLS, serial_dilution

HERE = Path(__file__).resolve().parent
OUT = []


def say(s=""):
    print(s); OUT.append(s)


def idx(cmds, op):
    return [i for i, c in enumerate(cmds) if c["op"] == op]


def _reuse(cmds, i):
    m = copy.deepcopy(cmds); first = cmds[idx(cmds, "pick_up_tip")[0]]
    m[i]["well"] = first["well"]; m[i]["labware"] = first["labware"]
    return m


def _skip_swap(cmds, i):
    """Delete the drop_tip at i and the pick_up_tip that follows it."""
    nxt = [j for j in idx(cmds, "pick_up_tip") if j > i]
    if not nxt:
        return None
    m = copy.deepcopy(cmds)
    del m[nxt[0]]; del m[i]
    return m


def faults(cmds):
    """name -> (expected code, list of mutated command lists). Every eligible site is mutated."""
    def per(op, fn):
        out = []
        for i in idx(cmds, op):
            r = fn(copy.deepcopy(cmds), i)
            if r is not None:
                out.append(r)
        return out

    def setk(k, v):
        def f(m, i):
            m[i][k] = v
            return m
        return f
    last = idx(cmds, "drop_tip")[-1]
    return {
        "typo labware": ("UNKNOWN_LABWARE", per("aspirate", setk("labware", "pltae"))),
        "well off plate": ("UNKNOWN_WELL", per("dispense", setk("well", "A13"))),
        "drop pick_up_tip": ("NO_TIP", per("pick_up_tip", lambda m, i: m[:i] + m[i + 1:])),
        "second pick_up_tip": ("TIP_PRESENT", per("pick_up_tip", lambda m, i: m[:i + 1] + [m[i]] + m[i + 1:])),
        "reuse a used tip": ("TIP_USED", [_reuse(cmds, i) for i in idx(cmds, "pick_up_tip")[1:]]),
        "drop the last drop_tip": ("TIP_LEFT", [cmds[:last] + cmds[last + 1:]]),
        "volume 350 uL": ("VOL_RANGE", per("aspirate", setk("vol", 350.0))),
        "volume 5 uL": ("VOL_RANGE", per("dispense", setk("vol", 5.0))),
        "overdraw source (5000 uL)": ("SOURCE_EMPTY", per("aspirate", setk("vol", 5000.0))),
        "skip tip change between samples": ("CROSS_CONTAM", [m for m in (_skip_swap(cmds, i) for i in idx(cmds, "drop_tip")[:-1]) if m]),
        "low travel (30 mm)": ("COLLISION", per("pick_up_tip", setk("travel_z", 30.0)) + per("aspirate", setk("travel_z", 30.0)) + per("dispense", setk("travel_z", 30.0))),
    }


def table():
    say("Fault injection: every eligible site mutated once; a mutant is detected if the checker reports any finding.")
    say("'expected' counts mutants whose findings include the code the fault was written to trigger.")
    say()
    clean = 0
    for f in PROTOCOLS.values():
        deck, init, cmds = f()
        clean += bool(check(deck, cmds, init).findings or structural(deck, cmds))
    say(f"clean protocols with any finding (twin or structural): {clean} of {len(PROTOCOLS)}")
    say()
    say(f"{'fault':34s} {'mutants':>7s} {'twin any':>9s} {'expected':>9s} {'structural':>11s}")
    agg = {}
    for f in PROTOCOLS.values():
        deck, init, cmds = f()
        for fname, (code, muts) in faults(cmds).items():
            a = agg.setdefault(fname, [0, 0, 0, 0, code])
            for m in muts:
                r = check(deck, m, init)
                a[0] += 1; a[1] += bool(r.findings); a[2] += code in r.codes(); a[3] += bool(structural(deck, m))
    tot = [0, 0, 0, 0]
    for fname, (n, any_, exp, st, code) in agg.items():
        say(f"{fname:34s} {n:7d} {any_:9d} {exp:9d} {st:11d}")
        tot = [t + v for t, v in zip(tot, (n, any_, exp, st))]
    say(f"{'total':34s} {tot[0]:7d} {tot[1]:9d} {tot[2]:9d} {tot[3]:11d}")
    say()
    for fname, (n, any_, exp, st, code) in agg.items():
        if exp < n:
            say(f"not flagged with {code}: {n - exp} of the {n} '{fname}' mutants")


def collisions():
    say()
    say("Low-travel (30 mm tip height) mutants by protocol: a collision needs the straight path to cross taller labware.")
    for pname, f in PROTOCOLS.items():
        deck, init, cmds = f()
        muts = faults(cmds)["low travel (30 mm)"][1]
        hit = sum("COLLISION" in check(deck, m, init).codes() for m in muts)
        say(f"  {pname:18s} mutants {len(muts):3d}  collisions {hit:3d}")


def travel_sweep():
    say()
    say("master_mix: collisions when every move uses one travel height z (mm); labware tops: plate 14.5, reservoir 44, tip rack 64, tube rack 85.")
    deck, init, cmds = PROTOCOLS["master_mix"]()
    for z in (10, 20, 50, 70, 90, 100):
        m = [dict(c, travel_z=float(z)) if c["op"] != "drop_tip" else c for c in cmds]
        r = check(deck, m, init)
        n = sum(f.code == "COLLISION" for f in r.findings)
        say(f"  z = {z:3d} mm: {n:2d} colliding moves")


def timing():
    say()
    say("Twin time estimate and tips for the clean protocols (all timing constants assumed):")
    for pname, f in PROTOCOLS.items():
        deck, init, cmds = f()
        r = check(deck, cmds, init)
        say(f"  {pname:18s} {len(cmds):3d} commands  {r.tips_used:3d} tips  {r.time / 60:6.1f} min")


def dilution(runs=4000):
    say()
    say(f"Serial 2-fold dilution over 12 wells, {runs} Monte Carlo runs per volume (assumed pipetting error CV = 1% + 0.8/v).")
    say("Final well A12 concentration relative to the nominal 0.5^11 (stock = 1). Verdict: no nominal finding and CV at most 10%.")
    say(f"{'vx (uL)':>8s} {'nominal findings':>17s} {'mean ratio':>11s} {'CV':>7s} {'5-95% range':>14s} {'verdict':>8s}")
    for vx in (10.0, 20.0, 30.0, 50.0, 100.0):
        deck, init, cmds = serial_dilution(vx)
        nom = check(deck, cmds, init)
        codes = ",".join(sorted(nom.codes())) or "none"
        ref = 0.5 ** 11
        vals = sorted(check(deck, cmds, init, rng=random.Random(s)).wells[("plate", "A12")].conc / ref for s in range(runs))
        cv = statistics.pstdev(vals) / statistics.fmean(vals)
        verdict = "PASS" if (not nom.findings and cv <= 0.10) else "FAIL"
        say(f"{vx:8.0f} {codes:>17s} {statistics.fmean(vals):11.3f} {cv:7.3f} {vals[int(.05 * runs)]:6.2f}-{vals[int(.95 * runs)]:5.2f} {verdict:>8s}")


if __name__ == "__main__":
    table(); collisions(); travel_sweep(); timing(); dilution()
    (HERE / "results.txt").write_text("\n".join(OUT) + "\n")
