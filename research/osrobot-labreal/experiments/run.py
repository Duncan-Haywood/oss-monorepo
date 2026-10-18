"""The 522 osrobot-lab mutants through the stdlib twin and through the real Opentrons simulator.

    python3.11 -m venv .venv && .venv/bin/pip install opentrons==8.0.0 && .venv/bin/pip install -e .
    PYTHONPATH=src:../osrobot-lab/src .venv/bin/python experiments/run.py     # about 2 minutes; writes experiments/results.txt
"""
import collections, os, sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "osrobot-lab" / "src"), str(HERE.parents[1] / "osrobot-lab" / "experiments")]
os.environ.setdefault("HOME", "/tmp")
from osrobot_lab.model import check
from osrobot_lab.protocols import PROTOCOLS
from osrobot_labreal.translate import script
from osrobot_labreal.sim import simulate, classify
import run as lab   # osrobot-lab/experiments/run.py: faults()

OUT = []


def say(s=""):
    print(s); OUT.append(s)


def _sim(src):
    ok, text = simulate(src)
    return src, ok, classify(text) if not ok else ""


def probe_source():
    """Two 200 uL aspirates from a well declared to hold 300 uL (one tip capacity each): is a half-empty source tracked?"""
    from osrobot_lab.model import tiprack, plate96
    deck = [tiprack("tips", 1), plate96("plate", 2)]
    cmds = [dict(op="pick_up_tip", labware="tips", well="A1")]
    for dst in ("B1", "C1"):
        cmds += [dict(op="aspirate", labware="plate", well="A1", vol=200.0), dict(op="dispense", labware="plate", well=dst, vol=200.0)]
    cmds.append(dict(op="drop_tip"))
    return deck, {("plate", "A1"): (300.0, 1.0, "s")}, cmds


def main():
    cases = []      # (protocol, fault, expected code, twin_any, src_declared, src_undeclared)
    for pname, f in PROTOCOLS.items():
        deck, init, cmds = f()
        for fname, (code, muts) in lab.faults(cmds).items():
            for m in muts:
                cases.append((pname, fname, code, bool(check(deck, m, init).findings),
                              script(deck, init, m, True), script(deck, init, m, False)))
    clean = [(p, script(*PROTOCOLS[p]()[:2], PROTOCOLS[p]()[2])) for p in PROTOCOLS]
    srcs = sorted({c[4] for c in cases} | {c[5] for c in cases} | {s for _, s in clean})
    with Pool(4) as pool:
        res = {src: (ok, cls) for src, ok, cls in pool.map(_sim, srcs, chunksize=8)}
    say(f"{len(cases)} mutants, {len(srcs)} distinct generated scripts (mutants that differ only in travel height translate to the clean script).")
    say("Clean protocols that the real simulator rejects: %d of %d" % (sum(not res[s][0] for _, s in clean), len(clean)))
    say()
    say("Detected = the checker reports any finding (twin) or the simulator raises (real). 'real' declares the starting liquids; 'real (no liquids)' does not.")
    say(f"{'fault':34s} {'mutants':>7s} {'twin':>5s} {'real':>5s} {'both':>5s} {'twin only':>9s} {'real only':>9s} {'real (no liq.)':>14s}")
    agg = collections.OrderedDict()
    classes = collections.defaultdict(collections.Counter)
    for pname, fname, code, tw, s1, s0 in cases:
        a = agg.setdefault(fname, [0] * 6)
        r = not res[s1][0]
        a[0] += 1; a[1] += tw; a[2] += r; a[3] += tw and r; a[4] += (not tw) and r; a[5] += not res[s0][0]
        if r:
            classes[fname][res[s1][1]] += 1
    tot = [0] * 6
    for fname, a in agg.items():
        n, tw, r, both, ro, nl = a
        say(f"{fname:34s} {n:7d} {tw:5d} {r:5d} {both:5d} {tw - both:9d} {ro:9d} {nl:14d}")
        tot = [t + v for t, v in zip(tot, a)]
    n, tw, r, both, ro, nl = tot
    say(f"{'total':34s} {n:7d} {tw:5d} {r:5d} {both:5d} {tw - both:9d} {ro:9d} {nl:14d}")
    say()
    say("Exception class the real simulator raised, by fault:")
    for fname, c in classes.items():
        say(f"  {fname:34s} " + ", ".join(f"{k} x{v}" for k, v in c.most_common()))
    say()
    deck, init, cmds = probe_source()
    tw = check(deck, cmds, init)
    r1, r0 = simulate(script(deck, init, cmds, True)), simulate(script(deck, init, cmds, False))
    say("Half-empty source probe (200 uL aspirated twice from a well declared to hold 300 uL):")
    say(f"  twin codes: {sorted(tw.codes()) or 'none'}")
    say(f"  real, liquids declared: {'ok' if r1[0] else classify(r1[1])};  real, undeclared: {'ok' if r0[0] else classify(r0[1])}")
    (HERE / "results.txt").write_text("\n".join(OUT) + "\n")
    (HERE / "per_fault.tsv").write_text("fault\tmutants\ttwin\treal\n" + "".join(f"{k}\t{a[0]}\t{a[1]}\t{a[2]}\n" for k, a in agg.items()))


if __name__ == "__main__":
    main()
