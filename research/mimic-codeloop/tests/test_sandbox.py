import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import sandbox as S  # noqa: E402

GOOD = '''```python
def generate(start, end, rng):
    t = np.arange(0, 400, 16.0)
    u = t / t[-1]
    pts = start + np.outer(u, end - start)
    return np.column_stack([t, pts])
```'''


class T(unittest.TestCase):
    def test_good(self):
        fn = S.compile_generator(S.extract(GOOD))
        out = S.run(fn, [0, 0], [100, 50], np.random.default_rng(0))
        self.assertEqual(out.shape[1], 3)
        self.assertTrue((out[-1, 1:] == [100, 50]).all())

    def test_banned(self):
        with self.assertRaises(ValueError):
            S.compile_generator("import os\ndef generate(s,e,r): return 1")
        with self.assertRaises(ValueError):
            S.compile_generator("def generate(s,e,r):\n    return open('x')")

    def test_timeout(self):
        fn = S.compile_generator("def generate(s,e,r):\n    while True:\n        pass")
        with self.assertRaises(ValueError):
            S.run(fn, [0, 0], [1, 1], np.random.default_rng(0))

    def test_bad_output(self):
        fn = S.compile_generator("def generate(s,e,r):\n    return np.zeros((5,3))")
        with self.assertRaises(ValueError):
            S.run(fn, [0, 0], [1, 1], np.random.default_rng(0))


if __name__ == "__main__":
    unittest.main()
