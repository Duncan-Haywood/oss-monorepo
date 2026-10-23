import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cite_check


class Extract(unittest.TestCase):
    def test_dois_and_arxiv(self):
        text = ("See [1] https://doi.org/10.1038/nature14539. Also (doi:10.1109/5.771073), "
                "arXiv:1706.03762v5 and arxiv.org/abs/1706.03762; old style arXiv:hep-th/9711200.")
        dois, arxivs = cite_check.extract(text)
        self.assertEqual(dois, ["10.1038/nature14539", "10.1109/5.771073"])
        self.assertEqual(arxivs, ["1706.03762", "hep-th/9711200"])

    def test_none(self):
        self.assertEqual(cite_check.extract("no refs, version 10.5 here"), ([], []))


if __name__ == "__main__":
    unittest.main()
