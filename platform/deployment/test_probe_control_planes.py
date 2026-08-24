"""The check is what CI runs, so the check is what needs testing.

Its whole job is to fail when the committed measurement stops supporting
README.md's claims. A check that passes on a broken probe is worse than no
check, so the controls are tested in both directions.
"""

import unittest

import probe_control_planes as p


def rec(host, verdict, status=0, group="x"):
    return {"host": host, "verdict": verdict, "status": status,
            "detail": "", "group": group}


def good():
    """A record set that should pass: every host present, controls sane."""
    out = []
    for host, group in p.HOSTS:
        if host == "registry.npmjs.org":
            out.append(rec(host, "reachable", 200, group))
        else:
            out.append(rec(host, "egress_denied", 0, group))
    return out


class CheckTest(unittest.TestCase):
    def test_wellformed_results_pass(self):
        self.assertEqual(p.check(good()), 0)

    def test_missing_host_fails(self):
        self.assertEqual(p.check([r for r in good() if r["host"] != "api.vercel.com"]), 1)

    def test_broken_probe_is_caught(self):
        # Everything denied, including the control that must answer. A blanket
        # denial like this is what a misconfigured probe looks like, and it
        # must not be readable as evidence.
        records = [r for r in good() if r["host"] != "registry.npmjs.org"]
        records.append(rec("registry.npmjs.org", "egress_denied", 0, "control-reachable"))
        self.assertEqual(p.check(records), 1)

    def test_changed_denial_signature_is_caught(self):
        records = [r for r in good() if r["host"] != "example.com"]
        records.append(rec("example.com", "reachable", 200, "control-denied"))
        self.assertEqual(p.check(records), 1)

    def test_a_reachable_write_surface_fails_the_claim(self):
        # If egress policy later opens up, README.md's "a session cannot stop a
        # runaway deploy from here" stops being true and must be rewritten.
        records = [r for r in good() if r["host"] != "api.cloudflare.com"]
        records.append(rec("api.cloudflare.com", "reachable", 200, "cloudflare"))
        self.assertEqual(p.check(records), 1)

    def test_committed_results_match_the_document(self):
        self.assertEqual(p.check(p.load(p.DEFAULT_RESULTS)), 0)


if __name__ == "__main__":
    unittest.main()
