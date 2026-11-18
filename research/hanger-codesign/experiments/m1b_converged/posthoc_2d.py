"""Post hoc (not in the pre-registered predictions): the 2D chain on milestone 1b's half-cm grid,
so the converged 3 cm arm's best offset can be set against the cheapest tier's.

    python3 experiments/m1b_converged/posthoc_2d.py    (a few seconds; needs numpy)
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("m1b_run", HERE / "run.py")
m1b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m1b)
m1 = m1b.m1

out = ["Post hoc: 2D chain (5 mm rows), wood-shaped profile, same offsets as milestone 1b.",
       "fabric offset err2d"]
for c in m1b.FABRICS:
    rows = [(o, m1.run2(m1.width(c, o), m1.garment(c))) for o in m1b.OFFSETS]
    out += [f"{c} {o:+.1f} {e:.4f}" for o, e in rows]
    out.append(f"{c} best {min(rows, key=lambda r: r[1])[0]:+.1f}")
(HERE / "posthoc_2d.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
