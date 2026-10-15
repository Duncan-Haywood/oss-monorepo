"""Audit a seeded sample of research/ projects. Usage: python3 experiments/run.py [N] [SEED] [TIMEOUT_SECONDS]"""
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_audit.audit import audit, summarise, wilson  # noqa: E402

RESEARCH = os.path.abspath(os.path.join(HERE, "..", ".."))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 40
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 20261015
TIMEOUT = int(sys.argv[3]) if len(sys.argv) > 3 else 300

rows = audit(RESEARCH, N, SEED, timeout=TIMEOUT)
print(f"sample: {len(rows)} projects, seed {SEED}, timeout {TIMEOUT} s each\n")
print(f"{'project':34s} {'status':12s} {'difflines':>9s} {'secs':>6s}  README decimals in output")
for r in rows:
    rd = f"{r['readme'][0]}/{r['readme'][1]}" if r["readme"] else "-"
    print(f"{r['slug']:34s} {r['status']:12s} {r['diff_lines']:9d} {r['seconds']:6.1f}  {rd}")
    if r["error"]:
        print(f"{'':34s}   last stderr line: {r['error']}")
s = summarise(rows)
print("\nstatus counts:", dict(Counter(r["status"] for r in rows)))
lo, hi = s["ci_reproduced"]
print(f"reproduced (identical or timing-only): {s['reproduced']}/{s['n']} = {s['reproduced']/s['n']:.0%}  (95% Wilson {lo:.0%} to {hi:.0%})")
lo, hi = s["ci_ran_ident"]
if s["ran"]:
    print(f"of runs that completed: byte-identical {s['identical_of_ran']}/{s['ran']}  (95% Wilson {lo:.0%} to {hi:.0%})")
print("\nby track (reproduced/sampled):")
tr = {}
for r in rows:
    k = tr.setdefault(r["track"], [0, 0])
    k[1] += 1
    k[0] += r["status"] in ("identical", "timing-only")
for t, (a, b) in sorted(tr.items()):
    print(f"  {t:10s} {a}/{b}")
tot = [r["readme"] for r in rows if r["readme"]]
f, t = sum(a for a, _ in tot), sum(b for _, b in tot)
print(f"\nREADME decimals found verbatim in committed results files: {f}/{t} = {f/t:.0%} over {len(tot)} READMEs")
