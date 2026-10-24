"""Experiments for hanger-kindlink; writes results.txt (deterministic, seeded). Stdlib only."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from hanger_kindlink.kindlink import KIND_TO_ARCH, CellParams, PickParams, replace, replicate  # noqa: E402

REPS = 200
out = []


def say(s=""):
    print(s)
    out.append(s)


CP, PP = CellParams(), PickParams()

say("== A. Linked vs unlinked kinds (adjustable hanger, 1 arm, load %d, mean of %d loads)" % (CP.load, REPS))
say("policy  linking   done/h  hung  folded  aside")
for policy in ("pinch", "see", "sweep"):
    for linked in (False, True):
        r = replicate(CP, policy, PP, REPS, linked=linked)
        say("%-7s %-8s %7.1f %5.1f %7.1f %6.2f" % (policy, "linked" if linked else "unlinked", r["done_per_hour"],
                                                    r["hung"], r["folded"], r["aside"]))

say()
say("== B. Knits hide their opening more often (see policy, 1 arm; other kinds 0.4)")
say("p_hidden_knit  done/h  hung  folded  aside  aside_knit")
for h in (0.2, 0.4, 0.6, 0.8, 1.0):
    r = replicate(CP, "see", PP, REPS, hidden_by_kind={"knit": h})
    say("%13.1f %7.1f %5.1f %7.1f %6.2f %11.2f" % (h, r["done_per_hour"], r["hung"], r["folded"], r["aside"],
                                                    r["aside_knit"]))

say()
say("== C. Same, two arms (unlinked, hanger-cellpick: %.1f done/h)" % replicate(replace(CP, arms=2), "see", PP, REPS, linked=False)["done_per_hour"])
say("p_hidden_knit  done/h  aside")
for h in (0.2, 0.4, 0.6, 0.8, 1.0):
    r = replicate(replace(CP, arms=2), "see", PP, REPS, hidden_by_kind={"knit": h})
    say("%13.1f %7.1f %6.2f" % (h, r["done_per_hour"], r["aside"]))

say()
say("== D. The mapping from pile kinds to cell archetypes is a guess: see policy, 1 and 2 arms")
say("mapping                          arms  done/h  hung  folded")
MAPS = {"default (trousers=linen, dress=shirt)": KIND_TO_ARCH,
        "fold-leaning (trousers, dress, kids -> tee)": {**KIND_TO_ARCH, "trousers": "tee", "dress": "tee"},
        "hang-leaning (kids -> shirt)": {**KIND_TO_ARCH, "kids": "shirt"},
        "all knit-like (all -> sweater)": {k: "sweater" for k in KIND_TO_ARCH},
        "all shirt-like (all -> shirt)": {k: "shirt" for k in KIND_TO_ARCH}}
for name, m in MAPS.items():
    for arms in (1, 2):
        r = replicate(replace(CP, arms=arms), "see", PP, REPS, arch_map=m)
        say("%-40s %2d  %7.1f %5.1f %7.1f" % (name, arms, r["done_per_hour"], r["hung"], r["folded"]))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
