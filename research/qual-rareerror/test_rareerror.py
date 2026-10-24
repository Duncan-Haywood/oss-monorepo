import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qual-stratified"))
import qualstrat as qs  # noqa: E402


def inject(llm, a_all, flip, rng):
    out = list(llm)
    for i in a_all:
        if rng.random() < flip:
            out[i] = 1 - out[i]
    return out


class InjectTests(unittest.TestCase):
    def test_flip_touches_only_group_a(self):
        llm = [0] * 100
        out = inject(llm, list(range(10)), 1.0, random.Random(1))
        self.assertEqual(out[:10], [1] * 10)
        self.assertEqual(out[10:], [0] * 90)

    def test_zero_flip_is_identity(self):
        llm = [i % 2 for i in range(50)]
        self.assertEqual(inject(llm, list(range(50)), 0.0, random.Random(2)), llm)

    def test_noisier_group_gets_larger_audit_share(self):
        a, b = list(range(100)), list(range(100, 1000))
        human = [i % 2 for i in range(1000)]
        clean_a = [h if i >= 100 else (1 - h if i % 10 == 0 else h) for i, h in enumerate(human)]
        noisy_a = [h if i >= 100 else (1 - h if i % 2 == 0 else h) for i, h in enumerate(human)]
        for llm in (clean_a, noisy_a):
            llm[100:] = [1 - h if k % 10 == 0 else h for k, h in enumerate(human[100:])]
        self.assertGreater(qs.allocation(noisy_a, human, a, b), qs.allocation(clean_a, human, a, b))


if __name__ == "__main__":
    unittest.main()
