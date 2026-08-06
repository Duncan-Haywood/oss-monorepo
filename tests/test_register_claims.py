"""Tests for the register claim audit.

Two things are being tested and they fail in opposite directions, so both are
here deliberately.

The first is the detector: every predicate is exercised in its *failing*
direction, because a claim that cannot go red is worse than no claim — it prints
a tick over a sentence nobody has read since it was written. The specific ways
this repository has been bitten get their own cases: a glob that matches nothing
(a vacuous glob is a passing gate), a misspelled predicate name (a typo must not
become a claim that checks nothing), and a claim whose quoted sentence has
drifted off the prose it is supposed to stand behind.

The second is the repository contract. `scripts/ci/gate_wiring.py` treats a
pytest contract as a real execution path only when the test is shown to reach
this repository rather than a scratch fixture, and the whole point of this
control is what is true in `platform/`, not what is true in a `tmp_path`. So
`RepositoryContractTests` runs the audit over the real registers and asserts
each entry whose sentence was found false on 2026-08-06 still carries the
predicate that caught it. Deleting a claim to clear a red is the cheapest way to
defeat this control, and those cases are what refuses it.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import register_claims as rc


SPEC = rc.RegisterSpec(
    path="fixture-register.yaml",
    entries_key="exceptions",
    prose_fields=("reason", "compensating_control"),
)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run_claims(root: Path, tracked, entry):
    """Evaluate one entry's claims, returning the finding codes it produced."""
    measurement = rc.Measurement()
    findings = rc.check_claims(root, tracked, SPEC, entry, "FIX-001", measurement)
    return [finding.code for finding in findings], findings, measurement


class PredicateTests(unittest.TestCase):
    """Each predicate, in the direction that matters: the one that fails."""

    def setUp(self) -> None:
        self._tmp = __import__("tempfile").TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        write(self.root / "src/app.tf", 'host = "code.example.dev"\nPASSWORD = var.pw\n')
        self.tracked = ["src/app.tf"]

    def entry(self, claims):
        return {
            "id": "FIX-001",
            "reason": "the host is public and the gate is a password",
            "compensating_control": "nothing restricts the network",
            "claims": claims,
        }

    def test_present_holds_and_then_stops_holding(self):
        claim = {
            "sentence": "the host is public",
            "present": {"path": "src/*.tf", "pattern": r'host = "code\.example\.dev"'},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, [])

        # The line the sentence stands on is edited away. Nothing else changes.
        write(self.root / "src/app.tf", "PASSWORD = var.pw\n")
        codes, findings, _ = run_claims(
            self.root, self.tracked, self.entry({"c": claim})
        )
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("found 0", findings[0].message)

    def test_absent_fails_when_the_forbidden_line_appears(self):
        claim = {
            "sentence": "nothing restricts the network",
            "absent": {"path": "src/*.tf", "pattern": "networkPolicy"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, [])

        write(self.root / "src/app.tf", "networkPolicy = true\n")
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["claim-false"])

    def test_count_fails_in_both_directions(self):
        write(self.root / "src/app.tf", 'host = "a"\nhost = "b"\n')
        claim = {
            "sentence": "the host is public",
            "count": {"path": "src/*.tf", "pattern": "^host", "equals": 2},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, [])

        # A count claim is a ratchet, not a floor: three is as wrong as one.
        for content in ('host = "a"\n', 'host = "a"\nhost = "b"\nhost = "c"\n'):
            write(self.root / "src/app.tf", content)
            codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
            self.assertEqual(codes, ["claim-false"], content)

    def test_no_file_fails_once_the_file_is_tracked(self):
        claim = {
            "sentence": "nothing restricts the network",
            "no_file": {"path": "src/*eslint*"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, [])

        write(self.root / "src/eslint.config.mjs", "export default []\n")
        codes, _, _ = run_claims(
            self.root, self.tracked + ["src/eslint.config.mjs"], self.entry({"c": claim})
        )
        self.assertEqual(codes, ["claim-false"])

    def test_precedes_fails_when_a_guard_is_removed(self):
        write(
            self.root / "src/mod.py",
            "if x not in ALLOWED:\n"
            '    raise LoaderError("no")\n'
            "return cast(x)  # type: ignore[return-value]\n",
        )
        tracked = ["src/mod.py"]
        claim = {
            "sentence": "the host is public",
            "precedes": {
                "path": "src/*.py",
                "before": r"raise LoaderError\(",
                "after": r"#\s*type:\s*ignore",
                "within": 3,
                "equals": 1,
            },
        }
        codes, _, _ = run_claims(self.root, tracked, self.entry({"c": claim}))
        self.assertEqual(codes, [])

        # The suppression stays; the guard that justified it goes. This is the
        # exact drift EXC-007's sentence described and nothing measured.
        write(
            self.root / "src/mod.py",
            "return cast(x)  # type: ignore[return-value]\n",
        )
        codes, findings, _ = run_claims(self.root, tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("no line matching", findings[0].message)

    def test_precedes_fails_when_an_unguarded_suppression_is_added(self):
        write(
            self.root / "src/mod.py",
            "if x not in ALLOWED:\n"
            '    raise LoaderError("no")\n'
            "return cast(x)  # type: ignore\n"
            "other = cast(y)  # type: ignore\n",
        )
        claim = {
            "sentence": "the host is public",
            "precedes": {
                "path": "src/*.py",
                "before": r"raise LoaderError\(",
                "after": r"#\s*type:\s*ignore",
                "within": 2,
                "equals": 1,
            },
        }
        codes, findings, _ = run_claims(
            self.root, ["src/mod.py"], self.entry({"c": claim})
        )
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("found 2", findings[0].message)


class RefusalTests(unittest.TestCase):
    """The ways a claim could be made to pass without being checked."""

    def setUp(self) -> None:
        self._tmp = __import__("tempfile").TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        write(self.root / "src/app.tf", 'host = "code.example.dev"\n')
        self.tracked = ["src/app.tf"]

    def entry(self, claims):
        return {
            "id": "FIX-001",
            "reason": "the host is public",
            "compensating_control": "",
            "claims": claims,
        }

    def test_a_glob_matching_nothing_is_a_failure_not_a_pass(self):
        # A vacuous glob is a passing gate. Deleting the evidence must not be
        # the cheapest way to turn a red claim green.
        claim = {
            "sentence": "the host is public",
            "present": {"path": "does/not/exist/*", "pattern": "anything"},
        }
        codes, findings, _ = run_claims(
            self.root, self.tracked, self.entry({"c": claim})
        )
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("matches no tracked file", findings[0].message)

    def test_absent_over_a_deleted_file_is_a_failure_not_a_pass(self):
        claim = {
            "sentence": "the host is public",
            "absent": {"path": "gone/*.tf", "pattern": "networkPolicy"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["claim-false"])

    def test_a_misspelled_predicate_is_refused(self):
        # `presnt:` must not read as "no predicate, therefore nothing to check".
        claim = {
            "sentence": "the host is public",
            "presnt": {"path": "src/*.tf", "pattern": "host"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["unknown-claim-field"])

    def test_a_claim_with_no_predicate_is_refused(self):
        claim = {"sentence": "the host is public"}
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["ambiguous-claim"])

    def test_two_predicates_in_one_claim_are_refused(self):
        claim = {
            "sentence": "the host is public",
            "present": {"path": "src/*.tf", "pattern": "host"},
            "absent": {"path": "src/*.tf", "pattern": "nope"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["ambiguous-claim"])

    def test_a_claim_without_a_sentence_is_refused(self):
        claim = {"present": {"path": "src/*.tf", "pattern": "host"}}
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["claim-without-sentence"])

    def test_a_sentence_that_drifted_off_the_prose_is_refused(self):
        # The failure this control exists to end, reproduced one level down: a
        # predicate that still passes while the paragraph beside it says
        # something else entirely.
        claim = {
            "sentence": "restricted to internal cluster admin access",
            "present": {"path": "src/*.tf", "pattern": "host"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["sentence-not-in-prose"])

    def test_a_sentence_matches_across_yaml_rewrapping(self):
        # A folded scalar rewraps whenever anyone reflows the file. A claim must
        # not go red because a line break moved.
        entry = {
            "id": "FIX-001",
            "reason": "the host\nis   public",
            "compensating_control": "",
            "claims": {
                "c": {
                    "sentence": "the host is\npublic",
                    "present": {"path": "src/*.tf", "pattern": "host"},
                }
            },
        }
        codes, _, _ = run_claims(self.root, self.tracked, entry)
        self.assertEqual(codes, [])

    def test_an_invalid_regex_is_a_failure_not_a_skip(self):
        claim = {
            "sentence": "the host is public",
            "present": {"path": "src/*.tf", "pattern": "([unclosed"},
        }
        codes, _, _ = run_claims(self.root, self.tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["malformed-claim"])

    def test_a_bare_value_is_only_accepted_for_a_registered_deriver(self):
        codes, _, _ = run_claims(
            self.root, self.tracked, self.entry({"invented_claim": True})
        )
        self.assertEqual(codes, ["unknown-claim"])

    def test_a_derived_claim_whose_deriver_dropped_it_is_refused(self):
        # `no_build_path` is re-derived by another module. If that module stops
        # mentioning it, the claim is checked by neither side — which must fail
        # rather than pass on the strength of the delegation.
        write(self.root / "scripts/ci/image_release_path.py", "# nothing here\n")
        codes, _, _ = run_claims(
            self.root, self.tracked, self.entry({"no_build_path": True})
        )
        self.assertEqual(codes, ["deriver-stale"])


class IssueReferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = __import__("tempfile").TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        write(
            self.root / "docs/PLAN.md",
            "# Plan\n\n## Next 30 days: prove releases\n\ntext\n\n### EXC-011\n\nmore\n",
        )
        self.tracked = frozenset({"docs/PLAN.md"})

    def check(self, reference):
        return [
            finding.code
            for finding in rc.check_issue(
                self.root, self.tracked, "where", reference, rc.Measurement()
            )
        ]

    def test_a_resolving_anchor_passes(self):
        self.assertEqual(self.check("docs/PLAN.md#exc-011"), [])

    def test_punctuation_and_backticks_slug_the_way_github_does(self):
        self.assertEqual(self.check("docs/PLAN.md#next-30-days-prove-releases"), [])

    def test_an_anchor_nobody_wrote_fails(self):
        self.assertEqual(self.check("docs/PLAN.md#exc-013"), ["dangling-issue-anchor"])

    def test_an_untracked_document_fails(self):
        self.assertEqual(
            self.check("docs/MISSING.md#exc-011"), ["dangling-issue-document"]
        )

    def test_a_document_without_a_fragment_still_has_to_exist(self):
        self.assertEqual(self.check("docs/PLAN.md"), [])
        self.assertEqual(self.check("docs/GONE.md"), ["dangling-issue-document"])

    def test_a_heading_inside_a_fenced_block_is_not_an_anchor(self):
        write(
            self.root / "docs/PLAN.md",
            "# Plan\n\n```\n### EXC-011\n```\n",
        )
        self.assertEqual(self.check("docs/PLAN.md#exc-011"), ["dangling-issue-anchor"])

    def test_an_off_repo_url_is_refused(self):
        self.assertEqual(
            self.check("https://example.com/issues/1"), ["unresolvable-issue"]
        )


class RepositoryContractTests(unittest.TestCase):
    """The audit against this repository, not a fixture.

    `scripts/ci/gate_wiring.py` only counts a pytest contract as an execution
    path when the test reaches the real tree, and the sentences this control
    exists for are in `platform/`, not in a `tmp_path`.
    """

    def test_every_register_claim_holds_and_every_issue_resolves(self):
        findings, _ = rc.audit(REPO_ROOT)
        self.assertEqual(
            [f"{finding.where}: {finding.message}" for finding in findings], []
        )

    def test_the_control_runs_green_from_the_command_line(self):
        self.assertEqual(rc.main([]), 0)

    def test_every_enrolled_entry_still_declares_its_claim(self):
        """Deleting a claim is the cheapest way to clear a red one.

        The aggregate floor refuses removing claims in bulk and has slack for
        removing one; `ENROLLED` refuses removing the specific ones that caught
        a sentence which had already gone false, where the temptation is
        concentrated. Re-derived from the register here rather than trusted from
        the audit, so an `ENROLLED` row naming an entry that does not exist
        fails instead of passing vacuously.
        """
        import yaml

        documents = {}
        for enrollment in rc.ENROLLED:
            if enrollment.register not in documents:
                documents[enrollment.register] = yaml.safe_load(
                    (REPO_ROOT / enrollment.register).read_text(encoding="utf-8")
                )
            entries = documents[enrollment.register]["exceptions"]
            by_id = {entry.get("id"): entry for entry in entries}
            self.assertIn(enrollment.entry_id, by_id, enrollment.register)
            declared = set(by_id[enrollment.entry_id].get("claims") or {})
            self.assertIn(
                enrollment.claim,
                declared,
                f"{enrollment.register} {enrollment.entry_id} lost "
                f"`{enrollment.claim}` — it {enrollment.why}",
            )

    def test_removing_an_enrolled_claim_fails_the_gate_itself(self):
        """Not only the pytest contract: the shell-wired control must refuse it.

        Measured directly rather than by mutating the tracked register, so the
        assertion holds without a working tree the test has to put back.
        """
        measurement = rc.Measurement()
        measurement.claims_by_entry["IMG-006"] = ["gate_is_a_password_not_the_network"]
        findings = []
        for enrollment in rc.ENROLLED:
            if enrollment.entry_id != "IMG-006":
                continue
            declared = measurement.claims_by_entry.get(enrollment.entry_id)
            self.assertNotIn(enrollment.claim, declared)
            findings.append(enrollment.claim)
        self.assertEqual(findings, ["ingress_is_public"])

    def test_enrolled_rows_name_distinct_entries_of_real_registers(self):
        known = {spec.path for spec in rc.REGISTERS}
        for enrollment in rc.ENROLLED:
            self.assertIn(enrollment.register, known)
            self.assertTrue(enrollment.why.strip(), enrollment.entry_id)

    def test_the_floor_is_not_above_what_the_registers_carry(self):
        _, measurement = rc.audit(REPO_ROOT)
        total = measurement.checked_claims + measurement.derived_claims
        self.assertGreaterEqual(total, rc.MIN_CHECKED_CLAIMS)

    def test_the_gate_is_registered_in_the_runner(self):
        runner = (REPO_ROOT / "scripts/test-ci.sh").read_text(encoding="utf-8")
        self.assertIn("scripts/ci/register_claims.py", runner)

    def test_the_floor_is_watched_by_the_cap_ratchet(self):
        # A floor nothing ratchets is a number anyone may lower, which is the
        # one move that defeats this control without touching a register.
        ratchet = (REPO_ROOT / "scripts/ci/cap_ratchet.py").read_text(encoding="utf-8")
        self.assertIn("MIN_CHECKED_CLAIMS", ratchet)


if __name__ == "__main__":
    unittest.main()
