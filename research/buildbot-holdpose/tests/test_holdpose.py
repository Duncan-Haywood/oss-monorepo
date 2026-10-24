import unittest

import numpy as np

from buildbot_payload import fetch, model as M
from buildbot_holdpose import TOE_EDGE, cop_x, evaluate, search, self_contacts


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fetch.model_path("g1")
        cls.r = M.load("g1")
        cls.d0 = M.standing(cls.r)

    def test_cop_equals_com_offset(self):
        for dx in (0.0, 0.05):
            u, w, p, s, n = evaluate(self.r, self.d0, (0.3, 0.6), 3.8, dx)
            self.assertTrue(np.allclose(cop_x(s), (dx, dx), atol=1e-6))

    def test_toe_edge_matches_foot_geometry(self):
        m = self.r.model
        import mujoco
        b = M._bid(m, "left_ankle_roll_link")
        far = max(m.geom_pos[g][0] + m.geom_size[g][0] for g in range(m.ngeom)
                  if m.geom_bodyid[g] == b and m.geom_contype[g] == 1 and m.geom_type[g] == 2)
        self.assertAlmostEqual(far - self.r.feet[0][1][0], TOE_EDGE, places=6)

    def test_default_pose_has_no_self_contact(self):
        p = M.pose(self.r, self.d0, (0.3, 0.6), 3.8)
        self.assertEqual(self_contacts(self.r, p.qpos), 0)

    def test_search_never_worse_than_default_and_deterministic(self):
        a = search(self.r, self.d0, (0.3, 0.6), 3.8, 0.0, seed=1, n_random=6, n_refine=4)
        b = search(self.r, self.d0, (0.3, 0.6), 3.8, 0.0, seed=1, n_random=6, n_refine=4)
        self.assertLessEqual(a["u"], a["u_default"] + 1e-12)
        self.assertEqual(a["u"], b["u"])

    def test_found_pose_hits_the_hands(self):
        a = search(self.r, self.d0, (0.3, 0.6), 3.8, 0.0, seed=2, n_random=6, n_refine=4)
        # re-solving from the found anchor is feasible and reproduces the torque ratio
        u, *_ = evaluate(self.r, a["anchor"], (0.3, 0.6), 3.8, 0.0)
        self.assertAlmostEqual(u, a["u"], places=6)
