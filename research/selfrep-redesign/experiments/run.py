import pathlib, random, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_redesign import design as d

PROCS = {"fdm", "cnc", "laser"}
out = []
names = lambda c: ", ".join(d.SUBS[i].name for i in c) or "-"
for metric in ("lines", "mass", "cost"):
    base = d.closure_of(d.design(()), PROCS, metric)
    out.append(f"== objective: {metric} closure of printer+cnc+laser shop, baseline {100*base:.1f}% "
               f"({d.vitamin_kinds(d.design(()), PROCS)} vitamin lines)")
    out.append("budget  exhaustive  greedy  random(8 evals, mean of 200)  | exhaustive choice")
    for b in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0):
        e, ve = d.exhaustive(b, PROCS, metric)
        g, vg = d.greedy(b, PROCS, metric)
        rs = [d.random_search(b, PROCS, metric, 8, random.Random(s))[1] for s in range(200)]
        out.append(f"{b:5.1f}   {100*ve:6.1f}%    {100*vg:5.1f}%  {100*sum(rs)/len(rs):6.1f}%"
                   f"                      | {names(e)}")
    out.append("")
allc = tuple(range(len(d.SUBS)))
out.append("all substitutions: penalty %.1f, vitamin lines %d -> %d; closure lines/mass/cost = %s" % (
    d.penalty(allc), d.vitamin_kinds(d.design(()), PROCS), d.vitamin_kinds(d.design(allc), PROCS),
    "/".join(f"{100*d.closure_of(d.design(allc), PROCS, m):.1f}%" for m in ("lines", "mass", "cost"))))
out.append("per-substitution mass-closure gain alone (percentage points):")
b0 = d.closure_of(d.design(()), PROCS, "mass")
for i, s in enumerate(d.SUBS):
    out.append(f"  {s.name:22} penalty {s.penalty}  +{100*(d.closure_of(d.design((i,)), PROCS, 'mass')-b0):.1f}")
# sensitivity: penalties scaled by independent factors in [0.5,2]; how often does the best set at budget 2 change?
rng = random.Random(0)
orig = [s.penalty for s in d.SUBS]
sets = {}
import math
for _ in range(500):
    d.SUBS[:] = [d.Sub(s.name, s.removes, s.adds, o * math.exp(rng.uniform(math.log(.5), math.log(2)))) for s, o in zip(d.SUBS, orig)]
    c = d.exhaustive(2.0, PROCS, "mass")[0]
    sets[c] = sets.get(c, 0) + 1
    d.SUBS[:] = [d.Sub(s.name, s.removes, s.adds, o) for s, o in zip(d.SUBS, orig)]
out.append("\npenalty-scale sensitivity at budget 2.0 (500 draws): best set -> share of draws")
for c, n in sorted(sets.items(), key=lambda kv: -kv[1])[:5]:
    out.append(f"  {n/5:5.1f}%  {names(c)}")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
