"""Experiments for hanger-foldsrc; writes results.txt (deterministic, seeded). About 1 min, stdlib only."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_foldsrc.foldsrc import FOLD_SOURCES, run, tables_for  # noqa: E402

out = []


def say(s=""):
    print(s)
    out.append(s)


say("== A. Dryers served by one arm and one fold table, by fold-station source (200 loads of 25, learned hang rule)")
say("source                        t_fold  p_ok  good/h  dryers  u_fold  bottleneck")
for lab, (t, p) in FOLD_SOURCES.items():
    r = run(lab, 1, 1)
    say("%-29s %6.1f %5.2f %7.1f %7.2f %7.2f  %s" % (lab, t, p, r["good"], r["dryers"], r["u_fold"], r["bottleneck"]))
say()
say("== B. Dryers served against fold tables (two arms; SpeedFolding t-shirt 116.9 s, p 0.93)")
say("tables  good/h  dryers  u_fold  bottleneck")
for k in (1, 2, 3, 4, 6, 8):
    r = run("SpeedFolding t-shirt", 2, k)
    say("%6d %7.1f %7.2f %7.2f  %s" % (k, r["good"], r["dryers"], r["u_fold"], r["bottleneck"]))
say()
say("== C. Fewest fold tables for 5 dryers (two arms)")
say("source                        tables")
for lab in FOLD_SOURCES:
    k = tables_for(lab, 2, 5.0)
    say("%-29s %s" % (lab, k if k is not None else ">40"))
say()
say("== D. Policy at the t-shirt fold time (two arms, 4 tables): does hanging more relieve the fold station?")
say("policy        good/h  dryers  hung  folded")
for pol in ("always_fold", "learned", "always_hang"):
    r = run("SpeedFolding t-shirt", 2, 4, policy=pol)
    say("%-13s %7.1f %7.2f %5.1f %7.1f" % (pol, r["good"], r["dryers"], r["hung"], r["folded"]))
say()
say("== E. Dryers served against fold tables, two arms, by source")
say("tables  towel  fling-to-fold  t-shirt  max-value")
for k in range(1, 9):
    v = [run(l, 2, k)["dryers"] for l in ("SpeedFolding towel", "SpeedFolding fling-to-fold", "SpeedFolding t-shirt", "SpeedFolding max-value map")]
    say("%6d %6.2f %14.2f %8.2f %10.2f" % ((k,) + tuple(v)))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
