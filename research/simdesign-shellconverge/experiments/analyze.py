"""Summarise scan.txt: per-direction refinement effect on the FE/closed-form ratio. Writes summary.txt."""
import os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
rows = collections.defaultdict(dict)
for ln in open(os.path.join(HERE, "scan.txt")):
    p = ln.split()
    if len(p) == 10 and p[0] in ("horizontal", "vertical"):
        rows[(p[0], float(p[1]))][p[2]] = float(p[8])
out = ["arm w base thick2 len72 wid8 all  d_thick d_len d_wid sum_d base+sum_d all-base"]
for (arm, w), r in sorted(rows.items()):
    if "base" not in r:
        continue
    d = {k: r[k] - r["base"] for k in ("thick2", "len72", "wid8") if k in r}
    s = sum(d.values())
    f = lambda k: f"{r[k]:.4f}" if k in r else "  n/a "
    g = lambda k: f"{d[k]:+.4f}" if k in d else "  n/a "
    ab = f"{r['all'] - r['base']:+.4f}" if "all" in r else "n/a"
    out.append(f"{arm} {w:.0f} {f('base')} {f('thick2')} {f('len72')} {f('wid8')} {f('all')} {g('thick2')} {g('len72')} {g('wid8')} {s:+.4f} {r['base'] + s:.4f} {ab}")
open(os.path.join(HERE, "summary.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
