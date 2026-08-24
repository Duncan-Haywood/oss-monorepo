"""The check is what CI runs, so the check is what needs testing.

Its job is to fail when the consolidated egress table stops supporting
README.md's claim that no vendor control plane is reachable from a session. A
check that passes on a broken measurement is worse than no check, so both
controls are tested in each direction.
"""

import unittest

import probe_control_planes as p


def table(**overrides):
    """A consolidated-table `hosts` mapping that should pass."""
    hosts = {h: {"prior_consensus": "egress_denied"} for h in p.ALL_HOSTS}
    hosts[p.CONTROL_REACHABLE] = {"prior_consensus": "reachable"}
    hosts[p.CONTROL_DENIED] = {"prior_consensus": "egress_denied"}
    for host, verdict in overrides.items():
        hosts[host] = {"prior_consensus": verdict}
    return hosts


class CheckTest(unittest.TestCase):
    def test_wellformed_table_passes(self):
        self.assertEqual(p.check(table()), 0)

    def test_an_error_verdict_does_not_support_the_claim(self):
        # Absence of an answer is not evidence of a denial. A probe that failed
        # for its own reasons must not read as "the vendor is unreachable".
        self.assertEqual(p.check(table(**{"api.vercel.com": "error"})), 1)

    def test_every_write_surface_must_be_egress_denied(self):
        for host in p.WRITE_SURFACES:
            with self.subTest(host=host):
                self.assertEqual(p.check(table(**{host: "error"})), 1)

    def test_railway_is_in_the_load_bearing_set(self):
        # It is the document's runner-up; a check that omits it cannot support
        # the all-vendor claim. Regression test for that omission.
        self.assertTrue(
            any("railway" in v for v in p.WRITE_SURFACES.values()),
            "Railway has no write surface in the load-bearing set",
        )

    def test_reachable_write_surface_fails_the_claim(self):
        # If egress policy later opens up, README.md's "a session cannot stop a
        # runaway deploy from here" stops being true and must be rewritten.
        self.assertEqual(p.check(table(**{"api.vercel.com": "reachable"})), 1)

    def test_every_write_surface_is_load_bearing(self):
        for host in p.WRITE_SURFACES:
            with self.subTest(host=host):
                self.assertEqual(p.check(table(**{host: "reachable"})), 1)

    def test_reachable_context_host_does_not_fail(self):
        # portal.azure.com really does answer 200. A dashboard root is not an
        # API a deploy calls, so it must not be read as refuting the claim.
        self.assertEqual(p.check(table(**{"portal.azure.com": "reachable"})), 0)

    def test_broken_probe_is_caught(self):
        # Everything denied, including the control that must answer -- what a
        # misconfigured probe looks like. It must not read as evidence.
        hosts = table()
        hosts[p.CONTROL_REACHABLE] = {"prior_consensus": "egress_denied"}
        self.assertEqual(p.check(hosts), 1)

    def test_changed_denial_signature_is_caught(self):
        hosts = table()
        hosts[p.CONTROL_DENIED] = {"prior_consensus": "reachable"}
        self.assertEqual(p.check(hosts), 1)

    def test_host_dropped_from_the_table_is_caught(self):
        # --probe iterates the committed table, so a host that falls out of it
        # is never re-measured; silence must not read as denial.
        hosts = table()
        del hosts["api.cloudflare.com"]
        self.assertEqual(p.check(hosts), 1)

    def test_committed_table_supports_the_document(self):
        self.assertEqual(p.check(p.load_table()), 0)

    def test_no_second_host_table_is_committed(self):
        # The point of reading prior-verdicts.json is that this directory keeps
        # no table of its own. A stray results file here would be the tenth.
        self.assertEqual(sorted(x.name for x in p.HERE.glob("results-*.json")), [])


if __name__ == "__main__":
    unittest.main()
