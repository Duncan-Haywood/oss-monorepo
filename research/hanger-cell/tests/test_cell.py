import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_cell import des  # noqa: E402
from hanger_cell import model as M  # noqa: E402


class Engine(unittest.TestCase):
    def test_timeouts_order_events(self):
        env, log = des.Env(), []

        def p(name, dt):
            yield des.Timeout(dt)
            log.append((name, env.now))

        env.process(p("b", 5.0))
        env.process(p("a", 2.0))
        self.assertEqual(env.run(), 5.0)
        self.assertEqual(log, [("a", 2.0), ("b", 5.0)])

    def test_resource_serialises_and_counts_busy_time(self):
        env = des.Env()
        r = des.Resource(env, "r", 1)
        ends = []

        def p():
            yield des.Request(r)
            yield des.Timeout(3.0)
            r.release()
            ends.append(env.now)

        for _ in range(3):
            env.process(p())
        self.assertEqual(env.run(), 9.0)
        self.assertEqual(ends, [3.0, 6.0, 9.0])
        self.assertAlmostEqual(r.utilisation(9.0), 1.0)

    def test_two_servers_halve_the_time(self):
        env = des.Env()
        r = des.Resource(env, "r", 2)

        def p():
            yield des.Request(r)
            yield des.Timeout(4.0)
            r.release()

        for _ in range(4):
            env.process(p())
        self.assertEqual(env.run(), 8.0)


class Inputs(unittest.TestCase):
    def test_parsed_from_siblings(self):
        t = M.insertion_table()
        self.assertEqual(len(t), 18)                          # 6 designs x 3 fabrics
        self.assertGreater(t[("wire", "shirt")][1], t[("wire", "tee")][1])    # the hem route is slower
        s = M.hang_share()
        self.assertEqual(set(s), set(M.FABRIC_OF))
        self.assertGreater(s["shirt"], 0.5)
        self.assertLess(s["sweater"], 0.5)


def det(**kw):
    """No randomness in durations or picks, so the arithmetic can be checked by hand."""
    return replace(M.Params(jitter=0.0, p_pick=1.0, **kw))


class Cell(unittest.TestCase):
    def test_every_item_is_accounted_for(self):
        for seed in range(5):
            r = M.run_once(M.Params(), seed)
            self.assertEqual(r["hung"] + r["folded"] + r["aside"], M.Params().load)

    def test_always_fold_one_arm_is_the_fold_table(self):
        # the arm hands off in t_pick + t_sense + t_to_fold = 14 s, the table needs 25 s per item: the table is the pace
        p = det(policy="always_fold", load=10)
        r = M.run_once(p, 1)
        self.assertAlmostEqual(r["makespan"], 14.0 + 10 * 25.0)
        self.assertEqual(M.bottleneck(r), "fold")

    def test_always_hang_one_arm_is_the_arm(self):
        p = det(policy="always_hang", load=3, mix={"tee": 1.0}, design="adjustable", refill_every=100)
        table = {("adjustable", "tee"): (1.0, 6.0)}
        r = M.run_once(p, 1, table=table)
        self.assertAlmostEqual(r["makespan"], 3 * (8.0 + 3.0 + 1.5 + 6.0 + 3.0))
        self.assertEqual((r["hung"], r["folded"]), (3, 0))
        self.assertEqual(M.bottleneck(r), "arms")

    def test_refill_stalls_the_feeder(self):
        table = {("adjustable", "tee"): (1.0, 6.0)}
        base = det(policy="always_hang", load=4, mix={"tee": 1.0}, refill_every=100)
        a = M.run_once(base, 3, table=table)
        b = M.run_once(replace(base, refill_every=2), 3, table=table)
        self.assertEqual(b["refills"], 1)
        self.assertAlmostEqual(b["makespan"] - a["makespan"], 90.0)

    def test_a_failed_insertion_falls_back_to_the_fold_table(self):
        table = {("adjustable", "tee"): (0.0, 6.0)}
        r = M.run_once(det(policy="always_hang", load=3, mix={"tee": 1.0}), 1, table=table)
        self.assertEqual((r["hung"], r["folded"], r["ins_fail"]), (0, 3, 3))

    def test_second_arm_never_hurts_and_helps_a_busy_cell(self):
        one = M.replicate(M.Params(arms=1), 60)["makespan"]
        two = M.replicate(M.Params(arms=2), 60)["makespan"]
        self.assertLess(two, one)

    def test_failed_picks_go_to_a_person(self):
        r = M.run_once(M.Params(p_pick=0.0, load=6), 1)
        self.assertEqual(r["aside"], 6)
        self.assertEqual(r["hung"] + r["folded"], 0)

    def test_deterministic_for_a_seed(self):
        self.assertEqual(M.run_once(M.Params(), 7), M.run_once(M.Params(), 7))


if __name__ == "__main__":
    unittest.main()
