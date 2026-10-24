"""How slow must a person be at nailing a sheet for a G1 nailing it to pay?

buildbot-grounded left the nailing rows as a ceiling and two slowdown points because buildbot-fasten gives where a robot
can press, not how long a sheet takes. buildbot-mobilebase now gives the time of a whole 4x8 sheet (62 nails) for a G1
walking between stances or riding a drive-and-lift base. The other side, a person's time per sheet, has no sourced
figure (the taskbook's 0.1 min a nail is its author's assumption), so it is the unknown: this module solves for the
human time per sheet at which the robot's ownership and supervision cost equals the wage avoided, and sweeps it.
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "buildbot-cost" / "src"))
from buildbot_cost import model as C  # noqa: E402

MOBILEBASE = ROOT / "buildbot-mobilebase" / "experiments" / "results.json"
TASKBOOK = ROOT / "buildbot-taskbook" / "experiments" / "taskbook.json"
NAILS_PER_SHEET = 62


def load(path):
    return json.loads(Path(path).read_text())


def robot_sheet_times(mb):
    """{label: seconds per sheet} for the G1 from buildbot-mobilebase results: walking, and the base's fastest/median/slowest."""
    base = sorted(t for w in mb["whole"] for t in w["by_v_lift"].values())
    return {
        "walking, 5 s a step": mb["walking"]["5.0"],
        "walking, 20 s a step": mb["walking"]["20.0"],
        "base, fastest tried": base[0],
        "base, median": base[len(base) // 2],
        "base, slowest tried": base[-1],
    }


def hand_sheet_seconds(taskbook):
    """Taskbook's assumed person time per sheet for wall-sheathing nailing (task S4): minutes a nail x 62 x 60."""
    s4 = next(t for t in taskbook["tasks"] if t["id"] == "S4")
    return s4["minutes_per_unit_mid"] * 60.0 * NAILS_PER_SHEET


def sheets(taskbook, task_id="S4"):
    t = next(t for t in taskbook["tasks"] if t["id"] == task_id)
    return t["cycles"] / NAILS_PER_SHEET


def hourly_rate(g1_price, base_price, life_h, upkeep, used_h):
    """Dollars per robot-hour: G1 plus any base, same life and upkeep."""
    return C.robot_rate(g1_price + base_price, life_h, upkeep, used_h)


def breakeven_hand_seconds(robot_s, wage, rate, supervision):
    """Person seconds per sheet above which the robot saves money: robot_s x (rate + supervision x wage) / wage."""
    return robot_s * (rate + supervision * wage) / wage


def saving_per_sheet(hand_s, robot_s, wage, rate, supervision):
    """Dollars saved on one sheet if a robot nails it instead of a person taking hand_s seconds."""
    return (hand_s - robot_s * (rate / wage + supervision) ) * wage / 3600.0


def p_saves(robot_s, draws=4000, seed=1, hand_range=(60.0, 720.0)):
    """Share of draws in which the robot saves money; hand time, supervision, base price, life and use drawn independently."""
    rnd = random.Random(seed)
    wage = C.WAGE_CARPENTER * 1.3
    n = 0
    for _ in range(draws):
        hand = rnd.uniform(*hand_range)
        sup = rnd.uniform(0.1, 1.0)
        base = rnd.choice([0.0, rnd.uniform(5000, 40000)])
        life = rnd.uniform(3000, 10000)
        used = rnd.uniform(500, 1800)
        rate = hourly_rate(C.PRICE_USD["G1"], base, life, 0.10, used)
        n += saving_per_sheet(hand, robot_s, wage, rate, sup) > 0
    return n / draws
