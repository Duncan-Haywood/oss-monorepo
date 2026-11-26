"""The OIDC subject form the trusts expect matches the template configure.sh
pins (docs/reports/2026-11-26-github-oidc-subject-form.md).

GitHub writes a token's `sub` either name-only, repo:<owner>/<name>:<context>
(the template ["repo","context"]), or ID-qualified,
repo:<owner>@<id>/<name>@<id>:<context>. Every trust in platform/aws expects
the name-only form, so configure.sh must pin that template on both
repositories; a trust written in the other form, or a template changed alone,
locks CI out of AWS (run 45905276526). Text checks only; no AWS or GitHub calls.
"""
import json
import pathlib
import re

AWS = pathlib.Path(__file__).resolve().parent.parent
CONFIGURE = AWS / "github" / "configure.sh"

# Allow-side subject strings: a trust's StringEquals value or a module's
# `subject`. The deny in stacks/org/rcps.tf is checked by its own tofu test.
SUBJECT = re.compile(r"""["']?(repo:[^"'\s,\]]+)""")


def _trust_subjects():
    files = [AWS / "bootstrap" / "bootstrap.yaml"]
    files += [p for p in (AWS / "stacks").rglob("*.tf") if "/.terraform/" not in str(p)]
    files += [p for p in (AWS / "modules").rglob("*.tf") if "/.terraform/" not in str(p)]
    out = []
    for p in files:
        if p.name == "rcps.tf":
            continue
        for line in p.read_text().splitlines():
            if line.lstrip().startswith("#"):
                continue
            for m in SUBJECT.finditer(line):
                out.append((p.relative_to(AWS), m.group(1)))
    return out


def test_configure_pins_the_name_only_template():
    text = CONFIGURE.read_text()
    m = re.search(r"^OIDC_SUB_KEYS='(.+)'$", text, re.M)
    assert m, "configure.sh names the claim keys it pins"
    assert json.loads(m.group(1)) == ["repo", "context"]
    assert '"use_default":false' in text
    # Both repositories whose tokens AWS trusts, on every full run.
    assert "Duncan-Haywood/oss-monorepo" in text and "Duncan-Haywood/private-monorepo" in text
    assert re.search(r"^pin_oidc_sub_all$", text, re.M), "the main path pins the template too"


def test_every_trust_expects_the_name_only_form():
    subjects = _trust_subjects()
    assert len(subjects) >= 8, subjects  # bootstrap x2, github-oidc, llm, site, app-identity, cutover-access
    for path, sub in subjects:
        assert "@" not in sub, f"{path}: {sub} is ID-qualified; configure.sh pins the name-only form"
        # repo:<owner>/<name>:<context>; one ${...} may stand for owner/name.
        assert re.match(r"^repo:(\$\{[^}]+\}|[^:/]+/[^:]+):(pull_request|environment:|ref:refs/heads/)", sub), f"{path}: {sub}"


def test_bootstrap_repository_parameter_is_owner_slash_name():
    text = (AWS / "bootstrap" / "bootstrap.yaml").read_text()
    m = re.search(r"GitHubRepository:\n(?:\s+.+\n)*?\s+AllowedPattern: \"(.+)\"", text)
    assert m and "@" not in m.group(1)
    assert re.fullmatch(m.group(1).replace("\\\\", "\\"), "Duncan-Haywood/oss-monorepo")
