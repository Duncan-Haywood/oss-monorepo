import random, unittest
from osrobot_weedpass import model as M

KMH = 1 / 3.6


def go(seed=1, **kw):
    fk = kw.pop("field_kw", {})
    return M.run_passes(M.Field(seed, **fk), random.Random(seed), **kw)


class T(unittest.TestCase):
    def test_one_stop_pass_matches_run_inline_kill_scale(self):
        a = go(passes=1, v=KMH); b = M.run_inline(M.Field(1), random.Random(1), v=KMH)
        self.assertAlmostEqual(a["time_min"], b["time_min"], delta=0.5 * b["time_min"] + 1e-9)
        self.assertLessEqual(abs(a["kill"] - b["kill"]), 0.25)

    def test_more_passes_more_kill_and_time(self):
        a = go(passes=1, v=KMH); b = go(passes=3, v=KMH)
        self.assertGreater(b["kill"], a["kill"]); self.assertGreater(b["time_min"], a["time_min"])

    def test_reproducible(self):
        self.assertEqual(go(passes=2, on_move=True, v=KMH), go(passes=2, on_move=True, v=KMH))

    def test_on_move_not_slower_when_sparse(self):
        s = go(passes=1, v=KMH, on_move=False); m = go(passes=1, v=KMH, on_move=True)
        self.assertLessEqual(m["time_min"], s["time_min"] + 1e-9)

    def test_on_move_lane_time_bounded_by_treatment_work(self):
        d = go(field_kw=dict(density=10.0), passes=1, v=4 * KMH, on_move=True)
        self.assertGreater(d["time_min"], go(field_kw=dict(density=0.3), passes=1, v=4 * KMH, on_move=True)["time_min"])

    def test_perfect_sensor_three_passes_clears(self):
        r = go(field_kw=dict(mud=0.0), passes=3, p_max=1.0, fp_rate=0.0, v=0.1)
        self.assertGreater(r["kill"], 0.99)


class Hidden(unittest.TestCase):
    def test_hidden_weeds_cap_kill(self):
        r = go(field_kw=dict(mud=0.0), passes=3, p_max=1.0, fp_rate=0.0, v=0.1, hidden_share=0.3)
        self.assertLess(r["kill"], 0.85)
