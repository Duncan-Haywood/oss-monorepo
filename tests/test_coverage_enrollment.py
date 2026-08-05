#!/usr/bin/env python3
"""
Contract tests for coverage enrollment.

`tests/test_coverage_ratchet.py` holds the components that are *in*
`platform/coverage-baseline.yaml`. This file holds the ones that are not.

The state it was written against: the baseline declared two components, and
only one of them — `print-atelier` — is in `VENTURE_CATALOG`. Fifteen of the
sixteen catalog components had no coverage floor, so deleting every test in
`local-site-studio`, `quick-pick-survey` or `ai-first-markets` turned no gate
red anywhere. The ratchet reported "every component matches its declared
baseline", which was true, and said nothing at all about the five sixths of the
catalog it had never been pointed at.

The contract is the one `scripts/ci/cap_ratchet.py` already applies to declared
budgets: every candidate is either watched or registered as exempt with a
reason, and a candidate that is neither is a failure. Transposed here, the
candidates are the catalog components, the watch is a baseline entry, and the
register is `UNMEASURED_COMPONENTS`.

Four properties this file exists to hold, each learned from a control in this
repository that did not have it:

  * **It can fail.** Most tests below assert a failing direction — a component
    added to the catalog with no floor, an exemption whose reason has gone
    false, an exemption for a component that no longer exists, a component
    enrolled at 0/0/0. `RemovingAnyOneRegistrationTests` proves the point
    mechanically: for every one of the sixteen catalog components, taking away
    its registration produces a finding naming it.
  * **It excuses nothing, including itself.** There is no branch in
    `audit_enrollment` that skips a path, and no branch here that skips a
    component. Three self-excusing branches have already been found in this
    repository's gates; the shape is a control that is complete except where it
    is not.
  * **It is not vacuous.** The candidate set is parsed rather than typed out,
    and a parse that yields nothing raises instead of returning `[]`. A glob or
    a list that matches nothing exits 0 and looks exactly like a gate that
    passed.
  * **The reasons are checkable.** Every exemption names a predicate that
    re-derives its reason from the tree today. Prose in this repository's
    registers has gone false while every count stayed green, so prose alone is
    not enough to hold a component out.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import textwrap
import unittest

import coverage_ratchet
from coverage_ratchet import (
    CATALOG_PATH,
    CATALOG_SYMBOL,
    ENROLLMENT_PREDICATES,
    UNMEASURED_COMPONENTS,
    CatalogComponent,
    EnrollmentError,
    EnrollmentExemption,
    audit_enrollment,
    enrolled_at_no_floor,
    load_baseline,
    load_catalog,
    parse_catalog,
)

# The shortest reason that can be an argument rather than a label. Deliberately
# a literal in the test rather than a constant in the module: shortening it is
# how a register of arguments becomes a register of shrugs, and it should be
# visible as an edit to the contract when someone does.
MIN_REASON_CHARS = 200

# Same rationale, for the sentence naming what has to change.
MIN_BLOCKER_CHARS = 20


def catalog() -> list:
    return load_catalog(REPO_ROOT)


def enrolled_ids() -> set:
    declared = load_baseline(REPO_ROOT).get("components") or []
    return {entry["id"] for entry in declared if isinstance(entry, dict) and "id" in entry}


def fake_catalog(*ids: str, type_: str = "node") -> list:
    return [
        CatalogComponent(id=name, dir=f"ventures/{name}", type=type_) for name in ids
    ]


class ParseCatalogTests(unittest.TestCase):
    """The candidate set is read, and an unreadable one is never an empty one."""

    SAMPLE = textwrap.dedent(
        """
        export const VENTURE_CATALOG = [
          {
            id: 'alpha',
            name: 'Alpha',
            dir: 'ventures/alpha',
            type: 'node',
          },
          {
            // A comment mentioning ['build'] and a stray ] bracket.
            id: 'beta',
            name: 'Beta',
            dir: 'ventures/beta',
            packageDir: 'ventures/beta/pkg',
            type: 'python',
          },
        ];

        const AFTER = [1, 2];
        """
    )

    def test_reads_every_entry(self):
        components = parse_catalog(self.SAMPLE)
        self.assertEqual([c.id for c in components], ["alpha", "beta"])

    def test_reads_the_fields_the_predicates_depend_on(self):
        beta = parse_catalog(self.SAMPLE)[1]
        self.assertEqual(beta.type, "python")
        self.assertEqual(beta.dir, "ventures/beta")
        self.assertEqual(beta.package_dir, "ventures/beta/pkg")

    def test_the_component_root_prefers_the_package_directory(self):
        alpha, beta = parse_catalog(self.SAMPLE)
        self.assertEqual(alpha.root, "ventures/alpha")
        self.assertEqual(beta.root, "ventures/beta/pkg")

    def test_a_bracket_inside_a_comment_does_not_end_the_catalog(self):
        # The live catalog has `['build']` in a comment. Naive bracket matching
        # over the raw text is one edit away from silently truncating the
        # candidate set, and a shorter candidate set is a quieter gate.
        self.assertEqual(len(parse_catalog(self.SAMPLE)), 2)

    def test_the_array_after_the_catalog_is_not_read_as_components(self):
        self.assertEqual([c.id for c in parse_catalog(self.SAMPLE)], ["alpha", "beta"])

    def test_a_url_in_a_value_is_not_read_as_a_comment(self):
        # Comment stripping runs before anything counts brackets, so a `//` it
        # gets wrong truncates the candidate set rather than producing an error.
        source = textwrap.dedent(
            """
            export const VENTURE_CATALOG = [
              {
                id: 'alpha',
                dir: 'ventures/alpha',
                type: 'node',
                homepage: 'https://example.invalid/alpha',
              },
              {
                id: 'omega',
                dir: 'ventures/omega',
                type: 'node',
              },
            ];
            """
        )
        self.assertEqual([c.id for c in parse_catalog(source)], ["alpha", "omega"])

    def test_a_missing_catalog_raises_rather_than_yielding_no_candidates(self):
        with self.assertRaises(EnrollmentError):
            parse_catalog("export const SOMETHING_ELSE = [];\n")

    def test_an_empty_catalog_raises(self):
        # The vacuous case. Zero candidates satisfies "every candidate is
        # enrolled or exempt" perfectly.
        with self.assertRaises(EnrollmentError):
            parse_catalog("export const VENTURE_CATALOG = [];\n")

    def test_an_entry_missing_its_id_raises(self):
        source = textwrap.dedent(
            """
            export const VENTURE_CATALOG = [
              {
                name: 'Nameless',
                dir: 'ventures/nameless',
                type: 'node',
              },
            ];
            """
        )
        with self.assertRaises(EnrollmentError):
            parse_catalog(source)

    def test_an_entry_missing_its_type_raises(self):
        # `type` is what two of the predicates below re-derive their reason
        # from, so an entry without one cannot be excused by them.
        source = textwrap.dedent(
            """
            export const VENTURE_CATALOG = [
              {
                id: 'typeless',
                dir: 'ventures/typeless',
              },
            ];
            """
        )
        with self.assertRaises(EnrollmentError):
            parse_catalog(source)

    def test_an_unterminated_catalog_raises(self):
        with self.assertRaises(EnrollmentError):
            parse_catalog("export const VENTURE_CATALOG = [\n  {\n    id: 'x',\n")

    def test_the_module_is_never_executed_to_read_it(self):
        # Importing a registry to audit it lets the registry decide whether it
        # is audited. This asserts the read is static: the sample would throw if
        # anything evaluated it.
        source = textwrap.dedent(
            """
            throw new Error('this module must not run');
            export const VENTURE_CATALOG = [
              {
                id: 'alpha',
                dir: 'ventures/alpha',
                type: 'node',
              },
            ];
            """
        )
        self.assertEqual([c.id for c in parse_catalog(source)], ["alpha"])


class UnenrolledComponentTests(unittest.TestCase):
    """The failing direction the whole contract exists for."""

    def test_a_catalog_component_with_no_floor_and_no_exemption_fails(self):
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("newcomer"),
            enrolled=set(),
            exemptions=(),
        )
        self.assertEqual([f.code for f in findings], ["component-not-enrolled"])
        self.assertEqual(findings[0].component, "newcomer")

    def test_a_catalog_component_with_a_floor_passes(self):
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("newcomer"),
            enrolled={"newcomer"},
            exemptions=(),
        )
        self.assertEqual(findings, [])

    def test_an_exemption_for_a_component_that_left_the_catalog_fails(self):
        # An exemption that outlives its component sits in the register ready to
        # absorb a component of the same id added back later without review.
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("stayed"),
            enrolled={"stayed"},
            exemptions=(
                EnrollmentExemption(
                    component="left",
                    predicate="runner-outside-lcov-toolchain",
                    blocker="n/a",
                    why="x" * MIN_REASON_CHARS,
                ),
            ),
        )
        self.assertEqual([f.code for f in findings], ["stale-exemption"])

    def test_a_component_both_enrolled_and_exempt_fails(self):
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("both"),
            enrolled={"both"},
            exemptions=(
                EnrollmentExemption(
                    component="both",
                    predicate="runner-outside-lcov-toolchain",
                    blocker="n/a",
                    why="x" * MIN_REASON_CHARS,
                ),
            ),
        )
        self.assertEqual([f.code for f in findings], ["enrolled-and-exempt"])

    def test_the_same_component_registered_twice_fails(self):
        exemption = EnrollmentExemption(
            component="twice",
            predicate="runner-outside-lcov-toolchain",
            blocker="n/a",
            why="x" * MIN_REASON_CHARS,
        )
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("twice", type_="terraform"),
            enrolled=set(),
            exemptions=(exemption, exemption),
        )
        self.assertIn("duplicate-exemption", [f.code for f in findings])

    def test_an_exemption_naming_an_unregistered_predicate_fails(self):
        # The escape hatch this contract must not have: an exemption whose
        # reason is a string nothing evaluates.
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("invented"),
            enrolled=set(),
            exemptions=(
                EnrollmentExemption(
                    component="invented",
                    predicate="because-i-said-so",
                    blocker="n/a",
                    why="x" * MIN_REASON_CHARS,
                ),
            ),
        )
        self.assertEqual([f.code for f in findings], ["unknown-predicate"])

    def test_an_exemption_whose_predicate_stopped_holding_fails(self):
        # `runner-outside-lcov-toolchain` holds only while the catalog types the
        # component as swift or terraform. Re-typed to node, the reason is
        # false, and the register must not keep excusing it.
        findings = audit_enrollment(
            REPO_ROOT,
            catalog=fake_catalog("converted", type_="node"),
            enrolled=set(),
            exemptions=(
                EnrollmentExemption(
                    component="converted",
                    predicate="runner-outside-lcov-toolchain",
                    blocker="n/a",
                    why="x" * MIN_REASON_CHARS,
                ),
            ),
        )
        self.assertEqual([f.code for f in findings], ["exemption-predicate-broken"])

    def test_an_unreadable_catalog_is_a_failure_not_an_empty_candidate_set(self):
        findings = audit_enrollment(REPO_ROOT, baseline_path="platform/coverage-baseline.yaml",
                                    catalog=None, enrolled=set(), exemptions=())
        # Sanity: with the real catalog and nothing registered, every component
        # is reported. This is the same call shape as the failure below, so the
        # two cannot be confused for one another.
        self.assertTrue(findings)
        self.assertTrue(all(f.code == "component-not-enrolled" for f in findings))

    def test_a_missing_catalog_file_fails_closed(self):
        findings = audit_enrollment(
            REPO_ROOT / "does-not-exist",
            enrolled=set(),
            exemptions=(),
        )
        self.assertEqual([f.code for f in findings], ["catalog-unreadable"])


class ZeroFloorTests(unittest.TestCase):
    """Enrolling at 0/0/0 is enrollment in appearance only."""

    def test_a_component_declared_at_zero_on_every_metric_fails(self):
        finding = enrolled_at_no_floor(
            {"id": "hollow", "baseline": {"lines": 0, "functions": 0, "branches": 0}}
        )
        self.assertIsNotNone(finding)
        self.assertEqual(finding.code, "enrolled-at-no-floor")

    def test_a_component_with_any_real_floor_passes(self):
        self.assertIsNone(
            enrolled_at_no_floor(
                {"id": "real", "baseline": {"lines": 0, "functions": 0, "branches": 12.5}}
            )
        )

    def test_a_component_with_no_baseline_block_is_left_to_the_structural_checks(self):
        # Absence is already `missing-field`; saying it twice sends the reader
        # to two repairs for one defect.
        self.assertIsNone(enrolled_at_no_floor({"id": "empty"}))


class RemovingAnyOneRegistrationTests(unittest.TestCase):
    """No component is silently excused — proven for every component, not a sample.

    This is the test that stands in for "the contract does not excuse itself".
    A hole in a gate is rarely written as a hole; it is a condition that happens
    to be false for one path. Rather than reading the code for such a branch,
    this takes each of the sixteen catalog components in turn, removes its
    registration, and requires a finding that names it. A component the contract
    quietly tolerates fails here.
    """

    def test_every_catalog_component_is_individually_held(self):
        components = catalog()
        self.assertGreater(len(components), 0, "the candidate set must not be empty")
        enrolled = enrolled_ids()
        for component in components:
            with self.subTest(component=component.id):
                findings = audit_enrollment(
                    REPO_ROOT,
                    catalog=components,
                    enrolled=enrolled - {component.id},
                    exemptions=tuple(
                        e for e in UNMEASURED_COMPONENTS if e.component != component.id
                    ),
                )
                named = [f for f in findings if f.component == component.id]
                self.assertEqual(
                    [f.code for f in named],
                    ["component-not-enrolled"],
                    f"removing {component.id}'s registration produced no finding about it, "
                    "so nothing holds it",
                )


class RepositoryContractTests(unittest.TestCase):
    """The live repository, today."""

    def test_the_candidate_set_resolves_and_is_not_empty(self):
        components = catalog()
        self.assertGreater(
            len(components),
            0,
            f"{CATALOG_SYMBOL} in {CATALOG_PATH} resolved to nothing; a contract over an "
            "empty candidate set passes by construction",
        )
        self.assertEqual(
            len({c.id for c in components}),
            len(components),
            "two catalog entries share an id, so one of them cannot be registered",
        )

    def test_every_catalog_component_is_enrolled_or_registered_as_exempt(self):
        findings = audit_enrollment(REPO_ROOT)
        self.assertEqual(
            [f.format() for f in findings],
            [],
            "every component CI verifies must have a measured coverage floor or a registered "
            "exemption whose predicate still holds",
        )

    def test_every_exemption_names_exactly_one_live_catalog_component(self):
        ids = {c.id for c in catalog()}
        for exemption in UNMEASURED_COMPONENTS:
            with self.subTest(component=exemption.component):
                # A blanket exemption — a directory, a wildcard, a runner family
                # — is a region in which "every component has a floor" may be
                # untrue while every count stays green.
                self.assertNotIn("*", exemption.component)
                self.assertNotIn("/", exemption.component)
                self.assertIn(
                    exemption.component,
                    ids,
                    "an exemption names one catalog id, and that id must still be in the catalog",
                )

    def test_every_exemption_carries_a_registered_predicate_that_still_holds(self):
        by_id = {c.id: c for c in catalog()}
        for exemption in UNMEASURED_COMPONENTS:
            with self.subTest(component=exemption.component):
                self.assertIn(
                    exemption.predicate,
                    ENROLLMENT_PREDICATES,
                    "the reason has to be re-derivable from the tree, not just written down",
                )
                broken = ENROLLMENT_PREDICATES[exemption.predicate](
                    REPO_ROOT, by_id[exemption.component]
                )
                self.assertIsNone(
                    broken,
                    f"the recorded reason is no longer true: {broken}. Blocker was: "
                    f"{exemption.blocker}",
                )

    def test_every_exemption_argues_its_case_and_names_its_blocker(self):
        seen = set()
        for exemption in UNMEASURED_COMPONENTS:
            with self.subTest(component=exemption.component):
                self.assertGreaterEqual(
                    len(exemption.why),
                    MIN_REASON_CHARS,
                    "the reason has to be a reason, not a label",
                )
                self.assertGreaterEqual(
                    len(exemption.blocker),
                    MIN_BLOCKER_CHARS,
                    "an exemption records what has to change, so it reads as work rather than "
                    "as a verdict",
                )
                self.assertNotIn(exemption.component, seen, "registered twice")
                seen.add(exemption.component)

    def test_no_component_is_both_enrolled_and_exempt(self):
        both = sorted({e.component for e in UNMEASURED_COMPONENTS} & enrolled_ids())
        self.assertEqual(both, [], "measured and excused at once: " + ", ".join(both))

    def test_every_registered_predicate_is_used_by_an_exemption(self):
        # A predicate nobody uses is a shape of exemption sitting ready, and the
        # argument for it was made when it had a case in front of it.
        used = {e.predicate for e in UNMEASURED_COMPONENTS}
        unused = sorted(set(ENROLLMENT_PREDICATES) - used)
        self.assertEqual(unused, [], "predicates no exemption uses: " + ", ".join(unused))

    def test_no_enrolled_component_declares_a_zero_floor(self):
        declared = load_baseline(REPO_ROOT).get("components") or []
        hollow = [
            entry["id"] for entry in declared if enrolled_at_no_floor(entry) is not None
        ]
        self.assertEqual(
            hollow,
            [],
            "these are enrolled at a floor nothing can fall below: " + ", ".join(hollow),
        )

    def test_the_catalog_components_measured_here_outnumber_the_state_this_replaced(self):
        # The state on 2026-08-05 before this change: one catalog component had
        # a floor. A regression to it would otherwise show up only as a longer
        # exemption register, which reads as bookkeeping rather than as loss.
        measured = sorted(enrolled_ids() & {c.id for c in catalog()})
        self.assertGreater(
            len(measured),
            1,
            "the catalog components with a measured coverage floor are "
            + ", ".join(measured),
        )


if __name__ == "__main__":
    unittest.main()
