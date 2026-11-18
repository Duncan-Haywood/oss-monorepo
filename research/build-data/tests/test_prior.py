import csv, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import prior


class T(unittest.TestCase):
    def test_hand_count(self):
        d = tempfile.mkdtemp()
        hdr = ["city", "permit_id", "permit_type", "work_class", "estimated_cost", "applied", "issued", "completed", "area", "description_len"]
        with open(os.path.join(d, "chicago.csv"), "w", newline="") as f:
            w = csv.writer(f); w.writerow(hdr)
            for i in range(40):   # type A: 0..39 days
                w.writerow(["c", i, "A", "", "", "2024-01-01", f"2024-02-{1+i%1:02d}" if False else _add(i), "", "", 0])
            for i in range(5):    # type B too small
                w.writerow(["c", 100 + i, "B", "", "", "2024-01-01", "2024-01-01", "", "", 0])
            w.writerow(["c", 999, "A", "", "", "2020-01-01", "2020-01-05", "", "", 0])  # outside window
        e = prior.build(d, [2024])[0]
        self.assertEqual(e["all_types"]["n"], 45)
        self.assertEqual(e["types"]["A"]["n"], 40)
        self.assertEqual(e["types"]["A"]["q50"], 19.5)   # type 7 median of 0..39
        self.assertEqual(e["types"]["A"]["same_day_share"], 0.025)
        self.assertNotIn("B", e["types"]); self.assertEqual(e["folded_small_types"], 5)


def _add(i):
    import datetime
    return (datetime.date(2024, 1, 1) + datetime.timedelta(days=i)).isoformat()


if __name__ == "__main__":
    unittest.main()
