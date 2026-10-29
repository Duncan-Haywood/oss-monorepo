"""The self-hosted Actions runner stack, and the workflow switch that uses it.

Context for anyone reading this later: GitHub-hosted Actions minutes are
metered on this private, user-owned repository, and from 2026-08-26 every
workflow run came back red within 3-6 seconds carrying `runner_id: 0`,
`runner_name: ""` and zero steps -- a job that was never assigned a runner,
not a job that ran and failed. These tests pin the two halves of the fix: a
runner that runs on our own hardware, and a single switch that moves every
workflow onto it.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
CI = ROOT / "ci"
WORKFLOWS = REPO / ".github" / "workflows"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# The updater for the count sentence asserted below. Loaded by path because
# gitops/ci/ is a manifest directory, not an importable package.
_sync = _load("sync_readme_counts", CI / "sync_readme_counts.py")

RUNS_ON = "${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.CI_RUNNER || 'ubuntu-latest' }}"

# Jobs that must stay off the switch: `container:` and `services:` both need a
# Docker daemon to pull and run an image alongside the job, and the
# self-hosted runner pod (gitops/ci/runner.yaml) has none -- no docker.sock
# mount, no DinD sidecar, and a securityContext (allowPrivilegeEscalation:
# false, capabilities.drop: ["ALL"]) that rules out running one inside that
# pod too. Once an owner flips CI_RUNNER to self-hosted, a job that read the
# switch here would not fail with the runner-starvation signature
# (runner_id: 0) -- it would register on a real runner and then hang or error
# for a reason CI_RUNNER never claimed to fix, which reads as a new,
# unrelated break rather than what it is. These two are pinned to
# ubuntu-latest instead, with a comment in the workflow file itself pointing
# back here.
DOCKER_DEPENDENT_JOBS = {
    ("world-clock-widget-ci.yml", "test-core"),
    ("quick-pick-survey-ci.yml", "verify"),
}

# Jobs that build for an operating system the self-hosted pod cannot be: the
# desktop packager's .dmg and .msi need macOS and Windows runners, so the job
# takes its runner from its OS matrix. Manual-only and owner-gated
# (DISTRIBUTE_DESKTOP), so it never runs on a push and never starves on one.
OS_MATRIX_JOBS = {
    ("distribute-desktop.yml", "build"),
}
OFF_SWITCH_JOBS = DOCKER_DEPENDENT_JOBS | OS_MATRIX_JOBS


def _ci_docs() -> dict[str, dict]:
    docs: dict[str, dict] = {}
    for path in CI.glob("*.yaml"):
        for doc in yaml.safe_load_all(path.read_text()):
            if doc:
                docs[doc["kind"]] = doc
    return docs


def test_every_workflow_reads_the_runner_switch() -> None:
    # The point of routing every `runs-on` line through one repo variable
    # is that moving between GitHub-hosted and self-hosted is a settings
    # change, not another repo-wide commit. A workflow that hard-codes a runner
    # silently opts out of that and would keep burning metered minutes -- or
    # keep failing -- after the switch is flipped. DOCKER_DEPENDENT_JOBS is
    # the one narrow, checked exception (see its comment and the paired test
    # below), not a loophole: everything else must still read the switch.
    workflows = sorted(WORKFLOWS.glob("*.yml"))
    assert len(workflows) > 100, "expected the full workflow set (131 on 2026-10-29)"
    for path in workflows:
        spec = yaml.safe_load(path.read_text())
        for name, job in (spec.get("jobs") or {}).items():
            if (path.name, name) in DOCKER_DEPENDENT_JOBS:
                assert job.get("runs-on") == "ubuntu-latest", f"{path.name}:{name}"
                continue
            if (path.name, name) in OS_MATRIX_JOBS:
                assert job.get("runs-on") == "${{ matrix.os }}", f"{path.name}:{name}"
                assert {"macos-latest", "windows-latest"} <= {
                    row["os"] for row in job["strategy"]["matrix"]["include"]
                }, f"{path.name}:{name} needs no OS matrix -- put it back on the switch"
                continue
            assert job.get("runs-on") == RUNS_ON, f"{path.name}:{name}"


def test_docker_dependent_exception_is_exactly_the_jobs_that_need_docker() -> None:
    # DOCKER_DEPENDENT_JOBS is a claim ("these need a Docker daemon the
    # self-hosted runner cannot provide"), not just a list to skip -- so pin
    # it from both directions. Every named exception must actually declare
    # `container:` or `services:` (if a future edit drops the need, the
    # exception has to go too and the job goes back on the switch), and no
    # *other* job anywhere in the workflow set may declare either without
    # being added here (which would otherwise silently break the moment an
    # owner flips CI_RUNNER, in a way this suite would not catch).
    found: set[tuple[str, str]] = set()
    for path in sorted(WORKFLOWS.glob("*.yml")):
        spec = yaml.safe_load(path.read_text())
        for name, job in (spec.get("jobs") or {}).items():
            if "container" in job or "services" in job:
                found.add((path.name, name))
    assert found == DOCKER_DEPENDENT_JOBS, found ^ DOCKER_DEPENDENT_JOBS


def test_readme_runs_on_count_matches_reality() -> None:
    # gitops/ci/README.md states a specific count of `runs-on` lines that read
    # the switch ("All N `runs-on` lines across M workflows"). That count went
    # stale once already (#2713 fixed it at 247/221; a later PR, #2740, added a
    # job and pushed the true total to 248 without anyone touching this
    # sentence) -- a hand-written number in prose has no way to notice a
    # workflow gained a job. Recompute both numbers from the same source the
    # other tests in this file use and assert the README agrees, so the next
    # drift fails CI instead of sitting unnoticed.
    workflows = sorted(WORKFLOWS.glob("*.yml"))
    total_runs_on = 0
    for path in workflows:
        spec = yaml.safe_load(path.read_text())
        total_runs_on += len(spec.get("jobs") or {})
    switch_count = total_runs_on - len(OFF_SWITCH_JOBS)

    readme = (CI / "README.md").read_text()
    match = re.search(
        r"(\d+) of the (\d+) `runs-on` lines across (\d+) workflows", readme
    )
    assert match, "README's runs-on count sentence not found or reworded"
    # Name the fix in the failure itself. This assertion has fired four times
    # (#2713, #2740, #3516, #3517) and each time a session hand-retyped three
    # integers, twice burning a whole PR on it -- #3516 and #3517 hours apart on
    # 2026-09-06, because a workflow landed while the first was open. The number
    # is derivable, so the failure should hand over the command rather than the
    # arithmetic.
    fix = "run `python3 gitops/ci/sync_readme_counts.py` and commit the result"
    assert int(match.group(1)) == switch_count, (
        f"README claims {match.group(1)} runs-on lines read the switch, "
        f"actual count is {switch_count} -- {fix}"
    )
    assert int(match.group(2)) == total_runs_on, (
        f"README claims {match.group(2)} total runs-on lines, "
        f"actual count is {total_runs_on} -- {fix}"
    )
    assert int(match.group(3)) == len(workflows), (
        f"README claims {match.group(3)} workflows, "
        f"actual count is {len(workflows)} -- {fix}"
    )


def test_sync_readme_counts_agrees_with_the_allowlist_derivation() -> None:
    # The two derivations are deliberately independent: the test above subtracts
    # DOCKER_DEPENDENT_JOBS (a hand-maintained allowlist), while the script counts
    # the `runs-on` values that literally are the switch expression. Sharing a
    # constant would have let the allowlist drift from the workflows with both
    # numbers moving together and nothing noticing. Assert they agree instead --
    # a disagreement means the allowlist names a job that no longer opts out, or
    # misses one that does.
    workflows = sorted(WORKFLOWS.glob("*.yml"))
    total_runs_on = sum(
        len(yaml.safe_load(p.read_text()).get("jobs") or {}) for p in workflows
    )
    expected = (total_runs_on - len(OFF_SWITCH_JOBS), total_runs_on, len(workflows))
    assert _sync.counts() == expected, (
        "sync_readme_counts.counts() disagrees with the DOCKER_DEPENDENT_JOBS "
        "derivation -- the allowlist and the workflow tree have drifted apart"
    )


def test_sync_readme_counts_repairs_drift_and_is_idempotent(tmp_path) -> None:
    # The whole point of the script is that a stale sentence is a command away
    # from correct. Prove it on a scratch copy: a wrong sentence is detected,
    # rewritten to the real numbers, and a second run changes nothing.
    readme = CI / "README.md"
    original = readme.read_text()
    reads_switch, total, count = _sync.counts()

    stale = _sync.SENTENCE.sub("1 of the 2 `runs-on` lines across 3 workflows", original, count=1)
    assert stale != original, "failed to construct a stale sentence to repair"

    repaired = _sync.rewrite(stale, reads_switch, total, count)
    assert repaired == original, "rewriting a stale sentence did not reproduce the README"
    assert _sync.rewrite(repaired, reads_switch, total, count) == repaired, "not idempotent"


def test_sync_readme_counts_reports_a_reworded_sentence_rather_than_guessing() -> None:
    # If someone rewords the sentence, the script must say so loudly. Silently
    # writing nothing would leave the guard above failing with no way to fix it.
    with pytest.raises(SystemExit):
        _sync.rewrite("no count sentence here", 1, 2, 3)


# A hyphen is a word boundary, so a bare \b matched the interpreter inside a venture slug
# (`ball-python-morph-pairing-planner`) and demanded a setup-python step for a node-only job.
_PYTHON_NEEDLE = re.compile(r"(?<![\w-])(python3?|pip3?)(?![\w-])")
_NODE_NEEDLE = re.compile(r"\b(node|npm|npx)\b")
# Not an interpreter, but the same failure shape: a binary GitHub's image
# happens to preinstall and the runner image does not. `shellcheck-py` is how
# both jobs that need it install the real binary on either runner, so an
# invocation preceded by that install is fine and a bare one is not.
_SHELLCHECK_NEEDLE = re.compile(r"\bshellcheck\b")
_SHELLCHECK_INSTALL = re.compile(r"\bpip3?\s+install\b.*\bshellcheck-py\b")


def _run_code_lines(step: dict) -> list[str]:
    # A comment can mention "python3" or "node" while explaining why a step
    # *doesn't* need them (this file has several such comments after this
    # test was added) -- only executable lines should trip the check.
    run = step.get("run") or ""
    return [
        line
        for line in run.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def test_every_job_that_runs_python_or_node_sets_it_up() -> None:
    # Regression, generalizing a bug already found and fixed once by hand in
    # garmin-world-traveler-watchface-ci.yml: a `run:` step invoking bare
    # `python3`/`pip` or `node`/`npm`/`npx` works today because GitHub-hosted
    # ubuntu-latest ships both interpreters -- but the self-hosted runner
    # image (gitops/ci/runner.yaml, upstream ghcr.io/actions/actions-runner)
    # ships neither (confirmed against actions/runner's own images/Dockerfile:
    # curl, jq, unzip and git, no interpreter). A job like that passes every
    # check today and turns red on its own first Python/Node line the moment
    # an owner flips CI_RUNNER to self-hosted -- a break with nothing to do
    # with which venture it belongs to.
    #
    # The garmin fix's own comment claimed "every other Python-only job in
    # this repo already downloads its own interpreter this way" -- untested,
    # so it went unnoticed when the same gap existed in three more places
    # (portfolio-pages.yml's `deploy` job, ubuntu-agent-server-ci.yml's
    # `yaml-sanity` job, both bare python3; backup-verification-evidence-ci
    # .yml's `lint` job, bare node) until this test was written to scan all
    # every workflow file at once instead of relying on a claim nothing checked.
    #
    # DOCKER_DEPENDENT_JOBS and any job with `container:`/`services:` run
    # inside their own image regardless of CI_RUNNER (see the docstring on
    # that set above) and are exempt for the same reason they are exempt from
    # the runner-switch test.
    failures: list[str] = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        spec = yaml.safe_load(path.read_text())
        for name, job in (spec.get("jobs") or {}).items():
            if (path.name, name) in DOCKER_DEPENDENT_JOBS:
                continue
            if "container" in job or "services" in job:
                continue
            steps = job.get("steps") or []
            has_setup_python = any(
                (s.get("uses") or "").startswith("actions/setup-python") for s in steps
            )
            has_setup_node = any(
                (s.get("uses") or "").startswith("actions/setup-node") for s in steps
            )
            needs_python = any(
                _PYTHON_NEEDLE.search(line)
                for s in steps
                for line in _run_code_lines(s)
            )
            needs_node = any(
                _NODE_NEEDLE.search(line) for s in steps for line in _run_code_lines(s)
            )
            if needs_python and not has_setup_python:
                failures.append(f"{path.name}:{name} runs python3/pip with no actions/setup-python step")
            if needs_node and not has_setup_node:
                failures.append(f"{path.name}:{name} runs node/npm/npx with no actions/setup-node step")
    assert not failures, "\n".join(failures)


def test_every_job_that_runs_shellcheck_installs_it() -> None:
    # The test above generalized the bare-`python3` gap across every workflow
    # at once, and that was the right move -- but it generalized over the
    # wrong axis. It asks "which *interpreters* does this job assume", when
    # the property that actually matters is "which *binaries* does this job
    # assume GitHub's image preinstalls". shellcheck is the second member of
    # that set, and it slipped through: ubuntu-agent-server-ci.yml's
    # `shellcheck` job ran the bare binary with no install step, one job above
    # the `yaml-sanity` job whose comment explains this exact hazard for
    # python3. It passed every check, because GitHub-hosted ubuntu-latest
    # ships shellcheck and nothing here looked for anything but python/node.
    #
    # hetzner-gitops-ci.yml's `scripts` job had it right all along: install
    # the shellcheck-py wheel, which carries the real binary and works on
    # either runner. This pins that as the rule rather than one job's habit.
    #
    # Exemptions match the test above for the same reasons: DOCKER_DEPENDENT_
    # JOBS and any job with `container:`/`services:` bring their own image.
    failures: list[str] = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        spec = yaml.safe_load(path.read_text())
        for name, job in (spec.get("jobs") or {}).items():
            if (path.name, name) in DOCKER_DEPENDENT_JOBS:
                continue
            if "container" in job or "services" in job:
                continue
            steps = job.get("steps") or []
            lines = [line for s in steps for line in _run_code_lines(s)]
            if not any(_SHELLCHECK_NEEDLE.search(line) for line in lines):
                continue
            if any(_SHELLCHECK_INSTALL.search(line) for line in lines):
                continue
            failures.append(
                f"{path.name}:{name} runs shellcheck with no `pip install shellcheck-py` step"
            )
    assert not failures, "\n".join(failures)


_THIRD_PARTY_IMPORT = re.compile(
    r"(?:^|\n)\s*(?:import|from)\s+(yaml|requests|jinja2|dateutil|bs4|numpy|pandas)\b"
)
_PIP_INSTALL = re.compile(r"pip3?\s+install\s+([^\n]*)")
# PyPI's distribution name differs from the import name for some of these, and
# the check compares against what a `pip install` line actually says.
_DIST_NAMES = {
    "yaml": ("pyyaml",),
    "dateutil": ("python-dateutil",),
    "bs4": ("beautifulsoup4", "bs4"),
}


def test_setup_python_jobs_install_the_modules_they_import() -> None:
    # The third variant of the same mistake, and the one that actually shipped
    # red: `actions/setup-python` installs a *clean* interpreter from the tool
    # cache. GitHub's *system* python3 carries PyYAML; the tool-cache one does
    # not. So ubuntu-agent-server-ci.yml's `yaml-sanity` job, which was given
    # a setup-python step precisely to survive a CI_RUNNER flip, started
    # failing on `import yaml` under the interpreter that fix installed --
    # trading a break that would happen later for one that was happening
    # already.
    #
    # Nothing caught it because the workflow only triggers on
    # `ventures/ubuntu-agent-server/**` or its own file, and neither had
    # changed since the fix landed. It surfaced only when this PR edited that
    # file for an unrelated reason. A job nobody runs is a job nobody checks,
    # which is exactly what a repo-wide scan is for.
    #
    # Scope note: this looks only at third-party modules imported directly in
    # `run:` blocks, and treats an `-r <file>` install as covering everything
    # (the requirements file is the declaration in that case).
    failures: list[str] = []
    for path in sorted(WORKFLOWS.glob("*.yml")):
        spec = yaml.safe_load(path.read_text())
        for name, job in (spec.get("jobs") or {}).items():
            steps = job.get("steps") or []
            if not any(
                (s.get("uses") or "").startswith("actions/setup-python") for s in steps
            ):
                continue
            body = "\n".join(s.get("run") or "" for s in steps)
            modules = set(_THIRD_PARTY_IMPORT.findall(body))
            if not modules:
                continue
            installed = " ".join(_PIP_INSTALL.findall(body)).lower()
            if "-r " in installed:
                continue
            for module in sorted(modules):
                names = _DIST_NAMES.get(module, (module,))
                if not any(n in installed for n in names):
                    failures.append(
                        f"{path.name}:{name} imports `{module}` but no pip install provides it"
                    )
    assert not failures, "\n".join(failures)


def test_host_mode_runner_version_matches_in_cluster_pin() -> None:
    # gitops/ci/host/README.md and bootstrap/scripts/install-github-runner-host.sh
    # both claim the host-mode runner installs "the same version
    # gitops/ci/runner.yaml runs in-cluster, so the two paths behave
    # identically" -- but until this test, that claim was two independent
    # hand-written pins (an image tag here, a shell variable there) with
    # nothing tying them together. gitops/ci/README.md already documents the
    # one-line fix for when GitHub deprecates a runner version ("bump the tag
    # in runner.yaml"), which updates only the in-cluster path and would leave
    # the host-mode installer silently registering a stale runner under a
    # comment claiming parity -- the same "a copied rule goes stale instead of
    # being imported" shape CLAUDE.md already records paying for twice (168
    # tools became 169 the same way). This test fails the moment the two pins
    # disagree, rather than waiting for GitHub to start warning on one runner
    # and not the other.
    runner_yaml = (CI / "runner.yaml").read_text()
    image_match = re.search(
        r"image:\s*ghcr\.io/actions/actions-runner:([0-9.]+)", runner_yaml
    )
    assert image_match, "gitops/ci/runner.yaml's runner image tag not found or reworded"
    cluster_version = image_match.group(1)

    installer = (
        REPO / "bootstrap" / "scripts" / "install-github-runner-host.sh"
    ).read_text()
    host_match = re.search(
        r'RUNNER_VERSION="\$\{RUNNER_HOST_VERSION:-([0-9.]+)\}"', installer
    )
    assert host_match, (
        "install-github-runner-host.sh's RUNNER_VERSION default not found or reworded"
    )
    host_version = host_match.group(1)

    assert host_version == cluster_version, (
        f"host-mode runner pins {host_version} (bootstrap/scripts/"
        f"install-github-runner-host.sh) but the in-cluster pod "
        f"(gitops/ci/runner.yaml) pins {cluster_version} -- bump both together, "
        "and re-verify RUNNER_TARBALL_SHA256 in the installer against the new "
        "release's own \"SHA-256 Checksums\" section before committing."
    )


def test_the_switch_defaults_to_github_hosted() -> None:
    # With the variable unset the expression must fall back to ubuntu-latest,
    # so merging this changes nothing until an owner opts in. `vars.CI_RUNNER`
    # is the empty string when unset, which is falsy, so `||` yields the
    # default.
    assert "vars.CI_RUNNER" in RUNS_ON
    assert RUNS_ON.endswith("|| 'ubuntu-latest' }}")


def test_runner_is_ephemeral() -> None:
    # A reused runner carries the previous job's checkout and environment into
    # the next one. --ephemeral is what makes each job start clean.
    script = (CI / "runner-entrypoint.sh").read_text()
    assert "--ephemeral" in script
    assert "--unattended" in script


def test_runner_uses_a_separate_token_to_deregister() -> None:
    # GitHub's registration-token and remove-token endpoints are distinct and
    # not interchangeable: config.sh accepts only a registration token, and
    # config.sh remove accepts only a remove token. Reusing the registration
    # token for removal used to silently no-op on the abnormal-exit path
    # (pod evicted before a job ever arrives), leaving an orphaned runner
    # listed in the repo's runner settings.
    script = (CI / "runner-entrypoint.sh").read_text()
    assert "runners/${kind}-token" in script
    assert 'fetch_token registration' in script
    assert 'fetch_token remove' in script
    assert 'config.sh remove --token "${reg_token}"' not in script


def test_runner_never_logs_the_api_response() -> None:
    # A failed registration call can echo the request back, and that request
    # carries the PAT. The error path must not print the response body.
    # Comments are allowed to mention the variable -- one does, explaining why
    # it is not printed. Only executable lines are checked.
    code = [
        line
        for line in (CI / "runner-entrypoint.sh").read_text().splitlines()
        if not line.lstrip().startswith("#")
    ]
    for line in code:
        if line.lstrip().startswith(("echo", "printf")):
            assert "${response}" not in line, line


def test_runner_holds_no_token_in_git() -> None:
    # The PAT arrives from a sealed Secret at runtime; the manifest names the
    # key and nothing else.
    deployment = _ci_docs()["Deployment"]
    container = deployment["spec"]["template"]["spec"]["containers"][0]
    env = {e["name"]: e for e in container["env"]}
    assert "value" not in env["RUNNER_TOKEN"]
    assert env["RUNNER_TOKEN"]["valueFrom"]["secretKeyRef"]["name"] == "actions-runner-secrets"


def test_runner_cannot_reach_the_cluster() -> None:
    # CI runs whatever a workflow says to run, on the same node as
    # marisstella.dev. It gets the internet and DNS; it does not get prod's
    # pods, the agents namespace, the API server, or cloud metadata.
    policy = _ci_docs()["NetworkPolicy"]["spec"]
    assert policy["ingress"] == []
    internet = policy["egress"][0]["to"][0]["ipBlock"]
    assert internet["cidr"] == "0.0.0.0/0"
    for blocked in ("10.42.0.0/16", "10.43.0.0/16", "10.244.0.0/16", "10.10.0.0/16", "169.254.0.0/16"):
        assert blocked in internet["except"], blocked

    deployment = _ci_docs()["Deployment"]
    pod = deployment["spec"]["template"]["spec"]
    assert pod["automountServiceAccountToken"] is False


def test_runner_internet_egress_is_scoped_to_https() -> None:
    # Regression: this rule had no `ports:` at all, which in NetworkPolicy
    # semantics means every port to any allowed destination -- not the
    # HTTPS-only egress this file's header always claimed, and not what
    # `gitops/agents/networkpolicy.yaml`'s `worker-egress` and
    # `gitops/prod/networkpolicy.yaml`'s `portfolio-site-egress` each already
    # enforce for the identical rule shape (both cite this file as already
    # fixed the same way -- it never was). `test_runner_cannot_reach_the_
    # cluster` above checked the `except:` CIDR list but never checked
    # `ports`, so a workflow step could open a connection to any address on
    # the internet on any port and nothing here would say so.
    policy = _ci_docs()["NetworkPolicy"]["spec"]
    internet_rule = policy["egress"][0]
    assert internet_rule["to"][0]["ipBlock"]["cidr"] == "0.0.0.0/0"
    assert internet_rule.get("ports") == [{"protocol": "TCP", "port": 443}], internet_rule.get("ports")


def test_runner_has_no_ssh_carveout_to_the_deleted_hetzner_boxes() -> None:
    # Until 2026-10-01 this policy carried a port-22 egress rule to
    # 89.167.29.39/32 and 157.180.80.188/32 for hetzner-gitops-ci.yml's
    # `preflight` job. The owner deleted both servers that day and the job
    # was removed; a released IP can be reassigned to a stranger, so no
    # runner may be allowed to SSH to either address again.
    policy = _ci_docs()["NetworkPolicy"]["spec"]
    ssh_rules = [
        r
        for r in policy["egress"]
        if any(p.get("port") == 22 for p in r.get("ports", []))
    ]
    assert ssh_rules == [], ssh_rules
    text = (REPO / "gitops" / "ci" / "networkpolicy.yaml").read_text()
    workflow = (REPO / ".github" / "workflows" / "hetzner-gitops-ci.yml").read_text()
    for ip in ("89.167.29.39", "157.180.80.188"):
        assert ip not in text, ip
        assert ip not in workflow, ip


def test_runner_pod_runs_as_the_images_own_unprivileged_user() -> None:
    # Every other workload in this repo (portfolio-site's three containers,
    # its refresh and usage CronJobs, the governor, prod's landing page) pins
    # runAsNonRoot -- this Deployment was the one exception, carrying no pod
    # securityContext at all since it was added. The official actions-runner
    # image already runs as its own unprivileged `runner` user, so this pins
    # that expectation rather than changing behaviour, and fails the pod
    # closed instead of silently starting as root if a future image tag ever
    # changed that default.
    pod = _ci_docs()["Deployment"]["spec"]["template"]["spec"]
    assert pod["securityContext"]["runAsNonRoot"] is True

    # Deliberately NOT readOnlyRootFilesystem, unlike every sibling above: a
    # workflow step can `npm ci` or run actions/setup-node, both of which
    # write into $RUNNER_TOOL_CACHE and other paths outside the one `work`
    # emptyDir this pod mounts -- inherent to running arbitrary job code.
    assert "readOnlyRootFilesystem" not in pod["securityContext"]
    container = _ci_docs()["Deployment"]["spec"]["template"]["spec"]["containers"][0]
    assert "readOnlyRootFilesystem" not in container["securityContext"]


def test_runner_yields_to_prod_and_stays_off_the_codex_node() -> None:
    pod = _ci_docs()["Deployment"]["spec"]["template"]["spec"]
    assert pod["priorityClassName"] == "ci-low"
    # The cpx22 is tainted for Codex Jobs and has 4 GB; CI belongs on the
    # control-plane node.
    assert pod["nodeSelector"] == {"hcloud/node-role": "control-plane"}

    classes = {
        d["metadata"]["name"]: d["value"]
        for d in yaml.safe_load_all((ROOT / "platform" / "priority-classes.yaml").read_text())
        if d
    }
    assert classes["ci-low"] < classes["agents-low"] < classes["prod-high"]


def test_runner_fits_the_ci_quota() -> None:
    quota = [
        d
        for d in yaml.safe_load_all((CI / "quota.yaml").read_text())
        if d and d["kind"] == "ResourceQuota"
    ][0]["spec"]["hard"]
    deployment = _ci_docs()["Deployment"]
    replicas = deployment["spec"]["replicas"]
    limits = deployment["spec"]["template"]["spec"]["containers"][0]["resources"]["limits"]
    assert replicas * _millicores(limits["cpu"]) <= _millicores(quota["limits.cpu"])
    assert replicas * _gib(limits["memory"]) <= _gib(quota["limits.memory"])
    assert replicas < int(quota["pods"])


def test_ci_project_cannot_dest_prod_or_agents() -> None:
    projects = [
        d
        for d in yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text())
        if d and d["metadata"]["name"] == "ci"
    ]
    assert len(projects) == 1
    namespaces = {d["namespace"] for d in projects[0]["spec"]["destinations"]}
    assert namespaces == {"ci"}
    assert projects[0]["spec"]["clusterResourceWhitelist"] == []


def test_ci_app_is_wired_into_argo() -> None:
    app = yaml.safe_load((ROOT / "apps" / "ci.yaml").read_text())
    assert app["spec"]["project"] == "ci"
    assert app["spec"]["source"]["path"] == "gitops/ci"
    kustomization = yaml.safe_load((ROOT / "apps" / "kustomization.yaml").read_text())
    assert "ci.yaml" in kustomization["resources"]


def _millicores(value: str) -> int:
    return int(value[:-1]) if value.endswith("m") else int(float(value) * 1000)


def _gib(value: str) -> float:
    if value.endswith("Gi"):
        return float(value[:-2])
    if value.endswith("Mi"):
        return float(value[:-2]) / 1024
    raise AssertionError(f"unhandled memory unit: {value}")


def test_fork_pull_requests_never_reach_a_self_hosted_runner() -> None:
    # The repository is public. A fork PR must land on a GitHub-hosted runner
    # whatever CI_RUNNER says, and the guard has to come before the variable.
    assert RUNS_ON.startswith(
        "${{ github.event.pull_request.head.repo.fork && 'ubuntu-latest' || vars.CI_RUNNER"
    )
