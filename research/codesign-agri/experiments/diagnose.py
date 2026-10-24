"""Print the diagnostics the session agent reads after each round: outcome shares per design (good, bruised-held,
slipped, missed, collided), median contact pressure and cost. Usage: diagnose.py proposals/roundN.json ..."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_agri import agri as A

for p in sys.argv[1:]:
    d = json.load(open(p))
    print(f"round {d['round']}")
    for x in d["designs"]:
        r = A.evaluate(x)
        print(f"  {x}  J={r['J']:.3f} good={r['good']:.2f} bruised={r['bruised']:.2f} slipped={r['slipped']:.2f} "
              f"missed={r['missed']:.2f} (collided {r['collided']:.2f}) p50={r['median_pressure_kpa']:.0f}kPa cost={r['cost']:.0f}")
