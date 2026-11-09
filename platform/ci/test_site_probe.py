"""Tests for site_probe.py: probing against a local server, and the summary."""
import http.server
import json
import os
import sys
import ssl
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import site_probe  # noqa: E402


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/version.json":
            body = b'{"sha": "0123456789abcdef", "built_at": "2026-11-07T00:00:00Z"}'
            self.send_response(200)
        elif self.path == "/down":
            body = b"error code: 1027"
            self.send_response(503)
        else:
            body = b"hello"
            self.send_response(200)
            self.send_header("cf-cache-status", "HIT")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class PlainProbe(unittest.TestCase):
    """probe_one over plain HTTP: swap the TLS wrap for a no-op."""

    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def probe(self, path):
        class NoTLS:
            # http.client reads verify_mode and check_hostname off the context.
            verify_mode = ssl.CERT_NONE
            check_hostname = False

            def wrap_socket(self, sock, server_hostname=None):
                return sock
        with mock.patch.dict(os.environ, {"HTTPS_PROXY": "", "https_proxy": ""}):
            return site_probe.probe_one(f"http://127.0.0.1:{self.port}", path, ctx=NoTLS())

    def test_ok(self):
        r = self.probe("/")
        self.assertEqual(r["status"], 200)
        self.assertEqual(r["bytes"], 5)
        self.assertEqual(r["cache"], "HIT")
        self.assertIsNone(r["error"])
        for k in ("connect", "tls", "ttfb", "total"):
            self.assertIsNotNone(r[k], k)
        self.assertLessEqual(r["connect"], r["ttfb"])
        self.assertLessEqual(r["ttfb"], r["total"])
        self.assertTrue(site_probe.is_ok(r))

    def test_version_sha_is_kept(self):
        self.assertEqual(self.probe("/version.json")["sha"], "0123456789ab")

    def test_cloudflare_error_is_recorded(self):
        r = self.probe("/down")
        self.assertEqual(r["status"], 503)
        self.assertIn("1027", r["error"])
        self.assertFalse(site_probe.is_ok(r))

    def test_refused_connection_is_a_record_not_an_exception(self):
        with mock.patch.dict(os.environ, {"HTTPS_PROXY": "", "https_proxy": ""}):
            r = site_probe.probe_one("https://127.0.0.1:1", "/", timeout=2)
        self.assertIsNone(r["status"])
        self.assertTrue(r["error"])
        self.assertFalse(site_probe.is_ok(r))


class Proxy(unittest.TestCase):
    def test_bare_host_proxy_defaults_to_port_80(self):
        with mock.patch.dict(os.environ, {"HTTPS_PROXY": "proxy.test"}, clear=True):
            self.assertEqual(site_probe._proxy_for("marisstella.app"), ("proxy.test", 80))
        with mock.patch.dict(os.environ, {"HTTPS_PROXY": "proxy.test:3128"}, clear=True):
            self.assertEqual(site_probe._proxy_for("marisstella.app"), ("proxy.test", 3128))

    def test_is_ok_status_boundaries(self):
        ok = lambda s: site_probe.is_ok({"status": s, "total": 0.1})
        self.assertTrue(ok(200) and ok(399))
        # a missing total counts as 0 s, so even a tight budget leaves it up
        self.assertTrue(site_probe.is_ok({"status": 200}, slow=0.5))
        self.assertFalse(ok(199) or ok(400) or ok(None))

    def test_no_proxy_match(self):
        env = {"HTTPS_PROXY": "http://127.0.0.1:3128", "NO_PROXY": "localhost,.example.com"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(site_probe._proxy_for("marisstella.app"), ("127.0.0.1", 3128))
            self.assertIsNone(site_probe._proxy_for("a.example.com"))
            self.assertIsNone(site_probe._proxy_for("localhost"))
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(site_probe._proxy_for("marisstella.app"))


class ProbeCli(unittest.TestCase):
    def test_probe_exits_zero_when_the_site_is_down(self):
        # Documented: a probe records an outage, it does not fail on one.
        import io
        import contextlib
        with mock.patch.dict(os.environ, {"HTTPS_PROXY": "", "https_proxy": ""}):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(site_probe.main(["probe", "--url", "https://127.0.0.1:1", "--quiet"]), 0)


class Summary(unittest.TestCase):
    def recs(self):
        base = {"group": "static", "path": "/", "cache": "HIT", "error": None}
        out = []
        for i, total in enumerate([0.1, 0.2, 0.3, 0.4, 5.0]):
            out.append({**base, "t": f"2026-11-07T00:0{i}:00Z", "status": 200, "ttfb": total / 2, "total": total})
        out.append({**base, "t": "2026-11-07T00:06:00Z", "status": 503, "ttfb": 0.1, "total": 0.1, "error": "x"})
        out.append({**base, "t": "2026-11-07T00:07:00Z", "status": None, "ttfb": None, "total": 20.0,
                    "error": "TimeoutError: timed out"})
        out.append({**base, "path": "/writing/", "group": "shard", "t": "2026-11-07T00:08:00Z",
                    "status": 200, "ttfb": 0.2, "total": 0.3, "cache": "MISS"})
        return out

    def test_availability_and_failure_kinds(self):
        s = {row["path"]: row for row in site_probe.summarise(self.recs())}
        root = s["/"]
        self.assertEqual(root["n"], 7)
        self.assertEqual(root["ok"], 4)
        self.assertEqual(root["failures"], {"HTTP 503": 1, "TimeoutError": 1, "over 3 s": 1})
        # The timed-out request has no status, so it is not in the latency figures.
        self.assertEqual(root["total_max"], 5.0)
        self.assertEqual(s["/writing/"]["cache_miss_share"], 1.0)

    def test_exactly_at_the_slow_threshold_is_up(self):
        # is_ok counts total <= slow as up, so the failure tally must not call
        # a request that took exactly `slow` seconds "over" it.
        rec = {"group": "static", "path": "/", "t": "2026-11-07T00:00:00Z",
               "status": 200, "ttfb": 1.0, "total": 3.0, "cache": "HIT", "error": None}
        row = site_probe.summarise([rec], slow=3.0)[0]
        self.assertEqual(row["ok"], 1)
        self.assertEqual(row["failures"], {})

    def test_since_filters_the_window(self):
        s = site_probe.summarise(self.recs(), since="2026-11-07T00:06:00")
        self.assertEqual({r["path"]: r["n"] for r in s}, {"/": 2, "/writing/": 1})

    def test_percentile(self):
        self.assertIsNone(site_probe.percentile([], 50))
        self.assertEqual(site_probe.percentile([1, 2, 3, 4], 50), 2)
        self.assertEqual(site_probe.percentile(list(range(1, 101)), 95), 95)
        self.assertEqual(site_probe.percentile([7], 95), 7)

    def test_render_and_report_cli(self):
        text = site_probe.render(site_probe.summarise(self.recs()))
        self.assertIn("all paths: 5/8 ok", text)
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            for r in self.recs():
                f.write(json.dumps(r) + "\n")
            f.write("not json\n")
        try:
            self.assertEqual(site_probe.main(["report", f.name]), 0)
        finally:
            os.unlink(f.name)


if __name__ == "__main__":
    unittest.main()
