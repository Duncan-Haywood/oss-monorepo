"""H5 across glider and propeller AUV: how large a fixed mission energy gap flips the ranking?

    PYTHONPATH=src python3 experiments/run_h5_glider.py > experiments/results_h5_glider.txt

7c and 7d showed that for two displacement hulls, range is linear in pack energy, so the order
cannot change with specific energy unless one hull carries a larger fixed energy E0 (launch,
recovery, ballasting). Here the pair has a different energy structure, so the question is
asked again for the glider against the same-mass propeller AUV of run_glider.py (its full 19,683-case
grid as 4a, 52 kg, 500 m dives). Best-range energy per metre of each (min over the 0.1 to 1.5 m/s
speeds) is taken per case; the pack is 10 kg at 150 to 250 Wh/kg (1.5 to 2.5 kWh, the REMUS
figure of results_remus.txt at the low end). Range = (E - E0) / e. With equal E0 the glider is
longer whenever e_g < e_a. A flip at energy E needs E0_g - E0_a > E (1 - e_g/e_a).
"""
import itertools
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_glider import GRID, SPEEDS, case  # noqa: E402

E_LO, E_HI = 10.0 * 150.0, 10.0 * 250.0
keys = list(GRID)
ratios, need_lo, need_hi = [], [], []
n = glider_ahead = no_glider = 0
for vals in itertools.product(*(GRID[k] for k in keys)):
    g, a, _ = case(**dict(zip(keys, vals)))
    n += 1
    eg = [x for x in g if x is not None]
    if not eg:
        no_glider += 1
        continue
    r = min(eg) / min(a)
    ratios.append(r)
    glider_ahead += r < 1
    need_lo.append(E_LO * (1 - r))   # Wh of extra glider overhead that flips it at 150 Wh/kg
    need_hi.append(E_HI * (1 - r))
print(f"{n} cases; pack energy {E_LO:.0f} to {E_HI:.0f} Wh; cases with no glider solution {no_glider}")
print(f"glider best-range energy per metre below the AUV's in {glider_ahead} of {len(ratios)} cases "
      f"({100*glider_ahead/len(ratios):.1f}%)")
q = statistics.quantiles(ratios, n=20)
print(f"e_g/e_a: min {min(ratios):.3f}, 5% {q[0]:.3f}, median {statistics.median(ratios):.3f}, "
      f"95% {q[-1]:.3f}, max {max(ratios):.3f}")
pos = [x for x in need_lo if x > 0]
print(f"extra glider overhead that flips the order at 150 Wh/kg (cases with glider ahead): "
      f"min {min(pos):.0f}, median {statistics.median(pos):.0f} Wh of {E_LO:.0f}")
for d in (0, 100, 250, 500, 1000):
    sw = sum((x > d) != (y > d) for x, y in zip(need_lo, need_hi))
    flipped = sum(x < d for x in need_lo)
    print(f"  glider extra overhead {d:5d} Wh: glider behind at 150 Wh/kg in {flipped:4d} cases; "
          f"rank swaps across 150 to 250 Wh/kg {sw:4d}")
