import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import sizerun  # noqa: E402

class SizeRunTests(unittest.TestCase):
    def test_models_ordered_by_size(self):
        self.assertEqual([m.split("-")[1] for m in sizerun.MODELS], ["0.5B", "1.5B", "3B"])

    def test_cache_paths_distinct(self):
        self.assertEqual(len({sizerun.cache_path(m) for m in sizerun.MODELS}), 3)

    def test_candidates_are_prefix_of_prompt_project(self):
        a = sizerun.anyprompt.candidates(n=sizerun.N_CAND)
        b = sizerun.anyprompt.candidates()
        self.assertEqual([c["text"] for c in a], [c["text"] for c in b[:sizerun.N_CAND]])

    def test_auroc_known(self):
        self.assertEqual(sizerun.core.auroc([2, 3], [0, 1]), 1.0)
        self.assertEqual(sizerun.core.auroc([0, 1], [2, 3]), 0.0)

if __name__ == "__main__":
    unittest.main()
