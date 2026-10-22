"""Finite-size noise versus memory correlation in the ring walking-side game.

`society-ringmf` found a deterministic local mean-field overstates the robot share needed.
Two things differ between it and the `society-allies` simulation: (1) the map is
deterministic (no finite-size noise) and (2) memory slots are treated as independent draws.
`resampled` keeps (1) but removes (2): each sweep, every person's new state is the majority
of M fresh independent partner plays (partner uniform over 2k sites; robots play L; people
play their current state with error eps). It is a noisy, memoryless version of the
mean-field map. Stdlib only.
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-allies" / "src"))
from society_allies import block_placement  # noqa: E402


def resampled(n=200, rho=0.12, block=1, k=2, m=9, eps=0.02, sweeps=300, seed=0):
    """Final share of people in state L after `sweeps` synchronous noisy sweeps from everyone on R."""
    rng = random.Random(seed)
    robot = block_placement(n, round(rho * n), block)
    humans = [i for i in range(n) if i not in robot]
    s = [1 if i in robot else 0 for i in range(n)]
    offs = [d for d in range(-k, k + 1) if d]
    for _ in range(sweeps):
        new = s[:]
        for i in humans:
            cnt = 0
            for _ in range(m):
                j = (i + rng.choice(offs)) % n
                if j in robot:
                    p = 1
                else:
                    p = rng.randint(0, 1) if rng.random() < eps else s[j]
                cnt += p
            new[i] = 1 if cnt > m // 2 else 0
        s = new
    return sum(s[i] for i in humans) / len(humans)
