"""Lint the 522 osrobot-lab mutants (as osrobot-labreal's generated scripts) and compare with the twin and the recorded simulator result.

    PYTHONPATH=src:../osrobot-lab/src:../osrobot-labreal/src python3 experiments/run.py     # a few seconds; writes results.txt, per_fault.tsv
The real simulator is not re-run: its per-fault counts are read from ../osrobot-labreal/experiments/per_fault.tsv.
"""
import collections, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "osrobot-lab" / "src"), str(HERE.parents[1] / "osrobot-labreal" / "src"), str(HERE.parents[1] / "osrobot-lab" / "experiments")]
from osrobot_lab.model import check
from osrobot_lab.protocols import PROTOCOLS
from osrobot_labreal.translate import script
from osrobot_lint import lint
import run as lab   # osrobot-lab/experiments/run.py: faults()

OUT = []


def say(s=""):
    print(s); OUT.append(s)


def issues(src):
    return [f for f in lint(src) if f.code != "SKIPPED"]


def main():
    real = {l.split("\t")[0]: int(l.split("\t")[3]) for l in (HERE.parents[1] / "osrobot-labreal/experiments/per_fault.tsv").read_text().splitlines()[1:]}
    clean = [(p, issues(script(*PROTOCOLS[p]()[:2], PROTOCOLS[p]()[2]))) for p in PROTOCOLS]
    skipped = sum(f.code == "SKIPPED" for p in PROTOCOLS for f in lint(script(*PROTOCOLS[p]()[:2], PROTOCOLS[p]()[2])))
    say(f"Clean reference protocols with any lint finding: {sum(bool(f) for _, f in clean)} of {len(clean)}; statements skipped as unanalysable: {skipped}")
    say()
    say(f"{'fault':34s} {'mutants':>7s} {'twin':>5s} {'lint':>5s} {'real':>5s} {'lint=twin':>10s} {'codes (lint)'}")
    agg = collections.OrderedDict()
    codes = collections.defaultdict(collections.Counter)
    tot = [0, 0, 0, 0]
    for pname, f in PROTOCOLS.items():
        deck, init, cmds = f()
        for fname, (code, muts) in lab.faults(cmds).items():
            a = agg.setdefault(fname, [0, 0, 0, 0])
            for m in muts:
                tw = bool(check(deck, m, init).findings)
                fs = issues(script(deck, init, m, True))
                a[0] += 1; a[1] += tw; a[2] += bool(fs); a[3] += tw == bool(fs)
                for c in {x.code for x in fs}:
                    codes[fname][c] += 1
    for fname, a in agg.items():
        say(f"{fname:34s} {a[0]:7d} {a[1]:5d} {a[2]:5d} {real[fname]:5d} {a[3]:10d}  " + ", ".join(f"{k} x{v}" for k, v in codes[fname].most_common()))
        tot = [t + v for t, v in zip(tot, a)]
    say(f"{'total':34s} {tot[0]:7d} {tot[1]:5d} {tot[2]:5d} {sum(real.values()):5d} {tot[3]:10d}")
    (HERE / "results.txt").write_text("\n".join(OUT) + "\n")
    (HERE / "per_fault.tsv").write_text("fault\tmutants\ttwin\tlint\treal\n" + "".join(f"{k}\t{a[0]}\t{a[1]}\t{a[2]}\t{real[k]}\n" for k, a in agg.items()))


if __name__ == "__main__":
    main()
