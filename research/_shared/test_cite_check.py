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

    def test_angle_bracket_doi(self):
        text = "See 10.1175/1520-0485(1999)029<0000:TEOTAO>2.0.CO;2; and 10.1000/abc;"
        dois, _ = cite_check.extract(text)
        self.assertEqual(dois, ["10.1175/1520-0485(1999)029<0000:TEOTAO>2.0.CO;2", "10.1000/abc"])

    def test_none(self):
        self.assertEqual(cite_check.extract("no refs, version 10.5 here"), ([], []))


class Lookup(unittest.TestCase):
    def run_with(self, code):
        import contextlib, io, tempfile, urllib.error
        def fake(url):
            if code == "conn":
                raise urllib.error.URLError("Tunnel connection failed: 403 connect_rejected")
            raise urllib.error.HTTPError(url, code, "x", {}, None)
        old, cite_check._get = cite_check._get, fake
        try:
            with tempfile.TemporaryDirectory() as d:  # fresh dir: no cite_check.json from another test
                path = Path(d) / "README.md"
                path.write_text("arXiv:1706.03762")
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    rc = cite_check.main([str(path)])
            return rc, out.getvalue()
        finally:
            cite_check._get = old

    def test_blocked_host_is_skipped_not_failed(self):
        rc, out = self.run_with(403)
        self.assertEqual(rc, 0)
        self.assertIn("SKIP", out)

    def test_connection_refused_is_skipped_not_failed(self):
        rc, out = self.run_with("conn")
        self.assertEqual(rc, 0)
        self.assertIn("SKIP", out)
        self.assertNotIn("FAIL", out)

    def test_404_fails(self):
        rc, out = self.run_with(404)
        self.assertEqual(rc, 1)
        self.assertIn("FAIL", out)


class Cache(unittest.TestCase):
    """A live lookup is remembered beside the README; a later blocked session prints ok*, not SKIP."""
    FEED = "<feed><entry><title>Attention Is All You Need</title><published>2017-06-12</published></entry></feed>"

    def run_in(self, d, response, *flags):
        import contextlib, io, urllib.error
        def fake(url):
            if isinstance(response, int):
                raise urllib.error.HTTPError(url, response, "x", {}, None)
            return response
        old, cite_check._get = cite_check._get, fake
        try:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = cite_check.main([str(Path(d) / "README.md"), *flags])
            return rc, out.getvalue()
        finally:
            cite_check._get = old

    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "research" / "slug"  # a project: its lookups are cached
        self.dir.mkdir(parents=True)
        (self.dir / "README.md").write_text("arXiv:1706.03762")
        self.cache = self.dir / cite_check.CACHE_NAME

    def tearDown(self):
        self.tmp.cleanup()

    def test_ok_lookup_is_recorded_then_used_when_blocked(self):
        import json
        rc, _ = self.run_in(self.dir, self.FEED)
        self.assertEqual(rc, 0)
        entry = json.loads(self.cache.read_text())["arxiv:1706.03762"]
        self.assertEqual(entry["title"], "Attention Is All You Need (2017)")
        rc, out = self.run_in(self.dir, 403)
        self.assertEqual(rc, 0)
        self.assertIn("ok*  arxiv:1706.03762  Attention Is All You Need (2017)", out)
        self.assertIn(entry["checked"], out)
        self.assertNotIn("SKIP", out)

    def test_unchanged_lookup_does_not_rewrite(self):
        self.run_in(self.dir, self.FEED)
        self.cache.write_text(self.cache.read_text().replace('"checked": "', '"checked": "x'))
        self.run_in(self.dir, self.FEED)
        self.assertIn('"checked": "x', self.cache.read_text())  # date kept: no churn in diffs

    def test_404_drops_the_entry(self):
        import json
        self.run_in(self.dir, self.FEED)
        rc, _ = self.run_in(self.dir, 404)
        self.assertEqual(rc, 1)
        self.assertEqual(json.loads(self.cache.read_text()), {})

    def test_no_write_and_offline_leave_no_file(self):
        self.run_in(self.dir, self.FEED, "--no-write")
        self.run_in(self.dir, self.FEED, "--offline")
        self.assertFalse(self.cache.exists())


    def hand(self, *args):
        import contextlib, io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = cite_check.main(["hand", str(self.dir / "README.md"), *args])
        return rc, out.getvalue()

    def test_hand_check_prints_ok_question_when_blocked(self):
        import json
        rc, _ = self.hand("arxiv:1706.03762", "Attention Is All You Need (2017)", "https://example.org/paper")
        self.assertEqual(rc, 0)
        entry = json.loads(self.cache.read_text())["arxiv:1706.03762"]
        self.assertEqual((entry["via"], entry["source"]), ("hand", "https://example.org/paper"))
        rc, out = self.run_in(self.dir, 403)
        self.assertEqual(rc, 0)
        self.assertIn("ok?  arxiv:1706.03762  Attention Is All You Need (2017)", out)
        self.assertIn("never by a registry", out)
        self.assertNotIn("ok*", out)
        self.assertNotIn("SKIP", out)

    def test_hand_refuses_an_id_the_file_does_not_cite(self):
        rc, out = self.hand("doi:10.1/x", "T (2000)", "s")
        self.assertEqual(rc, 2)
        self.assertIn("arxiv:1706.03762", out)
        self.assertFalse(self.cache.exists())

    def test_hand_needs_a_source(self):
        rc, _ = self.hand("arxiv:1706.03762", "T (2000)", " ")
        self.assertEqual(rc, 2)
        self.assertFalse(self.cache.exists())

    def test_hand_never_overwrites_a_live_entry(self):
        import json
        self.run_in(self.dir, self.FEED)
        rc, out = self.hand("arxiv:1706.03762", "Other (1999)", "s")
        self.assertEqual(rc, 0)
        self.assertIn("kept", out)
        self.assertNotIn("via", json.loads(self.cache.read_text())["arxiv:1706.03762"])

    def test_live_lookup_replaces_a_hand_entry_and_404_drops_it(self):
        import json
        self.hand("arxiv:1706.03762", "Attention Is All You Need (2017)", "s")
        self.run_in(self.dir, self.FEED)
        self.assertNotIn("via", json.loads(self.cache.read_text())["arxiv:1706.03762"])
        self.hand("arxiv:1706.03762", "Attention Is All You Need (2017)", "s")  # kept: live entry wins
        self.cache.write_text(json.dumps({"arxiv:1706.03762": {"title": "x", "checked": "d", "via": "hand"}}))
        rc, _ = self.run_in(self.dir, 404)
        self.assertEqual(rc, 1)
        self.assertEqual(json.loads(self.cache.read_text()), {})

    def test_skip_names_the_hand_command(self):
        _, out = self.run_in(self.dir, 403)
        self.assertIn("SKIP", out)
        self.assertIn("cite_check.py hand", out)

    def test_paper_subdir_reads_the_project_cache(self):
        import json
        self.run_in(self.dir, self.FEED)  # README at the project root records the id
        paper = self.dir / "paper"
        paper.mkdir()
        (paper / "README.md").write_text("eprint = {1706.03762}")
        rc, out = self.run_in(paper, 403)
        self.assertEqual(rc, 0)
        self.assertIn("ok*  arxiv:1706.03762", out)
        self.assertNotIn("SKIP", out)
        self.assertFalse((paper / cite_check.CACHE_NAME).exists())  # nothing copied down

    def test_directory_argument_checks_its_readme(self):
        rc, out = self.run_dir(self.dir)
        self.assertEqual(rc, 0)
        self.assertIn("is a directory: checking README.md", out)
        self.assertIn("ok   arxiv:1706.03762", out)

    def test_missing_path_is_an_error_not_a_traceback(self):
        rc, out = self.run_dir(self.dir / "nope.md")
        self.assertEqual(rc, 2)
        self.assertIn("no such file", out)

    def run_dir(self, target):
        import contextlib, io
        old, cite_check._get = cite_check._get, lambda url: self.FEED
        try:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = cite_check.main([str(target)])
            return rc, out.getvalue()
        finally:
            cite_check._get = old

    def test_post_outside_research_writes_no_cache_but_reads_project_caches(self):
        root = Path(self.tmp.name)
        (root / ".git").mkdir()
        self.run_in(self.dir, self.FEED)  # the project README confirms the id
        posts = root / "docs" / "posts"
        posts.mkdir(parents=True)
        (posts / "README.md").write_text("see arXiv:1706.03762")
        rc, out = self.run_in(posts, 403)
        self.assertEqual(rc, 0)
        self.assertIn("ok*  arxiv:1706.03762", out)
        rc, out = self.run_in(posts, self.FEED)
        self.assertIn("lookups not cached", out)
        self.assertFalse((posts / cite_check.CACHE_NAME).exists())
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()):
            rc = cite_check.main(["hand", str(posts / "README.md"), "arxiv:1706.03762", "T (2017)", "s"])
        self.assertEqual(rc, 2)
        self.assertFalse((posts / cite_check.CACHE_NAME).exists())

    def test_ancestor_walk_stops_at_project_root(self):
        import os
        root = os.path.join(os.sep, "x", "research", "slug")
        got = cite_check.ancestor_caches(os.path.join(root, "paper", "sec", "a.md"))
        self.assertEqual(got, [os.path.join(root, "paper", "cite_check.json"), os.path.join(root, "cite_check.json")])
        self.assertEqual(cite_check.ancestor_caches(os.path.join(root, "README.md")), [])


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


class Retry(unittest.TestCase):
    def run_get(self, codes):
        import io
        import urllib.error
        import urllib.request
        calls = []
        class R:
            def __enter__(s): return s
            def __exit__(s, *a): return False
            def read(s): return b"ok"
        def fake(req, timeout=0):
            calls.append(1)
            if len(calls) <= len(codes):
                raise urllib.error.HTTPError("u", codes[len(calls) - 1], "x", {}, io.BytesIO())
            return R()
        old = (urllib.request.urlopen, cite_check.time.sleep)
        urllib.request.urlopen, cite_check.time.sleep = fake, lambda s: None
        try:
            return cite_check._get("http://x"), len(calls)
        finally:
            urllib.request.urlopen, cite_check.time.sleep = old

    def test_429_then_ok_is_retried(self):
        self.assertEqual(self.run_get([429, 429]), ("ok", 3))

    def test_persistent_429_raises_after_all_retries(self):
        import urllib.error
        with self.assertRaises(urllib.error.HTTPError):
            self.run_get([429] * 10)

    def test_403_not_retried(self):
        import urllib.error
        with self.assertRaises(urllib.error.HTTPError):
            self.run_get([403, 403])




class OpenAlexFallback(unittest.TestCase):
    """A refused primary registry is retried on OpenAlex before SKIP (friction 2026-11-10..15)."""

    def run_routes(self, text, routes):
        import contextlib, io, tempfile, urllib.error
        seen = []
        def fake(url):
            seen.append(url)
            for prefix, resp in routes.items():
                if url.startswith(prefix):
                    if isinstance(resp, int):
                        raise urllib.error.HTTPError(url, resp, "x", {}, None)
                    if resp == "conn":
                        raise urllib.error.URLError("Tunnel connection failed: 403 connect_rejected")
                    return resp
            raise AssertionError("unexpected url " + url)
        old, cite_check._get = cite_check._get, fake
        try:
            with tempfile.TemporaryDirectory() as t:
                d = Path(t) / "research" / "slug"
                d.mkdir(parents=True)
                path = d / "README.md"
                path.write_text(text)
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    rc = cite_check.main([str(path)])
                cache = (d / cite_check.CACHE_NAME)
                return rc, out.getvalue(), seen, cache.read_text() if cache.exists() else ""
        finally:
            cite_check._get = old

    OA = '{"title": "Attention Is All You Need", "publication_year": 2017}'

    def test_refused_arxiv_is_found_via_openalex(self):
        rc, out, seen, cache = self.run_routes("arXiv:1706.03762", {
            "https://export.arxiv.org/": "conn", "https://api.openalex.org/": self.OA})
        self.assertEqual(rc, 0)
        self.assertIn("ok~  arxiv:1706.03762  Attention Is All You Need (2017)", out)
        self.assertIn("api.openalex.org/works/doi:10.48550/arXiv.1706.03762", seen[-1])
        self.assertIn('"via": "openalex"', cache)

    def test_refused_crossref_doi_is_found_via_openalex(self):
        rc, out, seen, _ = self.run_routes("doi:10.1038/nature14539", {
            "https://api.crossref.org/": 403, "https://api.openalex.org/": '{"title": "Deep learning", "publication_year": 2015}'})
        self.assertEqual(rc, 0)
        self.assertIn("ok~  doi:10.1038/nature14539  Deep learning (2015)", out)
        self.assertTrue(seen[-1].endswith("works/doi:10.1038/nature14539"))

    def test_openalex_404_is_not_a_verdict(self):
        rc, out, _, _ = self.run_routes("arXiv:1706.03762", {
            "https://export.arxiv.org/": 403, "https://api.openalex.org/": 404})
        self.assertEqual(rc, 0)
        self.assertIn("SKIP", out)
        self.assertNotIn("FAIL", out)

    def test_openalex_not_asked_when_primary_answers(self):
        feed = "<feed><entry><title>Attention</title><published>2017-06-12</published></entry></feed>"
        rc, out, seen, _ = self.run_routes("arXiv:1706.03762", {"https://export.arxiv.org/": feed})
        self.assertEqual(rc, 0)
        self.assertFalse(any("openalex" in u for u in seen))

    def test_primary_404_still_fails_without_openalex(self):
        rc, out, seen, _ = self.run_routes("arXiv:1706.03762", {"https://export.arxiv.org/": 404})
        self.assertEqual(rc, 1)
        self.assertFalse(any("openalex" in u for u in seen))


if __name__ == "__main__":
    unittest.main()
