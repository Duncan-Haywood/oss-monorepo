"""Tests for the repository walk.

The invariant these are mostly about: a manifest is never silently dropped. A
project either comes back analysed, or it comes back refused with a reason the
reader can act on. "Not in the output" is the failure mode the module exists to
remove, so most of these assert on the *count* of manifests found as well as on
the classification of the interesting one.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from triage.discovery import (
    ANALYSED,
    ANALYSED_NO_DEPLOYMENT_MODE,
    REFUSAL_REMEDIES,
    REFUSED,
    discover,
    iter_manifests,
)
from triage.evidence import render_repository_coverage

V3_LOCK = {"lockfileVersion": 3, "packages": {"": {}, "node_modules/left-pad": {"version": "1.3.0"}}}


def write_pnpm_lockfile(path: Path, importers: dict, version: str = "9.0") -> None:
    """Write a minimal but structurally real ``pnpm-lock.yaml``: the
    ``importers`` map is all this module's own classification reads, but a
    hand-typed string missing it silently tested the wrong thing before this
    helper existed."""
    path.write_text(
        yaml.safe_dump({"lockfileVersion": version, "importers": importers}),
        encoding="utf-8",
    )


def write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        payload if isinstance(payload, str) else json.dumps(payload), encoding="utf-8"
    )


def make_project(root: Path, relative: str, lock=V3_LOCK, manifest=None) -> Path:
    directory = root / relative if relative else root
    write(directory / "package.json", manifest if manifest is not None else {"name": relative or "root"})
    if lock is not None:
        write(directory / "package-lock.json", lock)
    return directory


def by_path(coverage) -> dict:
    return {project.path: project for project in coverage.projects}


class TestManifestWalk:
    def test_finds_nested_projects_and_skips_node_modules(self, tmp_path):
        make_project(tmp_path, "apps/web")
        make_project(tmp_path, "apps/api")
        # A dependency's own manifest must never be reported as a project.
        write(tmp_path / "apps/web/node_modules/left-pad/package.json", {"name": "left-pad"})

        found = [path.relative_to(tmp_path).as_posix() for path in iter_manifests(tmp_path)]

        assert found == ["apps/api", "apps/web"]

    def test_skips_build_output_directories(self, tmp_path):
        make_project(tmp_path, "web")
        write(tmp_path / "web/.next/standalone/package.json", {"name": "traced"})
        write(tmp_path / "web/dist/package.json", {"name": "bundled"})

        found = [path.relative_to(tmp_path).as_posix() for path in iter_manifests(tmp_path)]

        assert found == ["web"]

    def test_root_manifest_is_reported_as_dot(self, tmp_path):
        make_project(tmp_path, "")

        coverage = discover(tmp_path)

        assert [p.path for p in coverage.projects] == ["."]

    def test_order_is_stable(self, tmp_path):
        for name in ("z", "a", "m"):
            make_project(tmp_path, name)

        assert [p.path for p in discover(tmp_path).projects] == ["a", "m", "z"]

    def test_symlinked_directory_is_not_followed(self, tmp_path):
        make_project(tmp_path, "real")
        link = tmp_path / "alias"
        try:
            link.symlink_to(tmp_path / "real", target_is_directory=True)
        except (OSError, NotImplementedError):  # pragma: no cover - platform dependent
            pytest.skip("symlinks unavailable")

        assert [p.path for p in discover(tmp_path).projects] == ["real"]


class TestClassification:
    def test_v3_lockfile_is_analysed(self, tmp_path):
        make_project(tmp_path, "web")

        project = by_path(discover(tmp_path, detect_deployment=False))["web"]

        assert project.status == ANALYSED
        assert project.reason is None
        assert project.lockfile == "web/package-lock.json"

    def test_v1_lockfile_is_refused_with_its_own_reason(self, tmp_path):
        make_project(tmp_path, "web", lock={"lockfileVersion": 1, "dependencies": {}})

        project = by_path(discover(tmp_path))["web"]

        assert (project.status, project.reason) == (REFUSED, "lockfile-v1")

    def test_unparseable_lockfile_is_refused_not_skipped(self, tmp_path):
        make_project(tmp_path, "web", lock="{ not json")

        project = by_path(discover(tmp_path))["web"]

        assert (project.status, project.reason) == (REFUSED, "unreadable-lockfile")

    def test_unparseable_manifest_is_refused_not_skipped(self, tmp_path):
        make_project(tmp_path, "web", manifest="{ not json")

        project = by_path(discover(tmp_path))["web"]

        assert (project.status, project.reason) == (REFUSED, "unreadable-manifest")

    def test_no_lockfile_anywhere(self, tmp_path):
        make_project(tmp_path, "web", lock=None)

        project = by_path(discover(tmp_path))["web"]

        assert (project.status, project.reason) == (REFUSED, "no-lockfile")
        assert project.lockfile is None


class TestNonNpmWorkspaces:
    def test_pnpm_members_the_lockfile_does_not_declare_are_refused(self, tmp_path):
        # A pnpm-lock.yaml with no `importers` entry for these directories at
        # all -- the file parses, but nothing in it resolves "apps/web" or
        # "packages/core", the same shape as an npm workspace member missing
        # from the root's own `packages` map.
        make_project(tmp_path, "", lock=None)
        write_pnpm_lockfile(tmp_path / "pnpm-lock.yaml", importers={})
        make_project(tmp_path, "apps/web", lock=None)
        make_project(tmp_path, "packages/core", lock=None)

        coverage = discover(tmp_path)
        projects = by_path(coverage)

        assert coverage.counts() == {"manifests_found": 3, "analysed": 0, "refused": 3}
        for path in (".", "apps/web", "packages/core"):
            assert projects[path].reason == "not-in-pnpm-workspace"
            assert projects[path].lockfile == "pnpm-lock.yaml"

    def test_pnpm_members_the_lockfile_declares_are_analysed(self, tmp_path):
        make_project(tmp_path, "", lock=None)
        write_pnpm_lockfile(
            tmp_path / "pnpm-lock.yaml",
            importers={".": {}, "apps/web": {}, "packages/core": {}},
        )
        make_project(tmp_path, "apps/web", lock=None)
        make_project(tmp_path, "packages/core", lock=None)

        coverage = discover(tmp_path, detect_deployment=False)
        projects = by_path(coverage)

        assert coverage.counts() == {"manifests_found": 3, "analysed": 3, "refused": 0}
        assert projects["."].pnpm_importer == "."
        assert projects["apps/web"].pnpm_importer == "apps/web"
        assert projects["apps/web"].lockfile == "pnpm-lock.yaml"
        # Unlike an npm workspace member, a pnpm member is not "covered_by" the
        # root: each importer carries its own dependency list in the lockfile,
        # so each gets its own separate report rather than being folded away.
        assert projects["apps/web"].covered_by is None

    def test_a_pnpm_lockfile_this_tool_has_not_validated_is_refused(self, tmp_path):
        # lockfileVersion 6 parses as YAML but is not the major version
        # triage.pnpm has been built and tested against.
        make_project(tmp_path, "", lock=None)
        write_pnpm_lockfile(tmp_path / "pnpm-lock.yaml", importers={".": {}}, version="6.0")

        project = by_path(discover(tmp_path))["."]

        assert project.reason == "pnpm-lockfile"

    def test_an_unparseable_pnpm_lockfile_is_refused_not_skipped(self, tmp_path):
        make_project(tmp_path, "", lock=None)
        (tmp_path / "pnpm-lock.yaml").write_text("{ not: yaml: [", encoding="utf-8")

        project = by_path(discover(tmp_path))["."]

        assert project.reason == "pnpm-lockfile"

    def test_yarn_lockfile_is_named_distinctly(self, tmp_path):
        make_project(tmp_path, "", lock=None)
        (tmp_path / "yarn.lock").write_text("# yarn lockfile v1\n", encoding="utf-8")
        make_project(tmp_path, "apps/web", lock=None)

        assert by_path(discover(tmp_path))["apps/web"].reason == "yarn-lockfile"

    def test_nearest_lockfile_wins_over_a_further_one(self, tmp_path):
        make_project(tmp_path, "", lock=V3_LOCK)
        (tmp_path / "vendored").mkdir()
        write_pnpm_lockfile(tmp_path / "vendored/pnpm-lock.yaml", importers={".": {}})
        make_project(tmp_path, "vendored/app", lock=None)

        # The root npm lockfile does not resolve past the intervening pnpm
        # one, whose own `importers` map does not declare "vendored/app" (it
        # only declares its own root, ".").
        assert by_path(discover(tmp_path))["vendored/app"].reason == "not-in-pnpm-workspace"


class TestNpmWorkspaces:
    def test_member_declared_by_the_root_lockfile_is_covered(self, tmp_path):
        root_lock = {
            "lockfileVersion": 3,
            "packages": {
                "": {},
                "apps/web": {"name": "web"},
                "node_modules/left-pad": {"version": "1.3.0"},
            },
        }
        make_project(tmp_path, "", lock=root_lock)
        make_project(tmp_path, "apps/web", lock=None)

        project = by_path(discover(tmp_path, detect_deployment=False))["apps/web"]

        assert project.status == ANALYSED
        assert project.covered_by == "."
        assert project.lockfile == "package-lock.json"

    def test_member_the_root_lockfile_does_not_declare_is_refused(self, tmp_path):
        make_project(tmp_path, "", lock=V3_LOCK)
        make_project(tmp_path, "apps/orphan", lock=None)

        project = by_path(discover(tmp_path))["apps/orphan"]

        assert (project.status, project.reason) == (REFUSED, "not-in-workspace-lockfile")

    def test_coverage_is_not_inferred_from_the_workspaces_glob(self, tmp_path):
        # The root manifest claims the member; the lockfile does not resolve it.
        # An intention is not a resolved dependency set.
        make_project(tmp_path, "", lock=V3_LOCK, manifest={"workspaces": ["apps/*"]})
        make_project(tmp_path, "apps/web", lock=None)

        assert by_path(discover(tmp_path))["apps/web"].reason == "not-in-workspace-lockfile"


class TestDeploymentModeState:
    def test_undetermined_mode_is_a_distinct_weaker_status(self, tmp_path):
        make_project(tmp_path, "web")

        project = by_path(discover(tmp_path, detect_deployment=True))["web"]

        assert project.status == ANALYSED_NO_DEPLOYMENT_MODE
        assert project.analysed is True

    def test_detected_mode_reports_plain_analysed(self, tmp_path):
        make_project(tmp_path, "web")
        (tmp_path / "web/next.config.js").write_text(
            "module.exports = { output: 'export' }", encoding="utf-8"
        )

        assert by_path(discover(tmp_path))["web"].status == ANALYSED


class TestEveryRefusalIsActionable:
    def test_every_reason_code_has_a_remedy(self, tmp_path):
        """A refusal with no remedy is the silence this module exists to remove."""
        make_project(tmp_path, "v1", lock={"lockfileVersion": 1})
        make_project(tmp_path, "broken", lock="{")
        make_project(tmp_path, "bad-manifest", manifest="{")
        make_project(tmp_path, "orphan", lock=None)

        for project in discover(tmp_path).refused:
            assert project.reason in REFUSAL_REMEDIES, project.path
            assert project.remedy

    def test_no_reason_code_lacks_an_entry(self):
        # Guards the reverse direction: a reason added to the module without a
        # remedy would otherwise only be caught by a fixture that happens to hit it.
        from triage import discovery

        emitted = {
            "no-lockfile",
            "pnpm-lockfile",
            "not-in-pnpm-workspace",
            "yarn-lockfile",
            "lockfile-v1",
            "unreadable-lockfile",
            "unreadable-manifest",
            "not-in-workspace-lockfile",
        }
        assert set(discovery.REFUSAL_REMEDIES) == emitted


class TestCoverageRendering:
    def test_every_refused_project_is_named_in_the_record(self, tmp_path):
        make_project(tmp_path, "", lock=None)
        write_pnpm_lockfile(tmp_path / "pnpm-lock.yaml", importers={})
        make_project(tmp_path, "apps/web", lock=None)
        make_project(tmp_path, "readable")

        coverage = discover(tmp_path, detect_deployment=False)
        rendered = "\n".join(render_repository_coverage(coverage))

        assert "1 of 3 npm projects in this repository were analysed" in rendered
        for path in (".", "apps/web"):
            assert f"`{path}`" in rendered
        assert "not-in-pnpm-workspace" in rendered
        # The remedy, not just the refusal.
        assert "pnpm install" in rendered

    def test_record_never_claims_compliance(self, tmp_path):
        make_project(tmp_path, "web")
        rendered = "\n".join(
            render_repository_coverage(discover(tmp_path, detect_deployment=False))
        ).lower()

        assert "compliant" not in rendered
        assert "compliance" not in rendered

    def test_all_analysed_still_states_the_denominator(self, tmp_path):
        make_project(tmp_path, "web")

        rendered = "\n".join(
            render_repository_coverage(discover(tmp_path, detect_deployment=False))
        )

        # Even a fully-covered repository states what the coverage was measured
        # over, so "1 of 1" is a claim the reader can check rather than silence.
        assert "1 of 1 npm projects in this repository were analysed" in rendered


class TestThisRepository:
    """Pins the measurement the README quotes, against the real tree.

    This is the same shape as `eaa-wcag-triage`'s accuracy-citation tests: a
    figure printed in a write-up should fail the build when it goes stale rather
    than quietly stop being true.
    """

    # tests/ -> npm-reachability-triage -> probes -> pipeline -> portfolio -> repo root
    ROOT = Path(__file__).resolve().parents[5]

    def test_the_pnpm_venture_is_now_analysed_not_refused(self):
        """As of the pnpm lockfile-version-9 support added to `triage.pnpm`,
        this is no longer the coverage gap it names in the probe's own
        README: every real workspace member in `retail-pilot-intel`'s
        pnpm-lock.yaml resolves to an analysed project."""
        venture = self.ROOT / "ventures/retail-pilot-intel"
        if not venture.is_dir():  # pragma: no cover - defensive
            pytest.skip("retail-pilot-intel not present")

        coverage = discover(self.ROOT, detect_deployment=False)
        by_path_ = {p.path: p for p in coverage.projects}
        members = {
            path: project
            for path, project in by_path_.items()
            if path.startswith("ventures/retail-pilot-intel")
        }

        assert members, "the pnpm venture should be discovered"
        assert all(project.status == ANALYSED for project in members.values())
        assert all(
            project.lockfile == "ventures/retail-pilot-intel/pnpm-lock.yaml"
            for project in members.values()
        )
        # covered_by stays unset for pnpm: each importer keeps its own
        # dependency list in the lockfile, so each is triaged separately
        # rather than folded into one root report the way an npm workspace
        # member with no lockfile of its own would be.
        assert all(project.covered_by is None for project in members.values())

    def test_the_walk_reaches_the_hand_written_sample(self):
        """Every product `run_portfolio_sample.py` enumerates is found by the walk.

        The walk replacing a hand-written list is only an improvement if it is a
        superset of it.
        """
        sample = (
            "ventures/ai-first-markets",
            "ventures/local-site-studio",
            "ventures/photo-editing/docs-site",
            "ventures/print-atelier",
            "ventures/quick-pick-survey",
            "ventures/real-estate-agent-photo-app/docs-site",
            "ventures/real-estate-agent-photo-app/research",
        )
        if not (self.ROOT / sample[0]).is_dir():  # pragma: no cover - defensive
            pytest.skip("portfolio ventures not present")

        analysed = {p.path for p in discover(self.ROOT, detect_deployment=False).analysed}

        assert set(sample) <= analysed


class TestCoverageCitations:
    """The figures the accuracy note prints must come from the committed run.

    `probes/README.md` asks for this shape explicitly: *"a figure printed at a
    customer must not be able to go stale"*. These re-derive each printed
    coverage number from `coverage-2026-08-23.json` rather than trusting the
    constant beside it. (`coverage-2026-08-22.json` predates pnpm support and
    is kept only as a historical artifact.)
    """

    MEASUREMENT = (
        Path(__file__).resolve().parents[1] / "coverage-2026-08-23.json"
    )
    #: The run from before pnpm lockfiles were readable, kept committed so the
    #: coverage change is checkable against an artifact rather than asserted.
    PRIOR = Path(__file__).resolve().parents[1] / "coverage-2026-08-22.json"

    def load(self):
        return json.loads(self.MEASUREMENT.read_text(encoding="utf-8"))

    def load_prior(self):
        return json.loads(self.PRIOR.read_text(encoding="utf-8"))

    def test_printed_totals_match_the_committed_measurement(self):
        from triage import evidence

        counts = self.load()["coverage"]["counts"]

        assert evidence.PORTFOLIO_MANIFESTS_FOUND == counts["manifests_found"]
        assert evidence.PORTFOLIO_MANIFESTS_ANALYSABLE == counts["analysed"]

    def test_the_verification_sample_is_smaller_than_what_is_readable(self):
        from triage import evidence

        # The whole point of the correction: sample < readable < found.
        assert (
            evidence.PORTFOLIO_VERIFICATION_SAMPLE
            < evidence.PORTFOLIO_MANIFESTS_ANALYSABLE
            < evidence.PORTFOLIO_MANIFESTS_FOUND
        )

    def test_the_note_no_longer_claims_to_cover_every_npm_product(self):
        from triage import evidence

        assert "all seven npm products" not in evidence.ACCURACY_NOTE
        assert str(evidence.PORTFOLIO_MANIFESTS_FOUND) in evidence.ACCURACY_NOTE

    #: The seven `ventures/**/package-lock.json` products `run_portfolio_sample.py`
    #: hand-verifies. Only these are asserted against the pinned sample totals
    #: below — the repository walk also analyses others (pnpm's
    #: `retail-pilot-intel`, and two npm projects with no deployment mode),
    #: which is the whole point of the walk, but their findings were never
    #: part of the 53-claim hand review and must not be silently absorbed into
    #: a number that reads as "the verified sample."
    SAMPLE_PROJECTS = frozenset(
        {
            "ventures/ai-first-markets",
            "ventures/local-site-studio",
            "ventures/photo-editing/docs-site",
            "ventures/print-atelier",
            "ventures/quick-pick-survey",
            "ventures/real-estate-agent-photo-app/docs-site",
            "ventures/real-estate-agent-photo-app/research",
        }
    )

    def test_committed_findings_match_the_hand_enumerated_validation_run(self):
        """The walk must reproduce the sample run, not merely resemble it."""
        sample_rows = [
            p for p in self.load()["projects"] if p["project"] in self.SAMPLE_PROJECTS
        ]
        assert {p["project"] for p in sample_rows} == self.SAMPLE_PROJECTS

        totals = {
            "deployed": sum(p["deployed"] for p in sample_rows),
            "suppressed": sum(p["suppressed"] for p in sample_rows),
            "findings": sum(p["findings"] for p in sample_rows),
        }
        assert totals == {"deployed": 30, "suppressed": 102, "findings": 132}

    def test_every_npm_row_still_reproduces_the_prior_committed_run(self):
        """The wider version of the same claim, and what makes this pass a
        coverage change rather than a re-measurement.

        The sample check above pins the seven hand-verified products. This pins
        the whole npm subset — the nine this tool could read before pnpm support
        — against the whole of the prior committed run. Had reading a second
        format moved a number on a project that was already readable, the
        coverage change and a measurement change would have to be argued apart.
        They do not, because it did not.
        """
        npm_rows = [
            row for row in self.load()["projects"] if row["lockfile_format"] == "npm"
        ]
        totals = {
            key: sum(row[key] for row in npm_rows)
            for key in ("deployed", "suppressed", "findings")
        }

        assert totals == self.load_prior()["totals"]

    def test_the_pnpm_venture_is_what_the_totals_gained(self):
        rows = [
            row for row in self.load()["projects"] if row["lockfile_format"] == "pnpm"
        ]

        assert len(rows) == 7
        assert all(
            row["project"].startswith("ventures/retail-pilot-intel") for row in rows
        )
        assert sum(row["components"] for row in rows) == 485
        # Two findings, both suppressed as dev-only; nothing new is deployed.
        assert sum(row["findings"] for row in rows) == 2
        assert sum(row["deployed"] for row in rows) == 0

    def test_no_committed_answer_rests_on_an_edge_the_reader_could_not_follow(self):
        """A narrowed answer from a graph known to be incomplete is not a claim.

        The reader forces every install of an unfollowable edge's package onto
        the production graph, so an incomplete graph over-reports rather than
        over-suppresses. The committed measurement should still not be leaning
        on that safety net without saying so.
        """
        for row in self.load()["projects"]:
            assert row["unresolved_production_edges"] == [], row["project"]

    def test_the_readable_count_rose_and_the_verified_sample_did_not(self):
        """The figure that goes stale first, pinned to both committed runs.

        Reading pnpm took readable from 9 to 16 without moving the hand-verified
        7. A record printing the old 9 would understate its own coverage; one
        printing 16 without saying what is verified would let 16-of-18 read as
        16 verified. Both are wrong, in opposite directions.
        """
        from triage import evidence

        assert self.load_prior()["coverage"]["counts"]["analysed"] == (
            evidence.PORTFOLIO_MANIFESTS_ANALYSABLE_NPM_ONLY
        )
        assert self.load()["coverage"]["counts"]["analysed"] == (
            evidence.PORTFOLIO_MANIFESTS_ANALYSABLE
        )
        assert evidence.PORTFOLIO_VERIFICATION_SAMPLE == 7
        assert "widened that gap" in evidence.ACCURACY_NOTE


class TestWorkspaceMembersAreNotDoubleCounted:
    """A member resolving through a root lockfile is reported, not re-triaged.

    Triaging it separately would run the whole workspace's component list once
    per member, so the same vulnerable package would appear in as many sections
    as the workspace has members. The coverage table names the member and points
    at the root instead.
    """

    def build(self, tmp_path):
        root_lock = {
            "lockfileVersion": 3,
            "packages": {
                "": {},
                "apps/web": {"name": "web"},
                "apps/api": {"name": "api"},
                "node_modules/left-pad": {"version": "1.3.0"},
            },
        }
        make_project(tmp_path, "", lock=root_lock)
        make_project(tmp_path, "apps/web", lock=None)
        make_project(tmp_path, "apps/api", lock=None)
        return discover(tmp_path, detect_deployment=False)

    def test_members_are_analysed_and_attributed_to_the_root(self, tmp_path):
        coverage = self.build(tmp_path)

        assert coverage.counts() == {"manifests_found": 3, "analysed": 3, "refused": 0}
        members = {p.path: p for p in coverage.analysed if p.covered_by is not None}
        assert set(members) == {"apps/web", "apps/api"}
        assert all(p.lockfile == "package-lock.json" for p in members.values())

    def test_only_the_lockfile_owner_is_triaged(self, tmp_path):
        coverage = self.build(tmp_path)

        triaged = [p for p in coverage.analysed if p.covered_by is None]

        assert [p.path for p in triaged] == ["."]

    def test_the_record_explains_where_a_members_findings_are(self, tmp_path):
        rendered = "\n".join(render_repository_coverage(self.build(tmp_path)))

        assert "3 of 3 npm projects in this repository were analysed" in rendered
        for path in ("apps/web", "apps/api"):
            assert f"`{path}` → resolved by `package-lock.json`" in rendered
        assert "reported under that root" in rendered
