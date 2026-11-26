"""configure.sh's OIDC subject check (docs/reports/2026-11-26-github-oidc-subject-form.md).

GitHub writes a token's `sub` as <prefix>:<context>. The claim keys
["repo","context"] fix the context; the prefix is repo:<owner>/<name>, or
repo:<owner>@<id>/<name>@<id> while the repository has immutable subjects on,
whatever the keys say (apply runs 45905276526 and 45906725339). So the script
must check sub_claim_prefix, not just the keys. These tests run it against a
stub `gh`; no GitHub or AWS calls.
"""
import json
import os
import pathlib
import subprocess
import textwrap

import pytest

AWS = pathlib.Path(__file__).resolve().parent.parent
CONFIGURE = AWS / "github" / "configure.sh"
IDS = {"Duncan-Haywood/oss-monorepo": 1315497858, "Duncan-Haywood/private-monorepo": 1441455568}

STUB = textwrap.dedent("""\
    #!/usr/bin/env bash
    # args: api [-X PUT] <path> [--jq ...]
    if [ "$2" = -X ]; then cat > "$STATE/put.$(echo "$4" | tr / _)"; exit 0; fi
    case "$2" in
      users/*) echo 49566815 ;;
      repos/*/actions/oidc/customization/sub)
        r="${2#repos/}"; r="${r%/actions*}"
        python3 -I "$STATE/reply.py" "$r" ;;
      repos/Duncan-Haywood/private-monorepo) echo 1441455568 ;;
      repos/*) echo 1315497858 ;;
    esac
    """)


def _run(tmp_path, reply):
    """reply(repo) -> (use_immutable_subject, sub_claim_prefix or "")."""
    (tmp_path / "gh").write_text(STUB)
    (tmp_path / "gh").chmod(0o755)
    table = {r: reply(r) for r in IDS}
    (tmp_path / "reply.py").write_text(
        "import sys\n"
        f"t = {table!r}\n"
        "imm, prefix = t[sys.argv[1]]\n"
        "print('false [\"repo\",\"context\"] ' + ('true' if imm else 'false') + ' ' + prefix)\n")
    env = dict(os.environ, PATH=f"{tmp_path}:{os.environ['PATH']}", STATE=str(tmp_path))
    env.pop("GITHUB_REPOSITORY", None)
    env.pop("PRIVATE_REPOSITORY", None)
    return subprocess.run(["bash", str(CONFIGURE), "--oidc-sub"], env=env, capture_output=True, text=True, timeout=30)


def _id_form(r):
    owner, name = r.split("/")
    return f"repo:{owner}@49566815/{name}@{IDS[r]}"


def test_pins_repo_and_context_on_both_repositories(tmp_path):
    p = _run(tmp_path, lambda r: (True, _id_form(r)))
    assert p.returncode == 0, p.stderr
    for r in IDS:
        body = json.loads((tmp_path / f"put.repos_{r.replace('/', '_')}_actions_oidc_customization_sub").read_text())
        assert body == {"use_default": False, "include_claim_keys": ["repo", "context"]}
        assert f"sub = {_id_form(r)}:<context> (ID form)" in p.stdout


def test_name_form_is_accepted_when_immutable_subjects_are_off(tmp_path):
    p = _run(tmp_path, lambda r: (False, ""))
    assert p.returncode == 0, p.stderr
    assert "sub = repo:Duncan-Haywood/oss-monorepo:<context> (name form)" in p.stdout


@pytest.mark.parametrize("reply", [
    lambda r: (True, "repo:Someone@1/oss-monorepo@2"),           # another owner or repository
    lambda r: (True, "repo:Duncan-Haywood@49566815/oss-monorepo@1"),  # right name, wrong ID
    lambda r: (True, ""),                                         # immutable, prefix not reported
])
def test_any_other_prefix_fails(tmp_path, reply):
    p = _run(tmp_path, reply)
    assert p.returncode != 0
    assert "Duncan-Haywood/oss-monorepo" in p.stderr


def test_main_path_runs_the_check():
    import re
    assert re.search(r"^pin_oidc_sub_all$", CONFIGURE.read_text(), re.M)
