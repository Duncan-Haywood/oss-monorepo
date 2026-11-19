"""The C grouping helper (shootflow.cull_native, 2026-11-18) must link exactly the all-pairs scan's pairs."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from shootflow import cull, cull_native  # noqa: E402
from shootflow.frame_analysis import fine_pack, window_pack, zoom_index  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_cull  # noqa: E402  (its synthetic bursts; imported as a module so its tests are not run twice)


def _parsed(rows):
    ordered = sorted(rows, key=lambda row: str(row[0]))
    hashes = [int(r[1].dhash, 16) for r in ordered]
    crops = [tuple(int(h, 16) for h in r[1].dhash_crops) for r in ordered]
    zooms = [tuple(int(h, 16) for h in r[1].dhash_zooms) for r in ordered]
    fines = [tuple(int(h, 16) for h in r[1].dhash_fine) for r in ordered]
    return hashes, crops, zooms, fines


def _reference(hashes, crops, zooms, fines):
    return sorted(cull._linked_pairs_all(
        hashes, crops, [zoom_index(z) for z in zooms], [window_pack(c) for c in crops],
        [fine_pack(c, f) for c, f in zip(crops, fines)],
    ))


@unittest.skipUnless(cull_native.available(), "no C compiler")
class CullNativeTest(unittest.TestCase):
    def rows(self, seed, n):
        return test_cull.GroupingIndexTest._rows(self, seed, n)

    def test_pairs_match_the_all_pairs_scan(self):
        for seed in range(6):
            parsed = _parsed(self.rows(seed, 150))
            want = _reference(*parsed)
            self.assertGreater(len(want), 20)
            self.assertEqual(cull_native.linked_pairs(*parsed), want, f"seed {seed}")

    def test_every_pass_is_exercised(self):
        """Each pass alone links some pair the others do not, so a fault in any of them shows above."""

        parsed = _parsed(self.rows(0, 150))
        hashes, crops, zooms, fines = parsed
        zi = [zoom_index(z) for z in zooms]
        wp = [window_pack(c) for c in crops]
        fp = [fine_pack(c, f) for c, f in zip(crops, fines)]
        alone = {"near": 0, "window": 0, "zoom": 0, "fine": 0}
        for i, j in _reference(*parsed):
            d = (hashes[i] ^ hashes[j]).bit_count()
            hits = {
                "near": d <= cull.NEAR_DUPLICATE_MAX_DISTANCE,
                "window": cull.window_match(d, wp[i], wp[j]),
                "zoom": cull.zoom_match(d, hashes[i], zi[i], hashes[j], zi[j]),
                "fine": cull.fine_match(d, fp[i], fp[j]),
            }
            if sum(hits.values()) == 1:
                alone[next(k for k, v in hits.items() if v)] += 1
        for name, count in alone.items():
            self.assertGreater(count, 0, name)

    def test_groups_match_both_python_paths(self):
        rows = self.rows(7, 220)
        native = [[r[0] for r in g] for g in cull._group(rows, index="native")]
        self.assertEqual(native, [[r[0] for r in g] for g in cull._group(rows, index=False)])
        self.assertEqual(native, [[r[0] for r in g] for g in cull._group(rows, index=True)])
        self.assertEqual(native, [[r[0] for r in g] for g in cull._group(rows)])

    def test_every_limit_at_and_one_past(self):
        """Pairs built so one lane of one pass sits exactly at its limit or one bit past it.

        Covers each direction of the one-sided passes (crop centre against the other's windows, either
        frame's whole hash in the other's zoom windows), a pan lane and a fine lane, for whole-frame
        distances across each gate, so an off-by-one in any limit, gain or gate changes the answer.
        """

        import random

        from shootflow.frame_analysis import _CROP_CENTRE, _FINE_GRID, _FINE_PAIRS, _PAN_PAIRS

        rng = random.Random(11)

        def near(value, bits):
            for bit in rng.sample(range(64), bits):
                value ^= 1 << bit
            return value

        kinds = {
            # name: (gate, max, gain)
            "crop_a": (cull.CROP_CANDIDATE_MAX_DISTANCE, cull.CROP_MAX_DISTANCE, cull.CROP_MIN_GAIN),
            "crop_b": (cull.CROP_CANDIDATE_MAX_DISTANCE, cull.CROP_MAX_DISTANCE, cull.CROP_MIN_GAIN),
            "pan": (cull.PAN_CANDIDATE_MAX_DISTANCE, cull.PAN_MAX_DISTANCE, cull.PAN_MIN_GAIN),
            "zoom_a": (cull.ZOOM_CANDIDATE_MAX_DISTANCE, cull.ZOOM_MAX_DISTANCE, cull.ZOOM_MIN_GAIN),
            "zoom_b": (cull.ZOOM_CANDIDATE_MAX_DISTANCE, cull.ZOOM_MAX_DISTANCE, cull.ZOOM_MIN_GAIN),
            "fine": (cull.FINE_CANDIDATE_MAX_DISTANCE, cull.FINE_MAX_DISTANCE, cull.FINE_MIN_GAIN),
        }
        hashes, crops, zooms, fines = [], [], [], []
        for case in range(240):
            kind = list(kinds)[case % len(kinds)]
            gate, most, gain = kinds[kind]
            # Above the near-duplicate line, which links any pair by itself.
            floor = cull.NEAR_DUPLICATE_MAX_DISTANCE + 1
            d = rng.choice((floor, floor + 1, gain + most - 1, gain + most, gain + most + 1, gate, gate + 1))
            limit = max(-1, min(most, d - gain))
            lane = max(0, limit + rng.choice((0, 1)))
            a = [rng.getrandbits(64), [rng.getrandbits(64) for _ in range(25)],
                 [rng.getrandbits(64) for _ in range(100)], [rng.getrandbits(64) for _ in range(24)]]
            b = [near(a[0], d), [rng.getrandbits(64) for _ in range(25)],
                 [rng.getrandbits(64) for _ in range(100)], [rng.getrandbits(64) for _ in range(24)]]
            k = rng.randrange(25)
            if kind == "crop_a":
                b[1][k] = near(a[1][_CROP_CENTRE], lane) if k != _CROP_CENTRE else b[1][k]
            elif kind == "crop_b":
                b[1][_CROP_CENTRE] = near(a[1][k], lane) if k != _CROP_CENTRE else b[1][_CROP_CENTRE]
            elif kind == "pan":
                pa, pb = rng.choice(_PAN_PAIRS)
                b[1][pb] = near(a[1][pa], lane)
            elif kind == "zoom_a":
                b[2][rng.randrange(100)] = near(a[0], lane)
            elif kind == "zoom_b":
                a[2][rng.randrange(100)] = near(b[0], lane)
            else:
                fa, fb = (_FINE_GRID[x] for x in rng.choice(_FINE_PAIRS))
                grid_b = b[1] + b[3]
                grid_b[fb] = near((a[1] + a[3])[fa], lane)
                b[1], b[3] = grid_b[:25], grid_b[25:]
            for frame in (a, b):
                hashes.append(frame[0])
                crops.append(tuple(frame[1]))
                zooms.append(tuple(frame[2]))
                fines.append(tuple(frame[3]))
        want = _reference(hashes, crops, zooms, fines)
        self.assertGreater(len(want), 40)
        self.assertLess(len(want), 200)
        self.assertEqual(cull_native.linked_pairs(hashes, crops, zooms, fines), want)

    def test_thread_count_changes_nothing(self):
        parsed = _parsed(self.rows(5, 600))
        one = cull_native.linked_pairs(*parsed, threads=1)
        self.assertEqual(one, _reference(*parsed))
        for threads in (2, 3, 7, 64):
            self.assertEqual(cull_native.linked_pairs(*parsed, threads=threads), one, threads)

    def test_edge_sizes(self):
        self.assertEqual(cull_native.linked_pairs([], [], [], []), [])
        self.assertEqual(cull_native.linked_pairs([5], [()], [()], [()]), [])
        self.assertEqual(cull_native.linked_pairs([5, 5 ^ 0xFF], [(), ()], [(), ()], [(), ()]), [(0, 1)])
        self.assertEqual(cull_native.linked_pairs([5, 5 ^ 0x1FF], [(), ()], [(), ()], [(), ()]), [])

    def test_constants_come_from_cull(self):
        """A changed limit in cull.py reaches the C path (nothing is copied into the C source)."""

        parsed = _parsed(self.rows(2, 150))
        saved = cull.CROP_MAX_DISTANCE
        try:
            cull.CROP_MAX_DISTANCE = 3
            want = _reference(*parsed)
            self.assertEqual(cull_native.linked_pairs(*parsed), want)
        finally:
            cull.CROP_MAX_DISTANCE = saved
        self.assertNotEqual(want, _reference(*parsed))


class CullNativeOffTest(unittest.TestCase):
    def test_switch_off_falls_back_to_python(self):
        rows = test_cull.GroupingIndexTest()._rows(3, 60)
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ)
            saved = dict(cull_native._STATE)
            try:
                os.environ["SHOOTFLOW_NATIVE"] = "0"
                cull_native._STATE.clear()
                self.assertIsNone(cull_native.linked_pairs([1], [()], [()], [()]))
                groups = [[r[0] for r in g] for g in cull._group(rows)]
                self.assertEqual(groups, [[r[0] for r in g] for g in cull._group(rows, index=False)])
                with self.assertRaises(RuntimeError):
                    cull._group(rows, index="native")
            finally:
                os.environ.clear()
                os.environ.update(env)
                cull_native._STATE.clear()
                cull_native._STATE.update(saved)
            del tmp


if __name__ == "__main__":
    unittest.main()
