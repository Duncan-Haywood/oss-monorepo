"""Tests for the terraform deployment-surface reader.

`platform/terraform/` was read by no control in this repository until
2026-08-04. Adding a reader that *runs* is not the same as adding a reader that
*works*, and a reader that silently matched nothing would restore the previous
state while printing a tick — so most of what follows is the reader failing, or
resolving something a naive regex would miss.

Three properties matter more than the rest:

  * the reader never opens `*.tfvars`, `*.tfstate` or `.terraform/`. That is a
    security property, not a tidiness one: `platform/terraform/terraform.tfvars`
    is untracked and holds a live Hetzner token, database passwords and an admin
    key. `test_a_tfvars_file_is_never_opened` places one in the scanned tree and
    asserts nothing reads it;
  * an expression the reader cannot resolve is reported as unresolved, never
    dropped. "The control cannot see it" and "the control approves" must be
    different outcomes;
  * a Helm template is not skipped for failing to parse as YAML. It is checked
    with the rule that applies to a template instead.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import terraform_images as tfi


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class TestTerraformImagesUnit(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        (self.tmp_path / tfi.TERRAFORM_ROOT).mkdir(parents=True)
        self.tf = self.tmp_path

    def tearDown(self) -> None:
        self.tmp_dir.cleanup()

    def test_a_literal_image_attribute_is_found(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "db.tf",
            'resource "kubernetes_deployment" "db" {\n'
            "  spec {\n    container {\n"
            '      image = "postgres:16-alpine"\n'
            "    }\n  }\n}\n",
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertEqual(image.reference, "postgres:16-alpine")
        self.assertTrue(image.resolved)
        self.assertEqual(image.line, 4)

    def test_an_image_block_is_composed_from_repository_and_tag(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "ide.tf",
            'resource "helm_release" "ide" {\n'
            "  values = [yamlencode({\n"
            "    image = {\n"
            '      repository = "codercom/code-server"\n'
            '      tag        = "latest"\n'
            "    }\n  })]\n}\n",
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertEqual(image.reference, "codercom/code-server:latest")
        self.assertTrue(image.resolved)

    def test_a_machine_image_is_not_a_container_image(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "nodes.tf",
            'resource "hcloud_server" "primary" {\n  image = "ubuntu-24.04"\n}\n',
        )
        self.assertEqual(tfi.scan_terraform(self.tf), [])

    def test_an_unknown_resource_type_is_audited_rather_than_ignored(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "new.tf",
            'resource "some_future_container_thing" "x" {\n  image = "app:latest"\n}\n',
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertEqual(image.reference, "app:latest")

    def test_an_optional_attribute_default_is_the_tag_that_ships(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "variables.tf",
            'variable "services" {\n'
            "  type = map(object({\n"
            "    image = string\n"
            '    tag   = optional(string, "latest")\n'
            "  }))\n"
            "  default = {}\n}\n",
        )
        write(
            self.tf / tfi.TERRAFORM_ROOT / "services.tf",
            'resource "helm_release" "web" {\n'
            "  for_each = var.services\n"
            "  values = [yamlencode({\n"
            "    image = {\n"
            '      repository = "example/app"\n'
            "      tag        = each.value.tag\n"
            "    }\n  })]\n}\n",
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertEqual(image.tag, "latest")
        self.assertTrue(image.resolved)

    def test_a_variable_with_no_default_is_unresolved_not_assumed(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "variables.tf",
            'variable "ide_tag" {\n  type = string\n}\n',
        )
        write(
            self.tf / tfi.TERRAFORM_ROOT / "ide.tf",
            'resource "helm_release" "ide" {\n'
            "  values = [yamlencode({\n"
            "    image = {\n"
            '      repository = "codercom/code-server"\n'
            "      tag        = var.ide_tag\n"
            "    }\n  })]\n}\n",
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertFalse(image.tag_resolved)
        self.assertTrue(image.repository_resolved)
        self.assertFalse(image.resolved)

    def test_an_expression_is_never_guessed_at(self) -> None:
        write(
            self.tf / tfi.TERRAFORM_ROOT / "svc.tf",
            'resource "helm_release" "web" {\n'
            "  for_each = var.services\n"
            "  values = [yamlencode({\n"
            "    image = {\n"
            '      repository = each.key == "a" ? "one/app" : each.value.image\n'
            '      tag        = "v1"\n'
            "    }\n  })]\n}\n",
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertFalse(image.repository_resolved)
        self.assertIn("unresolved from tracked sources", image.origin)

    def test_a_scalar_variable_default_is_followed(self) -> None:
        write(self.tf / tfi.TERRAFORM_ROOT / "variables.tf", 'variable "t" {\n  default = "v2.1.0"\n}\n')
        write(
            self.tf / tfi.TERRAFORM_ROOT / "app.tf",
            'resource "helm_release" "a" {\n'
            "  values = [yamlencode({\n"
            '    image = {\n      repository = "ns/app"\n      tag = var.t\n    }\n  })]\n}\n',
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertEqual(image.reference, "ns/app:v2.1.0")

    def test_chart_default_values_are_a_real_reference(self) -> None:
        write(self.tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
        write(
            self.tf / tfi.TERRAFORM_ROOT / "helm/web-service/values.yaml",
            "image:\n  repository: nginx\n  tag: alpine\n",
        )
        (image,) = tfi.scan_terraform(self.tf)
        self.assertEqual(image.reference, "nginx:alpine")

    def test_a_template_that_hardcodes_an_image_is_an_error(self) -> None:
        write(self.tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
        write(
            self.tf / tfi.TERRAFORM_ROOT / "helm/web-service/templates/deployment.yaml",
            "spec:\n  containers:\n    - image: evil/backdoor:latest\n",
        )
        with self.assertRaisesRegex(tfi.TerraformSurfaceError, "hardcodes an image"):
            tfi.scan_terraform(self.tf)

    def test_an_interpolated_template_image_is_accepted(self) -> None:
        write(self.tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
        write(
            self.tf / tfi.TERRAFORM_ROOT / "helm/web-service/templates/deployment.yaml",
            "{{- if .Values.enabled }}\n"
            '    - image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"\n'
            "{{- end }}\n",
        )
        self.assertEqual(tfi.scan_terraform(self.tf), [])

    def test_a_terraform_directory_with_no_sources_is_an_error_not_a_pass(self) -> None:
        with self.assertRaisesRegex(tfi.TerraformSurfaceError, "scan is broken"):
            tfi.scan_terraform(self.tf)

    def test_a_repository_with_no_terraform_has_no_terraform_surface(self) -> None:
        empty_dir = Path(tempfile.mkdtemp())
        try:
            self.assertEqual(tfi.scan_terraform(empty_dir), [])
        finally:
            import shutil
            shutil.rmtree(empty_dir)

    def test_unparseable_chart_values_are_an_error_not_a_skip(self) -> None:
        write(self.tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
        write(self.tf / tfi.TERRAFORM_ROOT / "helm/c/values.yaml", "image: [unclosed\n")
        with self.assertRaisesRegex(tfi.TerraformSurfaceError, "could not parse"):
            tfi.scan_terraform(self.tf)

    def test_a_tfvars_file_is_never_opened(self) -> None:
        names = ["terraform.tfvars", "prod.tfvars", "terraform.tfvars.json", "terraform.tfstate"]
        for name in names:
            with self.subTest(name=name):
                write(self.tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
                write(self.tf / tfi.TERRAFORM_ROOT / name, 'hcloud_token = "NOT-A-REAL-TOKEN"\n')

                opened: list[str] = []
                original = Path.read_text

                def spy(path_obj, *args, **kwargs):
                    opened.append(path_obj.as_posix())
                    return original(path_obj, *args, **kwargs)

                with patch.object(Path, "read_text", side_effect=spy, autospec=True):
                    tfi.scan_terraform(self.tf)

                self.assertFalse(
                    [p for p in opened if p.endswith(name)],
                    f"{name} was opened",
                )

    def test_the_refusal_covers_the_dot_terraform_directory(self) -> None:
        self.assertTrue(tfi.is_refused(Path("platform/terraform/.terraform/x/main.tf")))
        self.assertTrue(tfi.is_refused(Path("platform/terraform/terraform.tfvars")))
        self.assertFalse(tfi.is_refused(Path("platform/terraform/main.tf")))


class TestRealRepository(unittest.TestCase):
    def test_the_reader_reaches_this_repositorys_terraform(self) -> None:
        images = tfi.scan_terraform(REPO_ROOT)
        self.assertGreaterEqual(len(images), 8, f"expected the terraform surface, found {len(images)}")

    def test_the_code_server_releases_are_both_seen(self) -> None:
        found = [i for i in tfi.scan_terraform(REPO_ROOT) if "code-server" in i.repository]
        self.assertEqual(
            {i.path for i in found},
            {
                "platform/terraform/agent_platform.tf",
                "platform/terraform/opencode_agent.tf",
            },
        )

    def test_no_tracked_terraform_source_still_pins_a_literal_latest(self) -> None:
        for image in tfi.scan_terraform(REPO_ROOT):
            self.assertNotEqual(image.tag, "latest", f"{image.format()} still declares :latest")


if __name__ == "__main__":
    unittest.main()
