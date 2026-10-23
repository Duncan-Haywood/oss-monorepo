import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_kindlink.kindlink import KIND_TO_ARCH, KINDS, CellParams, PickParams, pick_sequence, replicate  # noqa: E402
from hanger_cell.model import FABRIC_OF, hang_share, insertion_table, run_once  # noqa: E402

CP, PP = CellParams(), PickParams()


class T(unittest.TestCase):
    def test_every_kind_maps_to_a_cell_archetype(self):
        self.assertEqual(set(KIND_TO_ARCH), set(KINDS))
        self.assertTrue(set(KIND_TO_ARCH.values()) <= set(FABRIC_OF))

    def test_sequence_carries_kinds_and_is_deterministic(self):
        a = pick_sequence(25, "see", PP, 3)
        self.assertEqual(a, pick_sequence(25, "see", PP, 3))
        self.assertTrue(all(KIND_TO_ARCH[k] == arch for _, _, arch, k in a))

    def test_two_tuple_picks_unchanged(self):
        t, s = insertion_table(), hang_share()
        a = run_once(CP, 4, t, s, picks=[(5.0, True)] * CP.load)
        b = run_once(CP, 4, t, s, picks=[(5.0, True)] * CP.load)
        self.assertEqual(a, b)

    def test_named_archetype_overrides_cell_draw(self):
        t, s = insertion_table(), hang_share()
        always_sweater = run_once(CP, 4, t, s, picks=[(5.0, True, "sweater")] * CP.load)
        always_shirt = run_once(CP, 4, t, s, picks=[(5.0, True, "shirt")] * CP.load)
        self.assertGreater(always_shirt["hung"], always_sweater["hung"])   # sweaters are mostly folded

    def test_hidden_knits_set_more_knits_aside(self):
        lo = replicate(CP, "see", PP, 30, hidden_by_kind={"knit": 0.0})["aside_knit"]
        hi = replicate(CP, "see", PP, 30, hidden_by_kind={"knit": 1.0})["aside_knit"]
        self.assertGreater(hi, lo)


if __name__ == "__main__":
    unittest.main()
