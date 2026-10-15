import math
import random
import unittest

from corridor_twin.model import (corridor, room, gapped_corridor, raycast, scan, icp, sandwich_cov, cov_from, solve3, inv3,
                                 eig_sym3_min_max, observable, run_filter)


class T(unittest.TestCase):
    def test_solve_and_inverse(self):
        A = [[4.0, 1.0, 0.5], [1.0, 3.0, 0.2], [0.5, 0.2, 2.0]]
        d = solve3(A, [1.0, 2.0, 3.0])
        for i in range(3):
            self.assertAlmostEqual(sum(A[i][j] * d[j] for j in range(3)), [1.0, 2.0, 3.0][i], places=10)
        I = inv3(A)
        for i in range(3):
            self.assertAlmostEqual(sum(A[i][k] * I[k][i] for k in range(3)), 1.0, places=10)

    def test_raycast_room(self):
        r = raycast(room(20.0), (0.0, 0.0, 0.0), nrays=4)
        for v in r:
            self.assertAlmostEqual(v, 10.0, places=9)

    def test_noise_free_icp_recovers_pose(self):
        segs = corridor(60, 2, 10)
        pose = (30.0, 0.2, 0.05)
        pts = [(2 * math.pi * k / 360, r) for k, r in enumerate(raycast(segs, pose)) if r is not None]
        e = icp(segs, pts, (30.05, 0.2, 0.05))
        self.assertAlmostEqual(e[0], 30.0, places=4)
        self.assertAlmostEqual(e[1], 0.2, places=4)

    def test_pure_corridor_is_unobservable_along_track(self):
        segs = corridor(60, 2)
        pose = (30.0, 0.2, 0.05)
        A, _ = sandwich_cov(segs, pose, 0.02)
        self.assertLess(A[0][0], 1e-9)
        self.assertFalse(observable(A))
        rng = random.Random(1)
        e = icp(segs, scan(segs, pose, 0.02, rng), (30.3, 0.2, 0.05))
        self.assertAlmostEqual(e[0], 30.3, places=9)  # the scan matcher hands back its initial guess

    def test_stubs_make_it_observable_and_more_stubs_help(self):
        pose = (30.0, 0.2, 0.05)
        sds = []
        for sp in (20, 10, 5):
            A, B = sandwich_cov(corridor(60, 2, sp), pose, 0.02)
            self.assertTrue(observable(A))
            sds.append(math.sqrt(cov_from(A, B)[0][0]))
        self.assertGreater(sds[0], sds[1])
        self.assertGreater(sds[1], sds[2])

    def test_sandwich_matches_monte_carlo(self):
        segs = corridor(60, 2, 10)
        pose = (30.0, 0.2, 0.05)
        A, B = sandwich_cov(segs, pose, 0.02)
        sd = math.sqrt(cov_from(A, B)[0][0])
        rng = random.Random(2)
        E = [icp(segs, scan(segs, pose, 0.02, rng), (30.05, 0.2, 0.05))[0] - 30.0 for _ in range(150)]
        m = sum(E) / len(E)
        mc = math.sqrt(sum((e - m) ** 2 for e in E) / (len(E) - 1))
        self.assertLess(abs(mc / sd - 1.0), 0.2)

    def test_room_is_isotropic(self):
        A, B = sandwich_cov(room(20.0), (1.0, 0.5, 0.1), 0.02)
        C = cov_from(A, B)
        self.assertLess(abs(math.sqrt(C[0][0] / C[1][1]) - 1.0), 0.05)

    def test_filter_twin_overconfident_in_featureless_span(self):
        segs = gapped_corridor()
        A, B = sandwich_cov(room(10.0), (0.5, 0.2, 0.05), 0.02, 180, 10.0)
        R = cov_from(A, B)[0][0]
        nees = {}
        for mode in ("twin", "real"):
            acc = []
            for s in range(6):
                for xt, e, P in run_filter(segs, random.Random(s), mode, R_twin=R):
                    if 20.0 <= xt <= 40.0:
                        acc.append(e * e / max(P, 1e-12))
            nees[mode] = sum(acc) / len(acc)
        self.assertGreater(nees["twin"], 20.0)
        self.assertLess(nees["real"], 5.0)


if __name__ == "__main__":
    unittest.main()
