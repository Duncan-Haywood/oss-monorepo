import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_audit import audit as A


def mk(root, slug, script, results):
    d = os.path.join(root, slug, "experiments")
    os.makedirs(d)
    open(os.path.join(d, "run.py"), "w").write(script)
    open(os.path.join(d, "results.txt"), "w").write(results)
    open(os.path.join(root, slug, "README.md"), "w").write("value 1.50 and 2.25 and 9.99\n")


class T(unittest.TestCase):
    def test_wilson(self):
        lo, hi = A.wilson(5, 10)
        self.assertAlmostEqual(lo, 0.2366, places=3)
        self.assertAlmostEqual(hi, 0.7634, places=3)
        self.assertEqual(A.wilson(0, 0), (0.0, 1.0))

    def test_track(self):
        self.assertEqual(A.track_of("chip-accel"), "chip")
        self.assertEqual(A.track_of("blur-twin"), "other")

    def test_diff_classes(self):
        self.assertEqual(A.classify_diff("a\nb", "a\nb"), ("identical", 0))
        self.assertEqual(A.classify_diff("a\ntook 1.2 s", "a\ntook 3.4 s")[0], "timing-only")
        self.assertEqual(A.classify_diff("a 1", "a 2")[0], "differs")
        self.assertEqual(A.classify_diff("a", "a\nb")[0], "differs")

    def test_failure_class(self):
        self.assertEqual(A.classify_failure("ModuleNotFoundError: x"), "tool-missing")
        self.assertEqual(A.classify_failure("ZeroDivisionError"), "crashed")

    def test_sample_deterministic(self):
        s = [str(i) for i in range(50)]
        self.assertEqual(A.sample(s, 5, 1), A.sample(s, 5, 1))
        self.assertEqual(len(A.sample(s[:3], 5, 1)), 3)

    def test_end_to_end(self):
        with tempfile.TemporaryDirectory() as r:
            mk(r, "chip-a", "open('experiments/results.txt','w').write('x 1\\n')", "x 1\n")
            mk(r, "chip-b", "open('experiments/results.txt','w').write('x 2\\n')", "x 1\n")
            mk(r, "chip-c", "raise SystemExit(1)", "x 1\n")
            self.assertEqual(A.candidates(r), ["chip-a", "chip-b", "chip-c"])
            rows = {x["slug"]: x for x in A.audit(r, 3, 0, timeout=20, workers=2)}
            self.assertEqual(rows["chip-a"]["status"], "identical")
            self.assertEqual(rows["chip-b"]["status"], "differs")
            self.assertEqual(rows["chip-c"]["status"], "crashed")
            self.assertEqual(rows["chip-a"]["readme"], (0, 3))
            self.assertEqual(A.summarise(list(rows.values()))["reproduced"], 1)


if __name__ == "__main__":
    unittest.main()
