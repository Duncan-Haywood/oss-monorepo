"""Score one proposals/roundN.json and print the diagnostics the agent reads before writing the next round.
Usage: python3 experiments/score_round.py proposals/round1.json"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_gripper import optimisers as O

for i, r in enumerate(O.score_proposals(sys.argv[1:]), 1):
    fails = {k: v["why"] for k, v in r["per_object"].items() if not v["ok"]}
    x = r["x"]
    print(f"{i:2d} L={x[0]:.0f} t={x[1]:.1f} w={x[2]:.0f} a={x[3]:.0f}  J={r['J']:.3f} success={r['success']:.3f} "
          f"plastic={r['plastic_g']:.1f}g force={r['force_N']:.1f}N{' (stress-limited)' if r['stress_limited'] else ''}  fails={fails}")
