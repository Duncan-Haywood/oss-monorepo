"""The cell: a dryer load is dumped, and each item is picked, sensed, then hung or folded.

Stations (all times in seconds, all assumed unless parsed from a sibling project):
  arms     k robot arms; an arm is held from the pick until the item is on the rail or the fold table
  feeder   one hanger feeder; it is down for a refill after every `refill_every` hangers
  fold     one fold table, run by a separate mechanism, so the arm is free once it has set the item down
Insertion time and success per (hanger design, fabric) are parsed from hanger-insert's results.txt, and the share of
each archetype better hung than folded from hanger-fold's, never retyped.
"""
import random
import re
import statistics
from dataclasses import dataclass, field, replace
from pathlib import Path

from .des import Env, Request, Resource, Timeout

RESEARCH = Path(__file__).resolve().parents[3]
INSERT_RESULTS = RESEARCH / "hanger-insert" / "experiments" / "results.txt"
FOLD_RESULTS = RESEARCH / "hanger-fold" / "experiments" / "results.txt"

# hanger-fold has five archetypes and hanger-insert three; the other two borrow the nearest one (an assumption).
FABRIC_OF = {"tee": "tee", "shirt": "shirt", "linen": "shirt", "fleece": "sweater", "sweater": "sweater"}
MIX = {"tee": 0.40, "shirt": 0.25, "linen": 0.05, "fleece": 0.15, "sweater": 0.15}     # assumed household load


def _section(path, head):
    rows, on = [], False
    for line in Path(path).read_text().splitlines():
        m = re.match(r"(?:== )?([A-Z])\. ", line)
        if m:                                   # a block heading: "== A. ..." (hanger-insert) or "A. ..." (hanger-fold)
            on = m.group(1) == head
            continue
        if on and line.strip():
            rows.append(line.split())
    return rows[1:]            # drop the column header


def insertion_table(path=INSERT_RESULTS):
    """{(design, fabric): (mean_success, time_s)} from hanger-insert section A."""
    return {(r[0], r[1]): (float(r[2]), float(r[4])) for r in _section(path, "A")}


def hang_share(path=FOLD_RESULTS):
    """{archetype: share of garments better hung than folded} from hanger-fold section B."""
    return {r[0]: float(r[2]) for r in _section(path, "B") if r[0] in FABRIC_OF}


@dataclass(frozen=True)
class Params:
    design: str = "adjustable"          # a hanger-insert design
    arms: int = 1
    load: int = 25                      # items in a dryer load (assumed)
    policy: str = "learned"             # learned | always_hang | always_fold
    t_pick: float = 8.0                 # grasping one garment out of a pile; hanger-pick (milestone 5) will replace it
    p_pick: float = 0.85
    pick_tries: int = 3
    t_pick_fail: float = 4.0            # arm reset after a dropped or empty grasp
    t_sense: float = 3.0                # lift, weigh and measure
    t_feed: float = 1.5                 # feeder presents a hanger
    refill_every: int = 30
    t_refill: float = 90.0
    t_rail: float = 3.0                 # hang the loaded hanger on the rail
    t_to_fold: float = 3.0              # set the item on the fold table
    t_fold: float = 25.0                # the fold mechanism, per item
    fold_tables: int = 1                # parallel fold stations (hanger-foldsrc sweeps it)
    jitter: float = 0.2                 # every duration is scaled by U(1 - jitter, 1 + jitter)
    insertion_scale: float = 1.0        # for sensitivity: scales the parsed insertion times
    mix: dict = field(default_factory=lambda: dict(MIX))


def run_once(p, seed, table=None, share=None, picks=None):
    """`picks`: optional list of (seconds, ok) consumed in order, one per pick attempt sequence, replacing the
    assumed t_pick/p_pick (used by hanger-cellpick). Default None leaves every result unchanged."""
    table = table or insertion_table()
    share = share or hang_share()
    rng = random.Random(seed)
    env = Env()
    arms, feeder, fold = Resource(env, "arms", p.arms), Resource(env, "feeder", 1), Resource(env, "fold", p.fold_tables)
    kinds = list(p.mix)
    items = rng.choices(kinds, weights=[p.mix[k] for k in kinds], k=p.load)
    s = dict(hung=0, folded=0, aside=0, pick_fail=0, ins_fail=0, refills=0, dispensed=0, done=[], arm_busy_pick=0.0)

    def d(x):
        return x * rng.uniform(1 - p.jitter, 1 + p.jitter)

    def item(kind):
        yield Request(arms)
        ok = False
        if picks is not None:
            t_p, ok, *rest = picks.pop(0)
            if rest:                            # a pick may name the cell archetype it took (hanger-kindlink)
                kind = rest[0]
            yield Timeout(d(t_p))
            if not ok:
                s["pick_fail"] += 1
                s["aside"] += 1
                arms.release()
                s["done"].append(env.now)
                return
        for _ in range(0 if picks is not None else p.pick_tries):
            yield Timeout(d(p.t_pick))
            if rng.random() < p.p_pick:
                ok = True
                break
            s["pick_fail"] += 1
            yield Timeout(d(p.t_pick_fail))
        if not ok:
            s["aside"] += 1                     # left for a person
            arms.release()
            s["done"].append(env.now)
            return
        yield Timeout(d(p.t_sense))
        hang = {"always_hang": True, "always_fold": False}.get(p.policy)
        if hang is None:
            hang = rng.random() < share[kind]
        if hang:
            yield Request(feeder)
            if s["dispensed"] and s["dispensed"] % p.refill_every == 0:
                s["refills"] += 1
                yield Timeout(d(p.t_refill))
            s["dispensed"] += 1
            yield Timeout(d(p.t_feed))
            feeder.release()
            p_ok, t_ins = table[(p.design, FABRIC_OF[kind])]
            yield Timeout(d(t_ins * p.insertion_scale))
            if rng.random() < p_ok:
                yield Timeout(d(p.t_rail))
                s["hung"] += 1
                arms.release()
                s["done"].append(env.now)
                return
            s["ins_fail"] += 1                  # recovery: fold it instead
        yield Timeout(d(p.t_to_fold))
        arms.release()
        yield Request(fold)
        yield Timeout(d(p.t_fold))
        fold.release()
        s["folded"] += 1
        s["done"].append(env.now)

    for k in items:
        env.process(item(k))
    t = env.run()
    n = p.load
    return dict(makespan=t, per_hour=n / t * 3600.0, hung=s["hung"], folded=s["folded"], aside=s["aside"],
                pick_fail=s["pick_fail"], ins_fail=s["ins_fail"], refills=s["refills"],
                u_arms=arms.utilisation(t), u_feeder=feeder.utilisation(t), u_fold=fold.utilisation(t),
                arm_s_per_item=arms.busy / n, feeder_s_per_item=feeder.busy / n, fold_s_per_item=fold.busy / n)


def replicate(p, reps=200, seed=0, **kw):
    table, share = insertion_table(), hang_share()
    runs = [run_once(p, seed * 100003 + i, table, share) for i in range(reps)]
    out = {}
    for key in runs[0]:
        xs = [r[key] for r in runs]
        out[key] = statistics.fmean(xs)
        out[key + "_sd"] = statistics.pstdev(xs)
    return out


def bottleneck(r):
    u = {"arms": r["u_arms"], "feeder": r["u_feeder"], "fold": r["u_fold"]}
    return max(u, key=u.get)


__all__ = ["Params", "run_once", "replicate", "bottleneck", "insertion_table", "hang_share", "replace"]
