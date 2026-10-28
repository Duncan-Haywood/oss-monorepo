import os, tempfile, unittest
from wait_for import wait


class WaitFor(unittest.TestCase):
    def test_found(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("a\nDONE\n")
            ok, lines = wait(p, timeout=1)
            self.assertTrue(ok)
            self.assertEqual(lines[-1], "DONE")

    def test_marker_must_be_whole_line(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.log")
            open(p, "w").write("not DONE yet\n")
            t = [0.0]
            ok, _ = wait(p, timeout=3, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
            self.assertFalse(ok)

    def test_missing_file_times_out(self):
        t = [0.0]
        ok, _ = wait("/nonexistent/x.log", timeout=5, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
        self.assertFalse(ok)

    def test_quiet_mode_without_marker(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.jsonl")
            open(p, "w").write("{}\n")
            t = [0.0]
            ok, _ = wait(p, timeout=30, quiet=6, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
            self.assertTrue(ok)
            open(p, "w").close()
            ok, _ = wait(p, timeout=10, quiet=2, clock=lambda: t[0], nap=lambda s: t.__setitem__(0, t[0] + s))
            self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
