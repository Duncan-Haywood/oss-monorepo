"""Cost against tests added. Prints results.txt from runs_snapshot.jsonl."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_spendoutput.stats import spearman, elasticity, boot, terciles

runs = [json.loads(l) for l in open(os.path.join(HERE, "runs_snapshot.jsonl"))]
filled = [r for r in runs if r["tests_added"] is not None and r["cost_usd"] > 0]
print(f"priced runs {len(runs)}; with tests_added recorded {len(filled)} ({100 * len(filled) / len(runs):.0f}%)")
pos = [r for r in filled if r["tests_added"] > 0]
print(f"of those, tests_added > 0: {len(pos)}; zero: {len(filled) - len(pos)}")
print("\ntrack      priced filled  pos  median$  rho(cost,tests) [95% boot]   elasticity [95% boot]  (positive-test runs)")
for t in sorted({r["track"] for r in filled}, key=lambda t: -sum(r["track"] == t for r in filled)):
    allt = [r for r in runs if r["track"] == t]
    f = [r for r in filled if r["track"] == t]
    p = [r for r in f if r["tests_added"] > 0]
    if len(p) < 15:
        print(f"  {t:9s}{len(allt):6d}{len(f):7d}{len(p):5d}  too few positive-test runs")
        continue
    c = [r["cost_usd"] for r in p]; o = [r["tests_added"] for r in p]
    rho = boot(spearman, c, o); el = boot(elasticity, c, o)
    med = sorted(c)[len(c) // 2]
    print(f"  {t:9s}{len(allt):6d}{len(f):7d}{len(p):5d}  {med:7.2f}  {rho[0]:+.2f} [{rho[1]:+.2f}, {rho[2]:+.2f}]   {el[0]:+.2f} [{el[1]:+.2f}, {el[2]:+.2f}]")
c = [r["cost_usd"] for r in pos]; o = [r["tests_added"] for r in pos]
rho = boot(spearman, c, o); el = boot(elasticity, c, o)
print(f"\nall tracks, positive-test runs n={len(pos)}: rho {rho[0]:+.2f} [{rho[1]:+.2f}, {rho[2]:+.2f}]; elasticity {el[0]:+.2f} [{el[1]:+.2f}, {el[2]:+.2f}]")
print("\ncost tercile (positive-test runs): n   cost range      tests   tests per $")
for n, lo, hi, tc, to, per in terciles(c, o):
    print(f"  {n:3d}   ${lo:.2f} to ${hi:.2f}   {to:6d}   {per:6.2f}")
# runs with a recorded zero: where do they sit in cost?
z = sorted(r["cost_usd"] for r in filled if r["tests_added"] == 0)
if z:
    print(f"\nrecorded tests_added = 0: n={len(z)}, median cost ${z[len(z) // 2]:.2f} (positive-test median ${sorted(c)[len(c) // 2]:.2f})")
