#!/usr/bin/env python3
"""Tests for public_surface.py.

The tool's whole value is that it disagrees with the manifests when reality
does, so most of these pin the disagreement boundary rather than the happy
path: a 200 that carries nothing must not count as serving, a 301 must not
count as serving, and a host the manifests say is *supposed* to be dark must
stay green while it is dark.

No test here opens a socket. `fetch` is the only function that would, and
every test injects a stub opener in its place.
"""

import io
import json
import unittest
import urllib.error
from pathlib import Path

import public_surface as ps


class StubResponse(io.BytesIO):
    def __init__(self, status, body, headers=None):
        super().__init__(body)
        self.status = status
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


class StubOpener:
    """Answers by URL. Anything unlisted is treated as unreachable."""

    def __init__(self, answers):
        self.answers = answers
        self.seen = []

    def open(self, request, timeout=None):
        url = request.full_url if hasattr(request, "full_url") else str(request)
        self.seen.append(url)
        answer = self.answers.get(url)
        if answer is None:
            raise urllib.error.URLError("no route to host")
        if isinstance(answer, Exception):
            raise answer
        status, body, headers = answer
        if status >= 300:
            raise urllib.error.HTTPError(url, status, "err", headers, io.BytesIO(body))
        return StubResponse(status, body, headers)


def served(nbytes=4096, ctype="text/html"):
    return (200, b"x" * nbytes, {"Content-Type": ctype})


APEX = "https://marisstella.dev/"
TOOLS = "https://tools.marisstella.dev/"


def app_row(path, hosts):
    return {"application": "prod", "path": path, "hosts": hosts}


class HostProbeTests(unittest.TestCase):
    def test_a_host_with_no_unmet_secret_is_expected_to_serve(self):
        rows = [app_row("gitops/prod", [{"host": "marisstella.dev", "serves": "workload", "unmet_secrets": []}])]
        (probe,) = ps.host_probes(rows)
        self.assertEqual(probe.url, APEX)
        self.assertEqual(probe.expect, "serves")

    def test_a_host_failing_closed_on_a_secret_is_expected_to_be_dark(self):
        rows = [
            app_row(
                "gitops/prod",
                [{"host": "tools.marisstella.dev", "serves": "workload", "unmet_secrets": ["portfolio-site-repo"]}],
            )
        ]
        (probe,) = ps.host_probes(rows)
        self.assertEqual(probe.expect, "gated")
        self.assertIn("portfolio-site-repo", probe.why)

    def test_a_redirect_host_is_not_expected_to_carry_a_document(self):
        rows = [app_row("gitops/prod", [{"host": "www.marisstella.dev", "serves": "redirect", "unmet_secrets": []}])]
        (probe,) = ps.host_probes(rows)
        self.assertEqual(probe.expect, "gated")

    def test_a_host_claimed_twice_takes_the_serving_claim(self):
        rows = [
            app_row("gitops/a", [{"host": "marisstella.dev", "serves": "redirect", "unmet_secrets": []}]),
            app_row("gitops/b", [{"host": "marisstella.dev", "serves": "workload", "unmet_secrets": []}]),
        ]
        probes = ps.host_probes(rows)
        self.assertEqual(len(probes), 1)
        self.assertEqual(probes[0].expect, "serves")

    def test_the_real_manifests_produce_probes(self):
        """Not a pinned list — the manifests move. Only that it reads them."""
        probes = ps.host_probes()
        self.assertTrue(probes, "gitops/ declares no public hostname")
        for probe in probes:
            self.assertTrue(probe.url.startswith("https://"))
            self.assertIn(probe.expect, {"serves", "gated"})


def pages_row(classification, gates=()):
    """One `publish_surface.survey()` row for the Pages workflow."""
    return {
        "workflow": ps.PAGES_WORKFLOW,
        "classification": classification,
        "publishes": [{"job": "deploy", "gates": list(gates)}],
    }


class PagesOriginTests(unittest.TestCase):
    """The second origin: GitHub Pages, which no probe used to reach.

    It fails independently of the cluster -- no k3s, no SSH key, no sealed
    clone token -- so these pin that the prediction comes from the workflow's
    own gate rather than from anything about `marisstella.dev`.
    """

    def test_the_base_url_is_read_from_build_mjs_not_restated(self):
        """The one constant, parsed from the module that owns it."""
        url = ps.pages_base_url()
        self.assertTrue(url, "build.mjs no longer exports DEFAULT_BASE_URL")
        self.assertTrue(url.startswith("https://"))

    def test_the_parsed_base_url_matches_what_build_mjs_actually_exports(self):
        """Guards the rename that a copied constant cannot notice.

        `CLAUDE.md` records this exact failure twice: a value restated on this
        side of the language boundary kept agreeing with itself while
        `build.mjs` moved on. Ask node for the real export and compare.
        """
        import shutil
        import subprocess

        if not shutil.which("node"):
            self.skipTest("node is not installed")
        exported = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                "import {DEFAULT_BASE_URL} from './platform/pages/build.mjs';"
                "process.stdout.write(DEFAULT_BASE_URL);",
            ],
            cwd=ps.REPO,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        self.assertEqual(ps.pages_base_url(), exported)

    def test_a_gated_deploy_is_expected_to_be_dark(self):
        probes = ps.pages_probes(
            rows=[pages_row("gated", ["vars.PAGES_ENABLED == 'true'"])],
            base_url="https://example.test/site/",
            branch_route=False,
        )
        self.assertEqual(len(probes), 1)
        self.assertEqual(probes[0].expect, "gated")
        self.assertIn("PAGES_ENABLED", probes[0].why)

    def test_an_ungated_deploy_is_expected_to_serve(self):
        probes = ps.pages_probes(rows=[pages_row("live")], base_url="https://example.test/site/")
        self.assertEqual(probes[0].expect, "serves")

    def test_a_missing_workflow_predicts_nothing_rather_than_guessing(self):
        """A rename must not become a fabricated prediction about a deploy."""
        self.assertEqual(
            ps.pages_probes(rows=[], base_url="https://example.test/", branch_route=False),
            [],
        )

    def test_a_gated_workflow_with_the_branch_route_predicts_nothing(self):
        """The defect this pair exists for.

        `publish-branch.sh` serves this origin without the workflow, so a gated
        deploy job no longer means dark. Predicting `gated` here would score the
        catalogue going live as a discrepancy -- a red check on the one day the
        route finally works.
        """
        probes = ps.pages_probes(
            rows=[pages_row("gated", ["vars.PAGES_ENABLED == 'true'"])],
            base_url="https://example.test/site/",
            branch_route=True,
        )
        self.assertEqual(len(probes), 1)
        self.assertEqual(probes[0].expect, ps.UNPREDICTABLE)
        # Both routes are named, so a reader can tell which lever is which.
        self.assertIn("PAGES_ENABLED", probes[0].why)
        self.assertIn("gh-pages", probes[0].why)

    def test_an_unpredictable_origin_agrees_either_way(self):
        """Reported, never scored: neither outcome is evidence of a defect."""
        probe = ps.Probe(url="https://example.test/", expect=ps.UNPREDICTABLE, why="two routes")
        dark = ps.Result(probe=probe, status=404, body_bytes=0)
        serving = ps.Result(probe=probe, status=200, body_bytes=ps.MIN_SERVED_BYTES + 1)
        self.assertFalse(dark.serving)
        self.assertTrue(serving.serving)
        self.assertTrue(dark.agrees)
        self.assertTrue(serving.agrees)

    def test_the_branch_route_alone_still_probes_the_origin(self):
        """No workflow but a staged branch is a reason to ask, not to fall silent."""
        probes = ps.pages_probes(rows=[], base_url="https://example.test/", branch_route=True)
        self.assertEqual(len(probes), 1)
        self.assertEqual(probes[0].expect, ps.UNPREDICTABLE)

    def test_the_publisher_this_reads_still_exists(self):
        """`branch_route` defaults off a real path; a rename must not silently
        drop the origin back to a `gated` prediction."""
        self.assertTrue(
            ps.PUBLISH_BRANCH_SCRIPT.is_file(),
            "publish-branch.sh moved; pages_probes would silently go back to "
            "predicting `gated` for an origin that branch still serves",
        )

    def test_a_build_mjs_without_the_export_yields_no_url(self):
        """A rename of the export is a reason to read nothing, not to guess."""
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as handle:
            handle.write("export const SOMETHING_ELSE = 'https://wrong.test/';\n")
            path = Path(handle.name)
        try:
            self.assertIsNone(ps.pages_base_url(path))
        finally:
            path.unlink()
        self.assertIsNone(ps.pages_base_url(Path("/nonexistent/build.mjs")))

    def test_no_base_url_means_no_probe(self):
        """A wrong origin would 404 and read as an outage. Probe nothing."""
        self.assertEqual(ps.pages_probes(rows=[pages_row("live")], base_url=""), [])

    def test_the_real_workflows_produce_one_pages_probe(self):
        probes = ps.pages_probes()
        self.assertEqual(len(probes), 1, "portfolio-pages.yml no longer classifies as publishing")
        self.assertIn(probes[0].expect, {"serves", "gated", ps.UNPREDICTABLE})

    def test_the_real_repository_predicts_nothing_about_the_pages_origin(self):
        """What the two live routes actually add up to today.

        `portfolio-pages.yml` is gated on `PAGES_ENABLED` and `publish-branch.sh`
        stages `gh-pages`, so both routes are real and the account setting
        picks between them. Pinned rather than left to the looser set above
        because this is the state the reporting was getting wrong: if this ever
        goes back to a flat `gated`, a served catalogue starts reading as a
        failed probe again.
        """
        self.assertEqual(ps.pages_probes()[0].expect, ps.UNPREDICTABLE)

    def test_the_pages_origin_is_not_one_of_the_manifest_hosts(self):
        """The point of the addition: it is an origin nothing else reaches."""
        manifest_hosts = {p.url for p in ps.host_probes()}
        self.assertNotIn(ps.pages_probes()[0].url, manifest_hosts)


class ServingTests(unittest.TestCase):
    """What counts as a document, and what only looks like one."""

    def probe_with(self, answers, expect="serves", url=APEX):
        return ps.run_probe(ps.Probe(url=url, expect=expect, why="test"), opener=StubOpener(answers))

    def test_a_200_with_a_real_body_is_serving(self):
        result = self.probe_with({APEX: served()})
        self.assertTrue(result.serving)
        self.assertTrue(result.agrees)

    def test_a_200_with_a_stub_body_is_not_serving(self):
        result = self.probe_with({APEX: (200, b"ok", {})})
        self.assertFalse(result.serving)
        self.assertFalse(result.agrees)

    def test_a_301_is_reported_with_its_target_and_is_not_serving(self):
        result = self.probe_with({APEX: (301, b"", {"Location": TOOLS})})
        self.assertFalse(result.serving)
        self.assertEqual(result.redirected_to, TOOLS)
        self.assertIn(TOOLS, result.summary())

    def test_a_503_is_an_answer_not_an_error(self):
        result = self.probe_with({APEX: (503, b"unavailable", {})})
        self.assertEqual(result.status, 503)
        self.assertEqual(result.error, "")
        self.assertFalse(result.serving)

    def test_an_unreachable_host_is_data_not_an_exception(self):
        result = self.probe_with({})
        self.assertIsNone(result.status)
        self.assertIn("unreachable", result.error)
        self.assertFalse(result.agrees)

    def test_a_gated_host_that_is_dark_agrees(self):
        """The case that must stay green: `tools` is *supposed* to be dark."""
        result = self.probe_with({TOOLS: (503, b"", {})}, expect="gated", url=TOOLS)
        self.assertFalse(result.serving)
        self.assertTrue(result.agrees)

    def test_a_gated_host_that_started_serving_disagrees(self):
        """A seal landing is news too — the report should say so, not hide it."""
        result = self.probe_with({TOOLS: served()}, expect="gated", url=TOOLS)
        self.assertTrue(result.serving)
        self.assertFalse(result.agrees)


class SampleTests(unittest.TestCase):
    def test_sample_is_deterministic(self):
        urls = [f"u{i}" for i in range(100)]
        self.assertEqual(ps.sample(urls, 7), ps.sample(urls, 7))

    def test_sample_spreads_rather_than_taking_the_front(self):
        urls = [f"u{i}" for i in range(100)]
        picked = ps.sample(urls, 5)
        self.assertEqual(len(picked), 5)
        self.assertNotEqual(picked, urls[:5])
        self.assertEqual(picked[0], "u0")

    def test_sample_returns_everything_when_the_limit_exceeds_the_list(self):
        self.assertEqual(ps.sample(["a", "b"], 10), ["a", "b"])

    def test_sample_of_zero_returns_everything(self):
        """`--all` passes 0 through `limit or len(urls)`; guard the raw call."""
        self.assertEqual(ps.sample(["a", "b"], 0), ["a", "b"])


class SitemapTests(unittest.TestCase):
    def test_locs_are_read_from_the_xml(self):
        path = Path(self.enterContext(__import__("tempfile").TemporaryDirectory())) / "sitemap.xml"
        path.write_text(
            "<urlset><url><loc>https://a/</loc></url>"
            "<url><loc>\n  https://b/  \n</loc></url></urlset>",
            encoding="utf-8",
        )
        self.assertEqual(ps.sitemap_urls(path), ["https://a/", "https://b/"])

    def test_a_missing_sitemap_is_empty_not_an_error(self):
        self.assertEqual(ps.sitemap_urls(Path("/nonexistent/sitemap.xml")), [])

    def test_the_committed_apex_sitemap_parses_and_is_not_empty(self):
        urls = ps.sitemap_urls()
        self.assertTrue(urls, "gitops/prod/front-door/sitemap.xml lists no URLs")
        for url in urls:
            self.assertTrue(url.startswith("https://"), url)

    def test_every_sitemap_probe_expects_a_document(self):
        probes = ps.sitemap_probes(limit=3, urls=["https://a/", "https://b/", "https://c/", "https://d/"])
        self.assertEqual(len(probes), 3)
        self.assertTrue(all(p.expect == "serves" for p in probes))


class RenderTests(unittest.TestCase):
    def results(self):
        good = ps.Result(probe=ps.Probe(APEX, "serves", "no unmet Secret"), status=200, body_bytes=9000)
        dark = ps.Result(probe=ps.Probe(TOOLS, "gated", "fails closed on portfolio-site-repo"), status=503)
        return [good, dark]

    def test_agreement_is_stated_plainly(self):
        text = ps.render(self.results(), [])
        self.assertIn("All probes agree", text)
        self.assertNotIn("**NO**", text)

    def test_a_disagreement_is_marked_and_counted(self):
        broken = ps.Result(probe=ps.Probe(APEX, "serves", "no unmet Secret"), status=404)
        text = ps.render([broken], [])
        self.assertIn("**NO**", text)
        self.assertIn("1 probe(s) disagree", text)

    def test_a_broken_sitemap_url_is_listed_by_url(self):
        dead = ps.Result(probe=ps.Probe("https://marisstella.dev/tools/x/", "serves", "sitemap"), status=404)
        text = ps.render([], [dead])
        self.assertIn("/tools/x/", text)
        self.assertIn("0/1 served", text)

    def test_the_report_says_no_credential_was_used(self):
        self.assertIn("No credential", ps.render(self.results(), []))

    def test_json_carries_the_disagreement_count(self):
        payload = json.loads(ps.as_json(self.results(), []))
        self.assertEqual(payload["disagreements"], 0)
        self.assertEqual(len(payload["hosts"]), 2)


class JsonOutTests(unittest.TestCase):
    """`--json-out` is what keeps the workflow from probing the site twice."""

    def test_json_out_writes_the_reading_while_stdout_stays_markdown(self):
        import tempfile
        import unittest.mock

        out = Path(self.enterContext(tempfile.TemporaryDirectory())) / "reading.json"
        with unittest.mock.patch.object(ps, "run_probes", return_value=[]), \
             unittest.mock.patch.object(ps, "sitemap_urls", return_value=[]), \
             unittest.mock.patch("sys.stdout", new_callable=__import__("io").StringIO) as stdout:
            code = ps.main(["--hosts-only", "--json-out", str(out)])
        self.assertEqual(code, 0)
        self.assertIn("hosts", json.loads(out.read_text()))
        self.assertIn("Public surface", stdout.getvalue())


class ExitCodeTests(unittest.TestCase):
    def test_disagreements_are_what_decides_the_exit_code(self):
        ok = ps.Result(probe=ps.Probe(APEX, "serves", "x"), status=200, body_bytes=9000)
        bad = ps.Result(probe=ps.Probe(APEX, "serves", "x"), status=404)
        self.assertEqual(ps.disagreements([ok]), [])
        self.assertEqual(len(ps.disagreements([ok, bad])), 1)


if __name__ == "__main__":
    unittest.main()
