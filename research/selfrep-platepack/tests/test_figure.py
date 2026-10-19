import pathlib, subprocess, sys, tempfile, unittest

HERE = pathlib.Path(__file__).resolve().parents[1] / "experiments"


class T(unittest.TestCase):
    def test_results_parse(self):
        sys.path.insert(0, str(HERE.parents[1] / "_shared"))
        from linefig import table
        text = (HERE / "results.txt").read_text().replace("c=", "").splitlines()
        xs, ys = table(text, "== A.", 0, [2, 3, 4, 5])
        self.assertEqual(list(xs), [1, 2, 4, 11, 22, 44])
        self.assertEqual(len(ys), 4)


if __name__ == "__main__":
    unittest.main()
