import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import egress_probe as ep  # noqa: E402


class Classify(unittest.TestCase):
    def test_ok(self):
        self.assertEqual(ep.classify(0, "206", ""), ("ok", "206"))

    def test_site_error_is_still_an_answer(self):
        self.assertEqual(ep.classify(0, "404", ""), ("ok", "404"))

    def test_proxy_refusal(self):
        state, _ = ep.classify(56, "000", "curl: (56) CONNECT tunnel failed, response 403\n")
        self.assertEqual(state, "blocked")

    def test_timeout_and_dns(self):
        self.assertEqual(ep.classify(28, "000", "curl: (28) timed out")[1], "timeout")
        self.assertEqual(ep.classify(6, "000", "curl: (6) Could not resolve")[1], "DNS")


class RegistryAndRun(unittest.TestCase):
    def test_registry_is_well_formed(self):
        entries = ep.load_registry()
        hosts = [e["host"] for e in entries]
        self.assertEqual(len(hosts), len(set(hosts)), "duplicate host")
        for e in entries:
            self.assertTrue(ep.url_for(e).startswith("https://"), e)
            if e.get("fallback_probe"):
                self.assertTrue(e.get("fallback"), e)
                self.assertTrue(e.get("source"), "a fallback names where it was verified: %s" % e["host"])
        with open(ep.REGISTRY, encoding="utf-8") as f:
            json.load(f)

    def test_select(self):
        entries = ep.load_registry()
        self.assertEqual([e["host"] for e in ep.select(entries, ["ecfr"])], ["www.ecfr.gov"])
        got = ep.select(entries, ["https://example.org/x"])
        self.assertEqual((got[0]["host"], got[0]["url"]), ("example.org", "https://example.org/x"))
        self.assertEqual(ep.select(entries, ["nosuch.example"])[0]["host"], "nosuch.example")
        self.assertEqual(len(ep.select(entries, [])), len(entries))

    def test_blocked_host_shows_fallback_and_its_probe(self):
        entries = [{"host": "a.gov", "what": "x", "fallback": "use b", "fallback_probe": "https://b/",
                    "source": "somewhere"}, {"host": "c.gov", "fallback": "unused"}]

        def probe(url):
            return ("ok", "200") if url in ("https://b/", "https://c.gov/") else ("blocked", "proxy")

        rows = ep.run(entries, probe=probe, workers=2)
        self.assertEqual(rows[0]["state"], "blocked")
        self.assertEqual(rows[0]["fallback_state"], "ok (200)")
        self.assertNotIn("fallback", rows[1], "a reachable host needs no fallback")
        text = ep.render(rows)
        self.assertIn("-> fallback: use b", text)
        self.assertIn("1 of 2 reachable", text)


if __name__ == "__main__":
    unittest.main()
