"""Tests for the image release path ratchet.

A ratchet that cannot fail is worse than no ratchet, because CI prints a tick
for it. Most of what follows is therefore the failing direction: manifests that
name an unbuildable image, workflows that mention an image without building it,
declarations above their cap, and ceilings that have gone stale. The detector is
exercised against known-releasable and known-undeliverable fixtures for the same
reason `platform/ci/test/gate-substance.test.mjs` unit-tests its matcher — a
detector that silently matches nothing would pass forever while enforcing
nothing.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import image_release_path as irp


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def make_app(root: Path, name: str, image: str, kustomize_images: str = "") -> None:
    write(
        root / irp.APPS_DIR / name / "deployment.yaml",
        "apiVersion: apps/v1\n"
        "kind: Deployment\n"
        f"metadata:\n  name: {name}\n"
        "spec:\n  template:\n    spec:\n      containers:\n"
        f"      - name: {name}\n        image: {image}\n",
    )
    if kustomize_images:
        write(
            root / irp.APPS_DIR / name / "kustomization.yaml",
            "apiVersion: kustomize.config.k8s.io/v1beta1\n"
            "kind: Kustomization\n"
            f"images:\n{kustomize_images}",
        )


def make_baseline(
    root: Path,
    *,
    without_build_path: int,
    mutable: int,
    slack: int = 2,
    expires: date | None = None,
) -> None:
    expires = expires or (date.today() + timedelta(days=90))
    write(
        root / irp.BASELINE_PATH,
        "owner: duncan\n"
        "issue: docs/ENGINEERING-ROADMAP.md#image-release-path\n"
        f"expires: {expires.isoformat()}\n"
        "budget:\n"
        f"  max_without_build_path: {without_build_path}\n"
        f"  max_mutable_references: {mutable}\n"
        f"  slack: {slack}\n"
        "rationale: fixture\n",
    )


def make_register(root: Path, entries: str = "") -> None:
    write(root / "platform/image-tag-exceptions.yaml", "exceptions:\n" + entries)


def register_entry(
    *,
    id: str,
    path: str,
    count: int,
    claims: str = "",
    expires: date | None = None,
) -> str:
    expires = expires or (date.today() + timedelta(days=90))
    block = (
        f"  - id: {id}\n"
        f"    path: {path}\n"
        f"    count: {count}\n"
        "    owner: duncan\n"
        "    issue: docs/ENGINEERING-ROADMAP.md#image-release-path\n"
        f"    expires: {expires.isoformat()}\n"
        "    reason: fixture\n"
    )
    if claims:
        block += "    claims:\n" + claims
    return block


class TestImageReleasePathUnit(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp_dir.name)
        (self.repo / irp.WORKFLOWS_DIR).mkdir(parents=True)
        (self.repo / irp.APPS_DIR).mkdir(parents=True)

    def tearDown(self) -> None:
        self.tmp_dir.cleanup()

    def test_split_image(self) -> None:
        cases = [
            ("git.marisstella.dev/giteaadmin/app:latest", ("git.marisstella.dev/giteaadmin/app", "latest")),
            ("git.marisstella.dev/giteaadmin/app", ("git.marisstella.dev/giteaadmin/app", "")),
            ("nginx:alpine", ("nginx", "alpine")),
            ("nginx", ("nginx", "")),
            ("registry:5000/team/app:v1", ("registry:5000/team/app", "v1")),
            ("registry:5000/team/app", ("registry:5000/team/app", "")),
            (
                "git.marisstella.dev/giteaadmin/app@sha256:" + "a" * 63 + "b",
                ("git.marisstella.dev/giteaadmin/app", "sha256:" + "a" * 63 + "b"),
            ),
        ]
        for image, expected in cases:
            with self.subTest(image=image):
                self.assertEqual(irp.split_image(image), expected)

    def test_is_mutable(self) -> None:
        cases = [
            ("latest", True),
            ("main", True),
            ("master", True),
            ("", True),
            ("v1.2.3", False),
            ("sha256:" + "b" * 63 + "c", False),
        ]
        for ref, mutable in cases:
            with self.subTest(ref=ref):
                self.assertIs(irp.is_mutable(ref), mutable)

    def test_kustomize_digest_overrides_a_mutable_deployment_tag(self) -> None:
        overrides = {
            "git.marisstella.dev/giteaadmin/app": {"digest": "sha256:" + "c" * 63 + "d"}
        }
        repository, reference = irp.resolve(
            "git.marisstella.dev/giteaadmin/app:latest", overrides
        )
        self.assertEqual(repository, "git.marisstella.dev/giteaadmin/app")
        self.assertFalse(irp.is_mutable(reference))

    def test_kustomize_newtag_can_reintroduce_mutability(self) -> None:
        overrides = {"git.marisstella.dev/giteaadmin/app": {"newTag": "latest"}}
        _, reference = irp.resolve("git.marisstella.dev/giteaadmin/app:v1", overrides)
        self.assertTrue(irp.is_mutable(reference))

    def test_image_with_a_docker_build_workflow_is_releasable(self) -> None:
        make_app(self.repo, "shipper", irp.REGISTRY_PREFIX + "shipper:v1")
        write(
            self.repo / irp.WORKFLOWS_DIR / "shipper.yml",
            "jobs:\n  container:\n    steps:\n"
            f"      - run: docker build --tag {irp.REGISTRY_PREFIX}shipper:$SHA .\n",
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 0)
        self.assertEqual(measured["apps"][0]["built_by"], "shipper.yml")

    def test_build_push_action_also_counts(self) -> None:
        make_app(self.repo, "shipper", irp.REGISTRY_PREFIX + "shipper:v1")
        write(
            self.repo / irp.WORKFLOWS_DIR / "shipper.yml",
            "jobs:\n  container:\n    steps:\n"
            "      - uses: docker/build-push-action@abc\n"
            f"        with:\n          tags: {irp.REGISTRY_PREFIX}shipper:sha\n",
        )
        self.assertEqual(irp.measure(self.repo)["without_build_path"], 0)

    def test_a_workflow_that_only_deploys_does_not_count_as_a_producer(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:v1")
        write(
            self.repo / irp.WORKFLOWS_DIR / "deploy.yml",
            "jobs:\n  deploy:\n    steps:\n"
            f"      - run: kubectl set image deploy/phantom app={irp.REGISTRY_PREFIX}phantom:v1\n",
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 1)
        self.assertEqual(measured["without_build_path_apps"], ["phantom"])

    def test_a_workflow_building_a_different_image_does_not_cover_this_one(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:v1")
        write(
            self.repo / irp.WORKFLOWS_DIR / "other.yml",
            f"jobs:\n  c:\n    steps:\n      - run: docker build --tag {irp.REGISTRY_PREFIX}other:v1 .\n",
        )
        self.assertEqual(irp.measure(self.repo)["without_build_path"], 1)

    def test_third_party_images_are_out_of_scope(self) -> None:
        make_app(self.repo, "service-template", "nginx:alpine")
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 0)
        self.assertEqual(measured["mutable_references"], 0)
        self.assertTrue(measured["apps"][0]["external"])

    def test_init_containers_are_audited_too(self) -> None:
        write(
            self.repo / irp.APPS_DIR / "withinit" / "deployment.yaml",
            "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: withinit\n"
            "spec:\n  template:\n    spec:\n      initContainers:\n"
            f"      - name: migrate\n        image: {irp.REGISTRY_PREFIX}migrate:latest\n"
            "      containers:\n"
            f"      - name: app\n        image: {irp.REGISTRY_PREFIX}app:latest\n",
        )
        self.assertEqual(irp.measure(self.repo)["without_build_path"], 2)

    def test_non_workload_documents_are_ignored(self) -> None:
        write(
            self.repo / irp.APPS_DIR / "svc" / "deployment.yaml",
            "apiVersion: v1\nkind: Service\nmetadata:\n  name: svc\n",
        )
        self.assertEqual(irp.measure(self.repo)["apps"], [])

    def test_a_job_in_another_file_is_read(self) -> None:
        write(
            self.repo / irp.APPS_DIR / "hooked" / "release-hooks.yaml",
            "apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: migrate\n"
            "spec:\n  template:\n    spec:\n      containers:\n"
            f"        - name: migrate\n          image: {irp.REGISTRY_PREFIX}migrate:latest\n",
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 1)
        self.assertEqual(measured["mutable_references"], 1)
        self.assertEqual(measured["apps"][0]["kind"], "Job")

    def test_a_cronjob_pod_template_is_found_at_its_own_depth(self) -> None:
        write(
            self.repo / irp.APPS_DIR / "backup" / "cronjob.yaml",
            "apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: backup\n"
            'spec:\n  schedule: "0 3 * * *"\n  jobTemplate:\n    spec:\n      template:\n'
            "        spec:\n          containers:\n"
            f"            - name: dump\n              image: {irp.REGISTRY_PREFIX}dump:latest\n",
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 1)
        self.assertEqual(measured["apps"][0]["kind"], "CronJob")

    def test_a_statefulset_and_a_daemonset_are_read(self) -> None:
        write(
            self.repo / irp.APPS_DIR / "stateful" / "workloads.yaml",
            "apiVersion: apps/v1\nkind: StatefulSet\nmetadata:\n  name: s\n"
            "spec:\n  template:\n    spec:\n      containers:\n"
            f"        - name: s\n          image: {irp.REGISTRY_PREFIX}s:latest\n"
            "---\n"
            "apiVersion: apps/v1\nkind: DaemonSet\nmetadata:\n  name: d\n"
            "spec:\n  template:\n    spec:\n      containers:\n"
            f"        - name: d\n          image: {irp.REGISTRY_PREFIX}d:latest\n",
        )
        self.assertEqual(irp.measure(self.repo)["without_build_path"], 2)

    def test_the_kustomization_is_still_read_as_an_overlay_not_a_workload(self) -> None:
        make_app(
            self.repo,
            "pinned",
            irp.REGISTRY_PREFIX + "pinned:latest",
            kustomize_images=f"- name: {irp.REGISTRY_PREFIX}pinned\n  digest: sha256:{'e' * 63}f\n",
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["mutable_references"], 0)
        self.assertEqual(len(measured["apps"]), 1)

    def test_unparseable_manifest_is_an_error_not_a_skip(self) -> None:
        write(self.repo / irp.APPS_DIR / "broken" / "deployment.yaml", "kind: [unclosed\n")
        with self.assertRaisesRegex(irp.RatchetError, "could not parse"):
            irp.measure(self.repo)

    def test_a_third_party_terraform_image_is_out_of_scope(self) -> None:
        write(
            self.repo / "platform/terraform/ide.tf",
            'resource "helm_release" "ide" {\n  image = "codercom/code-server:4.1.0"\n}\n',
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 0)
        self.assertEqual(measured["mutable_references"], 0)
        self.assertTrue(measured["apps"][0]["external"])

    def test_an_unresolvable_terraform_repository_counts_both_ways(self) -> None:
        write(
            self.repo / "platform/terraform/services.tf",
            'resource "helm_release" "web" {\n'
            "  for_each = var.services\n"
            "  values = [yamlencode({\n"
            "    image = {\n      repository = each.value.image\n"
            "      tag        = each.value.tag\n    }\n  })]\n}\n",
        )
        measured = irp.measure(self.repo)
        self.assertEqual(measured["without_build_path"], 1)
        self.assertEqual(measured["mutable_references"], 1)
        self.assertEqual(measured["without_build_path_apps"], ["terraform:services"])

    def test_a_broken_terraform_surface_fails_closed(self) -> None:
        (self.repo / "platform/terraform").mkdir(parents=True)
        with self.assertRaisesRegex(irp.RatchetError, "scan is broken"):
            irp.measure(self.repo)

    def test_passes_when_measurement_matches_the_declaration(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        make_baseline(self.repo, without_build_path=1, mutable=1)
        make_register(self.repo)
        _, failures = irp.evaluate(self.repo)
        self.assertEqual(failures, [])

    def test_fails_when_an_unbuildable_deployment_is_added(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        make_app(self.repo, "phantom2", irp.REGISTRY_PREFIX + "phantom2:latest")
        make_baseline(self.repo, without_build_path=1, mutable=2)
        make_register(self.repo)
        _, failures = irp.evaluate(self.repo)
        self.assertTrue(any("max_without_build_path=1" in f for f in failures))
        self.assertTrue(any("phantom2" in f for f in failures))

    def test_fails_when_a_ceiling_has_gone_stale(self) -> None:
        make_app(self.repo, "shipper", irp.REGISTRY_PREFIX + "shipper:v1")
        write(
            self.repo / irp.WORKFLOWS_DIR / "shipper.yml",
            f"jobs:\n  c:\n    steps:\n      - run: docker build --tag {irp.REGISTRY_PREFIX}shipper:v1 .\n",
        )
        make_baseline(self.repo, without_build_path=5, mutable=0, slack=2)
        make_register(self.repo)
        _, failures = irp.evaluate(self.repo)
        self.assertTrue(any("stale" in f for f in failures))

    def test_fails_when_a_release_becomes_mutable(self) -> None:
        make_app(self.repo, "pinned", irp.REGISTRY_PREFIX + "pinned:latest")
        make_baseline(self.repo, without_build_path=1, mutable=0)
        make_register(self.repo)
        _, failures = irp.evaluate(self.repo)
        self.assertTrue(any("mutable" in f for f in failures))

    def test_a_true_no_build_path_claim_passes(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        make_baseline(self.repo, without_build_path=1, mutable=1)
        make_register(
            self.repo,
            register_entry(
                id="IMG-T1",
                path=f"{irp.APPS_DIR}/*/deployment.yaml",
                count=1,
                claims="      no_build_path: true\n",
            ),
        )
        _, failures = irp.evaluate(self.repo)
        self.assertEqual(failures, [])

    def test_a_no_build_path_claim_fails_once_the_image_has_a_producer(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        make_baseline(self.repo, without_build_path=1, mutable=1)
        make_register(
            self.repo,
            register_entry(
                id="IMG-T1",
                path=f"{irp.APPS_DIR}/*/deployment.yaml",
                count=1,
                claims="      no_build_path: true\n",
            ),
        )
        write(
            self.repo / irp.WORKFLOWS_DIR / "phantom-image.yml",
            "jobs:\n  c:\n    steps:\n"
            f"      - run: docker build --tag {irp.REGISTRY_PREFIX}phantom:$SHA .\n",
        )
        _, failures = irp.evaluate(self.repo)
        self.assertTrue(any("IMG-T1" in f and "no_build_path" in f for f in failures))
        self.assertTrue(any("phantom-image.yml" in f for f in failures))

    def test_a_specific_entry_above_a_glob_is_judged_on_its_own_references(self) -> None:
        make_app(self.repo, "built", irp.REGISTRY_PREFIX + "built:latest")
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        write(
            self.repo / irp.WORKFLOWS_DIR / "built-image.yml",
            "jobs:\n  c:\n    steps:\n"
            f"      - run: docker build --tag {irp.REGISTRY_PREFIX}built:$SHA .\n",
        )
        make_baseline(self.repo, without_build_path=1, mutable=2)
        make_register(
            self.repo,
            register_entry(id="IMG-T2", path=f"{irp.APPS_DIR}/built/deployment.yaml", count=1)
            + register_entry(
                id="IMG-T1",
                path=f"{irp.APPS_DIR}/*/deployment.yaml",
                count=1,
                claims="      no_build_path: true\n",
            ),
        )
        _, failures = irp.evaluate(self.repo)
        self.assertEqual(failures, [])

    def test_an_unreadable_register_fails_closed(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        make_baseline(self.repo, without_build_path=1, mutable=1)
        write(self.repo / "platform/image-tag-exceptions.yaml", "exceptions: [[[\n")
        with self.assertRaises(irp.RatchetError):
            irp.evaluate(self.repo)

    def test_a_missing_register_fails_closed(self) -> None:
        make_app(self.repo, "phantom", irp.REGISTRY_PREFIX + "phantom:latest")
        make_baseline(self.repo, without_build_path=1, mutable=1)
        with self.assertRaises(irp.RatchetError):
            irp.evaluate(self.repo)

    def test_missing_baseline_fails_closed(self) -> None:
        with self.assertRaisesRegex(irp.RatchetError, "missing"):
            irp.load_baseline(self.repo)

    def test_missing_required_field_fails_closed(self) -> None:
        import yaml

        for field in irp.REQUIRED_TOP_FIELDS:
            with self.subTest(field=field):
                make_baseline(self.repo, without_build_path=1, mutable=1)
                path = self.repo / irp.BASELINE_PATH
                document = yaml.safe_load(path.read_text())
                del document[field]
                path.write_text(yaml.safe_dump(document), encoding="utf-8")
                with self.assertRaises(irp.RatchetError):
                    irp.load_baseline(self.repo)

    def test_missing_budget_field_fails_closed(self) -> None:
        import yaml

        for field in irp.REQUIRED_BUDGET_FIELDS:
            with self.subTest(field=field):
                make_baseline(self.repo, without_build_path=1, mutable=1)
                path = self.repo / irp.BASELINE_PATH
                document = yaml.safe_load(path.read_text())
                del document["budget"][field]
                path.write_text(yaml.safe_dump(document), encoding="utf-8")
                with self.assertRaisesRegex(irp.RatchetError, field):
                    irp.load_baseline(self.repo)

    def test_unparseable_baseline_fails_closed(self) -> None:
        make_baseline(self.repo, without_build_path=1, mutable=1)
        path = self.repo / irp.BASELINE_PATH
        path.write_text("budget:\n  max: [unclosed\n", encoding="utf-8")
        with self.assertRaisesRegex(irp.RatchetError, "not valid YAML"):
            irp.load_baseline(self.repo)

    def test_ceiling_above_its_cap_is_refused(self) -> None:
        make_baseline(
            self.repo,
            without_build_path=irp.MAX_DECLARED_WITHOUT_BUILD_PATH + 1,
            mutable=1,
        )
        with self.assertRaisesRegex(irp.RatchetError, "above the cap"):
            irp.load_baseline(self.repo)

    def test_mutable_ceiling_above_its_cap_is_refused(self) -> None:
        make_baseline(
            self.repo,
            without_build_path=1,
            mutable=irp.MAX_DECLARED_MUTABLE_REFERENCES + 1,
        )
        with self.assertRaisesRegex(irp.RatchetError, "above the cap"):
            irp.load_baseline(self.repo)

    def test_slack_above_its_cap_is_refused(self) -> None:
        make_baseline(
            self.repo, without_build_path=1, mutable=1, slack=irp.MAX_DECLARED_SLACK + 1
        )
        with self.assertRaisesRegex(irp.RatchetError, "slack"):
            irp.load_baseline(self.repo)

    def test_expired_baseline_is_refused(self) -> None:
        make_baseline(
            self.repo,
            without_build_path=1,
            mutable=1,
            expires=date.today() - timedelta(days=1),
        )
        with self.assertRaisesRegex(irp.RatchetError, "expired"):
            irp.load_baseline(self.repo)

    def test_expiry_beyond_the_horizon_is_refused(self) -> None:
        make_baseline(
            self.repo,
            without_build_path=1,
            mutable=1,
            expires=date.today() + timedelta(days=irp.MAX_EXPIRY_DAYS + 10),
        )
        with self.assertRaisesRegex(irp.RatchetError, "horizon"):
            irp.load_baseline(self.repo)

    def test_non_integer_ceiling_is_refused(self) -> None:
        make_baseline(self.repo, without_build_path=1, mutable=1)
        path = self.repo / irp.BASELINE_PATH
        path.write_text(
            path.read_text().replace(
                "max_without_build_path: 1", "max_without_build_path: some"
            ),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(irp.RatchetError, "non-negative integer"):
            irp.load_baseline(self.repo)


class TestRealRepository(unittest.TestCase):
    def test_the_audit_runs_against_this_repository(self) -> None:
        measured = irp.measure(REPO_ROOT)
        self.assertTrue(measured["apps"], "no Kubernetes app manifests were found at all")

    def test_local_site_studio_can_now_be_built(self) -> None:
        measured = irp.measure(REPO_ROOT)
        self.assertNotIn("local-site-studio", measured["without_build_path_apps"])

    def test_the_release_hook_jobs_are_counted(self) -> None:
        kinds = {app["kind"] for app in irp.measure(REPO_ROOT)["apps"]}
        self.assertTrue({"Job", "CronJob"} <= kinds, kinds)

    def test_the_terraform_surface_is_measured(self) -> None:
        from_terraform = [a for a in irp.measure(REPO_ROOT)["apps"] if a["kind"] == "terraform"]
        self.assertGreaterEqual(len(from_terraform), 8, f"found {len(from_terraform)}")

    def test_this_repository_is_within_its_declared_baseline(self) -> None:
        _, failures = irp.evaluate(REPO_ROOT)
        self.assertEqual(failures, [], "; ".join(failures))


if __name__ == "__main__":
    unittest.main()
