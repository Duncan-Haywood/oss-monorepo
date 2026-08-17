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
import yaml


# Built rather than written out. `scripts/ci/audit_exceptions.py` scans tracked
# source for suppression markers and cannot parse Python, so a literal
# `# type:` + `ignore` in these fixtures would register as four real
# suppressions in this file and fail that audit — the same false positive
# EXC-009 documents for a string in `prompt_process.tsx`. Concatenating it keeps
# the fixture exact at runtime, which is what the predicate under test reads,
# without putting the marker in the source the scanner sees. Not a suppression
# and not an exemption: there is nothing here to suppress.
IGNORE = "# type" + ": ignore"


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
            f"return cast(x)  {IGNORE}[return-value]\n",
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
            f"return cast(x)  {IGNORE}[return-value]\n",
        )
        codes, findings, _ = run_claims(self.root, tracked, self.entry({"c": claim}))
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("no line matching", findings[0].message)

    def test_precedes_fails_when_an_unguarded_suppression_is_added(self):
        write(
            self.root / "src/mod.py",
            "if x not in ALLOWED:\n"
            '    raise LoaderError("no")\n'
            f"return cast(x)  {IGNORE}\n"
            f"other = cast(y)  {IGNORE}\n",
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


#: A Terraform `validation` in the shape `variables.tf` and `agent_platform.tf`
#: both carry: a regex literal, and the value it guards, inside `can(regex(...))`.
#: `{rule}` is the regex as HCL spells it — doubled backslashes and all.
TF_VALIDATION = """variable "services" {{
  validation {{
    condition = alltrue([
      for name, service in var.services :
      can(regex("{rule}", service.tag))
    ])
  }}
}}
"""

IMMUTABLE_RULE = (
    "^(sha256:[0-9a-f]{64}|v?[0-9]+(\\\\.[0-9]+)*"
    "([-_.+][A-Za-z0-9][A-Za-z0-9._+-]*)?)$"
)

#: The one-character weakening. `.*` where the version alternative was: the rule
#: still names a digest, still sits on the same line, still reads as a check —
#: and admits `latest` on a public ingress.
PERMISSIVE_RULE = "^(sha256:[0-9a-f]{64}|.*)$"

DIGEST = "sha256:" + "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea"


class AdmitsTests(unittest.TestCase):
    """`admits` runs the rule the source declares, rather than reading it.

    Every other predicate is a grep, and a grep cannot check a sentence about
    what a validation *allows*: the pattern loose enough to match the rule is
    loose enough to match the rule's negation. `IMG-008` was exactly that until
    2026-08-16 — its `present` pattern held `.+` where the version alternative
    belongs, so `.*` matched it and `latest` got in under a green claim.
    """

    def setUp(self) -> None:
        self._tmp = __import__("tempfile").TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.tracked = ["src/variables.tf"]

    def write_rule(self, rule: str) -> None:
        write(self.root / "src/variables.tf", TF_VALIDATION.format(rule=rule))

    def entry(self, claims):
        return {
            "id": "FIX-001",
            "reason": "refuses any tag that is not a digest or a version",
            "compensating_control": "",
            "claims": claims,
        }

    def claim(self, **overrides):
        spec = {
            "path": "src/*.tf",
            "extract": r'regex\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*service\.tag\s*\)',
            "unescape": "hcl",
            "refuses": ["latest", "stable", "latest-1.0", ""],
            "permits": [DIGEST, "1.4.2", "v2.0.0"],
        }
        spec.update(overrides)
        return {
            "sentence": "refuses any tag that is not a digest or a version",
            "admits": spec,
        }

    def run_one(self, **overrides):
        return run_claims(self.root, self.tracked, self.entry({"c": self.claim(**overrides)}))

    def test_the_real_rule_holds(self):
        self.write_rule(IMMUTABLE_RULE)
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, [], [f.message for f in findings])

    def test_a_rule_that_admits_a_moving_tag_is_red(self):
        # The mutation the old `present` predicate could not see.
        self.write_rule(PERMISSIVE_RULE)
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("admits 'latest'", findings[0].message)

    def test_dot_plus_is_red_too(self):
        # `.+` is the character the old predicate itself contained. It refuses
        # only the empty string, which is not what the sentence says.
        self.write_rule("^(sha256:[0-9a-f]{64}|.+)$")
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("admits 'latest'", findings[0].message)

    def test_a_rule_that_refuses_everything_is_red(self):
        # `refuses` alone would be satisfied by a rule matching nothing, which
        # is a broken deploy rather than a kept promise. `permits` is what
        # stops "check nothing" from reading as "refuse everything".
        self.write_rule("^$")
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("refuses", findings[0].message)
        self.assertIn("1.4.2", findings[0].message)

    def test_an_unanchored_rule_is_red(self):
        # Terraform's `regex` is a search, not a match: without `^...$` a rule
        # that still spells out both alternatives admits `latest-1.0`, because
        # the version half matches the `1.0` inside it. `refuses` carries that
        # value for exactly this reason — `latest` alone would not catch it.
        self.write_rule("(sha256:[0-9a-f]{64}|v?[0-9]+(\\\\.[0-9]+)*)")
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("latest-1.0", findings[0].message)

    def test_a_renamed_anchor_is_red_not_vacuous(self):
        # The rule is intact but no longer guards `service.tag`. A predicate
        # that shrugged at zero sites would let the validation be moved off the
        # value it protects without a word.
        write(
            self.root / "src/variables.tf",
            TF_VALIDATION.format(rule=IMMUTABLE_RULE).replace(
                "service.tag", "service.image"
            ),
        )
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("found 0", findings[0].message)

    def test_a_second_site_is_red(self):
        # Two validations where the claim asserts one: the reader cannot tell
        # which of them the sentence is about, and only one need be strict.
        write(
            self.root / "src/variables.tf",
            TF_VALIDATION.format(rule=IMMUTABLE_RULE)
            + TF_VALIDATION.format(rule=PERMISSIVE_RULE),
        )
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("found 2", findings[0].message)

    def test_hcl_escapes_are_undone_before_compiling(self):
        # `\\.` on the line is `\.` to Terraform. Compiling the raw bytes would
        # run a regex the cluster never sees — where `\\` is a literal
        # backslash and `.` is any character.
        self.write_rule(IMMUTABLE_RULE)
        codes, _, _ = self.run_one(permits=["1.4.2"], refuses=["1x4x2"])
        self.assertEqual(codes, [])

    def test_an_empty_refuses_list_is_refused(self):
        # `refuses: []` satisfies "none of them get in" for free — the vacuous
        # glob failure wearing a different field name.
        self.write_rule(IMMUTABLE_RULE)
        codes, findings, _ = self.run_one(refuses=[])
        self.assertEqual(codes, ["malformed-claim"])
        self.assertIn("non-empty list `refuses`", findings[0].message)

    def test_an_extract_without_exactly_one_group_is_refused(self):
        self.write_rule(IMMUTABLE_RULE)
        codes, findings, _ = self.run_one(extract=r'regex\("(.*)",\s*(service\.tag)\)')
        self.assertEqual(codes, ["malformed-claim"])
        self.assertIn("capture group", findings[0].message)

    def test_an_uncompilable_rule_is_refused_not_passed(self):
        self.write_rule("^(sha256:[0-9a-f]{64}|v?[0-9]+$")
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["malformed-claim"])
        self.assertIn("not a regex this checker can run", findings[0].message)

    def test_an_unknown_escape_is_refused_not_guessed(self):
        # One backslash in the file, not two: `\\\\` is an escape the unescaper
        # knows and would resolve, leaving `\\q` for `re` to reject. This is the
        # other path — a sequence HCL itself would not accept, refused here
        # rather than guessed at.
        self.write_rule("^\\q(sha256:[0-9a-f]{64})$")
        codes, findings, _ = self.run_one()
        self.assertEqual(codes, ["malformed-claim"])
        self.assertIn("does not know", findings[0].message)

    def test_a_glob_matching_nothing_is_red(self):
        self.write_rule(IMMUTABLE_RULE)
        codes, findings, _ = self.run_one(path="gone/*.tf")
        self.assertEqual(codes, ["claim-false"])
        self.assertIn("matches no tracked file", findings[0].message)


class LiveRegisterAdmitsTests(unittest.TestCase):
    """The two live `admits` claims, against the Terraform they actually read.

    `AdmitsTests` proves the predicate; this proves it is pointed at the right
    file. A predicate that works on a fixture and matches nothing in the tree is
    the failure it was written to end.
    """

    def test_both_terraform_rules_refuse_a_moving_tag(self):
        root = Path(rc.__file__).resolve().parents[2]
        tracked = rc.tracked_files(root)
        entries = {
            "IMG-006": ("tag_variable_is_validated_immutable",),
            "IMG-008": ("validation_refuses_a_moving_tag",),
        }
        register = yaml.safe_load(
            (root / "platform/image-tag-exceptions.yaml").read_text(encoding="utf-8")
        )
        by_id = {entry["id"]: entry for entry in register["exceptions"]}
        for identifier, names in entries.items():
            for name in names:
                spec = by_id[identifier]["claims"][name]
                self.assertIn("admits", spec, f"{identifier}.{name}")
                # Runs against the working tree, so a weakening of either
                # `.tf` file surfaces here as well as in the audit.
                self.assertIsNone(
                    rc.evaluate_predicate(
                        root, tracked, identifier, name, "admits", spec["admits"]
                    ),
                    f"{identifier}.{name}",
                )
                self.assertIn("latest", spec["admits"]["refuses"])


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

    def _census(self):
        """Every (register, entry, claim) the registers carry, read from YAML.

        Re-derived from the registers rather than trusted from the audit, so an
        `ENROLLED` row naming an entry that does not exist fails instead of
        passing vacuously.
        """
        import yaml

        census = set()
        for spec in rc.REGISTERS:
            document = (
                yaml.safe_load((REPO_ROOT / spec.path).read_text(encoding="utf-8"))
                or {}
            )
            for index, entry in enumerate(document.get(spec.entries_key) or []):
                identifier = str(
                    entry.get("id")
                    or entry.get("venture")
                    or entry.get("criterion")
                    or f"entry[{index}]"
                )
                for name in entry.get("claims") or {}:
                    census.add((spec.path, identifier, name))
        return census

    def test_enrollment_is_closed_over_the_registers(self):
        """Every claim is pinned by name, and every pin names a real claim.

        The aggregate floor has slack — on 2026-08-16, 27 claims against a
        floor of 14 — so before this closure any of the 19 unenrolled claims
        could be deleted one at a time with every gate green. The count moves
        as exceptions come and go; the closure is asserted, not the number.
        Both directions are asserted: a
        register claim with no row would be droppable tomorrow, and a row with
        no claim would be a pin that has already been defeated.
        """
        enrolled = {(row.register, row.entry_id, row.claim) for row in rc.ENROLLED}
        census = self._census()
        self.assertEqual(
            sorted(census - enrolled),
            [],
            "register claims that no ENROLLED row names",
        )
        self.assertEqual(
            sorted(enrolled - census),
            [],
            "ENROLLED rows naming a claim the registers no longer carry",
        )
        self.assertEqual(len(rc.ENROLLED), len(enrolled), "duplicate ENROLLED rows")

    def test_removing_any_claim_at_all_fails_the_gate(self):
        """Not one privileged subset: every claim, one at a time.

        Exercised through `check_enrollment` on a measurement with the claim
        taken out, rather than by mutating the tracked registers, so the
        assertion needs no working tree to put back. The audit builds the same
        structure, and `test_the_real_audit_surfaces_a_missing_claim` proves
        `audit` is actually wired to this function rather than computing it
        into a variable nobody reads.
        """
        _, baseline = rc.audit(REPO_ROOT)
        self.assertTrue(baseline.claims_by_key)
        for key, declared in sorted(baseline.claims_by_key.items()):
            for name in declared:
                measurement = rc.Measurement()
                measurement.claims_by_key = {
                    other: [c for c in names if not (other == key and c == name)]
                    for other, names in baseline.claims_by_key.items()
                }
                codes = [f.code for f in rc.check_enrollment(measurement)]
                self.assertEqual(
                    codes,
                    ["enrolled-claim-removed"],
                    f"deleting {key[0]} {key[1]}.{name} left the gate green",
                )

    def test_a_claim_added_without_a_row_is_refused(self):
        """The closure's other direction, which keeps the list from decaying.

        A list that may quietly fall behind the registers is the state this
        control was in: new claims arrive unenrolled and are free to leave.
        """
        _, baseline = rc.audit(REPO_ROOT)
        key = ("platform/image-tag-exceptions.yaml", "IMG-006")
        measurement = rc.Measurement()
        measurement.claims_by_key = dict(baseline.claims_by_key)
        measurement.claims_by_key[key] = list(baseline.claims_by_key[key]) + [
            "a_claim_nobody_enrolled"
        ]
        findings = rc.check_enrollment(measurement)
        self.assertEqual([f.code for f in findings], ["claim-not-enrolled"])
        self.assertIn("a_claim_nobody_enrolled", findings[0].message)

    def test_the_real_audit_surfaces_a_missing_claim(self):
        """The shell-wired path, not only the helper.

        A row naming a claim the register does not carry is the exact state a
        deletion produces, so this asserts `audit` — and therefore `main`, and
        therefore the gate `scripts/test-ci.sh` runs — goes red on it.
        """
        import unittest.mock

        patched = rc.ENROLLED + (
            rc.Enrollment(
                register="platform/image-tag-exceptions.yaml",
                entry_id="IMG-006",
                claim="a_claim_this_entry_does_not_carry",
            ),
        )
        with unittest.mock.patch.object(rc, "ENROLLED", patched):
            findings, _ = rc.audit(REPO_ROOT)
            self.assertEqual([f.code for f in findings], ["enrolled-claim-removed"])
            self.assertEqual(rc.main([]), 1)
        self.assertEqual(rc.main([]), 0)

    def test_the_emitted_enrollment_matches_the_declared_one(self):
        """`--emit-enrollment` is the way to regenerate, so it must be exact.

        A generator that disagrees with the list it generates is how a baseline
        becomes hand-written again.
        """
        import ast

        module = ast.parse(rc.emit_enrollment(REPO_ROOT))
        assignment = module.body[0]
        rows = []
        for call in assignment.value.elts:
            self.assertEqual(call.func.id, "Enrollment")
            rows.append(
                rc.Enrollment(
                    **{kw.arg: ast.literal_eval(kw.value) for kw in call.keywords}
                )
            )
        self.assertEqual(tuple(rows), rc.ENROLLED)

    def test_enrolled_rows_name_real_registers_and_keep_their_history(self):
        known = {spec.path for spec in rc.REGISTERS}
        founding = {
            ("platform/image-tag-exceptions.yaml", "IMG-005"),
            ("platform/image-tag-exceptions.yaml", "IMG-006"),
            ("platform/image-tag-exceptions.yaml", "IMG-007"),
            ("platform/image-tag-exceptions.yaml", "IMG-008"),
            ("platform/image-tag-exceptions.yaml", "IMG-010"),
            ("platform/exception-register.yaml", "EXC-001"),
            ("platform/exception-register.yaml", "EXC-007"),
            ("platform/exception-register.yaml", "EXC-013"),
        }
        with_history = set()
        for enrollment in rc.ENROLLED:
            self.assertIn(enrollment.register, known)
            if enrollment.why.strip():
                with_history.add(enrollment.key)
        # The eight sentences found live and untrue on 2026-08-06 each keep the
        # note saying so; losing one would leave the remedy generic exactly
        # where the history is the argument.
        self.assertEqual(with_history, founding)

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


class ImageRegisterGuardTests(unittest.TestCase):
    """The image register's own claim-name guard, extended not loosened.

    `image_tags.validate_claims` refused any `claims:` key it did not know by
    name, which is what stopped a decorative claim being written. Declarative
    claims carry their own predicate, so they are accepted without being named
    there — but only when the predicate is one this module can actually
    evaluate. These cases pin that: the loosening must not extend to a mapping
    with a misspelled or absent predicate, which would be exactly the unchecked
    claim the original guard existed to refuse.
    """

    def setUp(self) -> None:
        import image_tags

        self.image_tags = image_tags

    def entry(self, claims):
        return {"id": "IMG-999", "claims": claims}

    def test_a_declarative_claim_with_a_real_predicate_is_accepted(self):
        self.image_tags.validate_claims(
            self.entry({"c": {"sentence": "s", "present": {"path": "x", "pattern": "y"}}})
        )

    def test_a_mapping_with_no_predicate_is_still_refused(self):
        with self.assertRaises(self.image_tags.ImageTagError):
            self.image_tags.validate_claims(self.entry({"c": {"sentence": "s"}}))

    def test_a_misspelled_predicate_is_still_refused(self):
        with self.assertRaises(self.image_tags.ImageTagError):
            self.image_tags.validate_claims(
                self.entry({"c": {"sentence": "s", "presnt": {"path": "x"}}})
            )

    def test_an_unknown_boolean_claim_is_still_refused(self):
        with self.assertRaises(self.image_tags.ImageTagError):
            self.image_tags.validate_claims(self.entry({"invented": True}))

    def test_the_predicate_list_is_read_from_the_checker_not_restated(self):
        # A second copy would drift silently in the worst direction: a predicate
        # this guard still accepts but the checker no longer evaluates.
        self.assertEqual(
            self.image_tags._declarative_predicates(), rc.PREDICATE_KINDS
        )


if __name__ == "__main__":
    unittest.main()
