"""The check is what CI runs, so the check is what needs testing.

Its job is to fail when the consolidated egress table stops supporting
README.md's claim about reachability from a session. That claim is deliberately
*not* blanket: `cloudresourcemanager.googleapis.com` is a reachable write API
and is permitted by name, so the suite pins both halves -- everything else must
be denied, and the exception must still be reachable. A check that passes on a
broken measurement is worse than no check, so the controls and the exception
are both tested in each direction.
"""

import unittest

import probe_control_planes as p


def entry(verdict, disputed=False, tied=False):
    """A table entry in the shape `prior-verdicts.json` actually uses."""
    return {"prior_consensus": verdict, "prior_disputed": disputed,
            "prior_tied": tied, "n_observations": 2}


def table(**overrides):
    """A consolidated-table `hosts` mapping that should pass."""
    hosts = {h: entry("egress_denied") for h in p.ALL_HOSTS}
    # The documented exceptions are reachable in the real table; a fixture that
    # denied them would not be the state this check is asserting about.
    for h in p.EXPECTED_REACHABLE:
        hosts[h] = entry("reachable")
    hosts[p.CONTROL_REACHABLE] = entry("reachable")
    hosts[p.CONTROL_DENIED] = entry("egress_denied")
    for host, verdict in overrides.items():
        hosts[host] = entry(verdict)
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
            if host in p.EXPECTED_REACHABLE:
                continue
            with self.subTest(host=host):
                self.assertEqual(p.check(table(**{host: "error"})), 1)

    def test_a_documented_exception_is_allowed_to_answer(self):
        # GCP's Resource Manager really is reachable. The check has to survive
        # that without being loosened for everything else.
        for host in p.EXPECTED_REACHABLE:
            with self.subTest(host=host):
                self.assertEqual(p.check(table(**{host: "reachable"})), 0)

    def test_an_exception_going_quiet_is_drift_too(self):
        # If a host documented as reachable starts being denied, the document
        # describes a world that has moved and should say so.
        for host in p.EXPECTED_REACHABLE:
            with self.subTest(host=host):
                self.assertEqual(p.check(table(**{host: "egress_denied"})), 1)

    def test_an_exception_with_no_usable_measurement_fails(self):
        # `error` is neither reachable nor denied. Excluding exceptions from the
        # denied-surface rule must not also excuse them from having evidence.
        for host in p.EXPECTED_REACHABLE:
            for verdict in ("error", "scope_denied", ""):
                with self.subTest(host=host, verdict=verdict):
                    self.assertEqual(p.check(table(**{host: verdict})), 1)

    def test_a_reachable_write_api_is_not_filed_as_context(self):
        # The first draft put GCP's Resource Manager -- projects.create,
        # setIamPolicy -- in the context bucket, where its reachability could
        # not fail the claim. Regression test for that specific shuffle.
        self.assertNotIn("cloudresourcemanager.googleapis.com", p.CONTEXT_HOSTS)
        self.assertIn("cloudresourcemanager.googleapis.com", p.WRITE_SURFACES)

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
            if host in p.EXPECTED_REACHABLE:
                continue
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

    def test_disputed_write_surface_is_not_usable_evidence(self):
        # The table records a *conservative* consensus, so one new reachable
        # observation against existing denials leaves consensus at
        # egress_denied and flips prior_disputed -- precisely when a write
        # surface has started answering.
        for host in p.WRITE_SURFACES:
            with self.subTest(host=host):
                hosts = table()
                hosts[host] = entry(
                    "reachable" if host in p.EXPECTED_REACHABLE else "egress_denied",
                    disputed=True,
                )
                self.assertEqual(p.check(hosts), 1)

    def test_tied_evidence_is_rejected_too(self):
        hosts = table()
        hosts["api.vercel.com"] = entry("egress_denied", tied=True)
        self.assertEqual(p.check(hosts), 1)

    def test_disputed_control_is_rejected(self):
        for control in (p.CONTROL_REACHABLE, p.CONTROL_DENIED):
            with self.subTest(control=control):
                hosts = table()
                hosts[control] = entry(
                    "reachable" if control == p.CONTROL_REACHABLE else "egress_denied",
                    disputed=True,
                )
                self.assertEqual(p.check(hosts), 1)

    def test_disputed_context_host_does_not_fail(self):
        # Only the hosts the claim rests on are held to this. A disputed
        # dashboard root is noise, not evidence about the argument.
        hosts = table()
        hosts["portal.azure.com"] = entry("reachable", disputed=True)
        self.assertEqual(p.check(hosts), 0)

    def test_committed_table_supports_the_document(self):
        self.assertEqual(p.check(p.load_table()), 0)

    def test_no_second_host_table_is_committed(self):
        # The point of reading prior-verdicts.json is that this directory keeps
        # no table of its own. A stray results file here would be the tenth.
        self.assertEqual(sorted(x.name for x in p.HERE.glob("results-*.json")), [])


if __name__ == "__main__":
    unittest.main()
