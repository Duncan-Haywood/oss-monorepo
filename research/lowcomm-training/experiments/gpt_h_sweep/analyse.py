"""Summarise h_sweep_tune.jsonl / h_sweep_report.jsonl into h_sweep_results.txt (LOG.md, Milestone 3a)."""
import json, os, statistics as st
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda n: [json.loads(l) for l in open(os.path.join(HERE, n))]
out = []
say = out.append
tune = defaultdict(list)
for r in rd("h_sweep_tune.jsonl"): tune[(r["H"], r["lr"])].append(r["loss"])
say("Tuning half (seeds 100, 101), mean validation loss by inner lr (rows H; 0 = synchronous)")
lrs = sorted({k[1] for k in tune})
say("H     " + "  ".join(f"{lr:>7g}" for lr in lrs))
for H in sorted({k[0] for k in tune}):
    say(f"{H:<5} " + "  ".join(f"{st.mean(tune[(H, lr)]):7.4f}" for lr in lrs))
rep = defaultdict(dict)
for r in rd("h_sweep_report.jsonl"): rep[r["H"]][r["seed"]] = r["loss"]
say("\nReport seeds 0 to 2, validation loss at the tuned lr")
sync = [rep[0][s] for s in sorted(rep[0])]
sd = lambda v: st.stdev(v)
for H in sorted(rep):
    v = [rep[H][s] for s in sorted(rep[H])]
    d = [a - b for a, b in zip(v, sync)]
    bound = 2 * max(sd(v), sd(sync))
    say(f"H={H:<4} mean {st.mean(v):.4f} sd {sd(v):.4f}  minus sync {st.mean(d):+.4f} (2 sd bound {bound:.4f}; paired sd {sd(d) if H else 0:.4f})")
open(os.path.join(HERE, "h_sweep_results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
