"""Tests for the search-ranking feedback loop (platform/seo/probe.py).

Lives in platform/ci/ so the merge checklist's platform/ci line runs it.
Run: python3 platform/ci/test_seo_probe.py  (or cd platform/ci && python3 -m pytest test_seo_probe.py)
No network: every test feeds fixtures.
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "seo"))
import probe  # noqa: E402

SITE = "https://marisstella.app/"
Q = {"id": "intent-x", "tier": "intent", "query": "free wall framing calculator",
     "expect": "https://marisstella.app/wall-framing-takeoff/"}
QUERIES = {"site": SITE, "queries": [Q, {"id": "brand-name", "tier": "brand",
                                         "query": "Maris Stella Labs", "expect": SITE}]}


class RankOf(unittest.TestCase):
    def test_absent(self):
        r = probe.rank_of(["https://a.example/", "https://b.example/x"], Q["expect"], SITE)
        self.assertEqual((r["found"], r["rank"], r["site_rank"], r["results_seen"]),
                         (False, None, None, 2))

    def test_expected_page_and_subpage_count(self):
        urls = ["https://a.example/", "https://www.marisstella.app/wall-framing-takeoff/how.html"]
        r = probe.rank_of(urls, Q["expect"], SITE)
        self.assertEqual((r["found"], r["rank"], r["site_rank"]), (True, 2, 2))

    def test_site_rank_before_page_rank(self):
        urls = ["https://marisstella.app/c/construction/", "https://x.example/",
                "https://marisstella.app/wall-framing-takeoff/"]
        r = probe.rank_of(urls, Q["expect"], SITE)
        self.assertEqual((r["rank"], r["site_rank"]), (3, 1))

    def test_lookalike_host_is_not_us(self):
        r = probe.rank_of(["https://marisstella.app.evil.example/wall-framing-takeoff/",
                           "https://notmarisstella.app/"], Q["expect"], SITE)
        self.assertIsNone(r["site_rank"])

    def test_prefix_needs_a_path_boundary(self):
        r = probe.rank_of(["https://marisstella.app/wall-framing-takeoff-old/"], Q["expect"], SITE)
        self.assertFalse(r["found"])
        self.assertEqual(r["site_rank"], 1)


class Files(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.hist = self.dir / "obs.jsonl"
        self.qfile = self.dir / "q.json"
        self.qfile.write_text(json.dumps(QUERIES))
        self.patches = [mock.patch.object(probe, "HISTORY", self.hist),
                        mock.patch.object(probe, "QUERIES", self.qfile),
                        mock.patch.object(probe, "STATUS", self.dir / "STATUS.md")]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.dir)

    def test_record_then_report(self):
        self.assertEqual(probe.main(["record", "intent-x", "https://a.example/", "--date", "2026-11-01"]), 0)
        self.assertEqual(probe.main(["record", "intent-x", "https://marisstella.app/wall-framing-takeoff/",
                                     "--date", "2026-11-08"]), 0)
        rows = probe.read_history(self.hist)
        self.assertEqual([r["found"] for r in rows], [False, True])
        text = probe.scorecard(rows, probe.load_queries(self.qfile))
        self.assertIn("| intent | 1 of 1 | 1 | 1 | 1 | +1 found |", text)
        self.assertIn("| brand | 0 of 1 |", text)

    def test_record_refuses_silent_empty(self):
        self.assertEqual(probe.main(["record", "intent-x"]), probe.EXIT_UNMEASURED)
        self.assertEqual(probe.read_history(self.hist), [])
        self.assertEqual(probe.main(["record", "intent-x", "--empty"]), 0)
        self.assertEqual(probe.read_history(self.hist)[0]["results_seen"], 0)

    def test_unknown_query_is_unmeasured(self):
        self.assertEqual(probe.main(["record", "nope", "https://a.example/"]), probe.EXIT_UNMEASURED)

    def test_next_orders_never_seen_first(self):
        probe.main(["record", "intent-x", "https://a.example/", "--date", "2026-11-01"])
        with mock.patch("builtins.print") as out:
            probe.main(["next", "-n", "2"])
        first = out.call_args_list[0].args[0]
        self.assertTrue(first.startswith("brand-name\tnever"))

    def test_no_readings_says_unmeasured(self):
        self.assertIn("unmeasured, not zero", probe.scorecard([], probe.load_queries(self.qfile)))

    def test_keys_absent_are_unmeasured(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(probe.main(["brave"]), probe.EXIT_UNMEASURED)
            self.assertEqual(probe.main(["gsc"]), probe.EXIT_UNMEASURED)


class CommittedQueries(unittest.TestCase):
    def test_committed_queries_are_valid(self):
        data = probe.load_queries()
        for q in data["queries"]:
            self.assertTrue(q["expect"].startswith(data["site"]), q["id"])
            self.assertTrue(q["query"].strip(), q["id"])

    def test_committed_history_parses(self):
        for r in probe.read_history():
            self.assertIn(r["engine"], r["engine"])  # parse is the test
            self.assertRegex(r["date"], r"^\d{4}-\d{2}-\d{2}$")


class AuditPage(unittest.TestCase):
    URL = "https://marisstella.app/x/"

    def page(self, head="", body="<h1>X</h1>"):
        return (f'<html><head><title>X tool</title><meta name="description" content="d">'
                f'<link rel="canonical" href="{self.URL}"><script type="application/ld+json">{{}}'
                f"</script>{head}</head><body>{body}</body></html>")

    def test_clean(self):
        self.assertEqual(probe.audit_page(self.URL, 200, {}, self.page()), ([], []))

    def test_noindex_and_wrong_canonical_block(self):
        html = self.page('<meta name="robots" content="noindex,follow">').replace(
            f'href="{self.URL}"', 'href="https://duncan-haywood.github.io/oss-monorepo/x/"')
        blockers, _ = probe.audit_page(self.URL, 200, {"x-robots-tag": "none"}, html)
        self.assertEqual(len(blockers), 2)
        blockers, _ = probe.audit_page(self.URL, 200, {"x-robots-tag": "noindex"}, self.page())
        self.assertEqual(len(blockers), 1)

    def test_relative_canonical_resolves(self):
        html = self.page().replace(f'href="{self.URL}"', 'href="./"')
        self.assertEqual(probe.audit_page(self.URL, 200, {}, html)[0], [])

    def test_long_title_and_two_h1_are_warnings(self):
        html = self.page(body="<h1>a</h1><h1>b</h1>").replace("X tool", "x" * 90)
        blockers, warnings = probe.audit_page(self.URL, 200, {}, html)
        self.assertEqual(blockers, [])
        self.assertEqual(len(warnings), 2)

    def test_http_error(self):
        self.assertEqual(probe.audit_page(self.URL, 404, {}, ""), ([f"{self.URL}: HTTP 404"], []))

    def test_canonical_variants_of_the_page_block(self):
        # Quality audit 2026-11-07-platform-seo.json, defect 0: norm() forgave all of these.
        for other in ("http://marisstella.app/x/", "https://www.marisstella.app/x/",
                      "https://marisstella.app/x/?utm_source=a", "https://marisstella.app:8443/x/"):
            html = self.page().replace(f'href="{self.URL}"', f'href="{other}"')
            blockers, _ = probe.audit_page(self.URL, 200, {}, html)
            self.assertEqual(blockers, [f"{self.URL}: canonical names {other}"], other)

    def test_canonical_harmless_differences(self):
        for same in ("https://MarisStella.app/x/", "https://marisstella.app:443/x/",
                     "https://marisstella.app/x/#top"):
            html = self.page().replace(f'href="{self.URL}"', f'href="{same}"')
            self.assertEqual(probe.audit_page(self.URL, 200, {}, html), ([], []), same)
        html = self.page().replace(f'href="{self.URL}"', 'href="https://marisstella.app/x"')
        blockers, warnings = probe.audit_page(self.URL, 200, {}, html)
        self.assertEqual(blockers, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("trailing slash", warnings[0])

    def test_unquoted_robots_noindex_blocks(self):
        # Same audit, defect 2: attr() only read quoted values.
        for meta in ("<meta name=robots content=noindex>", "<meta name=googlebot content=noindex,follow />"):
            blockers, _ = probe.audit_page(self.URL, 200, {}, self.page(meta))
            self.assertEqual(blockers, [f"{self.URL}: meta robots noindex"], meta)


class NoAnswer(unittest.TestCase):
    """Same audit, defect 1: a DNS or connection failure raised URLError (exit 1, 'defect')."""

    def test_http_returns_no_answer(self):
        import urllib.error
        with mock.patch.object(probe.urllib.request, "urlopen",
                               side_effect=urllib.error.URLError("Name or service not known")):
            status, headers, body = probe.http("https://marisstella.app/robots.txt")
        self.assertEqual((status, headers), (probe.NO_ANSWER, {}))
        self.assertIn(b"Name or service not known", body)
        with mock.patch.object(probe.urllib.request, "urlopen", side_effect=TimeoutError("timed out")):
            self.assertEqual(probe.http("https://marisstella.app/")[0], probe.NO_ANSWER)

    def test_audit_offline_is_unmeasured(self):
        import argparse
        import urllib.error
        args = argparse.Namespace(site=SITE, seed="s", sitemaps=1, pages=1, dry_run=True)
        with mock.patch.object(probe.urllib.request, "urlopen",
                               side_effect=urllib.error.URLError("offline")), \
                mock.patch.object(probe, "load_queries", return_value=QUERIES):
            self.assertEqual(probe.cmd_audit(args), probe.EXIT_UNMEASURED)


class Gsc(unittest.TestCase):
    def test_rows_to_observations(self):
        rows = [
            {"keys": ["free wall framing calculator", "https://marisstella.app/wall-framing-takeoff/"],
             "clicks": 2, "impressions": 30, "position": 8.0},
            {"keys": ["free wall framing calculator", "https://marisstella.app/c/construction/"],
             "clicks": 0, "impressions": 10, "position": 20.0},
            {"keys": ["something else", "https://marisstella.app/"], "clicks": 1, "impressions": 5,
             "position": 3.0},
        ]
        obs = probe.gsc_rows_to_observations(rows, QUERIES, "2026-10-01", "2026-10-28")
        site, x, brand = obs
        self.assertEqual((site["clicks"], site["impressions"], site["distinct_queries"],
                          site["distinct_pages"]), (3, 45, 2, 3))
        self.assertEqual((x["found"], x["rank"], x["impressions"]), (True, 11.0, 40))
        self.assertEqual((brand["found"], brand["impressions"]), (False, 0))

    def test_jwt_signs_and_verifies_with_openssl(self):
        if not shutil.which("openssl"):
            self.skipTest("no openssl")
        d = Path(tempfile.mkdtemp())
        try:
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                            "rsa_keygen_bits:2048", "-out", str(d / "k.pem")],
                           check=True, capture_output=True)
            subprocess.run(["openssl", "pkey", "-in", str(d / "k.pem"), "-pubout", "-out",
                            str(d / "p.pem")], check=True, capture_output=True)
            unsigned = probe.jwt_unsigned("sa@x.iam.gserviceaccount.com", 1_700_000_000)
            header, claims = (json.loads(probe.base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
                              for p in unsigned.split("."))
            self.assertEqual(header["alg"], "RS256")
            self.assertEqual(claims["exp"] - claims["iat"], 3600)
            self.assertIn("webmasters.readonly", claims["scope"])
            sig = probe.rs256(unsigned, (d / "k.pem").read_text())
            (d / "sig").write_bytes(probe.base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4)))
            ok = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(d / "p.pem"),
                                 "-signature", str(d / "sig")], input=unsigned.encode(),
                                capture_output=True)
            self.assertEqual(ok.returncode, 0, ok.stderr)
        finally:
            shutil.rmtree(d)


class Misc(unittest.TestCase):
    def test_brave_urls(self):
        self.assertEqual(probe.brave_urls({"web": {"results": [{"url": "https://a/"}, {"title": "x"}]}}),
                         ["https://a/"])
        self.assertEqual(probe.brave_urls({}), [])

    def test_egress_refusal_is_narrow(self):
        self.assertTrue(probe.egress_refused(403, b"Host not in allowlist"))
        self.assertFalse(probe.egress_refused(403, b"invalid subscription token"))

    def test_verification_tags_match_the_build_module(self):
        conf = {"google": ["abcDEF123_-xyz"], "bing": ["0123456789ABCDEF"]}
        script = ("import { verificationTags } from './platform/pages/site-verification.mjs';"
                  f"console.log(JSON.stringify(verificationTags({json.dumps(conf)})))")
        root = Path(__file__).resolve().parents[2]
        if not shutil.which("node"):
            self.skipTest("no node")
        out = subprocess.run(["node", "--input-type=module", "-e", script], cwd=root,
                             capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), probe.verification_tags(conf))


if __name__ == "__main__":
    unittest.main()
