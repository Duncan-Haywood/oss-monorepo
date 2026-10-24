"""Feed the simulated carry and fasten results of track 20 into the buildbot-cost model.

buildbot-cost swept the robot's slowdown (robot-hours per replaced crew-hour) over 1 to 10 because no skill was
simulated. buildbot-carry now gives a simulated carry rate for the H1 and G1 against a walking labourer, and
buildbot-fasten gives the share of a sheet's nails a robot can reach from one stance. This module reads both and
asks, per task, whether the simulated slowdown is below the break-even slowdown of buildbot-cost.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "buildbot-cost" / "src"))
from buildbot_cost import model as C  # noqa: E402

CARRY = ROOT / "buildbot-carry" / "experiments" / "results.json"
FASTEN = ROOT / "buildbot-fasten" / "experiments" / "results.json"


def load(path):
    return json.loads(Path(path).read_text())


def carry_slowdowns(carry, robot, speed="1.1"):
    """Robot-hours per labourer-hour for the same pieces, over the carry grid (T step time, D metres, handling s).

    Returns {basis: sorted list of slowdowns}, basis '1' = labourer carries one stud a trip, '4' = a bundle of four.
    slowdown = labourer pieces/min over robot pieces/min, from buildbot-carry results.json 'rates'.
    """
    out = {"1": [], "4": []}
    for key, grid in carry["rates"][robot].items():
        if not key.startswith("T="):
            continue
        for cell in grid.values():
            r = cell["robot"]
            if not r:
                continue
            for basis in out:
                out[basis].append(cell["labourer"][f"{speed}|{basis}"] / r)
    return {b: sorted(v) for b, v in out.items()}


def nail_share(fasten, robot, mu="0.6", need="20"):
    """Share of a sheet's nails whose tool height is reachable from one stance with `need` newtons of push."""
    c = fasten["coverage"][f"{robot.lower()}-mu{mu}-need{need}"]["nails"]
    return c / fasten["nails"]


def net_per_house(hours, share, slowdown, wage, rate, supervision):
    """Dollars saved on `hours` crew-hours of which `share` can be done by the robot at `slowdown`."""
    return hours * share * C.net_per_replaced_hour(wage, rate, slowdown, supervision)


def quantile(xs, f):
    return xs[min(len(xs) - 1, int(f * len(xs)))]
