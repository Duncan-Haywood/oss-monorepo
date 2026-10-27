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

    def test_parenthesised_doi_and_bibtex_eprint(self):
        text = ("Townsend: doi:10.1016/0021-9991(79)90145-1) and (10.1038/nature14539). "
                "@article{x, eprint = {2510.04354}, doi = {10.1109/5.771073}}")
        dois, arxivs = cite_check.extract(text)
        self.assertEqual(dois, ["10.1016/0021-9991(79)90145-1", "10.1038/nature14539", "10.1109/5.771073"])
        self.assertEqual(arxivs, ["2510.04354"])

    def test_none(self):
        self.assertEqual(cite_check.extract("no refs, version 10.5 here"), ([], []))


class Lookup(unittest.TestCase):
    def run_with(self, code):
        import contextlib, io, tempfile, urllib.error
        def fake(url):
            raise urllib.error.HTTPError(url, code, "x", {}, None)
        old, cite_check._get = cite_check._get, fake
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
                f.write("arXiv:1706.03762")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = cite_check.main([f.name])
            return rc, out.getvalue()
        finally:
            cite_check._get = old

    def test_blocked_host_is_skipped_not_failed(self):
        rc, out = self.run_with(403)
        self.assertEqual(rc, 0)
        self.assertIn("SKIP", out)

    def test_404_fails(self):
        rc, out = self.run_with(404)
        self.assertEqual(rc, 1)
        self.assertIn("FAIL", out)


class DataCiteFallback(unittest.TestCase):
    def lookup(self, datacite_code):
        import json, urllib.error
        def fake(url):
            if "crossref" in url or datacite_code:
                raise urllib.error.HTTPError(url, datacite_code or 404, "x", {}, None)
            return json.dumps({"data": {"attributes": {"titles": [{"title": "A dataset"}], "publicationYear": 2021}}})
        old, cite_check._get = cite_check._get, fake
        try:
            return cite_check.lookup_doi("10.1184/R1/12683453")
        finally:
            cite_check._get = old

    def test_crossref_404_falls_back_to_datacite(self):
        self.assertEqual(self.lookup(0), "A dataset (2021)")

    def test_both_404_still_raises(self):
        import urllib.error
        with self.assertRaises(urllib.error.HTTPError):
            self.lookup(404)


if __name__ == "__main__":
    unittest.main()
