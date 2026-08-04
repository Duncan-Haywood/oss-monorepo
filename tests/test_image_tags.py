#!/usr/bin/env python3
"""
Unit and contract tests for the container image tag audit.

The step this gate replaces —
`.gitea/workflows/deploy-services.yml`'s "Reject mutable image tags" — rendered
the Helm chart with `--set image.tag=ci-$GITHUB_SHA` and then grepped that
render for `latest|main|master`. It searched for a string it had just made
impossible, so it passed on every run ever made, over manifests it never read.

So the tests that matter here are the failing ones: a mutable tag with no
exception, an absent tag, a registered count that grew, a registered count that
went stale, an expired exception, and an expiry beyond the cap. A gate is only
worth its green when its red has been seen.

The overlay tests exist because the naive check is wrong in this repository:
`quick-pick-survey` writes an untagged image in `deployment.yaml` and pins the
digest in `kustomization.yaml`. That is the correct pattern and the one the
other seven ventures should copy, so a control that failed it would be teaching
the wrong lesson.

No test here is skipped or conditionally skipped.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import subprocess
import tempfile
import unittest
from datetime import date, timedelta

import yaml

from image_tags import (
    EXCEPTIONS_PATH,
    MAX_EXPIRY_DAYS,
    ImageTagError,
    apply_overlay,
    audit,
    check_expiry,
    classify,
    is_immutable_tag,
    load_exceptions,
    scan,
    split_reference,
)
from terraform_images import TERRAFORM_ROOT


def write_terraform(root: Path, name: str, body: str) -> None:
    directory = root / TERRAFORM_ROOT
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(body, encoding="utf-8")


def write_manifest(directory: Path, name: str, image: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(
        yaml.safe_dump(
            {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "spec": {"template": {"spec": {"containers": [{"name": "web", "image": image}]}}},
            }
        ),
        encoding="utf-8",
    )


def write_exceptions(root: Path, entries: list) -> None:
    (root / "platform").mkdir(parents=True, exist_ok=True)
    (root / EXCEPTIONS_PATH).write_text(yaml.safe_dump({"exceptions": entries}), encoding="utf-8")


class ReferenceParsingTest(unittest.TestCase):
    def test_splits_name_tag_and_digest(self):
        self.assertEqual(split_reference("app:1.2.3"), ("app", "1.2.3", None))
        self.assertEqual(split_reference("app"), ("app", None, None))
        self.assertEqual(split_reference("r.io/ns/app@sha256:ab"), ("r.io/ns/app", None, "sha256:ab"))

    def test_a_registry_port_is_not_a_tag(self):
        """`registry:5000/app` has a colon, and no tag. The naive split gets this wrong."""
        self.assertEqual(split_reference("registry:5000/app"), ("registry:5000/app", None, None))
        self.assertEqual(split_reference("registry:5000/app:2"), ("registry:5000/app", "2", None))


class ClassifyTest(unittest.TestCase):
    def test_mutable_tags_are_rejected(self):
        for tag in ("latest", "main", "master", "LATEST"):
            with self.subTest(tag=tag):
                mutable, _ = classify(f"registry/app:{tag}")
                self.assertTrue(mutable, f":{tag} must be treated as mutable")

    def test_an_absent_tag_is_rejected(self):
        """Kubernetes supplies `:latest`, so the omission is the same defect."""
        mutable, why = classify("registry/app")
        self.assertTrue(mutable)
        self.assertIn("latest", why)

    def test_digests_and_versions_are_accepted(self):
        self.assertFalse(classify("registry/app@sha256:" + "a" * 64)[0])
        self.assertFalse(classify("registry/app:v1.36.0")[0])
        self.assertFalse(classify("postgres:16-alpine")[0])


class ImmutableFormTest(unittest.TestCase):
    """The rule that replaced the ten-word denylist.

    The denylist held `latest, main, master, stable, edge, dev, develop,
    nightly, prod, production`, so `:release`, `:current`, `:staging`, `:live`
    and `:rolling` were all read as pinned — and its own docstring claimed
    `:alpine` was "caught by the digest rule instead", which it was not. Every
    word below is one a denylist has to have thought of in advance. The rule
    here does not have to: it asks whether the tag names one specific build.
    """

    MUTABLE = (
        "latest",
        "main",
        "master",
        "stable",
        "edge",
        "dev",
        "nightly",
        "production",
        # The five the ten-word list let through, and the two this repository
        # actually deploys today.
        "release",
        "current",
        "staging",
        "live",
        "rolling",
        "alpine",
        "plain-text",
        "slim",
        "bookworm",
        "canary",
        "next",
        "",
    )

    IMMUTABLE = (
        "v1.36.0",
        "1.38.0",
        "16-alpine",
        "7-alpine",
        "3.11-slim",
        "0.38.0-alpine",
        "22-alpine",
        "2026.08.04",
        "sha256:" + "a" * 64,
        # What this repository's own publishing workflows produce.
        "a719980a1c3f5d2",
        "ci-" + "b" * 40,
        "sha-" + "c" * 12,
    )

    def test_only_immutable_forms_are_accepted(self):
        for tag in self.MUTABLE:
            with self.subTest(tag=tag):
                self.assertFalse(is_immutable_tag(tag), f":{tag} must not read as pinned")
        for tag in self.IMMUTABLE:
            with self.subTest(tag=tag):
                self.assertTrue(is_immutable_tag(tag), f":{tag} names a build and must pass")

    def test_the_rule_is_not_a_denylist_in_disguise(self):
        """A tag nobody thought of is mutable by default, not pinned by default."""
        for invented in ("wibble", "tuesday", "shiny-new-thing", "gold", "lts"):
            with self.subTest(tag=invented):
                self.assertTrue(classify(f"registry/app:{invented}")[0])


class TerraformSurfaceTest(unittest.TestCase):
    """The second deployment surface, which no control read before 2026-08-04."""

    def test_a_mutable_terraform_tag_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo@sha256:" + "d" * 64)
            write_terraform(
                root,
                "ide.tf",
                'resource "helm_release" "ide" {\n'
                "  values = [yamlencode({\n"
                '    image = {\n      repository = "codercom/code-server"\n'
                '      tag        = "latest"\n    }\n  })]\n}\n',
            )
            write_exceptions(root, [])
            findings = audit(root)
            self.assertEqual([f.code for f in findings], ["mutable-image-tag"])
            self.assertIn("code-server", findings[0].message)

    def test_an_unresolvable_terraform_tag_is_an_error_not_a_pass(self):
        """Cannot-see and approve must not be the same outcome."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo@sha256:" + "d" * 64)
            write_terraform(root, "variables.tf", 'variable "t" {\n  type = string\n}\n')
            write_terraform(
                root,
                "ide.tf",
                'resource "helm_release" "ide" {\n'
                "  values = [yamlencode({\n"
                '    image = {\n      repository = "ns/app"\n'
                "      tag        = var.t\n    }\n  })]\n}\n",
            )
            write_exceptions(root, [])
            findings = audit(root)
            self.assertEqual([f.code for f in findings], ["mutable-image-tag"])
            self.assertIn("not resolvable from tracked sources", findings[0].message)

    def test_a_pinned_terraform_tag_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo@sha256:" + "d" * 64)
            write_terraform(
                root,
                "db.tf",
                'resource "kubernetes_deployment" "db" {\n  image = "postgres:16-alpine"\n}\n',
            )
            write_exceptions(root, [])
            self.assertEqual(audit(root), [])

    def test_an_unreadable_terraform_surface_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo@sha256:" + "d" * 64)
            (root / TERRAFORM_ROOT).mkdir(parents=True)
            write_exceptions(root, [])
            with self.assertRaises(ImageTagError):
                audit(root)


class OverlayTest(unittest.TestCase):
    def test_a_digest_overlay_pins_an_untagged_image(self):
        overrides = {"ns/app": {"newName": "ns/app", "digest": "sha256:" + "b" * 64}}
        resolved = apply_overlay("ns/app", overrides)
        self.assertEqual(resolved, "ns/app@sha256:" + "b" * 64)
        self.assertFalse(classify(resolved)[0])

    def test_a_newtag_overlay_is_what_gets_judged(self):
        """The overlay decides, so `image: app:v1` under `newTag: latest` is mutable."""
        overrides = {"ns/app": {"newTag": "latest"}}
        resolved = apply_overlay("ns/app:v1", overrides)
        self.assertTrue(classify(resolved)[0])

    def test_an_unmatched_image_is_left_alone(self):
        self.assertEqual(apply_overlay("other/app:v1", {"ns/app": {"newTag": "latest"}}), "other/app:v1")


class GateCanFailTest(unittest.TestCase):
    """The property the replaced step never had."""

    def test_an_unregistered_mutable_tag_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo:latest")
            write_exceptions(root, [])
            findings = audit(root)
            self.assertEqual([f.code for f in findings], ["mutable-image-tag"])

    def test_an_untagged_image_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo")
            write_exceptions(root, [])
            self.assertEqual([f.code for f in audit(root)], ["mutable-image-tag"])

    def test_a_pinned_manifest_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(
                root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo@sha256:" + "c" * 64
            )
            write_exceptions(root, [])
            self.assertEqual(audit(root), [])

    def test_the_cli_exits_nonzero_on_a_mutable_tag(self):
        """End to end, because a policy that only fails in-process is not a gate."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/demo", "deployment.yaml", "ns/demo:latest")
            write_exceptions(root, [])
            completed = subprocess.run(
                [sys.executable, str(CI_DIR / "image_tags.py"), "--repo-root", str(root)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 1, completed.stdout + completed.stderr)
            self.assertIn("mutable-image-tag", completed.stderr)

    def test_an_empty_scan_is_an_error_not_a_pass(self):
        """A broken scan must not look like a clean repository."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "platform/k8s").mkdir(parents=True)
            write_exceptions(root, [])
            with self.assertRaises(ImageTagError):
                audit(root)

    def test_unparseable_yaml_is_an_error_not_a_skip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / "platform/k8s/apps/demo"
            directory.mkdir(parents=True)
            (directory / "deployment.yaml").write_text("image: [unclosed\n", encoding="utf-8")
            write_exceptions(root, [])
            with self.assertRaises(ImageTagError):
                audit(root)


class CountRatchetTest(unittest.TestCase):
    def _entry(self, count: int, expires: date) -> dict:
        return {
            "id": "IMG-TEST",
            "path": "platform/k8s/apps/*/deployment.yaml",
            "count": count,
            "owner": "duncan",
            "issue": "docs/ENGINEERING-ROADMAP.md",
            "reason": "test fixture",
            "expires": expires.isoformat(),
        }

    def test_more_than_declared_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/a", "deployment.yaml", "ns/a:latest")
            write_manifest(root / "platform/k8s/apps/b", "deployment.yaml", "ns/b:latest")
            write_exceptions(root, [self._entry(1, date.today() + timedelta(days=30))])
            self.assertEqual([f.code for f in audit(root)], ["exception-count-high"])

    def test_fewer_than_declared_fails_as_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/a", "deployment.yaml", "ns/a:latest")
            write_exceptions(root, [self._entry(2, date.today() + timedelta(days=30))])
            self.assertEqual([f.code for f in audit(root)], ["exception-count-low"])

    def test_the_declared_count_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/a", "deployment.yaml", "ns/a:latest")
            write_exceptions(root, [self._entry(1, date.today() + timedelta(days=30))])
            self.assertEqual(audit(root), [])

    def test_a_missing_required_field_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_manifest(root / "platform/k8s/apps/a", "deployment.yaml", "ns/a:latest")
            entry = self._entry(1, date.today() + timedelta(days=30))
            del entry["owner"]
            write_exceptions(root, [entry])
            with self.assertRaises(ImageTagError):
                load_exceptions(root)


class ExpiryTest(unittest.TestCase):
    def _entry(self, expires: str) -> dict:
        return {"id": "IMG-TEST", "expires": expires}

    def test_an_expired_exception_fails(self):
        today = date(2026, 8, 2)
        findings = check_expiry([self._entry("2026-08-01")], today)
        self.assertEqual([f.code for f in findings], ["exception-expired"])

    def test_an_expiry_beyond_the_cap_fails(self):
        today = date(2026, 8, 2)
        far = (today + timedelta(days=MAX_EXPIRY_DAYS + 1)).isoformat()
        self.assertEqual([f.code for f in check_expiry([self._entry(far)], today)], ["exception-too-long"])

    def test_an_expiry_inside_the_cap_passes(self):
        today = date(2026, 8, 2)
        near = (today + timedelta(days=30)).isoformat()
        self.assertEqual(check_expiry([self._entry(near)], today), [])


class RepositoryContractTest(unittest.TestCase):
    """The gate itself, executed against this repository."""

    def test_every_mutable_reference_is_registered(self):
        findings = audit(REPO_ROOT)
        self.assertEqual(
            [f.format() for f in findings],
            [],
            f"image references drifted from {EXCEPTIONS_PATH}",
        )

    def test_the_live_venture_is_digest_pinned(self):
        """quick-pick-survey is the only venture deploying from its manifest.

        It is also the worked example the register points the other seven at, so
        a change that loosened it would quietly remove the thing they are meant
        to copy.
        """
        refs = [r for r in scan(REPO_ROOT) if "quick-pick-survey" in r.path]
        self.assertTrue(refs, "expected quick-pick-survey manifests in the scan")
        unpinned = [r.format() for r in refs if r.mutable]
        self.assertEqual(unpinned, [], "the live venture must stay digest-pinned")

    def test_the_scan_reaches_the_real_manifests(self):
        refs = scan(REPO_ROOT)
        self.assertGreaterEqual(
            len(refs), 10, f"expected the scan to find this platform's manifests, found {len(refs)}"
        )

    def test_the_scan_reaches_the_terraform_surface_too(self):
        """Anti-vacuity for the widening itself.

        A `SCAN_ROOT` that quietly stopped covering `platform/terraform/` would
        make this gate green again while restoring the exact blind spot it was
        widened to close, and nothing else here would notice.
        """
        refs = [r for r in scan(REPO_ROOT) if r.path.startswith(TERRAFORM_ROOT)]
        self.assertGreaterEqual(
            len(refs), 8, f"expected the terraform deployment surface, found {len(refs)}"
        )

    def test_no_terraform_source_declares_a_literal_latest(self):
        """The regression guard for the 2026-08-04 fix.

        Scoped to terraform: the seven `platform/k8s/apps/*` ventures still
        carry `:latest` and are registered as IMG-001, with a reason and an
        expiry. Terraform's two `codercom/code-server` releases and
        `variables.tf`'s `tag = optional(string, "latest")` were not registered,
        they were removed, and this fails if any of them comes back.
        """
        literal = [
            r.format()
            for r in scan(REPO_ROOT)
            if r.path.startswith(TERRAFORM_ROOT) and ":latest" in r.declared
        ]
        self.assertEqual(literal, [], "a tracked terraform source writes :latest again")


if __name__ == "__main__":
    unittest.main()
