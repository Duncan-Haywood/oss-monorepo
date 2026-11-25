import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import sparse_checkout_verify as scv  # noqa: E402

DOC = {
    "defaults": {"run": {"working-directory": "ventures/a"}},
    "jobs": {
        "test": {"steps": [
            {"uses": "actions/checkout@x"},
            {"run": "echo hi", "env": {"A": "1", "B": "${{ github.sha }}"}},
            {"run": "echo there", "working-directory": "ventures/b"},
        ]},
        "other": {"defaults": {"run": {"working-directory": "ventures/c"}},
                  "steps": [{"run": "echo ${{ matrix.x }}"}]},
    },
}


class Steps(unittest.TestCase):
    def test_working_directory_precedence_and_env(self):
        got = list(scv.steps(DOC))
        self.assertEqual([(j, i, wd) for j, i, _, wd, _ in got],
                         [("test", 1, "ventures/a"), ("test", 2, "ventures/b"), ("other", 0, "ventures/c")])
        self.assertEqual(got[0][4], {"A": "1"})  # expressions are not passed through

    def test_counts_and_skips_are_compared_but_timings_are_not(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "w"))
            doc = {"jobs": {"j": {"steps": [
                {"run": "echo '# tests 3'; echo '# skipped 1'; echo 'ran in 0.42s'", "working-directory": "w"},
                {"run": "echo ${{ x }}"},
                {"run": "exit 3", "working-directory": "missing"}]}}}
            out = scv.run_all(doc, d)
        self.assertEqual(out[0], ["j", 0, 0, ["# tests 3", "# skipped 1"]])
        self.assertEqual(out[1], ["j", 1, "expr"])
        self.assertEqual(out[2], ["j", 2, "no working directory"])


if __name__ == "__main__":
    unittest.main()
