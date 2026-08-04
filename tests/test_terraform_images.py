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
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import pytest

import terraform_images as tfi


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


@pytest.fixture
def tf(tmp_path: Path) -> Path:
    (tmp_path / tfi.TERRAFORM_ROOT).mkdir(parents=True)
    return tmp_path


# ---------------------------------------------------------------------------
# extraction
# ---------------------------------------------------------------------------


def test_a_literal_image_attribute_is_found(tf: Path):
    write(
        tf / tfi.TERRAFORM_ROOT / "db.tf",
        'resource "kubernetes_deployment" "db" {\n'
        "  spec {\n    container {\n"
        '      image = "postgres:16-alpine"\n'
        "    }\n  }\n}\n",
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.reference == "postgres:16-alpine"
    assert image.resolved is True
    assert image.line == 4


def test_an_image_block_is_composed_from_repository_and_tag(tf: Path):
    write(
        tf / tfi.TERRAFORM_ROOT / "ide.tf",
        'resource "helm_release" "ide" {\n'
        "  values = [yamlencode({\n"
        "    image = {\n"
        '      repository = "codercom/code-server"\n'
        '      tag        = "latest"\n'
        "    }\n  })]\n}\n",
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.reference == "codercom/code-server:latest"
    assert image.resolved is True


def test_a_machine_image_is_not_a_container_image(tf: Path):
    """`hcloud_server.image = "ubuntu-24.04"` is an operating system."""
    write(
        tf / tfi.TERRAFORM_ROOT / "nodes.tf",
        'resource "hcloud_server" "primary" {\n  image = "ubuntu-24.04"\n}\n',
    )
    assert tfi.scan_terraform(tf) == []


def test_an_unknown_resource_type_is_audited_rather_than_ignored(tf: Path):
    """The exclusion list is the narrow one; the default is to look."""
    write(
        tf / tfi.TERRAFORM_ROOT / "new.tf",
        'resource "some_future_container_thing" "x" {\n  image = "app:latest"\n}\n',
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.reference == "app:latest"


# ---------------------------------------------------------------------------
# resolution
# ---------------------------------------------------------------------------


def test_an_optional_attribute_default_is_the_tag_that_ships(tf: Path):
    """`tag = optional(string, "latest")` is not a type detail; it is the tag."""
    write(
        tf / tfi.TERRAFORM_ROOT / "variables.tf",
        'variable "services" {\n'
        "  type = map(object({\n"
        "    image = string\n"
        '    tag   = optional(string, "latest")\n'
        "  }))\n"
        "  default = {}\n}\n",
    )
    write(
        tf / tfi.TERRAFORM_ROOT / "services.tf",
        'resource "helm_release" "web" {\n'
        "  for_each = var.services\n"
        "  values = [yamlencode({\n"
        "    image = {\n"
        '      repository = "example/app"\n'
        "      tag        = each.value.tag\n"
        "    }\n  })]\n}\n",
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.tag == "latest"
    assert image.resolved is True


def test_a_variable_with_no_default_is_unresolved_not_assumed(tf: Path):
    write(
        tf / tfi.TERRAFORM_ROOT / "variables.tf",
        'variable "ide_tag" {\n  type = string\n}\n',
    )
    write(
        tf / tfi.TERRAFORM_ROOT / "ide.tf",
        'resource "helm_release" "ide" {\n'
        "  values = [yamlencode({\n"
        "    image = {\n"
        '      repository = "codercom/code-server"\n'
        "      tag        = var.ide_tag\n"
        "    }\n  })]\n}\n",
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.tag_resolved is False
    assert image.repository_resolved is True
    assert image.resolved is False


def test_an_expression_is_never_guessed_at(tf: Path):
    write(
        tf / tfi.TERRAFORM_ROOT / "svc.tf",
        'resource "helm_release" "web" {\n'
        "  for_each = var.services\n"
        "  values = [yamlencode({\n"
        "    image = {\n"
        '      repository = each.key == "a" ? "one/app" : each.value.image\n'
        '      tag        = "v1"\n'
        "    }\n  })]\n}\n",
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.repository_resolved is False
    assert "unresolved from tracked sources" in image.origin


def test_a_scalar_variable_default_is_followed(tf: Path):
    write(tf / tfi.TERRAFORM_ROOT / "variables.tf", 'variable "t" {\n  default = "v2.1.0"\n}\n')
    write(
        tf / tfi.TERRAFORM_ROOT / "app.tf",
        'resource "helm_release" "a" {\n'
        "  values = [yamlencode({\n"
        '    image = {\n      repository = "ns/app"\n      tag = var.t\n    }\n  })]\n}\n',
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.reference == "ns/app:v2.1.0"


# ---------------------------------------------------------------------------
# helm chart surfaces
# ---------------------------------------------------------------------------


def test_chart_default_values_are_a_real_reference(tf: Path):
    write(tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
    write(
        tf / tfi.TERRAFORM_ROOT / "helm/web-service/values.yaml",
        "image:\n  repository: nginx\n  tag: alpine\n",
    )
    (image,) = tfi.scan_terraform(tf)
    assert image.reference == "nginx:alpine"


def test_a_template_that_hardcodes_an_image_is_an_error(tf: Path):
    """The failing direction of the template rule."""
    write(tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
    write(
        tf / tfi.TERRAFORM_ROOT / "helm/web-service/templates/deployment.yaml",
        "spec:\n  containers:\n    - image: evil/backdoor:latest\n",
    )
    with pytest.raises(tfi.TerraformSurfaceError, match="hardcodes an image"):
        tfi.scan_terraform(tf)


def test_an_interpolated_template_image_is_accepted(tf: Path):
    write(tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
    write(
        tf / tfi.TERRAFORM_ROOT / "helm/web-service/templates/deployment.yaml",
        "{{- if .Values.enabled }}\n"
        '    - image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"\n'
        "{{- end }}\n",
    )
    assert tfi.scan_terraform(tf) == []


# ---------------------------------------------------------------------------
# failing closed, and the security boundary
# ---------------------------------------------------------------------------


def test_a_terraform_directory_with_no_sources_is_an_error_not_a_pass(tf: Path):
    with pytest.raises(tfi.TerraformSurfaceError, match="scan is broken"):
        tfi.scan_terraform(tf)


def test_a_repository_with_no_terraform_has_no_terraform_surface(tmp_path: Path):
    assert tfi.scan_terraform(tmp_path) == []


def test_unparseable_chart_values_are_an_error_not_a_skip(tf: Path):
    write(tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
    write(tf / tfi.TERRAFORM_ROOT / "helm/c/values.yaml", "image: [unclosed\n")
    with pytest.raises(tfi.TerraformSurfaceError, match="could not parse"):
        tfi.scan_terraform(tf)


@pytest.mark.parametrize(
    "name",
    ["terraform.tfvars", "prod.tfvars", "terraform.tfvars.json", "terraform.tfstate"],
)
def test_a_tfvars_file_is_never_opened(tf: Path, monkeypatch: pytest.MonkeyPatch, name: str):
    """The security boundary, asserted rather than asserted-about.

    `platform/terraform/terraform.tfvars` is untracked and holds a live cloud
    token, database passwords and an admin key. A control that reads a secret in
    order to audit a tag has committed a worse defect than the one it audits.
    """
    write(tf / tfi.TERRAFORM_ROOT / "main.tf", 'resource "null_resource" "x" {\n}\n')
    write(tf / tfi.TERRAFORM_ROOT / name, 'hcloud_token = "NOT-A-REAL-TOKEN"\n')

    opened: list = []
    original = Path.read_text

    def spy(self, *args, **kwargs):
        opened.append(self.as_posix())
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", spy)
    tfi.scan_terraform(tf)
    assert not [p for p in opened if p.endswith(name)], f"{name} was opened"


def test_the_refusal_covers_the_dot_terraform_directory(tf: Path):
    assert tfi.is_refused(Path("platform/terraform/.terraform/x/main.tf")) is True
    assert tfi.is_refused(Path("platform/terraform/terraform.tfvars")) is True
    assert tfi.is_refused(Path("platform/terraform/main.tf")) is False


# ---------------------------------------------------------------------------
# the real repository
# ---------------------------------------------------------------------------


class TestRealRepository:
    def test_the_reader_reaches_this_repositorys_terraform(self):
        """Anti-vacuity. A reader that stopped matching would look identical."""
        images = tfi.scan_terraform(REPO_ROOT)
        assert len(images) >= 8, f"expected the terraform surface, found {len(images)}"

    def test_the_code_server_releases_are_both_seen(self):
        """Two public code-server ingresses; the k8s-only audit saw neither."""
        found = [i for i in tfi.scan_terraform(REPO_ROOT) if "code-server" in i.repository]
        assert {i.path for i in found} == {
            "platform/terraform/agent_platform.tf",
            "platform/terraform/opencode_agent.tf",
        }

    def test_no_tracked_terraform_source_still_pins_a_literal_latest(self):
        for image in tfi.scan_terraform(REPO_ROOT):
            assert image.tag != "latest", f"{image.format()} still declares :latest"
