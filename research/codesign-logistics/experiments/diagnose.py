"""Print the diagnostics the session agent reads after each round: outcome shares per design (fast hold, slow hold,
too weak, cups do not fit), pick time, median vacuum under the cups and cost. Usage: diagnose.py proposals/roundN.json ..."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_logistics import tote as T

for p in sys.argv[1:]:
    d = json.load(open(p))
    print(f"round {d['round']}")
    for x in d["designs"]:
        r = T.evaluate(x)
        print(f"  {x}  J={r['J']:.3f} fast={r['good']:.2f} slow={r['slow']:.2f} weak={r['weak']:.2f} nofit={r['nofit']:.2f} "
              f"t={r['pick_time_s']:.2f}s vac={r['median_vacuum_kpa']:.0f}kPa cost={r['cost']:.0f}")
