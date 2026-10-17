"""Observed order and Richardson extrapolation from scan.txt (three uniformly refined levels)."""
import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
rows = [l.split() for l in open(os.path.join(HERE, "scan.txt")).read().splitlines()[1:]]
f = [float(r[4]) for r in rows]
closed = float(rows[0][5])
d1, d2 = f[0] - f[1], f[1] - f[2]
out = ["levels (FE critical load, N): " + ", ".join(f"{x:.2f}" for x in f),
       f"differences coarse->mid, mid->fine: {d1:.2f}, {d2:.2f}"]
if d1 * d2 > 0:
    p = math.log(d1 / d2) / math.log(2)
    ext = f[2] - d2 / (2 ** p - 1)
    out += [f"observed order p = log2(d1/d2) = {p:.2f}",
            f"Richardson limit = {ext:.2f} N; ratio to closed form {ext/closed:.4f}",
            f"fine-level error vs limit = {(f[2]-ext)/ext*100:.2f} %"]
else:
    out.append("differences do not shrink monotonically: no order estimate")
open(os.path.join(HERE, "summary.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
