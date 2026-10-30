"""Shape and safety checks on the GitOps tree. No cluster required."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

import yaml
from front_door_mirror import all_kustomizations, mirror_kustomization as _mirror_kustomization

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "agents"
REPO = ROOT.parent
SECRETISH = (
    "BEGIN RSA PRIVATE KEY",
    "BEGIN OPENSSH PRIVATE KEY",
    "AGE-SECRET-KEY-1",
    "ghp_",
    "github_pat_",
)


def _yaml_files() -> list[Path]:
    skip = {ROOT / "tests"}
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if any(part.startswith(".") for part in path.parts):
            continue
        if any(s in path.parents or path.parent == s for s in skip):
            continue
        if path.suffix in {".yaml", ".yml"} and path.is_file():
            files.append(path)
    return files


def _docs() -> list[Path]:
    return list(REPO.glob("gitops/**/*.yaml")) + list(REPO.glob("infra/*.tf"))


def test_all_yaml_parses() -> None:
    for path in _yaml_files():
        docs = list(yaml.safe_load_all(path.read_text()))
        assert docs, path


def _find_volumes(node):
    if isinstance(node, dict):
        if isinstance(node.get("volumes"), list):
            yield from node["volumes"]
        for value in node.values():
            yield from _find_volumes(value)
    elif isinstance(node, list):
        for item in node:
            yield from _find_volumes(item)


def test_tmp_emptydir_volumes_carry_a_size_limit() -> None:
    # portfolio-site.yaml's own comment on its sized volumes explains why:
    # "An emptyDir that fills does not fail the write -- the kubelet evicts
    # the pod." Every nginx-unprivileged workload in gitops/prod mounts a
    # `tmp` emptyDir at /tmp because readOnlyRootFilesystem forces nginx's
    # pid file and temp buffers there -- portfolio-site.yaml and landing.yaml
    # both cap it (64Mi and 16Mi). portfolio-front.yaml shipped the same
    # volume with no sizeLimit at all, on the one node that also runs the
    # k3s control plane, ingress, and cert-manager, and no test caught it.
    for path in REPO.glob("gitops/**/*.yaml"):
        if "tests" in path.parts:
            continue
        for doc in yaml.safe_load_all(path.read_text()):
            if not doc:
                continue
            for volume in _find_volumes(doc):
                if not isinstance(volume, dict) or volume.get("name") != "tmp":
                    continue
                empty_dir = volume.get("emptyDir")
                if empty_dir is None:
                    continue
                assert isinstance(empty_dir, dict) and "sizeLimit" in empty_dir, (
                    f"{path}: 'tmp' emptyDir volume has no sizeLimit"
                )


def test_no_live_secrets_in_git() -> None:
    for path in list(ROOT.rglob("*")) + list((REPO / "infra").glob("*.tf")) + list(
        (REPO / "bootstrap").rglob("*")
    ):
        if not path.is_file():
            continue
        # Compressed bytes decoded as text can contain "ghp_" by chance (it fired
        # on a regenerated front-door .gz, 2026-10-04); the plain sources the .gz
        # files are built from are scanned as ordinary files.
        if path.suffix in {".png", ".jpg", ".gz"}:
            continue
        if "tests" in path.parts:
            continue
        text = path.read_text(errors="ignore")
        for needle in SECRETISH:
            assert needle not in text, f"{path} looks like it contains {needle}"


def test_every_project_with_a_secrets_template_can_receive_a_sealed_secret() -> None:
    # A venture that ships secrets/*.template.yaml documents "seal this and
    # commit the SealedSecret into this kustomization" as its own next step.
    # If the venture's AppProject does not whitelist bitnami.com/SealedSecret,
    # Argo refuses to sync that resource the moment it lands -- a sync
    # failure caused by a rule mismatch, not by the actual owner steps still
    # pending. This caught prod: it has secrets/portfolio-repo-token.template.yaml
    # but its AppProject omitted the kind that agents and ci both whitelist
    # for the identical reason.
    docs = list(yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text()))
    by_name = {d["metadata"]["name"]: d for d in docs if d}
    for venture_dir in ("prod", "staging", "agents", "ci"):
        templates = list((ROOT / venture_dir).glob("secrets/*.template.yaml"))
        if not templates:
            continue
        whitelist = by_name[venture_dir]["spec"]["namespaceResourceWhitelist"]
        kinds = [(e.get("group"), e.get("kind")) for e in whitelist]
        assert ("bitnami.com", "SealedSecret") in kinds or ("*", "*") in kinds, (
            f"{venture_dir} ships {[t.name for t in templates]} but its AppProject "
            f"cannot receive a SealedSecret: {whitelist}"
        )


def test_every_manifest_kind_is_on_its_appproject_whitelist() -> None:
    # Argo refuses to sync a resource whose apiGroup/kind is missing from its
    # AppProject's namespaceResourceWhitelist -- not a YAML error, a sync
    # failure at apply time that looks identical to "waiting on the owner"
    # until someone reads the Application's status. #2146 caught this for
    # prod's SealedSecret; this generalizes the check to every kind actually
    # shipped in prod/staging/agents/ci so the next resource added to a
    # venture (a CronJob, a Role, ...) cannot silently repeat it.
    docs = list(yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text()))
    by_name = {d["metadata"]["name"]: d for d in docs if d}
    for venture in ("prod", "staging", "agents", "ci"):
        whitelist = by_name[venture]["spec"]["namespaceResourceWhitelist"]
        allowed = {(e.get("group"), e.get("kind")) for e in whitelist}
        wildcard_all = ("*", "*") in allowed
        for path in (ROOT / venture).rglob("*.yaml"):
            # kustomization.yaml describes a build, not a resource Argo ever
            # applies, and secrets/*.template.yaml are placeholders (CHANGE_ME)
            # meant to be sealed before they are ever real manifests.
            if path.name == "kustomization.yaml" or "secrets" in path.parts:
                continue
            for doc in yaml.safe_load_all(path.read_text()):
                if not doc or "kind" not in doc:
                    continue
                api_version = doc.get("apiVersion", "")
                group = api_version.split("/")[0] if "/" in api_version else ""
                kind = doc["kind"]
                ok = wildcard_all or (group, kind) in allowed or (group, "*") in allowed
                assert ok, (
                    f"{venture} AppProject cannot receive {group or 'core'}/{kind} "
                    f"from {path.relative_to(ROOT)} -- Argo will refuse to sync it"
                )


def test_appproject_whitelist_carries_no_group_this_tree_never_ships() -> None:
    # `group: policy` sat wildcarded (`kind: "*"`) in the prod, staging,
    # agents and ci AppProjects' namespaceResourceWhitelist since the
    # namespace was first adopted (#1486), and no manifest anywhere under
    # gitops/ has ever shipped a policy/v1 resource -- no
    # PodDisruptionBudget, no PodSecurityPolicy. Every sibling convenience
    # group in the same lists ("" for the core group, apps, networking.k8s.io,
    # batch) is exercised by a real manifest (a ConfigMap or Service, a
    # Deployment, an Ingress or NetworkPolicy, a CronJob); this was the one
    # that was not. The specific-kind entries beside it -- bitnami.com/
    # SealedSecret and the two rbac.authorization.k8s.io kinds -- already get
    # this discipline: named explicitly, and only added in the commit that
    # first shipped a manifest needing them (#2146, #2207, #2594). `policy`
    # never got the equivalent narrowing, because nothing ever exercised it
    # to notice.
    #
    # `platform` is exempt on purpose: its own AppProject wildcards both
    # group and kind, because it syncs upstream Helm charts (ingress-nginx,
    # cert-manager, sealed-secrets) whose resource kinds this repo does not
    # enumerate and should not try to.
    docs = list(yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text()))
    for doc in docs:
        if not doc or doc["kind"] != "AppProject" or doc["metadata"]["name"] == "platform":
            continue
        groups = {e.get("group") for e in doc["spec"]["namespaceResourceWhitelist"]}
        assert "policy" not in groups, (
            f"{doc['metadata']['name']} AppProject still wildcards the policy group with "
            "nothing in the tree that ships a policy/v1 resource"
        )


def test_appproject_whitelist_carries_no_group_its_own_namespace_never_ships() -> None:
    # Generalizes test_appproject_whitelist_carries_no_group_this_tree_never_ships
    # to a per-namespace check rather than a tree-wide one, and to every
    # venture namespace rather than just `staging`. `apps` and
    # `networking.k8s.io` are real, load-bearing groups *somewhere* (prod
    # ships a Deployment via `apps`, prod/ci/agents all ship a NetworkPolicy
    # via `networking.k8s.io`), so the tree-wide check above cannot see a
    # group that is unused in one specific namespace's own directory while
    # real in a sibling's -- it only catches a group nothing anywhere ever
    # ships.
    #
    # Two live cases this caught before this generalization existed:
    # `staging` wildcarded both `apps` and `networking.k8s.io` despite
    # `gitops/staging/` shipping nothing but quota.yaml's ResourceQuota
    # (group ""), and `agents` wildcarded `apps` despite `gitops/agents/`
    # never shipping anything but a `batch/v1` CronJob, RBAC, NetworkPolicies
    # and core-group objects -- no Deployment, StatefulSet, ReplicaSet or
    # DaemonSet. Both are the same "whitelist wider than anything it guards"
    # shape as `policy` above, just scoped to one namespace's own directory
    # rather than the whole tree, which is why this needs a per-namespace
    # check instead of only the tree-wide one.
    #
    # This does not assert a namespace must stay empty -- it asserts each
    # whitelist stays in sync with what actually ships (or is deliberately
    # pre-provisioned for) in its own directory. Deploying a Service or
    # CronJob to staging, or a Deployment to agents, should fail this test
    # until the matching group is added back, per this file's own header
    # comment: "Add it back, in whichever project needs it, the same commit
    # a [resource] lands."
    #
    # `bitnami.com`/SealedSecret is the one deliberate exception: prod, ci
    # and agents each whitelist it ahead of an actual SealedSecret landing,
    # for a `secrets/*.template.yaml` waiting on an owner to seal it (see
    # test_every_project_with_a_secrets_template_can_receive_a_sealed_secret
    # above) -- the template itself is excluded from the scan the same way
    # that test excludes it, being a CHANGE_ME placeholder rather than a real
    # manifest, so `bitnami.com` would otherwise read as unused right up
    # until the seal lands.
    docs = list(yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text()))
    by_name = {d["metadata"]["name"]: d for d in docs if d}
    for venture in ("prod", "staging", "agents", "ci"):
        whitelist = by_name[venture]["spec"]["namespaceResourceWhitelist"]
        whitelisted_groups = {e.get("group") for e in whitelist}
        shipped_groups: set[str] = set()
        for path in (ROOT / venture).rglob("*.yaml"):
            if path.name == "kustomization.yaml" or "secrets" in path.parts:
                continue
            for doc in yaml.safe_load_all(path.read_text()):
                if not doc or "kind" not in doc:
                    continue
                api_version = doc.get("apiVersion", "")
                group = api_version.split("/")[0] if "/" in api_version else ""
                shipped_groups.add(group)
        if list((ROOT / venture).glob("secrets/*.template.yaml")):
            shipped_groups.add("bitnami.com")
        unused = whitelisted_groups - shipped_groups - {"*"}
        assert not unused, (
            f"{venture} AppProject wildcards {sorted(unused)} but "
            f"gitops/{venture}/ ships no resource in {sorted(unused)} -- "
            "narrow the whitelist to match, per this file's own header "
            "comment"
        )


def test_agents_project_cannot_dest_prod() -> None:
    docs = list(yaml.safe_load_all((ROOT / "apps" / "projects.yaml").read_text()))
    by_name = {d["metadata"]["name"]: d for d in docs if d}
    agents = by_name["agents"]["spec"]["destinations"]
    assert [d["namespace"] for d in agents] == ["agents"]
    prod = by_name["prod"]["spec"]["destinations"]
    assert "agents" not in [d["namespace"] for d in prod]
    assert [d["namespace"] for d in prod] == ["prod"]


def test_governor_starts_disabled() -> None:
    cron = yaml.safe_load((AGENTS / "governor" / "cronjob.yaml").read_text())
    assert cron["spec"]["suspend"] is True
    policy = (AGENTS / "governor" / "policy.json").read_text()
    assert '"enabled": false' in policy
    assert '"maxConcurrent": 1' in policy


def test_governor_runs_unprivileged_and_read_only() -> None:
    # Every other workload in this repo (portfolio-site's three containers,
    # its refresh and usage CronJobs, the CI runner) drops all capabilities,
    # refuses privilege escalation and runs a read-only root filesystem.
    # governor was the one exception -- despite being the single workload in
    # `agents` that holds a live ServiceAccount token with RBAC to create Jobs
    # and update a ConfigMap, which makes it the workload most worth
    # narrowing, not the one to skip.
    cron = yaml.safe_load((AGENTS / "governor" / "cronjob.yaml").read_text())
    pod = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]
    assert pod["securityContext"]["runAsNonRoot"] is True

    container = pod["containers"][0]
    sec = container["securityContext"]
    assert sec["readOnlyRootFilesystem"] is True
    assert sec["allowPrivilegeEscalation"] is False
    assert sec["capabilities"]["drop"] == ["ALL"]

    # governor.py's _save_state() unconditionally writes a local copy to
    # GOVERNOR_STATE (default /var/run/governor/state.json) before it ever
    # touches the ConfigMap -- _load_state()'s in-cluster fallback reads that
    # file back if the ConfigMap GET fails. A read-only root filesystem with
    # nowhere writable at that path would make every tick crash on the first
    # save, so the default path must resolve inside a mounted, writable volume.
    state_env = [e for e in container.get("env", []) if e["name"] == "GOVERNOR_STATE"]
    state_path = state_env[0]["value"] if state_env else "/var/run/governor/state.json"
    mount_paths = [v["mountPath"] for v in container["volumeMounts"]]
    assert any(
        state_path == mp or state_path.startswith(mp.rstrip("/") + "/") for mp in mount_paths
    ), f"GOVERNOR_STATE ({state_path}) is not under any writable mount: {mount_paths}"


def test_agents_job_count_quota_covers_governor_history_retention() -> None:
    # The governor CronJob creates a Job every tick (`*/5 * * * *`) and keeps
    # `successfulJobsHistoryLimit` + `failedJobsHistoryLimit` of them around as
    # ordinary steady state, regardless of whether any Codex worker Job ever
    # runs. `count/jobs.batch` and `pods` are namespace-wide object-count
    # quotas, so if either is smaller than that floor, the API server starts
    # rejecting the CronJob's own routine ticks with "exceeded quota" within
    # about an hour of the owner enabling it -- governor.py never even gets to
    # look at the queue. This was true of the "4"/"6" this quota used to carry:
    # `successfulJobsHistoryLimit: 6` + `failedJobsHistoryLimit: 6` + 1
    # possibly-running already floors at 13.
    cron = yaml.safe_load((AGENTS / "governor" / "cronjob.yaml").read_text())
    spec = cron["spec"]
    floor = spec["successfulJobsHistoryLimit"] + spec["failedJobsHistoryLimit"] + 1

    quota = [
        d
        for d in yaml.safe_load_all((AGENTS / "quota.yaml").read_text())
        if d and d["kind"] == "ResourceQuota"
    ][0]["spec"]["hard"]
    assert int(quota["count/jobs.batch"]) >= floor
    assert int(quota["pods"]) >= floor


def test_worker_script_never_merges() -> None:
    text = (AGENTS / "workers" / "worker.sh").read_text()
    assert "gh pr merge" not in text
    assert "git push" in text
    assert "--base" in text


def test_worker_accepts_isolated_openai_key_and_hard_limit_429() -> None:
    text = (AGENTS / "workers" / "worker.sh").read_text()
    assert "OPENAI_API_KEY" in text
    assert "spend_limit_exceeded" in text
    template = (AGENTS / "secrets" / "codex-token.template.yaml").read_text()
    assert "OPENAI_API_KEY" in template
    assert "CODEX_ACCESS_TOKEN" not in template


def test_worker_writes_the_subscription_credential_the_cli_actually_reads() -> None:
    # The CLI has no env var for a plan login: it reads $CODEX_HOME/auth.json,
    # and only consults the file when the credential store is set to "file".
    # Checking that a variable was set (what this used to do) proved nothing.
    text = (AGENTS / "workers" / "worker.sh").read_text()
    assert 'export CODEX_HOME=' in text
    assert 'cli_auth_credentials_store = "file"' in text
    assert '"$CODEX_AUTH_JSON" > "$AUTH_FILE"' in text


def test_both_credentials_stay_usable_and_the_free_one_wins_a_tie() -> None:
    # The API-key path is what infra/OWNER_CHECKLIST.md tells the owner to set
    # up. Adding the subscription route must not break it: a Secret carrying
    # only OPENAI_API_KEY still has to start.
    text = (AGENTS / "workers" / "worker.sh").read_text()
    subscription = text.index("CODEX_AUTH_JSON")
    api_key = text.index('if [[ -n "${OPENAI_API_KEY:-}" ]]')
    assert subscription < api_key, "the non-billing credential should be tried first"
    assert "bills per token" in text
    # Branch order alone is not the win. `codex exec` inherits this script's
    # environment, so leaving OPENAI_API_KEY in it hands the CLI a metered
    # credential on a run that reported itself as the plan's -- and which one
    # the CLI prefers is not ours to decide. The behavioural pair lives in
    # test_worker_run.py; this keeps the mechanism from being deleted as dead
    # code by someone reading only the branch order.
    assert "unset OPENAI_API_KEY" in text, (
        "the plan route must remove the metered key from codex's environment"
    )
    template = (AGENTS / "secrets" / "codex-token.template.yaml").read_text()
    assert "OPENAI_API_KEY: CHANGE_ME" in template
    assert "CODEX_AUTH_JSON" in template


def test_a_rejected_credential_is_not_reported_as_a_quota_limit() -> None:
    # Exit 42 makes the governor sleep off a 429. An expired login is not that,
    # and an hour of backoff would not fix it.
    text = (AGENTS / "workers" / "worker.sh").read_text()
    assert "CODEX_AUTH_EXIT:-43" in text
    assert "hit_auth_failure" in text


def test_worker_uses_the_approval_flag_the_current_cli_accepts() -> None:
    # `codex exec --ask-for-approval` was dropped upstream; the Job installs the
    # CLI unpinned, so passing it aborts the run before a token is spent.
    text = (AGENTS / "workers" / "worker.sh").read_text()
    code = [ln for ln in text.splitlines() if not ln.lstrip().startswith("#")]
    assert not [ln for ln in code if "--ask-for-approval" in ln]
    assert "approval_policy=\"never\"" in text


def test_the_pinned_tools_survive_between_jobs() -> None:
    # The claim, its kustomization entry, and the worker default that has to
    # agree with governor.py's mount path.
    pvc = yaml.safe_load((AGENTS / "codex-tools.yaml").read_text())
    assert pvc["kind"] == "PersistentVolumeClaim"
    assert pvc["metadata"]["name"] == "codex-tools"
    assert pvc["metadata"]["namespace"] == "agents"

    kustomization = yaml.safe_load((AGENTS / "kustomization.yaml").read_text())
    assert "codex-tools.yaml" in kustomization["resources"], (
        "the tool-cache PVC is not applied, so every Job falls back to a "
        "throwaway directory and re-downloads 320 MB of npm"
    )

    worker = (AGENTS / "workers" / "worker.sh").read_text()
    assert 'CODEX_TOOLS_DIR="${CODEX_TOOLS_DIR:-/var/lib/codex-tools}"' in worker, (
        "worker.sh no longer defaults to the path governor.py mounts the claim at"
    )


def test_a_cached_tool_is_checked_against_its_pin_rather_than_merely_present() -> None:
    # The hazard the cache introduces, and the reason install_tools grew a
    # version check. gh and codex are pinned in git precisely so a version
    # nobody reviewed cannot reach the binary that holds this Job's GH_TOKEN
    # and the owner's ChatGPT auth.json. A cache that kept serving the
    # superseded copy past a reviewed bump would make both pins decorative --
    # silently, since everything downstream only asks whether the name is on
    # PATH. `test_worker_run.py` drives this end to end; this pins the shape.
    worker = (AGENTS / "workers" / "worker.sh").read_text()
    assert "gh_matches_pin" in worker and "codex_matches_pin" in worker
    assert "cached gh" in worker and "cached codex" in worker


def test_codex_credential_survives_between_jobs() -> None:
    pvc = yaml.safe_load((AGENTS / "codex-home.yaml").read_text())
    assert pvc["kind"] == "PersistentVolumeClaim"
    assert pvc["metadata"]["name"] == "codex-home"
    kustomization = yaml.safe_load((AGENTS / "kustomization.yaml").read_text())
    assert "codex-home.yaml" in kustomization["resources"]
    worker_files = [
        entry
        for entry in kustomization["configMapGenerator"]
        if entry["name"] == "codex-worker-script"
    ][0]["files"]
    assert "mandate.md=workers/mandate.md" in worker_files


def test_every_queue_item_prompt_inherits_the_mandate() -> None:
    worker = (AGENTS / "workers" / "worker.sh").read_text()
    assert "/opt/worker/mandate.md" in worker
    mandate = (AGENTS / "workers" / "mandate.md").read_text()
    # The floor the item prompts are not allowed to talk a run out of.
    assert "Never push to the base branch" in mandate
    assert "runner_id: 0" in mandate


def test_the_mandate_does_not_teach_the_retired_absent_ci_excuse() -> None:
    # The mandate is the standing prompt for every worker run, so a stale claim
    # here is one every tick inherits. It used to say "PRs opened with
    # `GITHUB_TOKEN` do not trigger Actions here", which names the wrong
    # mechanism -- an agent PR authenticates with a fine-grained PAT
    # (`GH_TOKEN`), not the in-workflow `secrets.GITHUB_TOKEN` that GitHub's
    # no-recursion rule applies to, so it triggers `pull_request` workflows
    # like anyone else's. `platform/pages/clauses.mjs` had already retired the
    # same sentence in its own comment, and this test used to say the mandate
    # was "the last place carrying it". It was not: `queue/open-pr-repair-merge
    # .yaml` still had it on 2026-09-03, because this test only ever read
    # mandate.md. Fixing a rule in one file while a copy of it survives in
    # another is the exact failure CLAUDE.md records twice against the
    # front-door mirror -- so the assertion below now walks every queue prompt
    # too, and a new item inherits the check by existing.
    mandate = (AGENTS / "workers" / "mandate.md").read_text()
    assert "`GITHUB_TOKEN` do not\n  trigger Actions here" not in mandate
    assert "GH_TOKEN" in mandate, "the correct credential should be named"

    # Every queue item's prompt is read by a worker the same way the mandate
    # is, so the claim is just as wrong there.
    for item in sorted((AGENTS / "queue").glob("*.yaml")):
        prompt = yaml.safe_load(item.read_text()).get("prompt") or ""
        assert "GITHUB_TOKEN` do not trigger Actions" not in prompt, (
            f"{item.name} teaches the retired absent-CI excuse"
        )

    # And the distinction that makes a blank list actionable rather than an
    # excuse: the commit-status API reports total_count 0 on a PR whose checks
    # are red, so "no checks" read from it is not evidence of anything.
    assert "check-runs" in mandate, "the endpoint that actually answers must be named"


def test_queue_prompts_point_at_the_maintained_verification_list() -> None:
    # Same defect as the test above, one level up. CLAUDE.md's "Ship without
    # review ceremony" block is the maintained set of local checks -- the one
    # that gets widened when a guard is found to be going unrun. Three queue
    # prompts each restated a *subset* of it inline and then went stale
    # against it, which is the restate-instead-of-import failure CLAUDE.md
    # records twice against the front-door mirror ("168 became 169").
    #
    # Measured 2026-09-05, the same day that block gained four directories:
    #   - deploy-cicd-readiness named `pytest gitops/tests` and kubeconform,
    #     and never `platform/ci` -- although its own candidate 2 sends every
    #     run at `.github/workflows/`, and `platform/ci/` holds the 15
    #     unittest modules guarding ci_starvation/pages_state/publish_surface/
    #     public_surface/validate_workflows. A run could edit the tool this
    #     repo uses to decide whether a red check is real and execute no
    #     guard on it.
    #   - marketing-distribution and seo-discoverability-audit both ship page
    #     surfaces and named neither `regen.mjs` nor
    #     `platform/marketing/*.test.mjs` -- the generator and the guard whose
    #     `missing from the commit` failure CLAUDE.md records costing live
    #     product twice (#3256-#3258, #3324-#3326).
    #
    # This asserts the pointer rather than the contents, deliberately: pinning
    # the command list here would create a fourth copy to go stale, which is
    # the thing being fixed.
    claude_md = (REPO / "CLAUDE.md").read_text()
    assert "Ship without review ceremony" in claude_md, (
        "the queue prompts point at this heading; renaming it orphans them"
    )

    # The guards each item is most likely to need, given what its own prompt
    # sends a run at. Keyed by item id so a renamed file fails loudly.
    required: dict[str, tuple[str, ...]] = {
        "deploy-cicd-readiness": ("platform/ci",),
        "marketing-distribution": ("regen.mjs", "platform/marketing"),
        "seo-discoverability-audit": ("regen.mjs", "platform/marketing"),
    }
    seen: set[str] = set()

    for path in sorted((AGENTS / "queue").glob("*.yaml")):
        if path.name == "example.item.yaml":
            continue
        data = yaml.safe_load(path.read_text())
        if not data.get("enabled"):
            continue
        prompt = data.get("prompt") or ""
        if "erify" not in prompt:  # says nothing about verifying
            continue
        assert "CLAUDE.md" in prompt, (
            f"{path.name} tells a run to verify without pointing at the "
            "maintained list in CLAUDE.md, so its inline list can go stale"
        )
        for needle in required.get(data["id"], ()):
            assert needle in prompt, f"{path.name} never names {needle}"
        seen.add(data["id"])

    missing = set(required) - seen
    assert not missing, f"queue items disappeared or were disabled: {sorted(missing)}"


def test_job_template_from_governor_hides_sa_token() -> None:
    # The live Job is built in Python; the CronJob (governor) DOES mount a token.
    cron = yaml.safe_load((AGENTS / "governor" / "cronjob.yaml").read_text())
    assert cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["serviceAccountName"] == "governor"
    rbac = (AGENTS / "rbac.yaml").read_text()
    assert "automountServiceAccountToken: false" in rbac
    assert "codex-worker" in rbac


def test_governor_role_reads_no_configmap_it_cannot_name() -> None:
    # governor.py's only ConfigMap calls (_load_state / _save_state) GET and
    # PUT/POST a single object, governor-state -- never a namespace-wide list,
    # never any other ConfigMap. An unnamed `configmaps` rule with verbs
    # get/list/create used to sit alongside the resourceNames-narrowed one,
    # granting read access to every ConfigMap in `agents` (governor-policy,
    # governor-script, governor-queue, codex-worker-script -- none of which
    # governor.py ever requests over the API, it mounts them as volumes) plus
    # a `list` verb nothing calls. #2269 cut that rule down to bare `create`;
    # #2276 later removed it entirely, on the reasoning that governor-state is
    # seeded in git so create is never needed -- but _save_state's POST
    # fallback (see the pairing test below) is a real, live call, so #2276
    # left that path returning 403. A fix (#2273) was closed as superseded
    # before it landed; nothing enforced the invariant, so the rule stayed
    # missing until this test and its sibling PR restored it.
    #
    # `create` itself has to stay, and unnamed: resourceNames cannot scope it
    # (the object does not exist yet to name), and _save_state's create branch
    # is the first-tick / recreate-after-loss path -- POSTing the collection
    # endpoint when the ConfigMap is missing. Dropping the verb would turn
    # that call into a silent-ish 403 and lose a budget window, which is the
    # same class of bug by a different route. So the invariant worth locking
    # is not "one rule" but "no readable ConfigMap this Role cannot name".
    docs = list(yaml.safe_load_all((AGENTS / "governor" / "rbac.yaml").read_text()))
    role = next(d for d in docs if d and d["kind"] == "Role")
    rules = role["rules"]
    cm_rules = [r for r in rules if "configmaps" in r["resources"]]

    named = [r for r in cm_rules if r.get("resourceNames")]
    assert len(named) == 1, named
    assert named[0]["resourceNames"] == ["governor-state"]
    # `patch` sat here too until it was trimmed: `_save_state` always PUTs the
    # whole object (verb `update`), never a partial PATCH, and no other call
    # in governor.py builds one either. See
    # test_governor_role_grants_no_verb_its_own_code_never_calls for the
    # jobs/pods siblings of the same gap.
    assert sorted(named[0]["verbs"]) == ["get", "update"]

    # Any rule that does NOT name its objects must not be able to read them.
    # `create` returns the object it made, never one it did not, so it leaks
    # nothing about the sibling ConfigMaps in the namespace; get/list/watch
    # would.
    for rule in cm_rules:
        if rule.get("resourceNames"):
            continue
        assert sorted(rule["verbs"]) == ["create"], rule

    for rule in rules:
        assert "*" not in rule.get("verbs", [])


def test_governor_role_grants_no_verb_its_own_code_never_calls() -> None:
    # Same class of gap as test_governor_role_reads_no_configmap_it_cannot_
    # name, but for the batch/jobs and core/pods rules rather than
    # configmaps: `_load_cluster_jobs` makes exactly one call against each --
    # a bare GET on the collection endpoint (`/jobs?labelSelector=...` and
    # `/pods`, both with no name in the path), which RBAC classifies as
    # `list`, not `get`. `get` authorizes GET on a *named* object
    # (`/jobs/{name}`, `/pods/{name}`) and governor.py never builds either
    # URL. `watch` was never used at all -- every tick is a one-shot poll,
    # not a long-lived watch stream. All three verbs used to be granted
    # anyway, on the same ServiceAccount this repo's own history (CLAUDE.md)
    # already singles out as "the workload most worth narrowing" -- the one
    # holding a live token with RBAC to create Jobs and update a ConfigMap.
    docs = list(yaml.safe_load_all((AGENTS / "governor" / "rbac.yaml").read_text()))
    role = next(d for d in docs if d and d["kind"] == "Role")
    jobs_rule = next(r for r in role["rules"] if r["resources"] == ["jobs"])
    assert sorted(jobs_rule["verbs"]) == ["create", "list"]
    pods_rule = next(r for r in role["rules"] if r["resources"] == ["pods"])
    assert sorted(pods_rule["verbs"]) == ["list"]

    # Neither endpoint is ever addressed with a trailing name segment -- a
    # call like f"{...}/pods/{name}" or f"{...}/jobs/{name}" is the only
    # thing that would justify `get` rather than `list` on either resource,
    # and this repo has none.
    source = (AGENTS / "governor" / "governor.py").read_text()
    assert "/pods/" not in source
    assert "/jobs/" not in source

    # The named `configmaps` rule (test_governor_role_reads_no_configmap_it_
    # cannot_name above) is the same gap by a third route: it granted `patch`
    # alongside `get`/`update`, and no call anywhere in governor.py ever
    # issues a PATCH -- `_save_state` always PUTs the whole object. `_k8s`'s
    # `method` parameter is a plain string built at each call site, so every
    # verb this Role's ServiceAccount can actually exercise is spelled out
    # literally and greppable, not assembled or passed through a variable.
    assert '"PATCH"' not in source


def test_governor_save_state_create_path_has_the_rbac_verb_it_needs() -> None:
    # Pairs the manifest with the code: _save_state falls back to POSTing the
    # ConfigMap collection when _load_state found nothing to PUT. That call
    # needs `create` in the Role. The two have drifted apart once already --
    # a branch narrowed the Role to get/update/patch while this code path was
    # still live -- so assert the dependency rather than leaving it implicit.
    source = (AGENTS / "governor" / "governor.py").read_text()
    assert '_k8s("POST", f"/api/v1/namespaces/{namespace}/configmaps"' in source

    docs = list(yaml.safe_load_all((AGENTS / "governor" / "rbac.yaml").read_text()))
    role = next(d for d in docs if d and d["kind"] == "Role")
    grants_create = any(
        "configmaps" in r["resources"] and "create" in r["verbs"] for r in role["rules"]
    )
    assert grants_create, role["rules"]


def test_governor_jobs_and_pods_rules_grant_only_the_verbs_the_code_calls() -> None:
    # Same class of gap as test_governor_role_reads_no_configmap_it_cannot_name,
    # for the two resources that rule's own comment doesn't cover: `jobs` and
    # `pods`. `_load_cluster_jobs` is the only code that touches either one,
    # and both calls are GETs on the *collection* endpoint (no name in the
    # URL) -- which RBAC authorizes via `list`, never `get` (that verb is for
    # `.../jobs/<name>` or `.../pods/<name>`, a shape this file never builds).
    # `build_job_manifest`'s POST is the only other call, needing `create` on
    # jobs alone. `_k8s` is a single `urllib.request` round trip with a fixed
    # timeout, never a long-lived stream, so nothing here ever needs `watch`
    # either. The Role used to carry get+watch on jobs and get on pods with
    # nothing exercising any of the three -- caught by inspection, not by a
    # test, because no test paired this rule with the code the way the
    # ConfigMap rule already was.
    source = (AGENTS / "governor" / "governor.py").read_text()
    assert 'f"/apis/batch/v1/namespaces/{namespace}/jobs"' in source, "the jobs list call moved"
    assert '_k8s("GET", f"/api/v1/namespaces/{namespace}/pods")' in source, "the pods list call moved"
    assert "/jobs/{" not in source, "a per-name Job GET would need the `get` verb back"
    assert "/pods/{" not in source, "a per-name Pod GET would need the `get` verb back"

    docs = list(yaml.safe_load_all((AGENTS / "governor" / "rbac.yaml").read_text()))
    role = next(d for d in docs if d and d["kind"] == "Role")
    jobs_rule = next(r for r in role["rules"] if r["resources"] == ["jobs"])
    pods_rule = next(r for r in role["rules"] if r["resources"] == ["pods"])
    assert sorted(jobs_rule["verbs"]) == ["create", "list"]
    assert pods_rule["verbs"] == ["list"]


def test_worker_egress_cannot_reach_the_kube_apiserver() -> None:
    # Regression: worker-egress's HTTPS rule used to be `ports: [{443}]` with
    # no `to:`, which in NetworkPolicy semantics means "port 443 to any
    # destination" -- not the "no kube-api for workers" this file's top
    # comment, and a line inside this same policy, both claimed. 10.43.0.1
    # (the k3s default `kubernetes` Service, i.e. the API server) listens on
    # :443 and sat inside that unrestricted range the whole time -- a worker
    # pod could open a TCP connection to it.
    # automountServiceAccountToken: false on the codex-worker ServiceAccount
    # meant nothing could be *done* with a connection that reached it, but the
    # network route existed anyway: the wall was half-built and half-described.
    # Same `except` list gitops/ci/networkpolicy.yaml already uses for the
    # identical problem on the actions-runner pods -- see test_ci_runner.py's
    # test_runner_cannot_reach_the_cluster.
    docs = list(yaml.safe_load_all((AGENTS / "networkpolicy.yaml").read_text()))
    policy = next(
        d for d in docs if d and d["kind"] == "NetworkPolicy" and d["metadata"]["name"] == "worker-egress"
    )
    https_rules = [r for r in policy["spec"]["egress"] if r.get("ports") == [{"protocol": "TCP", "port": 443}]]
    assert len(https_rules) == 1, https_rules
    to = https_rules[0].get("to")
    assert to, "the 443 egress rule has no `to:` -- it allows any destination"
    internet = to[0]["ipBlock"]
    assert internet["cidr"] == "0.0.0.0/0"
    for blocked in ("10.42.0.0/16", "10.43.0.0/16", "10.244.0.0/16", "10.10.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"):
        assert blocked in internet["except"], blocked


def test_agents_dns_egress_is_scoped_to_kube_system() -> None:
    # Regression, same class as test_worker_egress_cannot_reach_the_kube_
    # apiserver above but for the DNS rule rather than the HTTPS one: both
    # governor-egress and worker-egress used to allow port 53 with no `to:`
    # at all, which in NetworkPolicy semantics is "port 53 to any
    # destination" -- an open DNS-tunneling exfiltration path that the 443
    # restriction does nothing to close, sitting right next to a file whose
    # own top comment claims "DNS" as a scoped, understood allowance.
    # gitops/ci/networkpolicy.yaml already scopes its DNS rule `to:`
    # kube-system (where CoreDNS actually runs); this pins agents/
    # networkpolicy.yaml to the same shape for both pods that get DNS here.
    docs = list(yaml.safe_load_all((AGENTS / "networkpolicy.yaml").read_text()))
    policies = {
        d["metadata"]["name"]: d
        for d in docs
        if d and d["kind"] == "NetworkPolicy"
    }
    for name in ("governor-egress", "worker-egress"):
        dns_rules = [
            r
            for r in policies[name]["spec"]["egress"]
            if {p["protocol"] for p in r.get("ports", [])} == {"UDP", "TCP"}
            and all(p["port"] == 53 for p in r["ports"])
        ]
        assert len(dns_rules) == 1, (name, dns_rules)
        to = dns_rules[0].get("to")
        assert to, f"{name}'s DNS rule has no `to:` -- it allows port 53 to any destination"
        assert to[0]["namespaceSelector"]["matchLabels"]["kubernetes.io/metadata.name"] == "kube-system", (
            name,
            to,
        )


def test_root_tracks_main_of_this_repo() -> None:
    root = yaml.safe_load((ROOT / "root.yaml").read_text())
    assert root["spec"]["source"]["repoURL"].endswith("Duncan-Haywood/monorepo-projects.git")
    assert root["spec"]["source"]["targetRevision"] == "main"
    assert root["spec"]["source"]["path"] == "gitops/apps"


def test_root_mirrors_the_bootstrap_application_it_claims_to() -> None:
    # gitops/root.yaml's own header says it is a "Mirror of
    # bootstrap/root-application.yaml so the snowflake is also visible in the
    # GitOps tree" -- two files, one meant to track the other by hand, and
    # nothing checked that claim. A future edit to either copy alone (a
    # syncPolicy tweak, a changed destination) would silently split them: the
    # live cluster is bootstrapped from bootstrap/root-application.yaml
    # (applied once, out of band), while a disaster-recovery rebuild reaching
    # for "the copy under bootstrap/" -- this file's own words -- or anyone
    # reading gitops/root.yaml as the source of truth would trust it to still
    # match. Comments are allowed to differ; each file explains its own role
    # from where it sits. The Application spec is the part that must not.
    root = yaml.safe_load((ROOT / "root.yaml").read_text())
    bootstrap_root = yaml.safe_load((REPO / "bootstrap" / "root-application.yaml").read_text())
    assert root == bootstrap_root, (
        "gitops/root.yaml has drifted from bootstrap/root-application.yaml -- "
        "update whichever one is stale so the two stay identical"
    )


def test_prod_landing_has_no_marisstella_ingress() -> None:
    landing = Path(ROOT / "prod" / "landing.yaml").read_text()
    assert "kind: Ingress" not in landing
    assert "marisstella.dev" in landing  # mentioned as do-not-hijack


def test_prod_landing_has_probes_and_no_service_account_token() -> None:
    # #1486 first adopted this namespace and shipped landing.yaml with
    # neither probe -- the one workload in prod without them, unlike
    # portfolio-site.yaml and site-usage.yaml which both declare both.
    # Without a liveness probe a hung nginx master is never restarted; the
    # kubelet has nothing telling it to. Port 8080, not 80: see
    # test_prod_landing_serves_unprivileged_and_read_only.
    docs = list(yaml.safe_load_all((ROOT / "prod" / "landing.yaml").read_text()))
    deployment = next(d for d in docs if d and d["kind"] == "Deployment")
    pod = deployment["spec"]["template"]["spec"]
    assert pod["automountServiceAccountToken"] is False
    container = pod["containers"][0]
    assert container["readinessProbe"]["httpGet"] == {"path": "/", "port": 8080}
    assert container["livenessProbe"]["httpGet"] == {"path": "/", "port": 8080}


def test_prod_landing_serves_unprivileged_and_read_only() -> None:
    # Every other workload in this repo (portfolio-site's three containers,
    # its refresh and usage CronJobs, the governor, the CI runner) runs
    # unprivileged with a read-only root filesystem -- this Deployment was the
    # one exception, carrying no securityContext at all since the namespace
    # was first adopted (#1486) and so running its one container as root.
    # Mirrors test_portfolio_site_serves_unprivileged_and_read_only, which
    # pins the same shape on the sibling Deployment this one now matches.
    docs = list(yaml.safe_load_all((ROOT / "prod" / "landing.yaml").read_text()))
    deployment = next(d for d in docs if d and d["kind"] == "Deployment")
    pod = deployment["spec"]["template"]["spec"]
    assert pod["securityContext"]["runAsNonRoot"] is True

    container = pod["containers"][0]
    sec = container["securityContext"]
    assert sec["readOnlyRootFilesystem"] is True
    assert sec["allowPrivilegeEscalation"] is False
    assert sec["capabilities"]["drop"] == ["ALL"]

    # nginx:1.27-alpine's master process needs root to bind port 80; running
    # unprivileged means the same unprivileged image and high port
    # portfolio-site.yaml already uses.
    assert "nginx-unprivileged" in container["image"]
    assert container["ports"][0]["containerPort"] == 8080

    service = next(d for d in docs if d and d["kind"] == "Service")
    assert service["spec"]["ports"][0]["targetPort"] == 8080


def _portfolio_site() -> dict[str, dict]:
    docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-site.yaml").read_text()))
    return {d["kind"]: d for d in docs if d}


def test_portfolio_site_is_synced_by_prod() -> None:
    kustomization = yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())
    assert "portfolio-site.yaml" in kustomization["resources"]


def test_portfolio_site_takes_a_subdomain_not_the_apex() -> None:
    # The content Ingress serves exactly one host, and it is the canonical one
    # stamped into every page's canonical link (see the PAGES_BASE_URL test
    # below). The apex and `www` reach the site through the 301 in
    # `prod/portfolio-apex.yaml`, so adding either here would put two
    # uncanonical copies of all 544 pages in front of crawlers.
    ingress = _portfolio_site()["Ingress"]
    hosts = [rule["host"] for rule in ingress["spec"]["rules"]]
    assert hosts == ["tools.marisstella.dev"]
    for host in hosts:
        assert host not in {"marisstella.dev", "www.marisstella.dev"}
    assert ingress["spec"]["tls"][0]["hosts"] == hosts


def _portfolio_apex() -> dict:
    docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-apex.yaml").read_text()))
    return [d for d in docs if d and d["kind"] == "Ingress"][0]


def test_portfolio_apex_is_synced_by_prod() -> None:
    kustomization = yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())
    assert "portfolio-apex.yaml" in kustomization["resources"]


def test_portfolio_apex_claims_both_bare_and_www() -> None:
    # Issue #1925: the owner types marisstella.dev and gets nothing, because
    # DNS points at a box whose only listener has no rule for that name.
    # ingress-nginx matches the Host header exactly, so `www` needs its own
    # rule — covering only the apex leaves half the front door shut.
    apex = _portfolio_apex()
    hosts = {rule["host"] for rule in apex["spec"]["rules"]}
    assert hosts == {"marisstella.dev", "www.marisstella.dev"}
    assert set(apex["spec"]["tls"][0]["hosts"]) == hosts


def _mounted_secrets(docs) -> set[str]:
    """Secret names a workload in `docs` must have before its pods can start.

    Ingress `tls.secretName` is excluded: cert-manager mints those from the
    ClusterIssuer when the Ingress is admitted, so their absence from git
    blocks nothing. Everything else — `volumes[].secret`, `secretKeyRef`,
    `envFrom.secretRef` — is a mount the kubelet will not start a pod without.
    """
    found: set[str] = set()

    def walk(node, kind: str | None) -> None:
        if isinstance(node, dict):
            if kind != "Ingress":
                secret = node.get("secret")
                if isinstance(secret, dict) and isinstance(secret.get("secretName"), str):
                    found.add(secret["secretName"])
                for key in ("secretKeyRef", "secretRef"):
                    ref = node.get(key)
                    if isinstance(ref, dict) and isinstance(ref.get("name"), str):
                        found.add(ref["name"])
            for value in node.values():
                walk(value, kind)
        elif isinstance(node, list):
            for value in node:
                walk(value, kind)

    for doc in docs:
        if doc:
            walk(doc, doc.get("kind"))
    return found


def test_portfolio_apex_does_not_redirect_into_a_host_that_serves_nothing() -> None:
    # Changed 2026-09-02. This used to pin a 301 to tools.marisstella.dev,
    # which was right about canonicalisation and wrong about the cluster: that
    # host fails closed on the unsealed Secret `portfolio-site-repo`, so the
    # apex spent every day of its life redirecting strangers into a dead end.
    # It now serves the front door instead (`portfolio-front.yaml`).
    #
    # Restoring a redirect is a legitimate later choice — but only once the
    # target actually serves, which is what this test now says. If the
    # annotation comes back while `portfolio-site` still mounts an unprovided
    # Secret, this fails.
    apex = _portfolio_apex()
    annotations = apex["metadata"].get("annotations", {})
    redirect = annotations.get("nginx.ingress.kubernetes.io/permanent-redirect")
    if redirect is None:
        return
    served = _portfolio_site()["Ingress"]["spec"]["rules"][0]["host"]
    assert redirect == f"https://{served}/"
    site_docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-site.yaml").read_text()))
    provided = {
        doc["metadata"]["name"]
        for doc in site_docs
        if doc and doc.get("kind") in {"Secret", "SealedSecret"}
    }
    assert not (_mounted_secrets(site_docs) - provided), (
        "the redirect target cannot start until its Secret is sealed — "
        "restoring this annotation now would 301 every visitor into a 503"
    )


def test_portfolio_apex_backend_can_start_without_an_owner_action() -> None:
    # The apex is the portfolio's front door, so whatever it names has to be
    # able to run today. `portfolio-site` cannot: its pods mount the unsealed
    # clone token. `portfolio-front` holds nothing but two generated
    # ConfigMaps, which Argo applies from this repository directly.
    front_docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-front.yaml").read_text()))
    front_service = next(
        doc["metadata"]["name"] for doc in front_docs if doc and doc["kind"] == "Service"
    )
    for rule in _portfolio_apex()["spec"]["rules"]:
        for path in rule["http"]["paths"]:
            assert path["backend"]["service"]["name"] == front_service
    assert not _mounted_secrets(front_docs), (
        "the front door must not grow a Secret dependency — that is the one "
        "property that makes it deployable while the site is not"
    )


def _portfolio_front() -> dict[str, dict]:
    docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-front.yaml").read_text()))
    return {doc["kind"]: doc for doc in docs if doc}


def test_front_door_ships_the_share_card_it_advertises() -> None:
    # `front-door/index.html` names `https://marisstella.dev/social-card.png`
    # in its `og:image`. That URL only resolves if three things stay true at
    # once, and each lives in a different file, so nothing else in either
    # suite fails when one of them is dropped:
    #
    #   1. the PNG is committed beside the page,
    #   2. `kustomization.yaml` reads it into the ConfigMap the Deployment
    #      mounts at the document root, and
    #   3. `default.conf` answers that exact path with it.
    #
    # Miss (2) and the catch-all `location /` hands a scraper 16 KB of HTML
    # with a 200 — reproduced against nginx 1.24 on 2026-09-02, and worse than
    # a 404, because a 404 makes Slack fall back to a text card while a
    # successful fetch of a non-image leaves the unfurl broken silently.
    front_door = ROOT / "prod" / "front-door"
    card = front_door / "social-card.png"
    assert card.is_file(), "regenerate with: node platform/marketing/front-door.mjs --write"
    assert card.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"

    page = (front_door / "index.html").read_text()
    assert '<meta property="og:image" content="https://marisstella.dev/social-card.png">' in page

    generators = {
        entry["name"]: entry
        for entry in yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())[
            "configMapGenerator"
        ]
    }
    # The volume mounted at the document root, so the card lands beside
    # `index.html` — a second ConfigMap could not, two of them cannot share one
    # `mountPath`.
    assert "social-card.png=front-door/social-card.png" in generators["portfolio-front-html"]["files"]

    conf = (front_door / "default.conf").read_text()
    assert "location = /social-card.png {" in conf
    assert conf.index("location = /social-card.png") < conf.index("location / {")


def test_portfolio_front_runs_unprivileged_and_read_only() -> None:
    # Same posture as every other workload in this tree. It is reachable from
    # the public internet on the portfolio's own domain, which makes it the
    # one with the least excuse for skipping it.
    pod = _portfolio_front()["Deployment"]["spec"]["template"]["spec"]
    assert pod["securityContext"]["runAsNonRoot"] is True
    assert pod["automountServiceAccountToken"] is False
    container = pod["containers"][0]
    sec = container["securityContext"]
    assert sec["readOnlyRootFilesystem"] is True
    assert sec["allowPrivilegeEscalation"] is False
    assert sec["capabilities"]["drop"] == ["ALL"]
    # nginx-unprivileged writes its temp dirs and pid under /tmp, so a
    # read-only root filesystem needs that one path writable or the container
    # never finishes starting.
    assert any(v["mountPath"] == "/tmp" for v in container["volumeMounts"])


def test_portfolio_front_probes_a_path_that_is_not_the_page() -> None:
    # A probe every few seconds against "/" would be written into the access
    # log as a page view, and this pod's log is the only record of how many
    # people reach the portfolio's front door.
    container = _portfolio_front()["Deployment"]["spec"]["template"]["spec"]["containers"][0]
    for probe in ("readinessProbe", "livenessProbe"):
        assert container[probe]["httpGet"]["path"] == "/healthz"
    conf = (ROOT / "prod" / "front-door" / "default.conf").read_text()
    assert "location = /healthz" in conf
    assert "access_log off;" in conf


def test_portfolio_front_every_content_location_sends_x_frame_options() -> None:
    # This file's own header comment calls `X-Frame-Options: DENY` unconditional
    # ("nothing embeds this page ... X-Frame-Options: DENY below is
    # unconditional here"), but `add_header` does not merge across nginx
    # levels: a `location` that sets any `add_header` drops the server block's
    # default rather than inheriting it (the comment on `location /` in this
    # same file says so). Each content-serving `location` therefore has to
    # repeat the header itself, and the mirrored `LICENSE` block once did not —
    # a plain-text response served with no clickjacking protection, silently
    # weaker than the equivalent path on `tools.marisstella.dev` (which falls
    # through to a `location /` that does carry it). `/healthz` is the one
    # deliberate exception: it returns a bare "ok" with no headers at all,
    # which `test_portfolio_front_probes_a_path_that_is_not_the_page` already
    # pins, so it is excluded here rather than silently satisfied.
    conf = (ROOT / "prod" / "front-door" / "default.conf").read_text()
    blocks = re.split(r"(?=^\s*location\b)", conf, flags=re.MULTILINE)
    located = [b for b in blocks if re.match(r"\s*location\b", b) and "healthz" not in b]
    # The second deliberate exception, and narrower than `/healthz`: a block
    # that emits no body of its own. Two shapes qualify and both arrived with
    # the soft-404 fix —
    #
    #   * `return 301 /` — the truncatable parents (`/tools/`, `/c/`) and
    #     `/index.html`. A redirect has no body to frame.
    #   * `error_page 404 @…; return 404;` — the catch-all, which hands the
    #     response to `@front_page_not_found`. That named block *is* checked
    #     below and does carry the header, which is the one that reaches the
    #     client; `add_header` here would be dropped by the final location
    #     anyway, so requiring it would pin a line that does nothing.
    #
    # The exclusion is by *shape*, not by name, and the two assertions below
    # are what keep it from becoming a hole: a block only leaves the check
    # while it still emits nothing, and the excluded set has to stay exactly
    # the size it is today. Add a `try_files`, a `root`, or any other
    # body-producing directive to one and it is a content block again on the
    # next run, header requirement included.
    bodyless = []
    content_blocks = []
    for block in located:
        body = block[block.index("{") + 1 : block.rindex("}")]
        directives = [
            line.strip()
            for line in body.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        if directives and all(
            re.fullmatch(r"(?:return \d{3}|error_page \d{3} @\w+)[^;]*;", d)
            for d in directives
        ):
            bodyless.append(block.splitlines()[0].strip())
        else:
            content_blocks.append(block)
    assert len(bodyless) == 7, (
        "expected exactly seven body-less blocks — the six redirects "
        "(/index.html, /tools, /tools/, /c, /c/, and /tools/<slug> to its "
        f"trailing-slash form) and the catch-all; got {bodyless}"
    )
    #
    # Changed 2026-09-03, and deliberately narrowed rather than relaxed. The
    # tool entry page became framable for `?pfEmbed=1` only, so that one block
    # sends `$portfolio_frame_options` instead of a literal. The invariant is
    # now three things, all of which this test pins:
    #
    #   1. every content location still sends the header, literal or mapped;
    #   2. *exactly one* block is allowed to send the mapped form, and it is the
    #      tool entry page — a second one appearing (say, a future edit copying
    #      the line into the `LICENSE` or subpage block) fails here rather than
    #      quietly making the whole mirror framable;
    #   3. the map's default row is DENY, so every request that does not carry
    #      `?pfEmbed=1` gets exactly the header it got before this change.
    #
    # Without (2) and (3) this test would pass on a config that framed
    # everything, which is the failure mode worth catching.
    assert len(content_blocks) >= 5, "fewer content locations than expected — check the split"
    mapped = []
    for block in content_blocks:
        header = block.splitlines()[0].strip()
        literal = "X-Frame-Options DENY" in block
        variable = "X-Frame-Options $portfolio_frame_options" in block
        assert literal or variable, f"{header} does not send X-Frame-Options at all"
        if variable:
            mapped.append(header)
            assert "Content-Security-Policy $portfolio_frame_ancestors" in block, (
                f"{header} relaxes X-Frame-Options without the matching "
                "frame-ancestors CSP — modern browsers read the CSP, older ones "
                "the header, and shipping one without the other frames on some "
                "and not others"
            )

    assert mapped == ['location ~ "^/tools/(?<slug>[a-z0-9][a-z0-9-]*)/$" {'], (
        "exactly one block — the tool entry page — may use the conditional "
        f"framing map; found {mapped}"
    )

    # The default row is what makes every other request identical to before.
    assert re.search(
        r"map \$arg_pfEmbed \$portfolio_frame_options \{\s*default DENY;", conf
    ), "the framing map's default row must be DENY"
    assert re.search(
        r"map \$arg_pfEmbed \$portfolio_frame_ancestors \{\s*default \"\";", conf
    ), "the frame-ancestors map must default to sending nothing"


def test_portfolio_front_access_log_records_no_visitor() -> None:
    # The same structural privacy property the site's own log_format carries:
    # a page with no account and no cookie must not write an address, a user
    # agent or a referer into a pod log. Dropping the fields is what makes the
    # claim on the page itself ("anonymous page views") true by construction.
    conf = (ROOT / "prod" / "front-door" / "default.conf").read_text()
    log_format = next(line for line in conf.splitlines() if line.startswith("log_format"))
    for forbidden in ("$remote_addr", "$http_user_agent", "$http_referer", "$request"):
        assert forbidden not in log_format, f"{forbidden} identifies a visitor"
    assert "$uri" in log_format


def test_portfolio_front_mounts_only_generated_configmaps() -> None:
    # The whole reason this workload can deploy while the site cannot. If it
    # ever grows a PVC, a Secret or an init container that clones, it has
    # taken on the site's failure modes and the apex goes dark with it.
    pod = _portfolio_front()["Deployment"]["spec"]["template"]["spec"]
    assert "initContainers" not in pod
    # `projected` joined this set when the tool mirror was sharded: several
    # ConfigMaps merged into one mountPath is what lifted the apex past the
    # ~20 tools a single 1 MiB object could hold. It carries no more capability
    # than `configMap` does — no Secret, no PVC, no downward API — which is the
    # property this assertion is really about.
    for volume in pod["volumes"]:
        assert set(volume) <= {"name", "configMap", "emptyDir", "projected"}, volume
    for volume in pod["volumes"]:
        for source in volume.get("projected", {}).get("sources", []):
            assert set(source) <= {"configMap"}, source
    mounted = _front_door_mounted_configmaps(pod)
    generated = _front_door_generated_configmaps()
    assert mounted <= generated, f"{mounted - generated} is mounted but not generated"


# Both kustomizations that can generate a ConfigMap into this namespace.
# `front-door-tools/` is a nested one (its file list is machine-written, one
# line per mirrored file, so it lives in its own directory rather than
# inflating `prod/kustomization.yaml`), and it is still a generator.
def _front_door_kustomizations() -> tuple:
    return (ROOT / "prod" / "kustomization.yaml", _mirror_kustomization())


def _front_door_generated_configmaps() -> set:
    generated = set()
    for kustomization in _front_door_kustomizations():
        parsed = yaml.safe_load(kustomization.read_text())
        generated |= {entry["name"] for entry in parsed.get("configMapGenerator", [])}
    return generated


def _front_door_mounted_configmaps(pod: dict) -> set:
    mounted = {v["configMap"]["name"] for v in pod["volumes"] if "configMap" in v}
    for volume in pod["volumes"]:
        for source in volume.get("projected", {}).get("sources", []):
            mounted.add(source["configMap"]["name"])
    return mounted


def _mirror_shard_names() -> list:
    """Shard ConfigMaps in the order `front-door-tools/kustomization.yaml` declares them."""
    parsed = yaml.safe_load(
        _mirror_kustomization().read_text()
    )
    return [entry["name"] for entry in parsed["configMapGenerator"]]


def test_portfolio_front_mounts_every_generated_mirror_shard() -> None:
    # The generator decides how many shards there are; this Deployment names
    # them by hand. Both directions of a disagreement are silent, which is why
    # they are pinned rather than trusted:
    #
    #   a shard generated but not mounted -> those tools are simply missing
    #       from the apex, with every manifest valid and every pod Ready;
    #   a shard mounted but not generated -> the pods never leave
    #       ContainerCreating, and `maxUnavailable: 0` keeps the previous front
    #       door serving a stale mirror while `prod` sits Degraded.
    #
    # Order matters too, though only for legibility: a reader comparing the two
    # files should not have to sort them in their head.
    pod = _portfolio_front()["Deployment"]["spec"]["template"]["spec"]
    volume = next(v for v in pod["volumes"] if v["name"] == "tools")
    mounted = [s["configMap"]["name"] for s in volume["projected"]["sources"]]
    generated = _mirror_shard_names()
    assert mounted == generated, (
        f"portfolio-front.yaml mounts {mounted} but front-door-tools/kustomization.yaml "
        f"generates {generated}. Regenerate with `node "
        "platform/marketing/front-door-tools.mjs --write`, which rewrites both files "
        "in the same call, and commit the result."
    )
    # Named by index from zero, with no gaps: the generator's `shardName`, and
    # what makes a missing shard obvious to a human scanning either file.
    assert generated == [f"portfolio-front-tools-{i}" for i in range(len(generated))]


def test_the_mirror_is_sharded_because_one_object_could_not_hold_it() -> None:
    # Pins that sharding has a subject. If a later change shrinks the mirror
    # back to a single shard, this fails and asks for a decision rather than
    # letting the projected volume and its long comment quietly become
    # decoration that the next reader simplifies away.
    assert len(_mirror_shard_names()) > 1


def _mirrored_venture_slugs() -> set:
    """Distinct venture slugs the apex mirror actually serves.

    `front-door-tools/kustomization.yaml`'s `files` entries are each
    `<slug>__<filename>=<slug>__<filename>` (see `MIRROR_SEPARATOR` in
    `front-door-tools.mjs` and `aggregate.py`) — the slug is everything
    before the first `__`, and no real venture slug or mirrored filename
    contains that separator itself.
    """
    parsed = yaml.safe_load(
        _mirror_kustomization().read_text()
    )
    slugs = set()
    for entry in parsed["configMapGenerator"]:
        for file_entry in entry["files"]:
            key = file_entry.split("=", 1)[0]
            slug, _, _ = key.partition("__")
            slugs.add(slug)
    return slugs


def test_mirrored_tool_count_matches_what_the_docs_claim() -> None:
    # The mirror grew from the ~20 ventures a single ConfigMap could hold to
    # 53 once it was sharded (see the comment atop
    # front-door-tools/kustomization.yaml) -- but `front-door/index.html`,
    # which recomputes its own "N of the 169 tools" line from the actual
    # mirrored set on every regeneration (front-door.test.mjs fails on a
    # stale commit), was not the only place that number was written down.
    # `infra/OWNER_CHECKLIST.md` and `gitops/prod/usage/aggregate.py`'s
    # comment both still said "14" -- the pre-sharding figure -- with nothing
    # to notice the mirror had grown to more than double that. Same failure
    # mode `test_readme_runs_on_count_matches_reality` in test_ci_runner.py
    # exists to catch, on a different piece of hand-written prose: a number
    # that is only ever typed, never recomputed, has no way to notice the
    # thing it describes changed size.
    actual = len(_mirrored_venture_slugs())
    # 172 since 2026-09-03, having been 169 that morning. Three ventures whose
    # only surface was a CLI or a Next.js app gained a static `site/index.html`
    # that both `build.mjs` and the mirror pick up on the standard entry path:
    # `real-estate-agent-photo-app` (the MLS listing-photo preflight),
    # `print-atelier` (the print-file preflight) and `cra-evidence-desk` (the
    # SBOM/advisory matcher, whose Python CLI stays canonical). This constant is
    # the one number here that is typed rather than computed, so it moves
    # whenever a venture gains or loses a public surface.
    # 173 since 2026-09-03, when `which-job-first` shipped — a static surface
    # from its first commit, so it entered the mirror and the total in the same
    # change rather than closing a gap between them.
    # 174 since 2026-09-04, when `dns-configuration-evidence` gained a browser
    # surface. Same shape as the three ventures above: its Python CLI stays
    # canonical and an `index.html` beside it made the venture mirrorable, so
    # the mirror and the total moved together and parity held.
    # 175 since 2026-09-05, when `vendor-change-watch` gained a browser surface.
    # The same shape as the four above and the fifth instance of it: a Python
    # CLI that stays canonical, with an `index.html` beside it that makes the
    # venture mirrorable, so the mirror and the total move together.
    # That this keeps happening is the point — a CLI acquiring a page is a
    # routine event here, not an exception, which is also why
    # `platform/pages/clauses.test.mjs` stopped using a CLI as its fixture for
    # "a venture with no browser surface" in the same change.
    # 176 since 2026-09-06, when `pet-grooming-bid-calculator` shipped — a new
    # venture with a static `index.html` from its first commit, entering the
    # mirror and the total in the same change rather than closing a gap
    # between them, the same shape as `which-job-first`.
    # 177 since 2026-09-06, when `card-processing-fee-audit` shipped — a new
    # venture with a static `index.html` from its first commit, so it entered
    # the mirror and the total in the same change, the same shape as
    # `pet-grooming-bid-calculator` above.
    # 178 since 2026-09-06, when `equipment-lease-buyout-calculator` shipped —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 179 since 2026-09-06, when `dog-walking-route-pricing` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 180 since 2026-09-06, when `vending-machine-route-margin` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 181 since 2026-09-06, when `atm-route-margin` shipped — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 182 since 2026-09-06, when `photo-booth-event-quote` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 183 since 2026-09-06, when `custom-farm-rate-calculator` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 184 since 2026-09-06, when `dumpster-rental-margin-calculator` shipped —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 185 since 2026-09-06, when `vehicle-wrap-bid-calculator` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 186 since 2026-09-06, when `locksmith-bid-calculator` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 187 since 2026-09-06, when `fire-extinguisher-inspection-route-margin`
    # shipped — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 188 since 2026-09-06, when `ice-dam-removal-bid-calculator` shipped —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 189 since 2026-09-06, when `home-staging-bid-calculator` shipped — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 190 since 2026-09-07, when `pour-cost-calculator` shipped — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 191 since 2026-09-07, when `actions-runner-starvation-check` graduated in
    # #3615 — same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together. The venture PR
    # updated neither this constant nor the four hand-typed counts below it, so
    # `main` was red on this test for three merges; that is exactly the drift
    # this test exists to catch, working as intended.
    # 192 since 2026-09-07, when `flaky-test-finder` graduated — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 193 since 2026-09-07, when `coverage-drop-check` graduated — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 194 since 2026-09-07, when `kdp-royalty-calculator` graduated — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 195 since 2026-09-07, when `whatnot-seller-payout` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 196 since 2026-09-07, when `ai-crawler-access-check` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 197 since 2026-09-07, when `ada-title-ii-evidence` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 198 since 2026-09-07, when `pinned-actions-check` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 199 since 2026-09-07, when `actions-injection-check` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 200 since 2026-09-07, when `childcare-tuition-calculator` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 201 since 2026-09-07, when `actions-permissions-check` graduated.
    # 202 since 2026-09-07, when `license-drift-check` graduated — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 203 since 2026-09-07, when `gig-driver-net-pay-calculator` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 204 since 2026-09-07, when `actions-cache-poisoning-check` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 205 since 2026-09-07, when `npm-lifecycle-script-check` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 206 since 2026-09-07, when `dependency-confusion-check` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 207 since 2026-09-07, when `actions-self-hosted-exposure-check`
    # graduated — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 208 since 2026-09-07, when `vscode-extension-drift-check` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 209 since 2026-09-07, when `3d-print-price-calculator` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 210 since 2026-09-07, when `food-truck-event-margin-calculator`
    # graduated — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 211 since 2026-09-07, when `ats-resume-checker` graduated — same shape
    # again: a new venture with a static `index.html` from its first commit,
    # entering the mirror and the total together.
    # 212 since 2026-09-07, when `menu-engineering-calculator` graduated —
    # same shape again, and landing in the same hour as the one above, which
    # is why this merge had to keep both rather than pick a side.
    # 214 since 2026-09-08. Three ventures graduated within hours of each
    # other -- `poshmark-fee-calculator`, `duplicate-payment-audit` and
    # `ats-resume-checker` -- and each branch, correctly, raised the count by
    # one from its own base. Merging them has to add three, not one, which is
    # why this number has now been resolved upward twice in one evening. Same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 215 since 2026-09-08, when `certified-payroll-calculator` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 216 since 2026-09-08, when `newsletter-sponsorship-rate-calculator`
    # graduated — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 217 since 2026-09-08, when `ios-privacy-manifest-check` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 218 since 2026-09-08, when `security-deposit-return-calculator`
    # graduated — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 219 since 2026-09-09, when `structured-data-drift-check` graduated —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 220 since 2026-09-09, when `actions-artifact-poisoning-check` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 221 since 2026-09-09, when `env-example-drift-check` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 222 since 2026-09-09, when `package-exports-drift-check` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 223 since 2026-09-09, when `affiliate-disclosure-checker` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 224 since 2026-09-09, when `chrome-extension-permission-check` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 225 since 2026-09-09, when `wordpress-plugin-review-check` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 226 since 2026-09-10, when `cors-misconfig-check` graduated — same
    # shape again: a new venture with a static `index.html` from its first
    # commit, entering the mirror and the total together.
    # 227 since 2026-09-10, when `wash-and-fold-price-calculator` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 228 since 2026-09-10, when `apparel-decoration-price-calculator` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 229 since 2026-09-10, when `craft-fair-booth-calculator` also
    # graduated the same day — same shape again: a new venture with a
    # static `index.html` from its first commit, entering the mirror and
    # the total together.
    # 230 since 2026-09-10, when `merchant-feed-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 231 since 2026-09-10, when `sri-check` also graduated the same day —
    # same shape again: a new venture with a static `index.html` from its
    # first commit, entering the mirror and the total together.
    # 232 since 2026-09-10, when `email-auth-check` also graduated the same
    # day — same shape again: a new venture with a static `index.html` from
    # its first commit, entering the mirror and the total together.
    # 233 since 2026-09-10, when `pwa-installability-check` also graduated
    # the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the
    # total together.
    # 234 since 2026-09-10, when `staffing-markup-calculator` also graduated
    # the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 235 since 2026-09-10, when `self-storage-rate-increase-calculator` also
    # graduated the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 236 since 2026-09-10, when `security-headers-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 237 since 2026-09-10, when `bounce-house-rental-calculator` also
    # graduated the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 238 since 2026-09-10, when `docker-base-image-pin-check` also graduated
    # the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 239 since 2026-09-10, when `oidc-trust-policy-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 240 since 2026-09-10, when `canonical-tag-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 241 since 2026-09-10, when `cookie-security-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 242 since 2026-09-10, when `social-preview-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 243 since 2026-09-10, when `wildlife-exclusion-bid-calculator` also
    # graduated the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 244 since 2026-09-10, when `cache-control-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 245 since 2026-09-11, when `ifta-quarterly-fuel-tax-calculator`
    # graduated — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 246 since 2026-09-11, when `drone-mapping-job-calculator` also graduated
    # the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 247 since 2026-09-11, when `hreflang-reciprocity-check` graduated too —
    # the third venture to land the same day, and the one that makes the point
    # this comment block has been accumulating toward: three sessions each
    # bumped this constant by one, in parallel, and each bump was correct
    # against the tree its author measured. Only the merge order decides which
    # number is right, which is why this is a conflict every time rather than
    # a count anybody can compute once.
    # 248 since 2026-09-11, when `sitemap-lastmod-freshness-check` also
    # graduated the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 249 since 2026-09-11, when `redirect-chain-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 250 since 2026-09-11, when `k8s-rollout-safety-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 251 since 2026-09-11, when `app-store-screenshot-check` graduated too —
    # the two landed within the same hour and each branch, correctly, moved the
    # total from 249 to 250. Merging them makes it 251: the count is of the
    # tree, not of either diff, which is exactly why this assertion is here.
    # 252 since 2026-09-11, when `llms-txt-generator` also graduated the same
    # day — same shape again: a new venture with a static `index.html` from
    # its first commit, entering the mirror and the total together.
    # 253 since 2026-09-11, when `actions-minutes-estimator` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 254 since 2026-09-11, when `codeowners-shadow-check` also graduated the
    # same day — same shape again: a new venture with a static `index.html`
    # from its first commit, entering the mirror and the total together.
    # 255 since 2026-09-11, when `ai-coding-plan-cost-calculator` also
    # graduated the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 256 since 2026-09-11, when `forestry-mulching-bid-calculator` also
    # graduated the same day — the count is of the tree, not of either
    # session's own diff, which is why two sibling ventures graduating in
    # parallel each correctly claimed 255 from their own base and merging
    # both makes it 256.
    # 257 since 2026-09-11, when `epk-generator` also graduated the same
    # day, merging on top of both of the above — same shape again: a new
    # venture with a static `index.html` from its first commit, entering
    # the mirror and the total together.
    # 258 since 2026-09-11, when `brand-deal-rate-calculator` also graduated
    # the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 259 since 2026-09-11, when `quarterly-estimated-tax-calendar` also
    # graduated the same day — same shape again: a new venture with a static
    # `index.html` from its first commit, entering the mirror and the total
    # together.
    # 260 since 2026-09-11, when `influencer-media-kit-generator` also
    # graduated the same day, merging on top of the above — the count is of
    # the tree, not of either session's own diff, which is why two sibling
    # ventures graduating in parallel each correctly claimed 259 from their
    # own base and merging both makes it 260.
    # 261 since 2026-09-11, when `terraform-plan-secret-exposure-check` also
    # graduated the same day: a zero-dependency CLI + browser tool with a
    # static `index.html` from its first commit, entering the mirror and the
    # total together, same shape as the rest of this running count.
    # 262 since 2026-09-11, when `auto-repair-effective-labor-rate` graduated
    # in parallel, merging on top of the above — same shape again, and the
    # same reason the count keeps moving several times a day: it is of the
    # tree, not of any one session's diff, so two sibling ventures graduating
    # in parallel each correctly claimed 261 from their own base and merging
    # both makes it 262.
    # 263 since 2026-09-11, when `dental-ppo-writeoff-calculator` graduated —
    # the first venture here for a healthcare practice's own back office, and a
    # static `index.html` from its first commit, so it entered the mirror and
    # the total together like the three above it.
    # 264 since 2026-09-11, when `cat-adjuster-fee-calculator` graduated (its
    # own PR #4629 did not update this count) — a static `index.html` from
    # its first commit, same shape as the venture above it.
    # 265 since 2026-09-11, when `vpat-acr-generator` graduated — a static
    # `index.html` from its first commit, same shape as the venture above it.
    # 266 since 2026-09-11, when `terraform-plan-blast-radius-check` graduated
    # — the second tool over the `terraform show -json` structured plan, after
    # the secret-exposure one further up, and a static `index.html` from its
    # first commit, so it entered the mirror and the total together like the
    # five above it.
    # 267 since 2026-09-11, when `home-inspection-fee-calculator` also
    # graduated the same day, merging on top of the above — the count is of
    # the tree, not of any one session's diff, so concurrent ventures
    # graduating in parallel each correctly claimed their own base and
    # merging all of them advances the total by one per venture.
    # 268 since 2026-09-11, when `process-server-fee-calculator` graduated —
    # a static `index.html` from its first commit, same shape as the venture
    # above it.
    # 269 since 2026-09-11, when `1099k-reconciliation-worksheet` also
    # graduated the same day (#4641) — a multi-platform gig/marketplace
    # 1099-K reconciliation worksheet with a static `index.html` from its
    # first commit, merging on top of the above the same way the two
    # ventures before it did: concurrent graduations each correctly claimed
    # their own base, and merging both advances the total by one per venture.
    # 270 since 2026-09-12, when `fleet-repair-or-replace-planner` graduated —
    # a repair-versus-replace planner for a small trade fleet, with a static
    # `index.html` from its first commit, so it entered the mirror and the
    # total together like the rest of this running count.
    # 271 since 2026-09-13, when `obsidian-plugin-review-check` graduated — a
    # free CLI + browser tool for Obsidian community-plugin developers, with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count.
    # 272 since 2026-09-13, when `caption-quality-check` graduated — a free
    # CLI + browser tool checking SRT/WebVTT caption files for reading speed,
    # line length, and timing problems against commonly-used caption
    # style-guide thresholds, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 273 since 2026-09-13, when `court-reporter-transcript-calculator`
    # graduated — a freelance court reporter deposition-invoice and
    # agency-offer calculator, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 274 since 2026-09-16, when `pdf-accessibility-tag-check` graduated — a
    # zero-dependency CLI + no-upload browser tool checking a PDF's own tag
    # structure, title, language, alt text, and form-field labels against
    # PDF/UA and Section 508, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 275 since 2026-09-16, when `photo-addon-pricing-calculator` graduated —
    # an independent wedding/event photographer's package add-on pricing
    # calculator, with a static `index.html` from its first commit, same
    # shape as the rest of this running count.
    # 276 since 2026-09-16, when `agent-instructions-drift-check` graduated —
    # a zero-dependency CLI + no-upload browser tool checking an AI-coding-
    # agent instruction file (AGENTS.md/CLAUDE.md) for broken file
    # references, undefined npm scripts, and known interpreter-mismatch
    # shell footguns, with a static `index.html` from its first commit, same
    # shape as the rest of this running count.
    # 277 since 2026-09-16, when `security-txt-check` graduated — a
    # zero-dependency CLI + no-upload browser tool validating a `security.txt`
    # against RFC 9116 (an expired or missing `Expires`, a `Contact` that is
    # not a URI, a key pasted where an `Encryption` URI belongs), with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count.
    # 278 since 2026-09-16, when `hoa-reserve-fund-calculator` graduated — a
    # browser-local calculator projecting an HOA/condo association's reserve
    # fund year by year against known capital component replacements, naming
    # the first year a special assessment is likely and solving for the
    # contribution that avoids it, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 279 since 2026-09-16, when `overtime-pay-calculator` graduated — a free
    # browser calculator for standard single-rate overtime pay plus the FLSA
    # weighted-average (blended rate) method for a workweek worked at two or
    # more different pay rates, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 280 since 2026-09-16, when `cron-dst-drift-check` graduated — a
    # zero-dependency CLI + browser tool computing a cron expression's
    # upcoming run times against a real IANA timezone, flagging
    # spring-forward-gap and fall-back-overlap occurrences, plus a
    # fixed-UTC-cron (GitHub Actions `schedule:` style) drift calculator,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count.
    # 281 since 2026-09-16, when `bridal-hair-makeup-pricing-calculator`
    # graduated — a browser-local calculator pricing a mobile bridal hair
    # and makeup booking (bride, bridal party, hair-only, makeup-only, kids)
    # plus an early-start fee, mileage, a service-minimum top-up, and a
    # schedule-capacity check for whether the artists booked can finish the
    # group on time, with a static `index.html` from its first commit, same
    # shape as the rest of this running count.
    # 282 since 2026-09-16, when `sql-migration-lock-check` graduated — a
    # zero-dependency CLI + browser tool reading a PostgreSQL schema
    # migration and reporting every statement that can take a blocking lock
    # or rewrite a table, including four relational checks a per-statement
    # linter cannot make (a missing `lock_timeout` above an exclusive-lock
    # statement, `NOT VALID` and `VALIDATE CONSTRAINT` sharing a
    # transaction, `CREATE INDEX CONCURRENTLY` inside a transaction block,
    # and `SET NOT NULL` judged against a validated `CHECK` earlier in the
    # file), with a static `index.html` from its first commit, same shape as
    # the rest of this running count.
    # 283 since 2026-09-16, when `sbom-diff-check` graduated — a
    # zero-dependency CLI + no-upload browser tool comparing two CycloneDX
    # or SPDX SBOM documents and reporting added, removed, and
    # version-changed packages between two builds, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count.
    # 284 since 2026-09-16, when `commissary-kitchen-cost-split-calculator`
    # graduated — a browser-local calculator splitting a shared commissary
    # kitchen's pooled monthly costs across multiple food-truck tenants by
    # hours booked and/or storage used (a largest-remainder allocation so
    # every tenant's total sums exactly to the pool total, to the cent),
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count.
    # 285 since 2026-09-16, when `backflow-test-fee-calculator` graduated —
    # a browser-local calculator pricing a multi-device backflow-preventer
    # test visit (per-device fee, a multi-device discount for devices after
    # the first, a per-device report-filing fee, travel, and a retest fee
    # for failures), with a static `index.html` from its first commit, same
    # shape as the rest of this running count.
    # 286 since 2026-09-16, when `land-survey-bid-calculator` graduated — a
    # browser-local bid calculator pricing a boundary/topographic/ALTA survey
    # job from corners located vs. set, terrain, record research, crew and
    # drafting time, then comparing the result to a flat per-acre quote, with
    # a static `index.html` from its first commit, same shape as the rest of
    # this running count.
    # 287 since 2026-09-17, when `estate-sale-net-proceeds-calculator`
    # graduated -- a browser-local calculator applying a company's tiered
    # commission schedule and fees to an estimated estate-sale gross, with
    # an optional minimum-guarantee floor and a two-quote comparison, same
    # shape as the rest of this running count.
    # 288 since 2026-09-16, when `wedding-florist-proposal-calculator`
    # graduated — a no-upload browser calculator pricing a wedding florist's
    # proposal from the stem recipe up, rounding each line to whole wholesale
    # bunches rather than loose stems, with a static `index.html` from its
    # first commit, same shape as the rest of this running count.
    # 289 since 2026-09-17, when `world-clock-widget` gained a browser surface
    # -- a world clock showing local time, sunrise, sunset, daylight length and
    # a waking-hours band for several cities at once, computed in the browser
    # from the USNO almanac algorithm. Unlike every other entry in this running
    # count it is not a new venture: the venture already existed as a Swift app
    # that needs an Apple account to reach anyone, and `site/` is a second
    # surface over the same tested core. So this is the first line here added
    # by *deploying* a product that was already finished rather than by
    # graduating a new one -- worth keeping distinct when reading the count
    # back as a rate of new ventures, which it no longer purely is.
    # 290 since 2026-09-17, when `openapi-breaking-change-check` graduated —
    # a zero-dependency CLI + no-upload browser tool diffing two OpenAPI
    # 3.0/3.1 documents and classifying each difference as a breaking change
    # (removed operation, newly-required parameter, narrowed type, removed
    # enum value, request body now required) or non-breaking, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count.
    # 291 since 2026-09-17, when `asbestos-abatement-bid-calculator`
    # graduated -- a browser-local bid calculator pricing an asbestos
    # removal job from OSHA/EPA containment class (Class I/II/III), square
    # footage, containment areas, crew and supervisor rates, air
    # monitoring, and waste disposal, then comparing the result to a flat
    # rate per square foot, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 292 since 2026-09-17, when `tutor-package-pricing-calculator`
    # graduated -- a no-upload browser calculator comparing a discounted
    # prepaid session package to pay-per-session pricing on both revenue and
    # effective hourly pay, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    # 293 since 2026-09-17, when `biohazard-cleanup-bid-calculator` graduated
    # -- a browser-local calculator pricing a biohazard/trauma-scene cleanup
    # job from crew labor, PPE decon-cycle sets, and regulated-waste disposal
    # rounded up to whole containers, with a static `index.html` from its
    # first commit, same shape as the rest of this running count. This
    # branch was open before `tutor-package-pricing-calculator` landed, so
    # it only ever knew its own predecessor's number (292) until this merge
    # -- the same ordinary collision shape recorded throughout this list.
    # 294 since 2026-09-17, when `storage-auction-max-bid-calculator`
    # graduated — a no-upload browser calculator pricing the maximum
    # profitable hammer bid for a storage-unit lien-auction lot from a
    # realistic resale recovery rate, resale-channel fees, the buyer's
    # premium, and the cleanout/dump/holding cost stack, then comparing it to
    # the flat percent-of-value rule of thumb most auction forums repeat, with
    # a static `index.html` from its first commit, same shape as the rest of
    # this running count. Landed the same afternoon as
    # `asbestos-abatement-bid-calculator`, `tutor-package-pricing-calculator`
    # and `biohazard-cleanup-bid-calculator`, so the resolved total is 294
    # rather than any one branch's own count.
    # 295 since 2026-09-17, when `vector-db-cost-calculator` graduated --
    # a browser-local calculator estimating a vector embedding index's
    # storage footprint (vector count, dimension, metadata, a user-set
    # index-overhead multiplier) and comparing monthly cost across up to
    # three vector database providers using rates the visitor types in,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count. This branch was open before
    # `tutor-package-pricing-calculator`, `biohazard-cleanup-bid-calculator`
    # and `storage-auction-max-bid-calculator` landed, so it only ever knew
    # its own predecessor's number (291) until this merge -- the same
    # ordinary collision shape recorded throughout this list.
    # 296 since 2026-09-17, when `required-checks-drift-check` graduated -- a
    # browser-local/CLI checker comparing a repository's branch-protection
    # required status check names against the job names its GitHub Actions
    # workflows would currently report, with a static `index.html` from its
    # first commit, same shape as the rest of this running count. This
    # branch was open before `storage-auction-max-bid-calculator` and
    # `vector-db-cost-calculator` landed, so it only ever knew its own
    # predecessor's number (294, then 295) until this merge -- the same
    # ordinary collision shape recorded throughout this list.
    # 297 since 2026-09-17, when `dog-boarding-daycare-pricing` graduated --
    # a browser-local calculator pricing a boarding/daycare reservation from
    # staff time, supplies, and overhead, with a threshold-based long-stay
    # discount and a multi-dog discount, plus a facility-level kennel/run
    # occupancy break-even distinct from any one reservation's price, with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count. This branch was open before
    # `vector-db-cost-calculator` and `required-checks-drift-check` landed,
    # so it only ever knew its own predecessor's number (295, then 296)
    # until this merge.
    # 298 since 2026-09-17, when `call-recording-consent-check` graduated --
    # a zero-dependency CLI + browser tool classifying US state
    # call-recording consent (one-party vs. all-party), with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch was open before `dog-boarding-daycare-pricing`
    # and `required-checks-drift-check` landed, so it only ever knew its own
    # predecessor's number (296) until this merge -- the same ordinary
    # collision shape recorded throughout this list.
    # 299 since 2026-09-17, when `podcast-sponsorship-rate-calculator`
    # graduated -- a browser-local calculator pricing a podcast ad spot
    # (pre-roll, mid-roll, post-roll) from a show's own average downloads
    # per episode, niche, and read type (host-read or produced) against
    # commonly cited CPM-per-1000-downloads benchmarks, a third
    # creator-economy pricing angle alongside `newsletter-sponsorship-rate-
    # calculator` and `brand-deal-rate-calculator`, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch was open before `call-recording-consent-check`
    # landed, so it only ever knew its own predecessor's number (297) until
    # this merge -- the same ordinary collision shape recorded throughout
    # this list.
    # 300 since 2026-09-17, when `subpath-robots-check` graduated -- a
    # browser-local checker plus a zero-dependency CLI reporting whether a
    # site published at a URL subpath can govern its own robots.txt, and the
    # sitemap auto-discovery gap that follows when it cannot, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch was open before
    # `podcast-sponsorship-rate-calculator` landed, so it only ever knew its
    # own predecessor's number (298, then 299) until this merge -- the same
    # ordinary collision shape recorded throughout this list.
    # 301 since 2026-09-17, when `import-landed-cost-calculator` graduated --
    # a browser-local calculator pricing an import shipment's total landed
    # cost (item cost, freight, insurance, duty, a supplemental/Section 301
    # tariff, the Merchandise Processing Fee, the Harbor Maintenance Fee,
    # and a customs broker fee) for small e-commerce importers, with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count. This branch was open before `subpath-robots-check`
    # landed, so it only ever knew its own predecessor's number (299, then
    # 300) until this merge -- the same ordinary collision shape recorded
    # throughout this list.
    # 302 since 2026-09-17, when `propane-delivery-route-margin` graduated --
    # a browser-local calculator pricing an independent propane (LP gas)
    # delivery route customer from annual gallons, fill size, the retail/
    # wholesale price spread, a small-fill minimum-delivery fee, drive time
    # and mileage, and fixed monthly tank-rental/hazmat compliance cost,
    # then rolling a customer list up into route profit -- the same
    # route-margin shape as `atm-route-margin` and `fire-extinguisher-
    # inspection-route-margin`, with a static `index.html` from its first
    # commit, same shape as the rest of this running count. This branch was
    # open before nothing else in flight landed, so it only ever knew its
    # own predecessor's number (301) until this merge.
    # 303 since 2026-09-17, when `k8s-deprecated-api-check` graduated -- a
    # zero-dependency CLI + browser tool reading Kubernetes manifest YAML for
    # apiVersion+kind pairs a past or named-target Kubernetes release has
    # removed, sourced from Kubernetes' own Deprecated API Migration Guide,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count. This branch was open before
    # `propane-delivery-route-margin` landed, so it only ever knew its own
    # predecessor's number (301, then 302) until this merge -- the same
    # ordinary collision shape recorded throughout this list: both branches
    # independently wrote "302" for what the merged tree made 303.
    # 304 since 2026-09-17, when `branch-protection-drift-check` graduated --
    # a zero-dependency CLI + browser tool comparing a repository's actual
    # GitHub branch-protection settings against a declared policy, flagging
    # every rule that has drifted weaker than intended (review counts, admin
    # enforcement, force-push/deletion rules, required status checks), with
    # a static `index.html` from its first commit, same shape as the rest
    # of this running count. This branch was open before nothing else in
    # flight landed, so it only ever knew its own predecessor's number
    # (303) until this merge.
    # 305 since 2026-09-17, when `stockx-seller-payout-calculator` graduated
    # -- a browser-local calculator pricing a StockX sneaker/streetwear/card
    # sale's net payout and net profit from the sale price, a Seller-Level
    # transaction fee, a Fast Shipping discount, a flat payment processing
    # fee, and outbound shipping cost, then rolling a month of sales up
    # against a profit goal -- the same single-channel marketplace-fee shape
    # as `whatnot-seller-payout` and `poshmark-fee-calculator`, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch was open before
    # `branch-protection-drift-check` landed, so it only ever knew its own
    # predecessor's number (303) until this merge -- the same ordinary
    # collision shape recorded throughout this list: both branches
    # independently wrote "304" for what the merged tree made 305.
    # 306 since 2026-09-17, when `android-data-safety-check` graduated -- a
    # browser-local and CLI checker cross-checking an Android project's
    # AndroidManifest.xml permissions and Gradle SDK dependencies against
    # the Google Play Data safety categories the developer says they've
    # already declared, the direct Android-side counterpart to
    # `ios-privacy-manifest-check`, with a static `index.html` from its
    # first commit, same shape as the rest of this running count. This
    # branch was open before this branch's own predecessor merges landed,
    # so it only ever knew an earlier number until this merge -- the same
    # ordinary collision shape recorded throughout this list.
    # 307 since 2026-09-17, when `helm-values-schema-check` graduated -- a
    # zero-dependency CLI + browser tool validating a Helm chart's
    # values.yaml against its own values.schema.json without running Helm,
    # flagging a field values.yaml sets that the schema does not declare
    # (the shape a typo takes, which helm lint only catches when the schema
    # sets additionalProperties: false) alongside real schema violations,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count. Cross-links `k8s-deprecated-api-check`,
    # its nearest sibling in the same `ci` category. This branch was open
    # before `stockx-seller-payout-calculator`, `android-data-safety-check`,
    # and `branch-protection-drift-check` landed, so it only ever knew an
    # earlier predecessor's number until this merge -- the same ordinary
    # collision shape recorded throughout this list: both branches
    # independently wrote "306" for what the merged tree made 307.
    # 308 since 2026-09-17, when `deploy-concurrency-check` graduated -- a
    # browser-local and CLI checker reading GitHub Actions workflow YAML for
    # the five ways a deploying workflow is permitted to apply an older
    # revision over a newer one (no concurrency group, a group keyed on
    # something that changes every run, cancel-in-progress on a deploy, two
    # jobs or workflows writing one environment under different group names,
    # and a deploying job checking out a moving branch), with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch was open before
    # `branch-protection-drift-check` and `helm-values-schema-check` landed,
    # so it only ever knew 306 until this merge -- the same ordinary
    # collision shape recorded throughout this list, three deep this time.
    # 309 since 2026-09-17, when `actions-secret-leak-check` graduated
    # concurrently with `deploy-concurrency-check` above -- a
    # zero-dependency CLI + browser tool flagging the two documented ways a
    # secret reaches a GitHub Actions log, or a later step, unmasked despite
    # GitHub's own log masking: a step that transforms a secret-derived
    # value before it can be printed, and one that exports a secret-derived
    # value to $GITHUB_ENV/$GITHUB_OUTPUT/$GITHUB_STATE without
    # `::add-mask::`. Direct sibling of `actions-injection-check`,
    # `actions-permissions-check` and `pinned-actions-check`, cross-linked
    # from all three. This branch was open before
    # `deploy-concurrency-check` landed, so it only ever knew 308 until this
    # merge -- both branches independently wrote "308" for what the merged
    # tree made 309.
    # 310 since 2026-09-17, when `twitch-payout-calculator` graduated
    # concurrently with `actions-secret-leak-check` above -- a browser-local
    # calculator turning a streamer's Tier 1/2/3 sub counts and Bits into
    # real monthly take-home after their revenue split, correcting the
    # belief that a mobile-purchased subscription pays less. This branch was
    # open before `actions-secret-leak-check` landed, so it only ever knew
    # 309 until this merge -- both branches independently wrote "309" for
    # what the merged tree made 310.
    # 311 since 2026-09-17, when `cnc-machining-quote-calculator` graduated
    # concurrently with `twitch-payout-calculator` above -- a CNC job shop
    # part-quoting calculator. This branch was open before
    # `cnc-machining-quote-calculator` landed, so it only ever knew 310
    # until this merge -- both branches independently wrote "310" for what
    # the merged tree made 311.
    # `actions-transitive-pin-check` also graduated concurrently -- a CLI +
    # browser tool that, for every top-level `uses:` reference already
    # pinned to a commit SHA, fetches that exact file from
    # `raw.githubusercontent.com` and classifies its own `uses:` lines the
    # same way, flagging a reference that is pinned at the call site but
    # loads something unpinned underneath -- a gap `pinned-actions-check`'s
    # own "no network calls" design cannot see into. Cross-linked with
    # `pinned-actions-check` from the first commit. A prior merge of several
    # concurrent branches guessed 311 by hand and got it wrong (measured 310
    # fresh against the actual tree at the time, most likely because one
    # branch's venture was already reflected in the baseline the arithmetic
    # started from) -- recorded here as the reminder not to repeat that.
    #
    # 311 since 2026-09-17: `actions-transitive-pin-check` (#4959) itself
    # shipped without registering in the front-door mirror, so that 310
    # figure was already stale the moment the very next commit (#4969)
    # registered it -- no venture graduated between the two, the mirror
    # just gained the entry it should have had from the start.
    #
    # 312 since 2026-09-17, when `twitch-payout-calculator` graduated
    # concurrently with all of the above -- a browser-local calculator
    # turning a streamer's Tier 1/2/3 sub counts and Bits into real monthly
    # take-home after their revenue split, correcting the belief that a
    # mobile-purchased subscription pays less. The number below is
    # `sync_tree_counts.py`'s own fresh measurement against this merge's
    # tree, not a hand sum of any of the above.
    #
    # 313 since 2026-09-17, when `ny-llc-transparency-act-tracker` graduated
    # concurrently with `twitch-payout-calculator` above -- a browser-local
    # eligibility check, deadline counter, and beneficial-owner worksheet
    # for New York's LLC Transparency Act. This branch was open before
    # `twitch-payout-calculator` landed, so it only ever knew 312 until this
    # merge. Recorded from `sync_tree_counts.py`'s own fresh measurement
    # against the merged tree, not a hand sum.
    #
    # 314 since 2026-09-17, when `docker-build-secrets-check` graduated -- a
    # browser-local and zero-dependency-CLI checker for Dockerfile build-time
    # secret exposure: an ENV/ARG instruction whose name looks like a secret,
    # or a COPY/ADD of a well-known credential file, with a BuildKit
    # `RUN --mount=type=secret` fix for each finding. Direct sibling of
    # `docker-base-image-pin-check` (same file, a different question -- FROM
    # tag/digest rather than ENV/ARG/COPY secret exposure), cross-linked
    # reciprocally. Recorded from `sync_tree_counts.py`'s own fresh
    # measurement against the merged tree, not a hand sum.
    #
    # 315 since 2026-09-17, when `1099-vendor-tracker` graduated concurrently
    # with `ny-llc-transparency-act-tracker` and `docker-build-secrets-check`
    # above -- a browser-local tracker flagging which vendors cross the 2026
    # $2,000 OBBBA reporting threshold (up from $600) and need a 1099-NEC,
    # applying the corporation exemption and its attorney-fee exception, and
    # tracking missing W-9s before the January 31 deadline. This branch was
    # open before either of the other two landed, so it only ever knew 313
    # until this merge. Recorded from `sync_tree_counts.py`'s own fresh
    # measurement against the merged tree, not a hand sum.
    #
    # 316 since 2026-09-17, when `1099-k-threshold-checker` graduated -- a
    # browser-local checker estimating whether a marketplace or payment app
    # is likely to issue a Form 1099-K, per platform and per tax year,
    # against the federal threshold's four changes since 2022 and four
    # states' own stricter $600 threshold. Recorded from
    # `sync_tree_counts.py`'s own fresh measurement against the tree, not a
    # hand sum.
    #
    # 317 since 2026-09-17, when `no-tax-on-tips-overtime-calculator`
    # graduated -- a browser-local calculator estimating the federal "no tax
    # on tips" ($25,000 cap) and "no tax on overtime" ($12,500/$25,000 cap)
    # deductions (One Big Beautiful Bill Act, tax years 2025-2028), combining
    # both in one shared-MAGI phase-out pass and applying the overtime
    # deduction's easy-to-miss half-time-premium-only rule. This branch was
    # open before `1099-k-threshold-checker` and the other same-day
    # graduations landed, so it only ever knew 316 until this merge.
    # Recorded from `sync_tree_counts.py`'s own fresh measurement against the
    # merged tree, not a hand sum.
    #
    # 318 since 2026-09-17, when `depreciation-recapture-calculator`
    # graduated concurrently -- a browser-local calculator splitting the
    # gain on a rental property sale into unrecaptured Section 1250
    # depreciation recapture (ordinary rate, capped at 25%) and the
    # remainder at the seller's capital-gains rate, with an optional NIIT
    # add-on and a 1031 exchange boot/deferral comparison. Filed under
    # `backoffice` (the same after-the-fact tax-arithmetic axis as
    # `quarterly-estimated-tax-calendar`, which it cross-links
    # reciprocally). This branch was open before `1099-k-threshold-checker`
    # and `no-tax-on-tips-overtime-calculator` landed, so it only ever knew
    # 316 until this merge. Recorded from `sync_tree_counts.py`'s own fresh
    # measurement against the merged tree, not a hand sum.
    #
    # 319 since 2026-09-17, when `qbi-deduction-calculator` graduated
    # concurrently (a federal Section 199A qualified-business-income
    # deduction estimator).
    #
    # 320 since 2026-09-17, when `equipment-auction-buyer-premium-calculator`
    # graduated concurrently -- a browser-local calculator turning a farm or
    # heavy-equipment auction hammer price into its true out-the-door total
    # (a capped buyer's premium, an online-bidding premium, a card
    # surcharge, sales tax, and a doc/title fee), with a closed-form reverse
    # solve for the highest hammer price a target budget supports. Filed
    # under `logistics` (the same "normalise a quote ... before you sign
    # for it" axis as `import-landed-cost-calculator`, just for an auction
    # lot instead of a customs entry). Recorded from `sync_tree_counts.py`'s
    # own fresh measurement against the merged tree, not a hand sum.
    #
    # 321 since 2026-09-17, when `docker-cache-order-check` graduated
    # concurrently -- a zero-dependency CLI + browser checker reading a
    # Dockerfile's instruction order for build-cache-invalidation mistakes (a
    # dependency manifest copied/installed after a whole-context `COPY . .`,
    # or an `apt-get update` split from `install` across layers). A different
    # object from this portfolio's other two Dockerfile checkers, which each
    # check one instruction against a rule rather than instruction order.
    # This branch was open before the other ventures above landed, so it
    # only ever knew 319 until this merge. Recorded from
    # `sync_tree_counts.py`'s own fresh measurement against the merged tree,
    # not a hand sum.
    #
    # 322 since 2026-09-18, when `parcel-dim-weight-calculator` graduated -- a
    # browser-local calculator turning a carton's dimensions, actual weight and
    # DIM divisor into the billable weight a parcel carrier charges, plus the
    # break-even cube that ends the dimensional penalty, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch was open before
    # `equipment-auction-buyer-premium-calculator` and `docker-cache-order-check`
    # landed, so it only ever knew its own predecessor's number (320) until
    # this merge -- the same ordinary collision shape recorded throughout this
    # list, and re-derived here by `sync_tree_counts.py` against the merged
    # tree rather than by hand.
    #
    # 323 since this merge: `docker-base-image-eol-check` graduated -- a
    # browser-local and CLI checker for Dockerfile base-image end-of-life,
    # cross-linked with `docker-base-image-pin-check` from its first commit.
    #
    # 324 since this merge: `freelance-platform-fee-calculator` graduated --
    # a browser-local calculator comparing Upwork's and Fiverr's net payout
    # for the same job price, with a static `index.html` from its first
    # commit, same shape as the rest of this running count.
    #
    # 325 since this merge: `personal-trainer-package-pricing-calculator`
    # graduated -- a browser-local calculator comparing a prepaid session
    # package to pay-per-session pricing on net take-home pay per hour,
    # after a gym or studio's percentage or flat cost structure, with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count.
    #
    # 326 since this merge: `actions-secrets-inherit-check` graduated -- a
    # browser-local and CLI checker for GitHub Actions `secrets: inherit`
    # calls to an external reusable workflow or a fork-reachable job, with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count. This branch was open before
    # `osha-trir-dart-calculator` and `supabase-rls-check` landed, so it
    # only ever knew its own predecessor's number (325) until this merge --
    # the same ordinary collision shape recorded throughout this list.
    #
    # 326 since this merge: `actions-secrets-inherit-check` graduated
    # concurrently -- a browser-local and CLI checker for GitHub Actions
    # `secrets: inherit` calls to an external reusable workflow or a
    # fork-reachable job, with a static `index.html` from its first commit,
    # same shape as the rest of this running count. Both branches only ever
    # knew their own predecessor's number (325) until this merge -- the same
    # ordinary collision shape recorded throughout this list.
    #
    # 327 since this merge: `osha-trir-dart-calculator` graduated -- a
    # browser-local calculator turning a company's own OSHA 300 log counts
    # into its TRIR and DART rate against a target, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count.
    #
    # 328 since this merge: `supabase-rls-check` graduated concurrently -- a
    # browser + CLI checker reading a Supabase project's own PostgREST
    # schema listing and testing whether the anon key can read real rows
    # from each table (the missing-Row-Level-Security exposure behind
    # CVE-2025-48757), with a static `index.html` from its first commit,
    # same shape as the rest of this running count.
    #
    # 329 since this merge: `source-map-leak-check` graduated -- a browser +
    # CLI checker reading each script's own sourceMappingURL comment and
    # fetching the referenced map to test whether a production source map
    # is publicly readable, and whether it embeds full original source text
    # or only file paths, with a static `index.html` from its first commit,
    # same shape as the rest of this running count. This branch only ever
    # knew its own predecessor's number (328, from `actions-secrets-inherit-
    # check` alone) until this merge brought `osha-trir-dart-calculator` and
    # `supabase-rls-check` in alongside it -- the same ordinary collision
    # shape recorded throughout this list.
    #
    # 330 since this merge: `mercari-fee-calculator` graduated concurrently
    # -- a browser-local calculator pricing a Mercari sale against the
    # current (Jan 6, 2025) shipping-inclusive 10% fee schedule and the
    # legacy item-price-only 10% + 2.9% + $0.50 schedule, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch only ever knew its own predecessor's
    # number (327) until this merge -- the same ordinary collision shape
    # recorded throughout this list.
    #
    # 331 since this merge: `sign-language-interpreter-rate-calculator`
    # graduated -- a browser-local calculator pricing a single freelance/
    # contract sign language interpreting assignment (hours against a
    # two-hour booking minimum, portal-to-portal travel, an after-hours
    # differential, and a team-interpreting flag for long legal/medical/
    # mental-health bookings) plus a tiered late-cancellation fee
    # calculator, with a static `index.html` from its first commit, same
    # shape as the rest of this running count. Recorded from
    # `sync_tree_counts.py`'s own fresh measurement against the merged
    # tree, not a hand sum.
    #
    # 332 since this merge: `turo-host-payout-calculator` also graduated,
    # concurrently -- a browser-local calculator turning one Turo trip's
    # price into a host payout under Turo's 2026 plan x booking-window
    # earnings matrix, with a static `index.html` from its first commit,
    # same shape as the rest of this running count. This branch only ever
    # knew its own predecessor's number (330, before mercari-fee-calculator
    # landed) until this merge -- the same ordinary collision shape
    # recorded throughout this list, re-derived here by `sync_tree_counts.py`
    # against the merged tree rather than by hand.
    #
    # 333 since this merge: `firebase-rules-check` also graduated,
    # concurrently -- a browser + CLI checker sending real, read-only,
    # unauthenticated requests to a Firebase project's Realtime Database (a
    # shallow key listing) and named Firestore collections (one document
    # max), testing whether an unauthenticated request returns real data --
    # the default-open / left-in-test-mode security-rules exposure
    # documented since Appthority's 2018 "Firebase mismanagement" report.
    # Direct sibling of `supabase-rls-check`, same "default-open unless a
    # rule locks it down" shape for a different backend, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch only ever knew its own predecessor's
    # number (327, before `osha-trir-dart-calculator`, `supabase-rls-check`,
    # `mercari-fee-calculator`, and `voiceover-project-rate-calculator`
    # landed) until this merge -- the same ordinary collision shape
    # recorded throughout this list.
    #
    # 334 since this merge: `source-map-leak-check` also graduated,
    # concurrently -- a browser + CLI checker reading each script's own
    # trailing sourceMappingURL comment and naming which scripts have a
    # publicly readable production source map, distinguishing one that
    # embeds full original source text from one that exposes only file
    # paths. Same "read what's actually there, name the exact evidence"
    # checker shape as `cors-misconfig-check` and `supabase-rls-check`,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count. This branch only ever knew its own
    # predecessor's number (327, before `osha-trir-dart-calculator`,
    # `supabase-rls-check`, `mercari-fee-calculator`,
    # `voiceover-project-rate-calculator`, and `turo-host-payout-calculator`
    # landed) until this merge -- the same ordinary collision shape
    # recorded throughout this list. Total re-derived here by
    # `sync_tree_counts.py` against the fully merged tree rather than by
    # hand.
    #
    # 335 since this merge: `graphql-introspection-exposure-check` also
    # graduated, concurrently -- a checker for GraphQL introspection left
    # enabled in production, with a static `index.html` from its first
    # commit, same shape as the rest of this running count. This branch
    # only ever knew its own predecessor's number (331) until this merge --
    # the same ordinary collision shape recorded throughout this list,
    # re-derived here by `sync_tree_counts.py` against the fully merged
    # tree rather than by hand.
    #
    # 336 since this merge: `podcast-feed-check` also graduated,
    # concurrently -- a zero-dependency CLI + browser checker parsing a
    # podcast's RSS 2.0 + iTunes/Podcast-namespace feed against Apple
    # Podcasts' documented requirements and the RSS spec's RFC 822 pubDate
    # format, with a static `index.html` from its first commit, same shape
    # as the rest of this running count. This branch only ever knew its
    # own predecessor's number (333, before `source-map-leak-check` and
    # `sign-language-interpreter-rate-calculator` landed) until this
    # merge -- the same ordinary collision shape recorded throughout this
    # list, re-derived here by `sync_tree_counts.py` against the fully
    # merged tree rather than by hand.
    #
    # 337 since this merge: `git-exposure-check` also graduated,
    # concurrently -- a zero-dependency CLI + browser report viewer sending
    # two real GET requests (.git/HEAD, .git/config) and classifying the
    # response body against the exact grammar of a real git-internal file
    # to detect a publicly exposed .git directory, distinguishing real
    # exposure from a webserver that answers every path with 200 (a
    # soft-404). Same "read what's actually there, name the exact evidence"
    # checker shape as `cors-misconfig-check` and `security-headers-check`,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count. This branch only ever knew its own
    # predecessor's number (332, before `sign-language-interpreter-rate-
    # calculator`, `firebase-rules-check`, `source-map-leak-check`, and
    # `podcast-feed-check` landed) until this merge -- the same ordinary
    # collision shape recorded throughout this list. Total re-derived here
    # by `sync_tree_counts.py` against the fully merged tree rather than by
    # hand.
    #
    # 337 since this merge: `dotenv-exposure-check` graduated (this
    # branch) -- a zero-dependency browser tool + CLI sending real GET
    # requests to five well-known dotenv paths (.env, .env.local,
    # .env.production, .env.production.local, .env.development.local),
    # verifying the response body against the real KEY=VALUE line shape
    # rather than just an HTTP status, and never reading, storing, or
    # rendering a variable's VALUE anywhere -- only its name. Same "read
    # what's actually there, name the exact evidence" checker shape as
    # `git-exposure-check` and `source-map-leak-check`, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch only ever knew its own predecessor's
    # number (335, before `git-exposure-check` landed) until this merge --
    # the same ordinary collision shape recorded throughout this list, and
    # re-derived here by `sync_tree_counts.py` against the fully merged
    # tree rather than by hand.
    #
    # `graphql-introspection-exposure-check` also graduated on `main`,
    # concurrently with both of the above -- a zero-dependency CLI +
    # browser checker for a GraphQL endpoint's introspection query being
    # left enabled in production, same shape as the rest of this running
    # count. Its own PR did not carry a comment entry here; re-derived
    # (this merge) by `sync_tree_counts.py` against the fully merged tree
    # rather than by hand.
    #
    # 339 since this merge: `subdomain-takeover-check` graduated (this
    # branch) -- a zero-dependency browser tool + CLI following a
    # hostname's real CNAME chain over public DNS-over-HTTPS, matching the
    # final target against 25 known takeover-prone hosting providers, and
    # confirming with one live GET checked against that provider's own
    # "unclaimed" fingerprint page rather than escalating a DNS-only match.
    # Same "read what's actually there, name the exact evidence" checker
    # shape as `git-exposure-check` and `dotenv-exposure-check`, with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count. Total re-derived here by `sync_tree_counts.py`
    # against the fully merged tree rather than by hand.
    #
    # 340 since this merge: `slopsquatting-check` graduated (this branch) --
    # a zero-dependency browser tool + CLI flagging an npm dependency name
    # that looks hallucinated or freshly squatted. The browser page is
    # fully offline (an edit-distance heuristic against a bundled list of
    # well-known names, no network call); the CLI's one live check is a
    # read-only GET per dependency to the public npm registry. Same
    # "browser-local checker plus a matching CLI, run against a manifest
    # the maintainer already has" shape as `npm-lifecycle-script-check` and
    # `dependency-confusion-check`, with a static `index.html` from its
    # first commit, same shape as the rest of this running count.
    #
    # 341 since this merge: `cloud-bucket-exposure-check` also graduated,
    # concurrently on `main` -- a zero-dependency browser tool + CLI sending
    # one real, read-only, unauthenticated GET to a cloud provider's own
    # anonymous bucket-listing endpoint across AWS S3, Google Cloud
    # Storage, and Azure Blob Storage, classifying the response body
    # against each provider's own documented listing-or-error XML shape
    # rather than trusting a bare status code. Same "read what's actually
    # there, name the exact evidence" checker shape as `git-exposure-check`
    # and `subdomain-takeover-check`, with a static `index.html` from its
    # first commit, same shape as the rest of this running count. This
    # branch only ever knew its own predecessor's number (340, before
    # `slopsquatting-check` landed) until this merge -- the same ordinary
    # collision shape recorded throughout this list. Total re-derived here
    # by `sync_tree_counts.py` against the fully merged tree rather than by
    # hand.
    #
    # 342 since this merge: `window-tinting-bid-calculator` graduated -- a
    # deterministic bid calculator for independent auto window tinting
    # installers pricing a vehicle film job by pane count, film tier, and
    # old-tint removal time rather than a flat per-vehicle-size price. Same
    # "browser-local bid worksheet, no AI, no network call" shape as
    # `land-survey-bid-calculator` and `biohazard-cleanup-bid-calculator`,
    # with a static `index.html` from its first commit, same shape as the
    # rest of this running count.
    #
    # 343 since this merge: `backup-file-exposure-check` also graduated,
    # concurrently on `main` -- a zero-dependency browser tool + CLI sending
    # real GET requests to eight well-known backup-file paths (backup.zip,
    # backup.sql, db.sql, and more), classifying the response against a
    # real archive's magic bytes or a real SQL dump's line shape rather
    # than a bare status code, and never quoting a SQL dump's row-data
    # statements or extracting a matched archive. Same "read what's
    # actually there, name the exact evidence" checker shape as
    # `git-exposure-check` and `dotenv-exposure-check`, with a static
    # `index.html` from its first commit, same shape as the rest of this
    # running count. This branch only ever knew its own predecessor's
    # number (342, before `window-tinting-bid-calculator` landed) until
    # this merge -- the same ordinary collision shape recorded throughout
    # this list.
    #
    # 344 since this merge: `employee-cost-calculator` also graduated,
    # concurrently on `main` -- a browser calculator comparing the
    # fully-loaded annual cost of a W-2 employee against a 1099 contractor
    # for the same role (capped FUTA/SUTA employer-burden arithmetic,
    # ongoing-vs-year-one cost split, a break-even contractor rate), with a
    # static `index.html` from its first commit, same shape as the rest of
    # this running count. This branch only ever knew its own predecessor's
    # number (343, before `backup-file-exposure-check` landed on this side)
    # until this merge -- the same ordinary collision shape recorded
    # throughout this list.
    #
    # 345 on this merge: `str-occupancy-tax-calculator` also graduated,
    # concurrently on `main` -- a zero-dependency browser calculator
    # splitting one short-term-rental stay's occupancy tax into up to four
    # named layers plus a flat per-night fee, each split between what a
    # platform's collection agreement already remits and what is left for
    # the host to self-file. Static `index.html` from its first commit,
    # same shape as the rest of this running count. This branch only ever
    # knew its own predecessor's number (341, before `window-tinting-bid-
    # calculator`, `backup-file-exposure-check`, and `employee-cost-
    # calculator` each landed) until this merge -- the same ordinary
    # collision shape recorded throughout this list, three-wide this time.
    #
    # 346 on this merge: `llm-api-pricing-calculator` also graduated -- a
    # zero-dependency browser calculator comparing the monthly dollar cost
    # of calling different LLM APIs (Claude, GPT, Gemini, or a custom
    # provider) for a given workload, pricing fresh input, cached input, and
    # output tokens separately rather than one blended per-token rate.
    # Static `index.html` from its first commit, same shape as the rest of
    # this running count.
    #
    # 347 on this merge: `mcp-config-risk-check` also graduated -- a
    # zero-dependency browser checker that audits a single pasted MCP server
    # config (mcp.json / claude_desktop_config.json / VS Code's servers
    # shape) for structural risk patterns: broad filesystem/shell access,
    # secrets hardcoded instead of referenced from an environment variable,
    # missing version pins on npx/uvx/pipx/docker launches, and shadowed
    # tool names across servers. Different scope from the already-mirrored
    # `mcp-supply-chain-watch` (which diffs two captured manifests over
    # time). Static `index.html` from its first commit, same shape as the
    # rest of this running count.
    #
    # 348 on this merge: `kickstarter-fee-calculator` also graduated,
    # concurrently on `main` -- a zero-dependency browser calculator
    # pricing a Kickstarter campaign's net payout after the 5% platform
    # fee and per-pledge payment processing, and why more, smaller pledges
    # keep less of an identical total raised than fewer, larger ones. This
    # branch only ever knew its own predecessor's number (346, before
    # `mcp-config-risk-check` landed) until this merge -- the same
    # ordinary collision shape recorded throughout this list. Static
    # `index.html` from its first commit, same shape as the rest of this
    # running count.
    #
    # 349 on this merge: `auto-glass-bid-calculator` also graduated -- a
    # zero-dependency browser calculator pricing a mobile or in-shop
    # auto-glass replacement from glass position/source, ADAS camera or
    # sensor calibration (dynamic, static, or both), a mobile trip fee,
    # and cash-discount versus insurance-deductible billing, with a
    # mechanical flag when a selected calibration requirement was never
    # actually priced. Static `index.html` from its first commit, same
    # shape as the rest of this running count.
    #
    # 350 on this merge: `depop-fee-calculator` also graduated -- a
    # zero-dependency browser calculator pricing a Depop sale against the
    # 0%-selling-fee-plus-processing schedule US and UK sellers now run,
    # the older flat 10% schedule still used elsewhere, and the Boosted
    # Listings surcharge, keeping the buyer-paid Marketplace fee separate
    # from seller payout. Static `index.html` from its first commit, same
    # shape as the rest of this running count.
    #
    # 351 on this merge: `hidden-unicode-check` also graduated, concurrently
    # on `main` -- a zero-dependency browser tool that scans pasted text
    # (CLAUDE.md, AGENTS.md, .cursorrules, copilot-instructions.md, a
    # README, or any text) for zero-width/invisible Unicode characters,
    # Unicode Tag characters (decoding any hidden ASCII message they spell
    # out), and bidirectional override/control characters from the Trojan
    # Source family -- the technique behind current AI-agent
    # prompt-injection attacks. Static `index.html` from its first commit,
    # same shape as the rest of this running count.
    #
    # 352 on this merge: `skill-manifest-check` also graduated, concurrently
    # on `main` -- a zero-dependency browser tool that lints one or more
    # pasted SKILL.md agent-skill manifests (the frontmatter-plus-Markdown
    # format Claude Code and similar agent systems use) for missing/
    # malformed frontmatter, a description too vague to trigger reliably,
    # overlapping triggers between two or more pasted skills, and a
    # body-size context-budget caution. Static `index.html` from its first
    # commit, same shape as the rest of this running count. That merge
    # also gzip-compressed `llms.txt` (joining `catalog.json`,
    # `sitemap.xml`, and this branch's own `about.html`) to buy back
    # etcd-object headroom -- see `llmsStoredKey` and `aboutStoredKey` in
    # `platform/marketing/front-door.mjs`.
    #
    # 353 on this merge: `salary-range-posting-check` also graduated,
    # concurrently on `main` -- a zero-dependency browser + CLI tool that
    # scans pasted job-posting text for a stated dollar range and
    # cross-references a chosen set of US states against a fixed table of
    # which ones currently require a posted pay range. Static `index.html`
    # from its first commit, same shape as the rest of this running count.
    # That merge separately, and independently, also gzip-compressed
    # `llms.txt` for the identical etcd-headroom reason as the merge two
    # entries above -- the second write is a no-op once the first is
    # already committed.
    #
    # 354 on this merge: `economic-nexus-threshold-tracker` also
    # graduated -- a zero-dependency browser tracker letting a
    # multi-state online seller enter trailing-12-month sales by state
    # and flag which states' economic-nexus sales-tax-registration
    # thresholds they've crossed, against each state's own published
    # revenue figure ($100k/$250k/$500k) and, where the state pairs one
    # on, its transaction-count test (AND or OR). Static `index.html`
    # from its first commit, same shape as the rest of this running
    # count.
    #
    # 355 on this merge: `k8s-resource-limits-check` also graduates -- a
    # zero-dependency browser + CLI checker that reads Kubernetes workload
    # YAML and reports every container missing a memory limit, memory
    # request, CPU request, or ephemeral-storage limit, plus any request set
    # above its own limit. This branch only ever knew its own predecessor's
    # number (349, before any of the five merges above landed) until this
    # merge -- the same ordinary collision shape recorded throughout this
    # list. Static `index.html` from its first commit, same shape as the
    # rest of this running count.
    #
    # 356 on this merge: `s-corp-reasonable-compensation-calculator` also
    # graduates -- a zero-dependency browser calculator for single-
    # shareholder S-corp owners that compares a planned W-2 salary against
    # a comparable-wage figure the owner supplies, using the IRS's actual
    # multi-factor reasonable-compensation test, reports the FICA-tax cost
    # of closing the gap, and prints a nine-factor documentation checklist.
    # Static `index.html` from its first commit, same shape as the rest of
    # this running count.
    #
    # 357 on this merge: `auto-loan-interest-deduction-calculator` also
    # graduated, concurrently -- a browser-local calculator for the new
    # federal "qualified passenger vehicle loan interest" deduction (OBBBA,
    # tax years 2025-2028). This branch only ever knew its own predecessor's
    # number (356, from the graduation two entries above) until this merge --
    # the same ordinary collision shape recorded throughout this list; a
    # sibling branch independently reached the same 357 and the same
    # narration one merge later (#5733), which is why this entry is the one
    # that survived reconciling the two.
    # Static `index.html` from its first commit, same shape as the rest of
    # this running count.
    #
    # 358 on this merge: `tip-pool-compliance-calculator` also graduated,
    # concurrently on `main` -- a zero-dependency browser calculator for
    # restaurant/bar owners that checks a mandatory tip pool against the
    # two federal FLSA tip-pooling rules (a manager/supervisor is never
    # eligible; back-of-house staff are eligible only when no tip credit
    # is taken) and computes the tip-credit back-wage exposure a
    # violation creates. Static `index.html` and a
    # `vs-guessing-from-a-staff-meeting.html` comparison page, both from
    # their first commit, same shape as the rest of this running count.
    # This branch only ever knew its own predecessor's number (357) until
    # this merge -- the same ordinary collision shape recorded throughout
    # this list.
    #
    # 359: `caa-record-check` graduates -- a browser tool + CLI resolving
    # the CAA DNS record set that governs certificate issuance, following
    # RFC 8659's tree-walk. Static `index.html`, a HowTo guide page and a
    # generic-method comparison page, all from its first commit.
    #
    # 360 on this merge: `claude-code-settings-check` also graduated,
    # concurrently on `main` -- a browser tool checking a pasted Claude
    # Code settings.json for structural mistakes in hooks and permissions.
    # This branch only ever knew its own predecessor's number (359, from
    # `caa-record-check` above) until this merge -- the same ordinary
    # collision shape recorded throughout this list.
    #
    # 361 on a later merge: `claude-code-subagent-check` also graduated,
    # concurrently on `main` -- a zero-dependency browser checker for
    # Claude Code subagent definitions (.claude/agents/*.md) that flags a
    # malformed/mismatched name, a description too vague for reliable
    # orchestrator delegation, a malformed `tools` list, an unrecognized
    # `model` alias, and a missing or near-empty system prompt. Static
    # `index.html` from its first commit, same shape as the rest of this
    # running count.
    #
    # 362 on a later merge: `claude-skill-scaffold-generator` also
    # graduated, concurrently on `main` -- a zero-dependency browser tool
    # that turns a plain-language description of a Claude Agent Skill into
    # a starter SKILL.md with valid YAML frontmatter and a suggested folder
    # layout, flagging a non-slug name, a first-person description, and a
    # missing trigger condition. The generator half of the pair
    # `skill-manifest-check` started as the checker half. Static
    # `index.html` from its first commit, same shape as the rest of this
    # running count.
    #
    # 363 on a later merge: `mega-backdoor-roth-calculator` also graduated,
    # concurrently on `main` -- a browser calculator computing after-tax
    # 401(k) headroom under the IRS 415(c) limit, static index.html plus a
    # which-conversion-cadence-should-i-use.html guide page, both from
    # their first commit. This branch only ever knew its own predecessor's
    # number (360, from `claude-code-settings-check` above) until this
    # merge -- the same ordinary collision shape recorded throughout this
    # list.
    #
    # 362 on this merge: `mega-backdoor-roth-calculator` also graduated,
    # concurrently on `main` -- a browser-local calculator computing
    # after-tax 401(k)/415(c) contribution headroom for the mega-backdoor
    # Roth strategy against the published, dated IRS dollar limits. Static
    # `index.html` plus a `which-conversion-cadence-should-i-use.html`
    # guide page, both from their first commit, same shape as the rest of
    # this running count.
    #
    # 363 on this merge: `senior-deduction-calculator` also graduated
    # (#5765), concurrently on `main` -- a browser-local calculator for the
    # new federal "senior bonus" deduction (OBBBA, tax years 2025-2028),
    # including the married-filing-separately exclusion and the per-spouse
    # MAGI phase-out. Static `index.html` from its first commit, same shape
    # as the rest of this running count. Two separate concurrent sessions
    # each recorded their own half of this transition independently, one
    # only seeing claude-skill-scaffold-generator and the other only
    # seeing claude-code-subagent-check -- neither could see the other's
    # addition. All four additions above are real.
    #
    # 364 on this later merge: `facebook-marketplace-fee-calculator` also
    # graduated -- a browser-local calculator that prices a Facebook
    # Marketplace sale against the current shipped-checkout 10% fee (with
    # an $0.80 minimum) vs. the $0 local-pickup fee, plus the flat $20
    # dispute penalty. Static `index.html` and a
    # `vs-tracking-facebook-marketplace-sales-in-a-spreadsheet.html`
    # comparison page, both from their first commit, same shape as the
    # rest of this running count. This branch only ever knew its own
    # predecessor's number (362, from its own earlier merges of
    # `mega-backdoor-roth-calculator` and `senior-deduction-calculator`)
    # until this merge revealed two further concurrent graduations
    # (`claude-skill-scaffold-generator`, `claude-code-subagent-check`) it
    # had never observed -- the same ordinary collision shape recorded
    # throughout this list, one merge later. `senior-deduction-calculator`
    # was independently recorded again by a fourth concurrent session at
    # this same 364; the addition is the same one already counted above,
    # not a fifth.
    #
    # 365 on this later merge: `caa-record-check` also graduated,
    # concurrently on `main` -- a browser checker for CAA (Certification
    # Authority Authorization) DNS records, static `index.html` from its
    # first commit, same shape as the rest of this running count.
    #
    # 367 on this merge: two further ventures graduated concurrently on
    # `main`, neither visible to the other branch until this merge -- this
    # branch's own `npm-provenance-check` (a browser/CLI checker reporting
    # which packages in a pasted lockfile carry an npm provenance
    # attestation, trusted publishing / --provenance, with a
    # why-not-just-npm-audit-signatures.html docs page) and
    # `trump-account-calculator` (a browser-local calculator projecting a
    # federal "Trump Account" child savings account, One Big Beautiful
    # Bill Act, 26 U.S.C. 530A, to age 18 or later, with a
    # vs-doing-the-math-by-hand.html comparison page). Each is static
    # `index.html` plus one docs/comparison page from its first commit,
    # same shape as the rest of this running count. Total re-derived here
    # by `sync_tree_counts.py` against the fully merged tree rather than
    # by hand.
    #
    # 367 -> 368: `claude-code-hooks-security-check` also graduated -- a
    # browser tool scanning the command strings inside a pasted Claude
    # Code hooks configuration for known-dangerous shapes (remote
    # pipe-to-shell, credential exfiltration, unguarded recursive delete,
    # and others), complementing the portfolio's existing structural
    # checkers for the same ecosystem (`claude-code-settings-check`,
    # `claude-code-subagent-check`, `mcp-config-risk-check`,
    # `skill-manifest-check`). Static `index.html` plus one docs page from
    # its first commit, same shape as the rest of this running count.
    #
    # 369 -> 370 on this merge: `section-174a-catchup-calculator` also
    # graduated -- a browser-local calculator comparing the two
    # Rev. Proc. 2025-28 Section 174A domestic R&E catch-up election paths
    # (deduct the whole remaining unamortized 2022-2024 balance in 2025, or
    # split it over 2025-2026), with an NOL flag and a present-value
    # comparison, plus a vs-doing-the-math-by-hand.html comparison page.
    # Static `index.html` plus one docs/comparison page from its first
    # commit, same shape as the rest of this running count. Total
    # re-derived here by `sync_tree_counts.py` against the fully merged
    # tree rather than by hand.
    #
    # 371 -> 372 on that merge: `patreon-fee-calculator` also graduated,
    # concurrently and invisibly to the `mrr-waterfall-calculator` branch
    # above -- a browser-local calculator finding a Patreon creator's real
    # monthly payout from three pledge tiers after the plan's platform fee
    # (10% Standard, or legacy 5%/8%/12% Lite/Pro/Premium) and per-charge
    # payment processing, with a docs/comparison page showing when
    # per-creation billing costs more in fees than monthly billing for
    # the same total pledge. Static `index.html` plus one docs/comparison
    # page from its first commit, same shape as the rest of this running
    # count. Both additions are real, taking 370 to 372.
    #
    # 372 -> 373 on this merge: `bonus-depreciation-calculator` also
    # graduated, concurrently and invisibly to both branches above -- a
    # browser-local calculator comparing 100% bonus depreciation, a
    # Section 179 election (with the 2025/2026 dollar limit and
    # phase-out), and plain MACRS for a new equipment purchase, flagging
    # whether an over-large deduction creates an NOL or a Section 179
    # carryforward, plus a vs-doing-the-math-by-hand.html comparison page.
    # Static `index.html` plus one docs/comparison page from its first
    # commit, same shape as the rest of this running count. Total
    # re-derived here by `sync_tree_counts.py` against the fully merged
    # tree rather than by hand.
    #
    # 373 -> 374: `salt-cap-calculator` also graduated -- a browser-local
    # calculator computing the SALT itemized-deduction cap after its
    # 2025/2026 MAGI-based phase-out (30 cents per dollar of excess MAGI,
    # floored at a fixed dollar amount rather than phasing to zero), plus
    # a vs-doing-the-math-by-hand.html comparison page. Static `index.html`
    # plus one docs/comparison page from its first commit, same shape as
    # the rest of this running count.
    #
    # 374 -> 375: `charitable-deduction-calculator` also graduated -- a
    # browser-local calculator comparing the new 2026 non-itemizer
    # above-the-line charitable deduction against itemizing cash gifts
    # after the new 0.5%-of-AGI floor and the permanent 60%-of-AGI
    # ceiling, plus a vs-doing-the-math-by-hand.html comparison page.
    # Static `index.html` plus one docs/comparison page from its first
    # commit, same shape as the rest of this running count.
    #
    # 375 -> 376: `gambling-loss-deduction-calculator` also graduated,
    # concurrently with and invisibly to the five ventures below -- a
    # browser-local calculator computing the allowable gambling-loss
    # deduction under OBBBA's new 90%-of-winnings cap (IRC Section 165(d)),
    # plus a vs-doing-the-math-by-hand.html comparison page. Static
    # `index.html` plus one docs/comparison page from its first commit,
    # same shape as the rest of this running count.
    #
    # 376 -> 377: `estate-tax-exemption-calculator` also graduated -- a
    # browser-local calculator projecting federal estate tax exposure
    # under OBBBA's permanent 2026 $15,000,000 basic exclusion amount
    # (up to $30,000,000 married with portability), plus a
    # vs-doing-the-math-by-hand.html comparison page. Static `index.html`
    # plus one docs/comparison page from its first commit, same shape as
    # the rest of this running count.
    #
    # 377 -> 378: `excess-business-loss-calculator` also graduated,
    # concurrently -- a browser-local calculator computing the IRC 461(l)
    # excess business loss threshold (permanent under OBBBA, with a 2026
    # figure that counterintuitively falls below 2025's rather than
    # rising) and the resulting net operating loss carryforward, plus a
    # vs-doing-the-math-by-hand.html comparison page. Static `index.html`
    # plus one docs/comparison page from its first commit, same shape as
    # the rest of this running count.
    #
    # 378 -> 379: `qsbs-exclusion-calculator` also graduated, also
    # concurrently -- a browser-local calculator computing the Section
    # 1202 QSBS capital-gain exclusion, expanded by OBBBA for stock
    # acquired after July 4, 2025 (a new tiered 3/4/5-year schedule and a
    # higher per-issuer cap, replacing the old all-or-nothing 5-year cliff
    # for earlier stock), plus a vs-doing-the-math-by-hand.html comparison
    # page. Static `index.html` plus one docs/comparison page from its
    # first commit, same shape as the rest of this running count.
    #
    # 379 -> 380: `referrer-permissions-policy-check` also graduated,
    # concurrently and invisibly to the entries above -- a
    # zero-dependency CLI + browser report viewer sending one real GET
    # request and classifying the response's Referrer-Policy (an
    # unsafe-url full-URL leak, a missing or unrecognised value, the
    # legacy no-referrer-when-downgrade value) and Permissions-Policy (a
    # malformed structured-field allowlist, a wildcard on a sensitive
    # feature like camera/microphone, reliance on the deprecated
    # Feature-Policy header alone). Static `index.html` from its first
    # commit, same shape as the rest of this running count.
    #
    # 380 -> 381: `exempt-salary-threshold-checker` also graduated,
    # concurrently and invisibly to the entries above -- a browser-local
    # calculator checking a weekly salary against the 2026 federal FLSA
    # white-collar exemption threshold and the higher state figure in
    # California, Washington, Maine, Alaska, or New York (including New
    # York's carve-out excluding the professional exemption from its
    # higher figure). Static `index.html` only, no comparison page, from
    # its first commit.
    #
    # 381 -> 382: `final-paycheck-deadline-calculator` also graduated,
    # concurrently and invisibly to the entry above -- a browser-local
    # calculator computing the legal deadline for a departing employee's
    # final paycheck by US state and separation type (fired/laid off vs.
    # quit), including California's notice-based rule and Minnesota's
    # demand-triggered 24-hour rule, plus whether the state requires
    # accrued unused vacation/PTO to be paid out as wages. Static
    # `index.html` only, no comparison page, from its first commit. Its
    # own merge into `main` left its mirror files written but its
    # `gitops/prod/front-door-tools/kustomization.yaml` mount ABSENT --
    # neither `regen.mjs --verify` nor a partial `regen.mjs` run inside a
    # conflicted merge caught it, because `git checkout --ours` had
    # already replaced the just-regenerated `front-door-tools/` directory
    # with this branch's own stale pre-merge copy immediately afterward;
    # `_mirrored_venture_slugs()` (this file) is what actually caught the
    # gap, one commit short of shipping a venture nobody could reach.
    # Fixed by re-running `front-door-tools.mjs --write` and
    # `front-door.mjs --write` directly, after the `--ours` checkout, so
    # the freshly-regenerated files are what actually get committed.
    #
    # 382 -> 383: `boi-reporting-exemption-checker` also graduated,
    # concurrently -- a browser-local checker for whether an entity still
    # owes a federal Corporate Transparency Act beneficial ownership
    # report after FinCEN's August 2026 final rule permanently exempted
    # every U.S.-formed entity, applying only to foreign-formed entities
    # registered to do business in the U.S. Static `index.html` only, no
    # comparison page, from its first commit.
    #
    # 383 -> 384: `child-tax-credit-calculator` also graduated,
    # concurrently and invisibly to the two entries above -- a
    # browser-local calculator applying the permanent $2,200-per-child
    # Child Tax Credit, the $500 Credit for Other Dependents, their
    # combined MAGI phase-out, and the refundable Additional Child Tax
    # Credit ceiling, plus a vs-doing-the-math-by-hand.html comparison
    # page. Static `index.html` plus one docs/comparison page from its
    # first commit, same shape as the rest of this running count.
    #
    # 384 -> 385: `eitc-calculator` also graduated -- a browser-local
    # calculator for the federal Earned Income Tax Credit, applying the
    # phase-in/plateau/phase-out formula by qualifying-child count and
    # filing status, the investment income limit, and IRS Publication
    # 596's own dual earned-income/AGI lookup, plus a
    # vs-doing-the-math-by-hand.html comparison page. Static `index.html`
    # plus one docs/comparison page from its first commit, same shape as
    # the rest of this running count.
    #
    # 385 -> 386: `freelance-writer-rate-calculator` also graduated,
    # concurrently -- a browser-local calculator comparing a freelance
    # writer's per-word rate against a flat per-project fee for the same
    # job by effective hourly rate, counting research and revision hours
    # (which a per-word rate does not separately compensate) alongside
    # writing time. Static `index.html` from its first commit. `boi-
    # reporting-exemption-checker` and `final-paycheck-deadline-
    # calculator` are NOT re-added here -- both are already counted above,
    # at 382 -> 383 and 381 -> 382 respectively; a sibling merge of this
    # same conflict independently re-narrated them as new, which this
    # resolution does not repeat.
    #
    # 386 -> 387: `hsa-contribution-limit-calculator` also graduated,
    # concurrently on `origin/main` -- a browser-local calculator computing
    # the 2026 HSA contribution limit for self-only or family HDHP
    # coverage, prorated by months of eligibility or the full amount under
    # the last-month rule, plus the fixed $1,000 age-55 catch-up and an
    # HDHP-qualification check. Static `index.html` only, no comparison
    # page, from its first commit.
    #
    # 387 -> 388: `solo-401k-contribution-calculator` also graduated -- a
    # browser-local calculator computing the 2026 Solo 401(k) contribution
    # limit for a sole proprietor or single-member LLC: employee elective
    # deferral, employer profit-sharing contribution derived from net
    # self-employment earnings, and the combined Section 415(c) overall
    # limit. Static `index.html` only, no comparison page, from its first
    # commit. Total re-derived here by `sync_tree_counts.py` against the
    # fully merged tree rather than by hand.
    #
    # 388 -> 389: `mileage-deduction-method-calculator` graduated -- a
    # browser-local calculator comparing the 2026 IRS standard mileage rate
    # (72.5 then 76 cents) with actual vehicle expenses. Static `index.html`
    # only, from its first commit. Total re-derived by `sync_tree_counts.py`.
    # 389 -> 390: `home-office-deduction-calculator` also graduated -- a
    # browser-local simplified-vs-regular (Form 8829) home office deduction
    # comparison. Static `index.html` only.
    # 390 -> 391: `str-tax-loophole-calculator` also graduated -- a
    # browser-local short-term-rental passive/non-passive and cost
    # segregation calculator. Static `index.html` only.
    # 391 -> 392: `estimated-tax-penalty-calculator` also graduated -- a
    # browser-local Form 2210 underpayment penalty estimator. Static `index.html` only.
    # 392 -> 393: `self-employment-tax-calculator` also graduated -- a
    # browser-local 2026 Schedule SE tax calculator. Static `index.html` only.
    # 393 -> 394: `backdoor-roth-pro-rata-calculator` graduated (browser-local
    # Form 8606 pro-rata calculator, static `index.html` only).
    # 397 -> 398: `dependabot-config-check` graduated (Node CLI + browser
    # page that lints dependabot.yml; static `index.html` plus ES modules).
    # 400 -> 401: `roth-conversion-bracket-fill-calculator` graduated (browser-local
    # 2026 Roth conversion calculator, static `index.html` only).
    # 403 -> 404: `etsy-statement-profit-analyzer` graduated (browser-local Etsy
    # statement CSV analyzer, static `index.html` plus ES modules).
    # 404 -> 405: `google-ads-wasted-spend-analyzer` graduated (browser-local Google Ads
    # search terms report analyzer, static `index.html` plus ES modules).
    # 405 -> 406: `shopify-discount-leakage-analyzer` graduated (browser-local Shopify
    # orders export analyzer, static `index.html` plus ES modules).
    # 407 -> 408: `airbnb-earnings-report-analyzer` graduated (browser-local Airbnb
    # Transaction history analyzer, static `index.html` plus ES modules).
    # 409 -> 410: `ebay-transaction-report-analyzer` graduated (browser-local eBay
    # Transaction report analyzer, static `index.html` plus ES modules).
    # 410 -> 411: `shopify-payments-fee-analyzer` graduated (browser-local Shopify
    # Payments transactions fee-rate analyzer, static `index.html` plus ES modules).
    # 412 -> 413: `upwork-earnings-fee-analyzer` graduated (browser-local Upwork
    # transaction history fee analyzer, static `index.html` plus ES modules).
    # 413 -> 414: `meta-ads-fatigue-analyzer` graduated (browser-local Meta Ads Manager
    # export analyzer, static `index.html` plus ES modules).
    # +1: `turo-earnings-report-analyzer` graduated (browser-local Turo earnings
    # CSV analyzer, static `index.html` plus ES modules).
    # +1: `fiverr-earnings-fee-analyzer` graduated (browser-local Fiverr earnings
    # CSV analyzer, static `index.html` plus ES modules).
    # +1: `kdp-royalty-report-analyzer` graduated (browser-local KDP royalty
    # report analyzer, static `index.html` plus ES modules).
    # +1: `poshmark-sales-report-analyzer` graduated (browser-local Poshmark My
    # Sales Report CSV analyzer, static `index.html` plus ES modules).
    # +1: `patreon-members-churn-analyzer` graduated (browser-local Patreon Members export analyzer).
    # +1: `whatnot-sales-report-analyzer` graduated (browser-local Whatnot orders CSV analyzer).
    # +1: `tiktok-shop-settlement-analyzer` graduated (browser-local TikTok Shop
    # settlement CSV analyzer, static `index.html` plus ES modules).
    # +1: `substack-subscriber-export-analyzer` graduated.
    # +1: `app-store-sales-report-analyzer` graduated.
    # +1: `bandcamp-sales-report-analyzer` graduated.
    # +1: `google-play-earnings-report-analyzer` graduated.
    # +1: `indie-game-payout-calculator` graduated.
    # +1: `home-service-lead-roi-analyzer` graduated (browser-local lead log analyzer).
    # +1: `rent-roll-delinquency-analyzer` graduated (browser-local rent ledger analyzer).
    # +1: `fba-aged-inventory-fee-analyzer` graduated.
    # +1: `ghost-members-export-analyzer` graduated.
    # +1: `restaurant-pos-menu-mix-analyzer` graduated (browser-local POS export analyzer).
    # +1: `rental-property-schedule-e-categorizer` graduated (browser-local bank CSV to Schedule E lines).
    # +1: `property-tax-appeal-calculator` graduated (browser-local property tax appeal comps and equity check).
    # +1: `appointment-no-show-analyzer` graduated (browser-local booking export analyzer).
    # +1: `freelancer-schedule-c-categorizer` graduated (browser-local bank CSV to Schedule C lines).
    # +1: `self-employed-schedule-c-categorizer` graduated (browser-local bank CSV to Schedule C lines).
    # +1: `late-invoice-collections-kit` graduated (browser-local late-invoice fee, letters and break-even plan).
    # +1: `print-on-demand-profit-calculator` graduated (browser-local print-on-demand profit, target price and ad limit).
    # +1: `service-hourly-yield-analyzer` graduated (browser-local booking export revenue-per-hour analyzer).
    # +1: `medical-bill-error-checker` graduated (browser-local itemized medical bill checker).
    # +1: `mortgage-escrow-analysis-checker` graduated (browser-local mortgage escrow statement checker).
    # +1: `shopify-inventory-reorder-planner` graduated (browser-local reorder-point and dead-stock planner).
    # +1: `like-kind-exchange-1031-calculator` graduated (browser-local 1031 exchange deadline, boot and basis calculator).
    # +1: `aca-subsidy-cliff-calculator` graduated (browser-local 2026 ACA premium tax credit and 400% FPL cliff).
    # +1: `wage-garnishment-limit-calculator` graduated (browser-local federal wage garnishment cap calculator).
    # +1: `medicare-irmaa-cliff-calculator` graduated (browser-local 2026 Medicare IRMAA tier, cliff distance and SSA-44 checklist).
    # +1: `rmd-calculator` graduated (browser-local required minimum distribution planner).
    # +1: `rsu-withholding-gap-calculator` graduated (browser-local RSU withholding gap calculator).
    # +1: `espp-tax-calculator` graduated (browser-local ESPP sell-or-hold tax calculator).
    # +1: `agent-brokerage-split-calculator` graduated (browser-local brokerage split and cap comparison for real estate agents).
    # +1: `tax-loss-harvesting-calculator` graduated (browser-local tax-loss harvesting calculator).
    # +1: `solar-payback-calculator` graduated (browser-local homeowner solar payback calculator).
    # +1: `rental-dscr-calculator` graduated (browser-local rental DSCR and cash-on-cash calculator).
    # +1: `heat-pump-vs-furnace-calculator` graduated (browser-local homeowner heat pump vs gas furnace calculator).
    # +1: `van-westendorp-pricing-analyzer` graduated (browser-local Van Westendorp price survey analyzer).
    # +1: `gabor-granger-price-analyzer` graduated (browser-local Gabor-Granger willingness-to-pay analyzer).
    # +1: `sales-commission-plan-comparison-calculator` graduated (browser-local sales offer comparison across quota attainment).
    # +1: `merchant-cash-advance-true-cost-calculator` graduated (browser-local MCA and invoice-factoring annualised cost calculator).
    # +1: `usage-based-pricing-simulator` graduated (browser-local metered pricing plan simulator against a usage distribution).
    # +1: `locum-tenens-vs-employed-calculator` graduated (browser-local locum tenens 1099 vs employed W-2 comparison with break-even rate).
    # +1: `startup-exit-waterfall-calculator` graduated (browser-local exit waterfall with liquidation preferences, participation caps and seniority).
    # +1: `insurance-agency-book-valuation-calculator` graduated (browser-local insurance book of business sell-or-keep valuation).
    # +1: `ab-test-significance-calculator` graduated (browser-local A/B test significance, SRM and sequential calculator).
    # +1: `online-business-valuation-calculator` graduated (browser-local small online business valuation).
    # +1: `fix-and-flip-deal-analyzer` graduated (browser-local fix-and-flip max offer, profit and hard-money cost analyzer).
    # +1: `customer-lifetime-value-predictor` graduated (browser-local CLV predictor, BG/NBD and Gamma-Gamma).
    # +1: `commercial-lease-effective-rent-calculator` graduated (browser-local commercial lease offer comparison).
    # +1: `sales-seasonality-forecaster` graduated (browser-local seasonal sales forecast, Holt-Winters, cash cushion).
    # +1: `clearance-markdown-planner` graduated (browser-local markdown schedule planner, price elasticity and dynamic programming).
    # +1: `bid-win-rate-optimizer` graduated (browser-local bid win-probability curve and best markup, logistic regression).
    # +1: `liquidation-pallet-bid-calculator` graduated (browser-local liquidation pallet max bid, Monte Carlo recovery simulation).
    # +1: `appointment-overbooking-optimizer` graduated (browser-local overbooking planner, beta-binomial show-ups, overflow risk).
    # +1: `shift-cover-optimizer` graduated (browser-local shift plan, exact min-cost-flow cover of hourly staffing needs).
    # +1: `client-rebooking-predictor` graduated (browser-local client rebooking rhythm, who is overdue versus lost).
    # +1: `crew-dispatch-optimizer` graduated (browser-local dispatch planner, exact Held-Karp plus subset DP for up to 12 jobs).
    # +1: `service-van-stock-optimizer` graduated (browser-local van stock planner, exact subset enumeration for up to 20 part units).
    # +1: `renewal-rent-optimizer` graduated (browser-local lease renewal rent optimizer, logistic regression, vacancy and turnover economics).
    # +1: `trial-conversion-timing-analyzer` graduated (browser-local free-trial conversion timing, what a shorter trial would have lost).
    # +1: `str-nightly-rate-optimizer` graduated (browser-local STR nightly price optimizer, logistic booking curve, fee and turnover economics).
    # +1: `quote-follow-up-timing` graduated (browser-local quote follow-up timing, Aalen-Johansen competing risks over open/won/lost quotes).
    # +1: `rental-rent-optimizer` graduated (browser-local asking-rent optimizer from own listing history).
    # +1: `mechanics-lien-deadline-calculator` graduated (browser-local mechanics-lien notice and filing deadline lookup, five states).
    # +1: `donor-retention-analyzer` graduated (browser-local nonprofit donor retention and ranked LYBUNT/SYBUNT lists from own gift history).
    # +1: `workers-comp-premium-calculator` graduated (browser-local workers' comp premium and audit true-up from user-supplied class rates).
    # +1: `market-garden-bed-planner` graduated (browser-local crop-mix planner: exact LP over beds, labor and demand, with shadow prices).
    # +1: `family-child-care-time-space-calculator` graduated (browser-local home day care time-space percentage, exclusive-use rooms, simplified-method comparison).
    # +1: `private-practice-payer-mix-calculator` graduated (browser-local therapy-practice payer mix: net per clinical hour by panel and cash, break-even refill).
    # +1: `cottage-food-pricing-calculator` graduated (browser-local cottage-food pricing: full cost per sellable unit, online/market/wholesale prices, earned per hour).
    # +1: `contractor-wip-schedule` graduated (browser-local percent-of-completion WIP schedule: over/under billing, loss provision, cash still to come).
    # +1: `freelance-retainer-vs-hourly-calculator` graduated (browser-local retainer-versus-hourly replay of a proposed retainer against the user's own time log).
    # +1: `payroll-tax-deposit-penalty-calculator` graduated (browser-local payroll tax deposit due dates and failure-to-deposit penalty with cheapest designation).
    # +1: `home-care-agency-margin-calculator` graduated (browser-local home care agency margin per billed hour by payer, bill rate for a target margin).
    # +1: `family-child-care-time-space-calculator` graduated (browser-local home day care time-space percentage, exclusive-use rooms, simplified-method comparison).
    # +1: `adu-payback-calculator` graduated (browser-local ADU payback: yield on cost, equity IRR/NPV, break-even rent, rent and cost sensitivity).
    # +1: `massage-therapist-profit-calculator` graduated (browser-local massage profit per hour by session, no-show-adjusted price floor, practice vs room rent vs split).
    # +1: `wedding-photographer-profit-calculator` graduated (browser-local wedding photographer profit per hour worked with editing time, price floor, own clients vs marketplace vs studio associate).
    # +1: `dj-gig-profit-calculator` graduated (browser-local DJ profit per hour worked and price floor by package; landed in #6139 without its own line here).
    # +1: `shipping-box-size-optimizer` graduated (browser-local carton assortment optimizer: which box sizes to stock, p-median over dimensional-weight landed cost).
    # +1: `container-load-planner` graduated (browser-local 3D container/pallet load planner: units packed and left over, containers for the whole load, to-scale views, loose-versus-pallets comparison).
    # +1: `crypto-cost-basis-calculator` graduated (browser-local crypto lot matcher: FIFO/LIFO/HIFO/LOFO/tax-aware, short/long rows, Form 8949 style export).
    # +1: `rental-fleet-size-optimizer` graduated (browser-local rental fleet size: Erlang loss plus seeded day-by-day simulation, how many identical units to own).
    # +1: `tile-layout-planner` graduated (browser-local tile layout planner: exact polygon clipping, offcut reuse, search over starting positions, to-scale plan and cut list).
    # +1: `event-seating-chart-optimizer` graduated (browser-local seating chart optimizer: simulated annealing over guest wishes, tables balanced, pins honoured).
    # +1: `state-residency-day-counter` graduated (browser-local multi-state residency day counter: 183-day tests, crossing date, workday wage split).
    # +1: `league-schedule-generator` graduated (browser-local round-robin league schedule generator: dates, home/away balance, courts and time slots, blackouts, play-offs).
    # +1: `shift-roster-builder` graduated (browser-local weekly shift roster builder: availability, rest, hour caps, overtime, who-is-critical).
    # +1: `time-off-request-planner` graduated (browser-local time-off request planner: exact search for the leave requests that fit minimum cover per role).
    # +1: `cheap-meal-plan-optimizer` graduated (browser-local minimum-cost diet solver: simplex plus branch and bound, price of each nutrient target).
    # +1: `coffee-roaster-margin-calculator` graduated (browser-local coffee roaster margin, channel and blend-cost calculator).
    # +1: `nsa-idr-offer-calculator` graduated (browser-local NSA IDR offer sizing and file-or-skip by claim).
    # +1: `house-cleaning-quote-calculator` graduated (browser-local house cleaning price floor, frequency discount limit and profit per visit calculator).
    # +1: `handyman-minimum-job-calculator` graduated (browser-local handyman minimum trip charge, smallest job and effective hourly calculator).
    # +1: `tattoo-piece-profit-calculator` graduated (browser-local tattoo piece lowest price, effective hourly and shop minimum calculator).
    # +1: `regex-redos-check` graduated (browser + CLI ReDoS regex scanner).
    # +1: `freelance-rate-increase-calculator` graduated (browser-local freelance rate increase break-even client loss, hours freed and raise ladder calculator).
    # +1: `course-launch-revenue-calculator` graduated (browser-local online course launch net profit, break-even list size and scenario calculator).
    # +1: `postgres-explain-analyzer` graduated (browser + CLI PostgreSQL EXPLAIN ANALYZE plan analyzer).
    # +1: `lambda-memory-rightsizer` graduated (browser + CLI Lambda memory right-sizer from CloudWatch REPORT lines).
    # +1: `dynamodb-capacity-mode-advisor` graduated (browser + CLI DynamoDB on-demand vs provisioned cost advisor from CloudWatch consumed capacity).
    # +1: `nat-gateway-cost-advisor` graduated (browser + CLI NAT gateway vs VPC endpoint cost advisor from GB per destination).
    # +1: `s3-storage-class-advisor` graduated (browser + CLI S3 storage-class cost advisor from per-bucket Storage Lens numbers).
    # +1: `bigquery-query-cost-advisor` graduated (browser + CLI BigQuery on-demand vs Editions cost advisor).
    # +1: `snowflake-warehouse-cost-advisor` graduated (browser + CLI Snowflake warehouse cost advisor).
    # +1: `databricks-cluster-cost-advisor` graduated (browser + CLI Databricks cluster cost advisor).
    # +1: `k8s-requests-rightsizer` graduated (browser + CLI Kubernetes requests right-sizer from kubectl top / pods JSON / CSV).
    # +1: `lambda-vs-fargate-cost-breakeven` graduated (browser + CLI Lambda / Cloud Run / Fargate / EC2 cost break-even).
    # +1: `rds-instance-rightsizer` graduated (browser + CLI RDS/Aurora instance right-sizer from CloudWatch metrics).
    # +1: `booking-request-chooser` graduated (browser + CLI booking-request chooser for rental hosts, exact DP over gap nights).
    # +1: `free-shipping-threshold-optimizer` graduated (browser + CLI free-shipping minimum sweep from an orders export).
    # +1: `returns-policy-cost-analyzer` graduated (browser + CLI returns-cost and return-fee analyzer).
    # +1: `card-grading-submission-picker` graduated (browser + CLI which-cards-to-grade picker with exact break-even and budgeted subset).
    # +1: `appraisal-assignment-picker` graduated (browser + CLI which-assignments-to-accept picker with exact deadline-capacity search and break-even fee).
    # +1: `saas-renewal-planner` graduated (browser + CLI SaaS renewal notice-deadline and negotiation planner).
    # +1: `thrift-haul-buy-picker` graduated (browser + CLI thrift/estate-sale buy picker with walk-away price and exact best set under cash or hours caps).
    # +1: `bookkeeping-client-fee-calculator` graduated (browser + CLI bookkeeping retainer, cleanup and walk-away fee calculator with a client roster ranked by effective hourly).
    # +1: `owner-operator-load-chain-planner` graduated (browser + CLI best chain of paid loads with exact walk-away rate per load).
    # +1: `translation-job-picker` graduated (browser + CLI which-translation-jobs-to-accept picker).
    # +1: `tax-season-client-picker` graduated (browser + CLI late-season tax client picker).
    # +1: `interior-design-fee-calculator` graduated (browser + CLI interior design fee-model comparator with overrun scenarios and a past-project audit by fee model).
    # +1: `snow-plow-contract-calculator` graduated (browser + CLI snow plow contract-model comparator across low/normal/high snow years with a past-season audit).
    # +1: `pool-service-route-calculator` graduated (browser + CLI pool route audit: per-account true hourly, reprice/drop, route density and CSV export).
    # +1: `nail-tech-booth-rent-calculator` graduated (browser + CLI booth rent vs commission vs employee take-home per hour worked, with break-even clients and a past-week audit).
    # +1: `grant-indirect-cost-calculator` graduated (browser MTDC, indirect cost and award-cap fit calculator).
    # +1: `docker-compose-security-check` graduated (browser + CLI risky-settings scanner for docker-compose.yml).
    # +1: `dog-grooming-price-calculator` graduated (browser + CLI dog grooming price by breed class and time, with a past-appointment audit).
    # +1: `k8s-pod-security-check` graduated (browser + CLI risky pod and container security-settings scanner for Kubernetes manifests).
    # +1: `terraform-plan-cost-estimate` graduated (browser + CLI monthly AWS cost delta estimate for a Terraform plan, from an approximate bundled price table).
    # +1: `aws-bill-change-explainer` graduated (browser + CLI explainer for an AWS Cost Explorer CSV: ranked movers, partial-month normalisation, cause checklist, CI gate).
    # +1: `lockfile-license-check` graduated (browser + CLI licence audit of an npm package-lock.json).
    # +1: `firewood-profit-calculator` graduated (browser firewood profit per cord and hour, price needed for a wage, delivery distance).
    # +1: `feie-physical-presence-calculator` graduated (browser Form 2555 physical presence 330-day counter).
    # +1: `ci-test-shard-balancer` graduated (browser + CLI balanced CI test sharding from JUnit XML timings, with shard-count sweep and Actions matrix).
    # +1: `webhook-signature-debugger` graduated (browser + CLI webhook HMAC signature verification and mismatch diagnosis).
    # +1: `hvac-repair-tier-price-calculator` graduated (browser HVAC Good/Better/Best repair pricing, diagnostic fee and average-call model).
    # +1: `training-gpu-pricing-calculator` graduated (browser + CLI GPU cloud pricing with idle time and rent-versus-buy breakeven).
    # +1: `era-835-underpayment-finder` graduated (browser 835 remittance parser: payments below contract rates, denials, takebacks).
    # +1: `nacha-file-validator` graduated (browser ACH/NACHA file validator: record layout, check digits, control totals, control-record rebuild).
    # +1: `cobra-vs-marketplace-calculator` graduated (browser + CLI COBRA vs marketplace total cost, break-even and election deadlines).
    # +1: `sepa-pain001-validator` graduated (browser SEPA pain.001/pain.008 XML validator: control sums, IBAN, dates, character set, totals repair).
    # +1: `eu-vat-oss-calculator` graduated (browser EU VAT OSS calculator: EUR 10,000 threshold date and the quarterly return per country and rate from a sales CSV).
    # +1: `form-5500-late-filing-calculator` graduated (browser Form 5500 due date, days late, DFVC cost against IRS and DOL penalty exposure).
    # +1: `irs-iris-1099-csv-check` graduated (browser IRS IRIS 1099-NEC/MISC bulk CSV checker: TIN formats, thresholds, duplicates, totals, safe fixes).
    # +1: `edi-x12-order-checker` graduated (browser X12 EDI 850/810/856/997 checker: envelope counts, UPC/SSCC check digits, invoice totals, 997 translation).
    # +1: `xero-invoice-csv-check` graduated (browser Xero sales invoice CSV checker: per-invoice agreement, date order, Excel damage, safe fixes, 500-line splitter).
    # +1: `quickbooks-chart-of-accounts-csv-check` graduated (browser QuickBooks Online chart of accounts import checker: account types, detail types, duplicates, sub-account order, balances and dates).
    # +1: `xero-contacts-csv-check` graduated (browser Xero contacts import checker: duplicate names, emails, Excel damage, payment terms, safe fixes, splitter).
    # +1: `hubspot-contacts-csv-check` graduated (browser HubSpot contacts/companies import checker: duplicate and invalid emails, Excel damage, date formats, lifecycle stage and lead status values, formatting-only safe fixes).
    # +1: `pipedrive-import-csv-check` graduated (browser Pipedrive deals/people/organizations import checker: deal status, value and currency, probability, duplicate deals and emails, Excel damage, date formats, safe fixes).
    # +1: `zoho-crm-import-csv-check` graduated (browser Zoho CRM leads/contacts/accounts/deals import checker: required fields, Stage and Lead Status picklists, amount and currency, probability, duplicates, Excel damage, date formats, safe fixes).
    # +1: `klaviyo-profile-csv-check` graduated (browser Klaviyo profile import checker: identifiers, E.164 phones, Excel damage, near-miss headers, lat/long/timezone, mixed dates, safe fixes).
    # +1: `mailchimp-audience-csv-check` graduated (browser Mailchimp audience import checker: no-email rows, duplicate emails, unquoted Tags commas, birthday format, Excel phone damage, mixed dates, safe fixes).
    # +1: `shopify-inventory-csv-check` graduated (browser Shopify inventory import checker: On hand (new) column, text/fraction/thousands-comma quantities, tenfold jumps, duplicate variant+location rows, handles, location spelling, Excel SKU damage, safe fixes).
    # +1: `payroll-hours-csv-check` graduated (browser payroll hours / timesheet CSV checker: decimal vs h:mm, Excel date serials, duplicate person-days, hours over 24, Start/End arithmetic, safe fixes).
    # +1: `shopify-customer-csv-check` graduated (browser Shopify customer import checker: emails, E.164 phones, Excel zip and phone damage, country and province codes, consent values, tags, safe fixes).
    # +1: `teachers-pay-teachers-earnings-analyzer` graduated (browser TPT sales CSV analyzer: observed fee incl. flat per-sale fee, per-resource take-home, repeat buyers, break-even price).
    # +1: `google-ads-editor-csv-check` graduated (browser Google Ads Editor import checker: headline/description limits, RSA counts, keyword symbols and match types, URLs, budgets, safe fixes).
    # +1: `meta-catalog-csv-check` graduated (browser Meta catalog feed checker: required fields, ids, price and sale price, availability, links, images, GTIN check digits, item groups, Excel damage, safe fixes).
    # +1: `youtube-chapters-check` graduated (browser YouTube chapter-list checker: 0:00 start, three-chapter and 10-second rules, ordering and format fixes, marker-export conversion to chapters.json, FFmetadata, WebVTT).
    # +1: `quickbooks-iif-file-check` graduated (browser QuickBooks Desktop IIF checker: ENDTRNS, TRNS/SPL balance, stray tabs, dates, Excel quotes, safe fixes).
    # +1: `mt940-statement-check` graduated (browser SWIFT MT940 statement checker: balance arithmetic, statement continuity, :61: layout, comma decimals, repeats, closing -, CSV conversion).
    # +1: `bank-statement-pdf-to-csv` graduated (browser bank/credit card statement PDF to CSV with a balance proof: opening + rows = closing, running-balance sign check, Xero/QuickBooks layouts).
    # +1: `coi-expiry-gap-checker` graduated (browser subcontractor certificate-of-insurance list checker: expiry and lead time, limits with umbrella make-up, endorsements, renewal gaps, chase list and .ics).
    # +1: `pickleball-facility-pro-forma` graduated (browser indoor pickleball/padel facility pro-forma: steady-state P&L, break-even utilization and members, 24-month ramp cash curve, sensitivities, profit-lever ranking).
    # +1: `lemonsqueezy-payout-to-journal` graduated (browser Lemon Squeezy order/payout export to month-split Xero/QuickBooks journals).
    # +1: `ko-fi-payout-to-journal` graduated (browser Ko-fi transactions export to month-split Xero/QuickBooks journals, income by transaction type, derived fee).
    # +1: `buymeacoffee-payout-to-journal` graduated (browser Buy Me a Coffee export to month-split Xero/QuickBooks journals).
    # +1: `teachable-payout-to-journal` graduated (browser Teachable transactions export to month-split Xero/QuickBooks journals).
    # +1: `fiverr-earnings-to-journal` graduated (browser Fiverr earnings history to month-split Xero/QuickBooks journals, gross revenue and 20% fee split, with a running-balance completeness check).
    # +1: `kdp-royalty-to-journal` graduated (browser Amazon KDP royalty report to month-split Xero/QuickBooks journals, gross by marketplace and format, printing cost and tax withheld as expenses, per-currency, with row and report total checks).
    # +1: `distrokid-royalty-to-journal` graduated (browser DistroKid earnings report to month-split Xero/QuickBooks journals, by store and kind, songwriter royalties withheld as a deduction, per-currency, with row and report total checks).
    # +1: `upwork-earnings-to-journal` graduated (browser Upwork transaction history to month-split Xero/QuickBooks journals with a running-balance completeness check).
    # +1: `youtube-adsense-payout-to-journal` graduated (browser AdSense payments export to month-split Xero/QuickBooks journals with US withholding receivable and realised FX).
    # +1: `revolut-business-statement-to-journal` graduated (browser Revolut Business currency statement to month-split Xero/QuickBooks journals with realised FX).
    # +1: `syndication-waterfall-calculator` graduated (browser-local GP/LP waterfall with preferred return and promote tiers).
    # +1: `donor-acknowledgment-letter-generator` graduated (browser gift list to per-donor IRS acknowledgment letters, per-gift $250 rule and $75 quid pro quo statement).
    # +1: `exemption-certificate-audit-check` graduated (browser exempt sales matched to certificates on file, tax at stake by customer and state).
    # +1: `rent-increase-notice-checker` graduated (browser rent roll to per-unit cap, notice period and earliest effective date).
    # +1: `supplier-price-creep-checker` graduated (browser supplier invoice lines to per-item creep, one-off spikes, contract overcharges and credit requests).
    # +1: `restaurant-tip-pool-calculator` graduated (browser shift list to tip pool payouts by hours, points or tip-out).
    # +1: `greenhouse-bench-planner` graduated (browser crop list to sow dates, weekly bench and germination space, what does not fit and what extra space is worth).
    # +1: `mushroom-fruiting-room-planner` graduated (browser flush, slot and cash planner for small mushroom farms).
    # +1: `lien-waiver-checker` graduated (browser pasted lien waiver to red flags and the change to ask for).
    # +1: `cash-flow-risk-forecaster` graduated (browser invoices and bills to the odds of a cash shortfall, cushion and biggest lever).
    # +1: `wholesale-line-sheet-maker` graduated (browser product list to wholesale prices, retailer and own margin, tiers, minimums, order simulator and a printable line sheet).
    # +1: `str-turnover-scheduler` graduated (browser iCal feeds to turnover cleaning schedule, same-day window checks, double bookings and minimum crew).
    # +1: `mobile-detailing-day-planner` graduated (browser pending detailing jobs to the most profitable set for the day, take-home per hour and the price each job needs).
    # +1: `craft-brewery-batch-margin-calculator` graduated (browser beers and sales channels to batch profit per barrel by channel, break-even prices and profit per fermenter day).
    # +1: `midterm-rental-calculator` graduated (furnished 30-day-plus rental against a long-term lease and nightly renting, with rate, vacancy and furnishing payback crossing points).
    # +1: `maple-syrup-sugarbush-profit-calculator` graduated (browser taps, sap and costs to maple profit per tap and per hour, poor and good seasons and a reverse osmosis payback).
    # +1: `u-pick-farm-profit-planner` graduated (browser season days, visitors, admission, picking and extras to break-even attendance and admission and a rainy-season check).
    # +1: `sheep-goat-flock-profit-planner` graduated (browser ewes or does, weaning rate, prices and hay to a multi-year flock projection, break-even flock and weaning rate).
    # +1: `waterfront-rental-season-planner` graduated (browser kayak and boat fleets, demand, weather days and costs to season profit, weather break-even, turn-aways and one-more-boat payback).
    # +1: `property-management-profit-calculator` graduated (browser doors, fee, staffing and owner inputs to monthly profit, break-even doors, the next-hire cliff and a fee search).
    # +1: `mobile-welding-job-price-calculator` graduated (browser mobile welding hours, drive, rig, materials and margin to a job price, distance table, overrun check and break-even jobs).
    # +1: `sauna-cold-plunge-install-bid-calculator` graduated (browser sauna and cold plunge install hours, crew, equipment, electrician and drive to a bid price, distance table, overrun check and break-even installs).
    # +1: `good-faith-estimate-generator` graduated (browser service lines, codes and charges to a printable Good Faith Estimate, delivery deadline, per-biller totals, a $400 dispute check and a past-estimate drift review).
    # +1: `collision-shop-drp-profit-calculator` graduated (browser collision shop retail and insurer-program terms, repriced and promised jobs to profit with and without the program, break-even orders and a lowest labor rate).
    # +1: `volunteer-shift-scheduler` graduated (browser volunteers with availability, max shifts and excluded roles, plus shifts with headcounts, to a fair roster, unfilled-place report, per-volunteer calendars and reminder messages).
    # +1: `appointment-no-show-cost-calculator` graduated (browser practice schedule, no-show and late-cancel rates, refills, fee and reminders to yearly cost, best overbooking level and break-even fee and reminder price).
    # +1: `franchise-unit-economics-calculator` graduated (browser franchise fee, build-out, loan, sales ramp, costs and royalties to payback, IRR, break-even sales, a cash-cushion check and the sales lift the brand must deliver against going independent).
    # +1: `home-inspection-report-builder` graduated (browser home inspection findings, severity, notes and cost ranges to a printable report, with a generic editable comment library).
    # +1: `pte-tax-election-calculator` graduated (browser state pass-through entity tax election vs none: federal plus state tax, SALT cap phase-out, lost 20% deduction, income where it first pays).
    # +1: `container-demurrage-detention-calculator` graduated (browser ocean-container dates, free days and tiered per-day rates to demurrage and detention per box, last free days, one more day's cost and the value of an earlier pickup).
    # +1: `bonus-take-home-gross-up-calculator` graduated (browser bonus take-home after supplemental withholding, FICA caps and state tax, refund or balance due, 401(k) deferral comparison, exact employer gross-up).
    # +1: `farmland-lease-cash-rent-vs-crop-share-calculator` graduated (browser cash rent vs crop share vs flex farmland lease comparison with break-even yield and risk grid).
    # +1: `tip-fica-credit-calculator` graduated (browser employer FICA tip credit per employee from cash wage, hours and tips, with after-tax value and prior-year look-back).
    # +1: `contract-vs-fte-rate-calculator` graduated (browser W-2 offer to the hourly 1099 rate leaving the same cash, with a step-by-step gap table).
    # +1: `covered-call-wheel-calculator` graduated (browser covered call and cash-secured put quotes ranked by annualized yield, assignment chance and breakeven).
    # +1: `medical-billing-pricing-calculator` graduated (browser billing-company pricing: percent of collections vs per-claim vs flat against cost to serve).
    # +1: `scrap-gold-buy-price-calculator` graduated (browser scrap gold karat and weight lot, refiner terms and gold price to break-even and target-margin offer, offer ladder and price-drop risk).
    # +1: `pawn-loan-profit-calculator` graduated (pawn loan book profit: redemption rate, loan-to-value, forfeit resale, largest loan and smallest ticket that pay).
    # +1: `card-bonus-planner` graduated (browser credit card sign-up bonus tracker with 5/24 and issuer velocity status, net bonus value and a spend-feasible application schedule).
    # +1: `water-well-drilling-bid-calculator` graduated (browser well depth by formation, casing, pump system, trench, rig hours and dry-hole chance to a bid, break-even, price per foot and the cost of a dry hole).
    # +1: `adjunct-course-offer-calculator` graduated (browser adjunct and part-time course offers to real hourly pay after prep, grading, unpaid hours, commute and cancellation risk, ranked side by side).
    # +1: `lash-studio-service-profit-calculator` graduated (browser lash service take-home per chair hour after supplies, card fees, no-shows and studio rent, ranked side by side).
    # +1: `self-storage-unit-mix-optimizer` graduated (browser exact unit-size mix for a self-storage building, bounded knapsack under demand limits).
    # +1: `wedding-venue-date-pricing-optimizer` graduated (browser exact price per date type for a wedding venue).
    # +1: `farm-crop-mix-optimizer` graduated (browser exact crop-acreage plan, linear program under land, labor and capital limits).
    # +1: `ev-charging-site-roi-calculator` graduated (browser EV charging site payback, NPV, IRR and break-even utilization with demand charges).
    # +1: `tutor-weekly-schedule-optimizer` graduated (browser exact weekly timetable for one-to-one teachers from each student's available times, gaps, day costs and must-keep students).
    # +1: `surety-bond-capacity-calculator` graduated (browser surety bond premium priced into the bid, bonding capacity from working capital, and the bids to submit).
    # +1: `optical-dispensary-margin-calculator` graduated (browser eyeglass sale margin after frame, lenses, remakes, plan and card fees and optician time).
    # +1: `therapy-8-minute-rule-calculator` graduated (browser Medicare 8-minute rule billable units from timed therapy minutes, assigned to CPT codes, with a per-code comparison and revenue).
    # +1: `bid-leveling-worksheet` graduated (browser subcontractor bid table leveled to one scope: excluded and unaddressed items priced at the buyer's estimate, a ranking, and whether the low bid survives).
    # +1: `fixed-bid-overrun-forecaster` graduated (browser fixed-price project price, cost budget, percent complete and cost to date to earned value, CPI/SPI, three finish forecasts, projected margin and the point the job stops paying).
    # +1: `timber-sale-offer-checker` graduated (browser timber-offer checker: logs scaled under Doyle, Scribner and International rules, valued at the owner's own prices, compared with a logger's offer).
    # +1: `pollination-contract-checker` graduated (browser pollination-contract checker: net per hive and break-even fee for beekeepers, cost per acre for growers).
    # +1: `oyster-farm-growout-planner` graduated (browser oyster-crop planner: seed, survival, gear, lease and grade prices to net per crop, break-even price and survival, and cash before first sale).
    # +1: `form-2290-hvut-calculator` graduated (browser Form 2290 heavy vehicle use tax per truck: weight category, proration, suspension and due date).
    # +1: `eu-pay-gap-report-calculator` graduated (browser EU Pay Transparency Directive indicators: mean and median pay gap, variable pay, quartiles and 5% category flags from a pasted payroll table).
    # +1: `laser-cutting-engraving-job-price-calculator` graduated (browser laser cut and engrave job price: nesting, laser time, labour and setup to a price per piece, quantity breaks and a target-price check).
    # +1: `fair-workweek-schedule-checker` graduated (browser predictive scheduling check: late postings, short-notice add, move and cancel premium pay, and rest-period violations from a pasted schedule and change log).
    # +1: `json-ld-rich-result-validator` graduated (browser JSON-LD validator and builder).
    # +1: `amusement-route-location-calculator` graduated (browser coin-op route location check: take, commission, visits and miles to profit per route hour, the weekly take needed and the highest commission worth paying).
    # +1: `courier-van-route-profit-calculator` graduated (browser delivery van route check: route pay, stops, miles and van costs to true profit per route, per hour and per stop, break-even stops, the lowest route pay for a target hourly and a two-offer comparison).
    # +1: `pilot-car-escort-run-profit-calculator` graduated (browser pilot car and oversize-load escort run check: per-mile or day quote, minimum charge, deadhead, hours, hotel and yearly overhead to true profit per run and per driver hour, the lowest quote for a target margin, break-even runs and a two-run comparison).
    # +1: `climbing-gym-profit-calculator` graduated (browser climbing and bouldering gym day passes, members, youth programs, parties, staff, route setting and rent to monthly profit, build payback, break-even members and the lowest day pass and membership fee for a target margin).
    # +1: `percentage-rent-audit-checker` graduated (browser percentage-rent statement check for retail and restaurant tenants: natural or stated breakpoint, landlord versus own sales, lease exclusions, cap and estimates paid to the overcharge, line by line, with a review note).
    # +1: `release-notes-generator` graduated (browser and zero-dependency CLI that turn git log into grouped release notes with a suggested semver bump).
    # +1: `3pl-invoice-audit-checker` graduated (browser 3PL invoice audit: rate card, WMS and order-export counts and invoice lines to recoverable overcharges, proving records and a dispute note).
    # +1: `glamping-unit-payback-calculator` graduated (browser glamping worksheet: build and shared cost, seasonal rates and occupancy, loan, to payback, debt coverage and break-even occupancy).
    # +1: `mini-golf-course-profit-calculator` graduated (browser mini-golf and small fun-center pro forma).
    # +1: `rv-boat-storage-lot-calculator` graduated (browser RV and boat storage lot: acres, land, site cost, rent and occupancy to spaces, NOI, yield on cost, debt coverage, lease-up cash and equity IRR).
    # +1: `arcade-game-payback-calculator` graduated (browser arcade and family-entertainment-center worksheet: per-game plays, credits and tickets to weekly profit, payback, break-even plays and a keep, watch or cut verdict).
    # +1: `self-serve-dog-wash-profit-calculator` graduated (browser dog wash pro forma: tub capacity, traffic by weekday and season, break-even washes per day, ramp and payback).
    # +1: `convenience-store-gas-station-profit-calculator` graduated (browser c-store and gas station P&L: fuel margin after card fees, inside sales, labor, loan, break-even gallons and debt coverage).
    # +1: `nis2-scope-checker` graduated (browser EU NIS2 scope check: sector and size to essential, important or out of scope, with the Article).
    # +1: `eaa-accessibility-act-checker` graduated (browser European Accessibility Act check: product or service, role and size to in scope, microenterprise-exempt or out, with the Article).
    # +1: `indoor-play-center-profit-calculator` graduated (browser indoor play centre pro forma: visits, memberships, parties, cafe and staffing to profit, break-even visits, ramp-up reserve and payback).
    # +1: `gpsr-product-safety-checker` graduated (browser EU General Product Safety Regulation check).
    # +1: `eu-battery-regulation-checker` graduated (browser EU Batteries Regulation duty timeline).
    # +1: `padel-club-profit-calculator` graduated (browser padel club pro forma: courts, peak and off-peak utilisation, members, coaching, food and drink and staffing to profit, break-even utilisation, ramp-up reserve and payback).
    # +1: `pay-transparency-directive-checker` graduated (browser EU Pay Transparency Directive check).
    # +1: `eu-whistleblower-channel-checker` graduated (browser EU Whistleblower Directive channel check and report clocks).
    # +1: `eu-einvoicing-mandate-checker` graduated (browser EU e-invoicing mandate dates by country).
    # +1: `eu-product-liability-directive-checker` graduated (browser EU Product Liability Directive scope, liability chain and time limits).
    # +1: `dac7-seller-reporting-checker` graduated (browser EU DAC7 platform seller reporting check).
    # +1: `eu-platform-work-directive-checker` graduated (browser EU Platform Work Directive scope, employment presumption and algorithmic-management check).
    # +1: `eu-price-reduction-claim-checker` graduated (browser EU 30-day lowest price rule check for sale prices).
    # +1: `eu-dora-readiness-checker` graduated (browser EU DORA scope, duty areas, Article 30 contract terms and major-incident report clocks).
    # +1: `ugc-creator-rate-calculator` graduated (browser UGC creator rate calculator: content plus ad usage rights, whitelisting, exclusivity).
    # +1: `uk-sole-trader-vs-limited-company-calculator` graduated (browser UK sole trader vs limited company take-home, best salary and dividend split, 2026/27).
    # +1: `eu-espr-readiness-checker` graduated (browser EU ESPR unsold-apparel destruction ban, disclosure table and Digital Product Passport data checklist).
    # +1: `uk-tax-free-childcare-calculator` graduated (browser UK Tax-Free Childcare, 15/30 free hours and Universal Credit childcare comparison for England).
    # +1: `uk-savings-interest-tax-calculator` graduated (browser UK savings interest tax, starting rate, Personal Savings Allowance and cash ISA saving).
    # +1: `sg-freelancer-tax-set-aside-calculator` graduated (browser Singapore freelancer income tax after earned income relief, MediSave flag and set-aside per invoice).
    # +1: `de-freiberufler-tax-set-aside-calculator` graduated (browser Germany freelancer tax: section 32a tariff, Soli, Kirchensteuer, Gewerbesteuer and set-aside per invoice).
    # +1: `us-freelancer-tax-set-aside-calculator` graduated (browser US freelancer SE tax, federal tax with QBI, state tax and 1040-ES set-aside). #6981 and #6982 each wrote 1223 against a base without the other; re-synced after both merged.
    # +1: `cancel-flow` graduated (self-hosted Stripe cancellation flow: reason-matched save offers, browser simulator plus zero-dependency server).
    # +1: `dunning-engine` graduated (self-hosted Stripe failed-payment recovery: browser plan simulator plus zero-dependency server).
    # +1: `uk-statutory-residence-test-checker` graduated (UK Statutory Residence Test rules engine, in-browser).
    # +1: `webhook-relay` graduated (self-hosted webhook relay: verify, store, retry, replay; browser outage simulator plus zero-dependency server).
    # +1: `visit-keeper` graduated (self-hosted cookie-free web analytics: snippet, daily-rotating visitor hashes, goals credited to source; browser setup page plus zero-dependency server).
    # +1: `rev-rec` graduated (self-hosted Stripe revenue recognition: deferred revenue schedule and journal CSV, browser demo plus zero-dependency server).
    # +1: `actions-checkout-credentials-check` graduated (browser persist-credentials scan of pasted workflow YAML, ported from its CLI).
    # +1: `support-desk` graduated (self-hosted shared support inbox: email and form tickets, threading, triage, reply targets, saved-reply suggestions).
    # +1: `slot-keeper` graduated (self-hosted booking pages: weekly hours, busy time from an iCal feed, visitor time zones, invitations, reminders, reschedule links).
    # +1: `help-keeper` graduated (self-hosted help center: Markdown articles, typo-tolerant ranked search, helpful votes, content-gap report).
    # +1: `deal-keeper` graduated (self-hosted pipeline forecaster: learned stage win rates, backtested forecast band, stale/slipped deal hygiene list, signed alert webhook).
    # +1: `internal-link-planner` graduated (browser and CLI internal link audit: orphans, menu-only pages, suggested links with the PageRank effect).
    # +1: `trade-bid-studio` graduated (browser trade-agnostic bid engine: price at a target margin, walk-away price, competitor-quote check, markup/margin converter, directory of the 121 bid calculators).
    # +1: `devsec-toolkit` graduated (one zero-dependency command running 22 devsec checks, SARIF/JSON/Markdown, baselines, local report viewer page).
    # +1: `s-corp-basis-tracker` graduated (browser S corporation stock and debt basis roll-forward in Form 7203 order, suspended losses and excess distributions).
    # +1: `uk-crypto-cgt-calculator` graduated (browser + CLI UK crypto capital gains: HMRC same-day, 30-day and Section 104 pool matching, per-tax-year estimate, working CSV).
    # +1: `open-house-plans` graduated (browser, CLI and agent house plan generator: a brief or a sentence to a CC0 plan set of SVG drawings, DXF, IFC4, OBJ, schedules and an NAHB-anchored cost).
    # +1: `ca-crypto-acb-calculator` graduated (browser + CLI Canadian crypto ACB: CRA average cost per coin, superficial loss rule, taxable gain per year, working CSV).
    total = 1322  # `infra/OWNER_CHECKLIST.md`'s own "N of the 1322 tools" wording.
    # +1: `shed-designer` graduated (browser gable shed designer: click-and-drag plan, true-size framing with structural screening checks, plan sheets as SVG/DXF, WebGL 3D view, a cutting-stock cut sheet and a shopping list with cited prices).
    # +1: `sales-agent` graduated (browser, CLI and MCP AI sales inbox agent: reply triage, automatic stop/pause/suppress with a consent record, drafts queued for approval, never sends; flagship for the owner's 2026-10-21 AI sales agents direction).
    # +1: `agent-workroom` graduated (browser 3D room for AI agents' tasks: a desk per agent, a task wall, typed or spoken commands, progress from GitHub pull requests).
    # +1: `interview-content-studio` graduated (browser and CLI: interviews about a brand or topic become a per-platform plan, a 4-week calendar and drafts for 14 platforms, optional own-key AI with a no-invented-numbers check).
    # +1: `open-tennis-robots` graduated (open-source tennis ball machine with a moving catch net and a ball-collecting rover: shot planner, catch simulation, route planner, ESP32 firmware, seller listing tool, collector manufacturing package).
    # +1: `sales-call-notes-desk` graduated (browser sales call notes reader: CRM fields, BANT/MEDDIC gaps, dated next steps, a follow-up email checked against the notes, optional own-key AI).
    # +1: `sales-cadence-builder` graduated (browser and CLI multi-channel prospecting cadence: email, call with voicemail, LinkedIn note and letter on business days, calls in the prospect's local 9-5, suppression and CASL/EU consent gating, CSV and .ics export, optional own-key AI).
    # +1: `publish-kit` graduated (podcast RSS feed generator, Markdown to EPUB, ACX audiobook checks, KDP spine/cover size; browser page plus an agent-drivable CLI).
    # +1: `actions-schedule-check` graduated (browser + CLI lint of GitHub Actions schedule crons: invalid, faster than 5 minutes, minute 0).
    # +1: `liability-audit` graduated (zero-dependency repository scanner for legal and financial exposure: consent, auto-renewal, disclosures, leaked keys, open LLM endpoints, cloud budgets; CLI, SARIF, monorepo sweep, browser page, agent playbook).
    # +1: `llm-spend-guard` graduated (self-hosted proxy and zero-dependency library: hard per-user/feature/run LLM budgets with worst-case holds, loop breakers, browser log-replay simulator).
    # +1: `yoga-pilates-studio-class-profit-calculator` graduated (browser yoga, pilates and barre studio classes, reservations, drop-in, pack and membership mix, late cancels and teacher pay to profit per class and per room hour, with a teach, hire or rent-a-room comparison).
    # +1: `home-inspection-business-profit-calculator` graduated (browser home inspector fees, add-ons, hours, mileage, fall-through and fixed cost to profit per inspection and per hour, fee for a target margin, break-even and a solo versus associate comparison).
    # +1: `ball-python-morph-pairing-planner` graduated (browser ball python females, males, morphs and prices to Mendelian odds for every pairing, clutch profit and a ranking).
    # +1: `ag-spray-drone-quote-calculator` graduated (browser spray-drone fields, tank, battery and cost inputs to real time per field, cost per acre, recommended quote and break-even).
    # +1: `stump-grinding-price-calculator` graduated (browser stump diameters, wood hardness, grinder speed, crew and drive time to a price, per-stump prices and a per-inch quote check).
    # +1: `freelance-dashboard` graduated (browser hub reading the four freelancer tools' saved data: owed, unbilled, pipeline, profit and a ranked do-this-next list).
    # +1: `horse-boarding-stall-profit-calculator` graduated (browser barn stalls, occupancy and costs to monthly profit, break-even occupancy and board price).
    # +1: `pet-waste-removal-route-calculator` graduated (browser pet waste route clients, price and drive time to monthly profit, hourly pay and break-even clients).
    # +1: `tow-truck-rate-calculator` graduated (browser tow job price: hook-up, loaded rate, deadhead, surcharges, storage).
    # +1: `dog-grooming-day-planner` graduated (browser + CLI groom quote by table hour and best-dogs-for-a-day planner).
    # +1: `insurance-denial-appeal-builder` graduated (browser denial-letter reader, appeal deadline, letter and reminder calendar).
    # +1: `ticket-resale-profit-calculator` graduated (browser + CLI ticket resale payout, break-even and sales-log audit).
    # +1: `catering-quote-calculator` graduated (browser + CLI per-guest catering quote, tier table and break-even guest count).
    # +1: `breakeven-roas-calculator` graduated (browser-local break-even ROAS, max CPA and LTV-adjusted ad economics calculator).
    # +1: `market-event-picker` graduated (browser + CLI market/festival picker for vendors, exact search over overlapping events).
    # +1: `lot-split-calculator` graduated (browser + CLI sell-the-lot-whole-or-split-it decision for resellers).
    # +1: `trade-show-roi-calculator` graduated (browser + CLI trade show ROI, break-even leads and budget-constrained show picker).
    # +1: `csa-share-pricing-calculator` graduated (browser + CLI CSA share price, wage price, break-even shares and price sweep).
    # +1: `support-staffing-planner` graduated (browser + CLI Erlang C agents per interval and exact cheapest shift cover).
    # +1: `embroidery-shop-quote-calculator` graduated (browser + CLI embroidery job quote, quantity breaks and per-1000-stitches rule check).
    # +1: `worker-classification-checker` graduated (browser-local 1099-vs-W-2 screen: IRS, DOL and ABC tests, facts to fix, back-tax and overtime exposure range).
    # +1: `ad-slot-sell-through-planner` graduated (browser-local newsletter/podcast ad-slot sell-through, price-response and booking-pace planner).
    # +1: `ca-meal-rest-break-premium-checker` graduated (browser California meal and rest break premium audit: late, short and missed meals, rest shortfalls, waivers and the Labor Code 226.7 premium per workday from pasted timecards).
    # +1: `prop-firm-challenge-calculator` graduated (browser Monte Carlo of a funded-trader challenge: pass probability, expected fees to pass, funded payouts, break-even win rate).
    # +1: `youtube-sponsorship-rate-calculator` reached the mirror (its page landed after #7000 set 1232; counted by sync_tree_counts.py at the merge).
    # +1: `self-hosted-saas-stack` graduated (browser directory of the 27 self-hosted small-SaaS tools, grouped by job and named against the paid products they replace).
    # +1: `trial-converter` graduated (self-hosted Stripe trial-to-paid conversion: card and no-card plans, browser simulator plus zero-dependency server).
    # +1: `survey-keeper` reached the mirror (it landed on main without its count bump; counted by sync_tree_counts.py while merging main into #7632).
    # +1: a venture landed on main without its count bump (counted by sync_tree_counts.py while merging main into #7987).
    # +1: `review-reply-desk` graduated (browser local-business review reply writer: rating-aware replies, risky-review triage, health-privacy-safe mode, reply checker, optional own-key AI).
    # +1: `bid-price-engine` graduated (one job-pricing engine for 120+ trades; the consolidated bid calculator).
    # +1: `us-substantial-presence-test-calculator` graduated (browser IRS substantial presence test: 183-day weighted count, days left this year, crossing date, planned-trip what-if).
    # +1: `discogs-fee-calculator` graduated (browser Discogs seller fee calculator: 9% on item plus shipping with the $0.10/$150 limits, editable processing, target-profit price, fee ladder).
    # +1: `tutoring-group-schedule-optimizer` graduated (browser exact timetable for weekly small-group sessions: min-cost-flow seating inside a search over which slots to run).
    # +1: `hearth-and-horizon` graduated (free CC BY-SA AI-written stories: sci-fi, stories for AI agents, Catholic saints bedtime stories; pages, podcast RSS feeds and Piper audio).
    # +1: `ai-bookkeeper` graduated (browser + CLI double-entry books from bank CSVs that learn payees, pair transfers, reconcile and export QuickBooks/Xero journals; optional own-key or local-model AI).
    # +1: `wall-framing-takeoff` graduated (browser + CLI wall framing takeoff: stud layout, cut list and a cutting-stock lumber order with an LP bound).
    # +1: `support-agent` graduated (self-hosted AI support agent: answers from your help articles with citations, hands off by rule or calibrated confidence; measured on BANKING77).
    # +1: `dupehound` graduated (Rust copy-paste detector: one engine as a CLI and a WebAssembly browser page; benchmarked against jscpd).

    checklist = (REPO / "infra" / "OWNER_CHECKLIST.md").read_text()

    mirrors_of = re.findall(r"mirrors (\d+) of the (\d+) tools directly", checklist)
    assert mirrors_of, "OWNER_CHECKLIST.md's 'mirrors N of the M tools' sentence not found or reworded"
    for mirrored, whole in mirrors_of:
        assert int(mirrored) == actual, (
            f"OWNER_CHECKLIST.md claims {mirrored} mirrored tools, actual is {actual}"
        )
        assert int(whole) == total, (
            f"OWNER_CHECKLIST.md claims {whole} total tools, expected {total}"
        )

    static_mirror_of = re.findall(r"static mirror of (\d+) tools at", checklist)
    assert static_mirror_of, "OWNER_CHECKLIST.md's 'static mirror of N tools' sentence not found or reworded"
    for value in static_mirror_of:
        assert int(value) == actual, (
            f"OWNER_CHECKLIST.md claims a mirror of {value} tools, actual is {actual}"
        )

    # Reworded 2026-09-02. This used to pin "working funnel for the other N",
    # and the arithmetic it checks was always the point — but the sentence
    # carrying it also claimed the seal was what turned the front door into a
    # working funnel at all, which CLAUDE.md corrects at length: the apex
    # already serves the tools and its cards already work. Pinning a count
    # inside a sentence that is wrong about what the count means keeps the
    # number honest and the claim stale, so the wording moved and this pattern
    # moved with it. The check itself is unchanged.
    #
    # `tools?` rather than `tools` since 2026-09-03. The remainder reached 1
    # when the mirror learned `site/index.html` entry points, and the only
    # grammatical English for that is "the remaining 1 tool" — which the plural
    # pattern could not match, so this assertion failed on the sentence being
    # *correct*. A checker that forces prose to be ungrammatical to pass is
    # checking the wrong thing; the count is what matters and it is still
    # pinned exactly.
    #
    # The remainder reached 0 on 2026-09-03, when the mirror learned
    # `ENTRY_OVERRIDES` and picked up `ai-engineering-academy`. There is no
    # grammatical sentence of this shape for zero — "publishes the remaining 0
    # tools" is not English, and the paragraph now says the seal buys the
    # canonical hostname and search rather than any tool's reachability, which
    # is the true claim. So at parity the requirement inverts: the sentence
    # must be *absent*, and any surviving "remaining N" claim is a stale
    # number to catch. Below parity it is required and pinned exactly, as
    # before. Both branches assert; neither is a hole.
    other_tools = re.findall(r"publishes the remaining\s+(\d+)\s+tools?", checklist)
    if total == actual:
        assert not other_tools, (
            "the mirror serves every tool, but OWNER_CHECKLIST.md still claims "
            f"{other_tools} remain unmirrored"
        )
    else:
        assert other_tools, "OWNER_CHECKLIST.md's 'the remaining N tools' sentence not found or reworded"
        for value in other_tools:
            assert int(value) == total - actual, (
                f"OWNER_CHECKLIST.md claims {value} tools remain unmirrored, "
                f"actual is {total - actual}"
            )

    aggregate = (REPO / "gitops" / "prod" / "usage" / "aggregate.py").read_text()
    aggregate_match = re.search(r"mirrors (\d+) complete ventures", aggregate)
    assert aggregate_match, "aggregate.py's 'mirrors N complete ventures' comment not found or reworded"
    assert int(aggregate_match.group(1)) == actual, (
        f"aggregate.py's comment claims {aggregate_match.group(1)} mirrored ventures, "
        f"actual is {actual}"
    )

    # `default.conf`'s own comments restate the count twice more, in prose
    # explaining why the mirrored pages carry no `X-Robots-Tag`. Neither is
    # read by nginx or by kustomize -- both are free text -- but that is
    # exactly why they drift silently: nothing about serving the site fails
    # when they go stale. They did, the same day the mirror grew from 168 to
    # 169 (`ai-engineering-academy`'s ENTRY_OVERRIDES fix): the commit that
    # bumped OWNER_CHECKLIST.md and aggregate.py's comment above left these
    # two unchanged. Pinning them here closes the same gap this test already
    # closes for the other two files.
    conf = (REPO / "gitops" / "prod" / "front-door" / "default.conf").read_text()
    conf_matches = re.findall(r"filter (\d+) tools by category", conf)
    conf_matches += re.findall(r"served all (\d+) tools", conf)
    assert len(conf_matches) == 2, (
        "default.conf's two 'N tools' comments not found or reworded "
        f"(found {len(conf_matches)})"
    )
    for value in conf_matches:
        assert int(value) == actual, (
            f"default.conf's comment claims {value} mirrored tools, actual is {actual}"
        )

    # A fifth count, found stale on 2026-09-07: `OWNER_CHECKLIST.md` restates
    # the total a second time, in the "not a tool-count difference at all"
    # paragraph explaining what sealing `portfolio-site-repo` buys once the
    # mirror already carries everything. It said "175" for days while the
    # "mirrors N of the N tools directly" sentence 40 lines above it (checked
    # above) already said 198 -- two counts in the same document disagreeing,
    # because this sentence was never one of the four this test pinned. Same
    # failure mode as the rest of this test, caught the same way.
    apex_serves_matches = re.findall(r"the apex serves all (\d+)", checklist)
    assert apex_serves_matches, (
        "OWNER_CHECKLIST.md's 'the apex serves all N' sentence not found or reworded"
    )
    for value in apex_serves_matches:
        assert int(value) == actual, (
            f"OWNER_CHECKLIST.md's 'apex serves all' claims {value} tools, actual is {actual}"
        )


def test_portfolio_front_configmaps_keep_their_content_hash() -> None:
    # A Deployment mounts these, so the generated name has to change with the
    # content or a regenerated page never reaches a running pod. The usage
    # script is the deliberate exception: a CronJob names it directly.
    by_name = {}
    for kustomization in _front_door_kustomizations():
        parsed = yaml.safe_load(kustomization.read_text())
        # A nested kustomization can set the option globally rather than per
        # entry, so fold `generatorOptions` down onto each generator before
        # asking the question. `portfolio-front-tools` is generated that way and
        # is mounted by the same Deployment, so it is bound by the same rule.
        shared = parsed.get("generatorOptions", {})
        for entry in parsed.get("configMapGenerator", []):
            merged = dict(entry)
            merged["options"] = {**shared, **entry.get("options", {})}
            by_name[entry["name"]] = merged
    for name in ("portfolio-front-html", "portfolio-front-html-index", "portfolio-front-nginx", *_mirror_shard_names()):
        options = by_name[name].get("options", {})
        assert not options.get("disableNameSuffixHash"), (
            f"{name} is mounted by a Deployment; without the hash a content "
            "change would not roll the pods"
        )
    assert by_name["portfolio-site-usage-script"]["options"]["disableNameSuffixHash"] is True


# The API server's cap on the *total* size of one object's annotations:
# `TotalAnnotationSizeLimitB` in
# `k8s.io/apimachinery/pkg/api/validation/objectmeta.go`. Exceeding it is a
# validation error on the object, not a warning:
#
#   metadata.annotations: Too long: must have at most 262144 bytes
CLIENT_SIDE_APPLY_CEILING = 256 * 1024

# etcd's cap on one stored object. Once `ServerSideApply=true` retires the
# annotation cap above, this is the constraint that binds.
ETCD_OBJECT_CEILING = 1024 * 1024

# What a generated ConfigMap may serialise to before this suite fails it.
#
# Below the hard cap on purpose. The size measured here is the JSON of a bare
# ConfigMap, and three things are added on top of it before etcd sees the
# object: Argo's tracking label and annotation, the `metadata` a real apply
# fills in, and — specific to server-side apply, which is what the large
# ConfigMaps here use — a `managedFields` entry per key, which for a 95-key
# mirror is several KB. So the measurement is a floor and the margin is what
# covers the difference. 90% leaves ~100 KB, comfortably more than those three
# cost together.
ETCD_OBJECT_BUDGET = int(ETCD_OBJECT_CEILING * 0.90)


def _generated_configmaps() -> list[tuple[str, Path, bytes, dict[str, str]]]:
    """Every ConfigMap a kustomization in this tree generates, as applied bytes.

    Returns (name, kustomization path, serialised object, annotations) so a
    caller can ask about the size of the object that would actually be applied
    rather than about the file list that produces it. All three ceiling checks
    below want exactly that one number, so it is built here once.

    A generator input that is not valid UTF-8 goes under `binaryData` as
    base64, which is what kustomize does with it and the only faithful way to
    size it: the front door's `social-card.png` is 5,984 bytes on disk and
    7,980 in the object, and a check that measured the file would understate
    every binary key by a third. Reading it as text is what the three ceiling
    tests did until 2026-09-02, when the card was added and they stopped being
    able to read the tree at all (`UnicodeDecodeError`) rather than quietly
    under-measuring — the good direction for that bug to fail in.
    """
    found = []
    for kustomization in all_kustomizations(ROOT):
        parsed = yaml.safe_load(kustomization.read_text()) or {}
        shared = parsed.get("generatorOptions", {})
        for entry in parsed.get("configMapGenerator", []):
            options = {**shared, **entry.get("options", {})}
            data: dict[str, str] = {}
            binary_data: dict[str, str] = {}
            for spec in entry.get("files", []):
                key, _, rel = spec.partition("=")
                raw = (kustomization.parent / (rel or key)).read_bytes()
                try:
                    data[key] = raw.decode()
                except UnicodeDecodeError:
                    binary_data[key] = base64.b64encode(raw).decode("ascii")
            body: dict[str, object] = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": entry["name"], "namespace": "prod"},
                "data": data,
            }
            if binary_data:
                body["binaryData"] = binary_data
            found.append(
                (
                    entry["name"],
                    kustomization,
                    json.dumps(body).encode(),
                    options.get("annotations", {}),
                )
            )
    return found


def test_a_configmap_too_large_for_client_side_apply_asks_for_server_side() -> None:
    # The delivery-path defect this test exists for, in full:
    #
    # Argo CD applies client-side by default (v3.5.1 here, per
    # bootstrap/install-argocd.sh, and every version before it). A client-side
    # apply records the object it sent in the annotation
    # `kubectl.kubernetes.io/last-applied-configuration` — a second full copy of
    # the manifest, inside the object's own annotations, which the API server
    # caps at 262144 bytes in total.
    #
    # `portfolio-front-tools` (the apex tool mirror, #2739 and #2741) is ~600 KB
    # and grows with STARTER_SET. Every
    # size comment in this tree reasons about etcd's 1 MiB ConfigMap ceiling,
    # which it is comfortably under — and nothing reasoned about this one, which
    # binds first and which it is comfortably over. The failure is not a
    # degraded mirror but no mirror: the sync of the ConfigMap fails, the hashed
    # name `portfolio-front.yaml` mounts is never created, the new pods sit in
    # ContainerCreating, `maxUnavailable: 0` keeps the toolless front door
    # serving, and `prod` stays permanently Degraded with nothing else in the
    # namespace able to report why.
    #
    # `ServerSideApply=true` writes no such annotation, so the object is bounded
    # only by etcd's 1 MiB. Declared per resource rather than on the `prod`
    # Application so it changes the delivery of this one ConfigMap and nothing
    # else in the namespace.
    #
    # The size measured here is the JSON of a bare ConfigMap. Argo adds a
    # tracking label and annotation on top, so this is a floor: a generator that
    # passes here by a few hundred bytes is not actually safe, which is the
    # direction an estimate should err in.
    for name, kustomization, body, annotations in _generated_configmaps():
        size = len(body)
        if size <= CLIENT_SIDE_APPLY_CEILING:
            continue
        assert annotations.get("argocd.argoproj.io/sync-options") == "ServerSideApply=true", (
            f"{name} (generated by {kustomization.relative_to(ROOT)}) serialises to {size} "
            f"bytes, over the {CLIENT_SIDE_APPLY_CEILING}-byte annotation cap a client-side "
            "apply has to fit its copy of the object into. Argo CD would fail to apply it "
            "with `metadata.annotations: Too long`. Either declare "
            "`options.annotations: {argocd.argoproj.io/sync-options: ServerSideApply=true}` "
            "on the generator, or make the ConfigMap smaller."
        )


def test_the_apex_tool_mirror_is_the_case_that_ceiling_is_about() -> None:
    # The test above is a rule; this pins that the rule currently has a subject.
    # Without it, shrinking the mirror under the cap would silently retire the
    # only check on the delivery path — and the annotation left behind would
    # look like decoration to the next reader rather than the thing that made
    # #2739 deliverable at all.
    shards = _mirror_shard_names()
    mirror = {
        name: (body, annotations)
        for name, _, body, annotations in _generated_configmaps()
        if name in shards
    }
    assert sorted(mirror) == sorted(shards), f"{set(shards) - set(mirror)} did not build"
    for name in shards:
        body, annotations = mirror[name]
        # Every shard, not just the first: an annotation present on shard 0 and
        # missing on shard 3 is the same outage three shards later, and the
        # failure would look like "some tools 404" rather than like a bad apply.
        assert len(body) > CLIENT_SIDE_APPLY_CEILING, name
        assert annotations["argocd.argoproj.io/sync-options"] == "ServerSideApply=true", name
        # And still inside the ceiling that comment tree already knew about.
        assert len(body) < ETCD_OBJECT_CEILING, name


def test_generated_configmaps_stay_under_the_etcd_object_ceiling() -> None:
    # The check on the object that actually gets applied.
    #
    # `BYTE_CEILING` in `platform/marketing/front-door-tools.mjs` guards the
    # same thing one step earlier and in a different unit: it counts the bytes
    # of the mirrored *files*, which is a proxy for the size of the ConfigMap
    # they end up in. A proxy is the right tool there — it fails in the venture
    # directory seconds after a `--write`, long before anything is built — but
    # nothing measured the object itself against etcd's cap, and that is the
    # ceiling that binds now that #2746 moved these ConfigMaps to server-side
    # apply and retired the 256 KiB annotation cap as the first one hit.
    #
    # Failing here means the sync stops, not that the mirror degrades: the
    # hashed ConfigMap name `portfolio-front.yaml` mounts is never created, the
    # new pods sit in ContainerCreating, `maxUnavailable: 0` keeps the previous
    # front door serving, and `prod` stays Degraded.
    for name, kustomization, body, _ in _generated_configmaps():
        size = len(body)
        assert size <= ETCD_OBJECT_BUDGET, (
            f"{name} (generated by {kustomization.relative_to(ROOT)}) serialises to {size} "
            f"bytes, over the {ETCD_OBJECT_BUDGET}-byte budget this suite allows under etcd's "
            f"{ETCD_OBJECT_CEILING}-byte object cap. The measurement is a floor — Argo's "
            "tracking metadata and server-side apply's per-key `managedFields` are added on "
            "top — so the margin is not slack to spend. Make the ConfigMap smaller rather "
            "than raising the budget."
        )


def test_the_mirror_byte_ceiling_trips_before_this_one_does() -> None:
    # Two ceilings guard the same failure in different units, and they have to
    # stay in that order: `BYTE_CEILING` counts mirrored file bytes and fails in
    # the venture directory seconds after a `--write`; this suite measures the
    # built object and fails after a kustomize build. If the file-bytes ceiling
    # were ever raised past what this budget allows, the earlier and more useful
    # error would stop firing and the first sign of trouble would move to CI.
    #
    # 1.40 is a deliberately generous stand-in for the serialisation overhead,
    # and the number changed by an order of magnitude on 2026-09-02.
    #
    # It was 1.05, standing in for the 3.7% measured on the real object (643,465
    # bytes of content serialising to 667,371) — correct while the mirror was
    # text under `data`, where the only overhead is JSON string escaping. The
    # mirror is now gzipped, gzip output is not valid UTF-8, and kustomize puts
    # a key it cannot decode under `binaryData` as base64. That is a 4/3
    # expansion, so a 1.05 factor would have under-predicted the applied object
    # by 27% and left this check passing on a ceiling that could not actually be
    # delivered — a ceiling test that no longer predicts the thing it guards is
    # worse than none, because it reads like coverage.
    #
    # 1.40 is 4/3 plus room for the JSON keys and the object envelope. Being
    # generous here is the safe direction: it makes this test complain sooner.
    source = (REPO / "platform" / "marketing" / "front-door-tools.mjs").read_text()
    match = re.search(r"SHARD_BYTE_CEILING = (\d+) \* 1024", source)
    assert match, "front-door-tools.mjs no longer declares SHARD_BYTE_CEILING in KiB"
    byte_ceiling = int(match.group(1)) * 1024
    assert byte_ceiling * 1.40 < ETCD_OBJECT_BUDGET, (
        f"SHARD_BYTE_CEILING is {byte_ceiling} bytes of content, which could serialise past the "
        f"{ETCD_OBJECT_BUDGET}-byte budget here. Lower it, or lower it and raise this budget "
        "together — never leave the object check as the only one that fires."
    )


def test_portfolio_front_page_is_the_committed_generator_output() -> None:
    # The manifest side of the drift check in
    # platform/marketing/front-door.test.mjs: the file the ConfigMap is
    # generated from has to exist and be the real page, not a placeholder.
    page = (ROOT / "prod" / "front-door" / "index.html").read_text()
    assert page.startswith("<!doctype html>")
    assert 'rel="canonical" href="https://marisstella.dev/"' in page
    # Both PRODUCT_PLAYBOOK.md section 5b clauses, on a hosted surface that
    # platform/pages/build.mjs does not build and therefore cannot inject.
    assert "No warranty." in page
    assert "Best-effort hosting, no SLA." in page


def test_portfolio_front_fits_the_prod_quota() -> None:
    quota = next(
        doc
        for doc in yaml.safe_load_all((ROOT / "prod" / "quota.yaml").read_text())
        if doc and doc["kind"] == "ResourceQuota"
    )["spec"]["hard"]
    spec = _portfolio_front()["Deployment"]["spec"]
    container = spec["template"]["spec"]["containers"][0]
    replicas = spec["replicas"]
    # Millicores and mebibytes, small enough that exact parsing is overkill.
    requests = container["resources"]["requests"]
    limits = container["resources"]["limits"]
    assert requests["cpu"] == "20m"
    request_mi = int(requests["memory"].removesuffix("Mi"))
    limit_mi = int(limits["memory"].removesuffix("Mi"))
    assert replicas * 20 < int(quota["requests.cpu"]) * 1000
    assert replicas * request_mi < int(quota["requests.memory"].removesuffix("Gi")) * 1024
    assert replicas * limit_mi < int(quota["limits.memory"].removesuffix("Gi")) * 1024

    # The memory limit is sized by the mirror, not by nginx, and that is the
    # part worth pinning. A ConfigMap volume is tmpfs, charged to the pod's
    # memory cgroup, so the whole projected `tools` volume is resident in every
    # replica. At `MIRROR_BYTE_CEILING` the mirror alone would have been ~10 MiB
    # from OOMKilling both replicas under the old 64Mi limit — and the symptom
    # of getting this wrong is not a slow page, it is the apex crash-looping
    # some months after whoever raised the mirror ceiling has gone.
    #
    # Twice the ceiling, so nginx's own ~10 MiB and the page cache have room
    # that does not have to be re-derived every time the mirror grows.
    source = (REPO / "platform" / "marketing" / "front-door-tools.mjs").read_text()
    match = re.search(r"MIRROR_BYTE_CEILING = (\d+) \* 1024 \* 1024", source)
    assert match, "front-door-tools.mjs no longer declares MIRROR_BYTE_CEILING in MiB"
    mirror_ceiling_mi = int(match.group(1))
    assert limit_mi >= mirror_ceiling_mi * 2, (
        f"the mirror may grow to {mirror_ceiling_mi}Mi of tmpfs in each replica, against a "
        f"{limit_mi}Mi memory limit. Raise the limit or lower MIRROR_BYTE_CEILING — the pod "
        "is OOMKilled, not throttled, when tmpfs and the process together cross it."
    )


def test_portfolio_apex_matches_the_site_certificate_issuer() -> None:
    # A browser has to accept the certificate for marisstella.dev before it is
    # ever shown the redirect. If the apex sat on staging while the target was
    # on prod, the front door would be the only page with a warning
    # interstitial — so the two issuers move together or not at all.
    apex_issuer = _portfolio_apex()["metadata"]["annotations"][
        "cert-manager.io/cluster-issuer"
    ]
    site_issuer = _portfolio_site()["Ingress"]["metadata"]["annotations"][
        "cert-manager.io/cluster-issuer"
    ]
    assert apex_issuer == site_issuer


def test_portfolio_apex_uses_its_own_certificate_secret() -> None:
    # Sharing `portfolio-site-tls` would make two Certificates fight over one
    # Secret, each reissuing to drop the other's names.
    apex = _portfolio_apex()["spec"]["tls"][0]["secretName"]
    site = _portfolio_site()["Ingress"]["spec"]["tls"][0]["secretName"]
    assert apex != site


def test_portfolio_site_types_es_modules_as_javascript() -> None:
    # nginx's mime.types has no .mjs entry (verified against 1.24: it maps
    # `js` and nothing else), so .mjs falls through to
    # default_type application/octet-stream — and a browser refuses to
    # execute an ES module with a non-JavaScript MIME type, which the
    # nosniff header below makes absolute. The site ships 579 .mjs files
    # loaded with <script type="module"> on 270 pages, so without this the
    # calculators render and silently do not compute. GitHub Pages types
    # .mjs correctly, which is why this never showed on that host.
    conf = _portfolio_site()["ConfigMap"]["data"]["default.conf"]
    # An empty `types { }` immediately before the default_type is
    # load-bearing, so assert the adjacency rather than the two parts: a
    # POPULATED types block in this context replaces the inherited mime map
    # instead of extending it, stripping the content type off every other
    # file on the site.
    #
    # `.csv` is the third of the same class -- nginx 1.27.0's mime.types has no
    # entry for it either, and fifo-pick-evidence ships examples/picks.csv as
    # the sample a visitor loads into the tool. Found by generalizing rather
    # than by it breaking: `platform/pages/check.mjs` now fails the build when
    # the site emits an extension neither nginx nor this ConfigMap types, so a
    # fourth cannot reach production the quiet way the first two did.
    #
    # `.py` is the fourth: 18 ventures' own pages offer a specific CLI as a
    # same-origin download (`DOWNLOADABLE_CLI_FILES` in `build.mjs`).
    #
    # `.gz` is the fifth: research/marriage-divorce-evidence's in-browser
    # trainer fetches its data as .json.gz and unpacks it with
    # DecompressionStream, so it must arrive as application/gzip.
    for suffix, mime in (
        (r"\.mjs$", "text/javascript"),
        (r"\.webmanifest$", "application/manifest+json"),
        (r"\.csv$", "text/csv"),
        (r"\.py$", "text/plain"),
        (r"\.gz$", "application/gzip"),
    ):
        block = f"location ~ {suffix} {{\n    types {{ }}\n    default_type {mime};"
        assert block in conf, f"missing or reordered: {suffix} -> {mime}"


def test_portfolio_site_types_the_feed_as_atom() -> None:
    # nginx's mime.types has an `xml` entry, so without this the feed serves
    # as text/xml -- readable, but not the registered type (RFC 4287), and the
    # aggregators that take a site URL and go looking for a feed match on
    # application/atom+xml rather than parsing every text/xml document.
    #
    # Scoped `=` rather than `~ \.xml$` on purpose: the site ships one Atom
    # document and 171 sitemaps, which are not Atom and must keep their own
    # type.
    conf = _portfolio_site()["ConfigMap"]["data"]["default.conf"]
    assert "location = /feed.xml {\n    types { }\n    default_type application/atom+xml;" in conf
    assert "location ~ \\.xml$" not in conf, "a broad .xml rule would retype every sitemap"


def _location_blocks(conf: str) -> list[str]:
    """Split on locations at their real indentation, so prose mentioning the
    word 'location' in a comment does not read as a block."""
    return conf.split("\n  location ")[1:]


def test_portfolio_site_repeats_security_headers_in_every_location() -> None:
    # add_header does not merge across levels: a location setting any
    # add_header drops all of them inherited from the server block. So a
    # location that sets Cache-Control silently loses nosniff unless it
    # restates it — which is exactly how the .mjs fix could have opened a
    # hole while closing one.
    #
    # The count is pinned so a *new* location cannot be added without someone
    # reading this: 14 today (.mjs, .webmanifest, .csv, .ofx, .qif, .mt940, .tsv, .py, .gz, .whl,
    # /feed.xml, /sw.js, /buildinfo.txt, /). Bumping the number is the reminder to restate the
    # headers in the block being added, which is the whole point of the loop
    # below — and it has worked twice now: /buildinfo.txt and /feed.xml were
    # both written with their three headers because this test refused the
    # block without them. `.py` (added when 18 ventures' own pages started
    # offering a same-origin CLI download) is the third, and `.gz` (gzipped
    # data a research app unpacks itself in the browser) the fourth.
    blocks = [b for b in _location_blocks(_portfolio_site()["ConfigMap"]["data"]["default.conf"]) if "add_header" in b]
    assert len(blocks) == 14, [b.splitlines()[0] for b in blocks]
    for block in blocks:
        assert "X-Content-Type-Options nosniff" in block, block.splitlines()[0]


def test_portfolio_site_serves_a_publicly_trusted_certificate_issuer() -> None:
    # This asserted `letsencrypt-staging` until 2026-08-31, and the reason was
    # sound while it held: Argo auto-syncs prod, so the Ingress existed before
    # DNS for its host did, and prod-issuer challenges that cannot resolve burn
    # Let's Encrypt limits for a name nobody can reach.
    #
    # DNS resolved on 2026-08-29, which retired that reason — and left the
    # assertion pinning the one state in which publishing cannot succeed.
    # Staging is not a trusted root, so a site served under it meets every
    # visitor with a browser interstitial. Because the only thing between this
    # repo and a live site is the owner sealing `portfolio-site-repo`, a
    # staging pin meant that seal would have published 508 pages nobody could
    # open without clicking through a security warning.
    #
    # Pinning prod rather than merely allowing it: the flip is easy to undo by
    # accident (both Ingresses carry the annotation and a revert of either one
    # alone is silently wrong), and a regression here is invisible in review —
    # it shows up as a warning interstitial in production or not at all.
    ingress = _portfolio_site()["Ingress"]
    issuer = ingress["metadata"]["annotations"]["cert-manager.io/cluster-issuer"]
    assert issuer == "letsencrypt-prod"


def test_portfolio_site_canonical_base_matches_the_ingress_host() -> None:
    # build.mjs stamps PAGES_BASE_URL into every canonical link, og:url and
    # sitemap entry. If it drifts from the host actually served, every page
    # tells crawlers the real page lives somewhere it does not.
    site = _portfolio_site()
    host = site["Ingress"]["spec"]["rules"][0]["host"]
    build = [
        c
        for c in site["Deployment"]["spec"]["template"]["spec"]["initContainers"]
        if c["name"] == "build"
    ][0]
    base = [e for e in build["env"] if e["name"] == "PAGES_BASE_URL"][0]["value"]
    assert base == f"https://{host}/"


def test_portfolio_site_carries_no_token_and_reads_one_from_a_secret() -> None:
    raw = (ROOT / "prod" / "portfolio-site.yaml").read_text()
    assert "CHANGE_ME" not in raw
    assert "stringData" not in raw
    fetch = [
        c
        for c in _portfolio_site()["Deployment"]["spec"]["template"]["spec"]["initContainers"]
        if c["name"] == "fetch"
    ][0]
    token = [e for e in fetch["env"] if e["name"] == "GH_TOKEN"][0]
    assert token["valueFrom"]["secretKeyRef"] == {"name": "portfolio-site-repo", "key": "token"}
    # The token must not end up in the remote URL, where `git remote -v`, the
    # process list, or an error echoing the URL would expose it.
    assert "x-access-token:%s@github.com" in fetch["args"][0]
    assert "https://x-access-token:${GH_TOKEN}@" not in raw


def _prod_networkpolicies() -> dict[str, dict]:
    # Every *.yaml directly under prod/, not just networkpolicy.yaml: a
    # NetworkPolicy can ride in a workload's own manifest instead of the
    # shared file, the way portfolio-front-egress does in portfolio-front.yaml
    # (added by #2730, after this file's own networkpolicy.yaml was written).
    # Reading one file only made
    # test_landing_is_the_only_prod_workload_without_a_networkpolicy below
    # pass for the wrong reason: it never saw that fourth policy to count it,
    # so an assertion naming exactly three names still passed the day a
    # fourth one landed elsewhere. secrets/ is skipped because a SealedSecret
    # cannot contain a NetworkPolicy and, once portfolio-repo-token.sealed.yaml
    # exists, is not something this test suite should be parsing as plaintext
    # YAML at all.
    policies: dict[str, dict] = {}
    for path in sorted((ROOT / "prod").glob("*.yaml")):
        if path.name == "kustomization.yaml":
            continue
        for doc in yaml.safe_load_all(path.read_text()):
            if doc and doc.get("kind") == "NetworkPolicy":
                policies[doc["metadata"]["name"]] = doc
    return policies


def test_landing_is_the_only_prod_workload_without_a_networkpolicy() -> None:
    # Inverted from what this test asserted through #2727: it used to say
    # "portfolio-site is the only prod workload with a NetworkPolicy" and
    # named exactly one, which was true when it was written and stayed
    # syntactically true after #2632, #2727 and #2730 each added another --
    # each new policy was a set this assertion had never claimed to be
    # exhaustive against by name, so nothing here failed while the claim in
    # the old test's name quietly stopped matching the tree. `landing` is
    # still the one prod workload deliberately left off this list: it holds
    # no credential of any kind (no ServiceAccount token, no external secret)
    # and calls out to nothing, so it has nothing worth restricting. Every
    # other workload in this namespace now has one: portfolio-site (the
    # GitHub clone token), its two CronJobs (a ServiceAccount token with RBAC
    # to mutate a specific resource), and portfolio-front (no credential, but
    # locked to egress: [] anyway since it has nothing to call out to either
    # -- see test_portfolio_front_egress_targets_the_pod_it_guards below).
    assert set(_prod_networkpolicies()) == {
        "portfolio-site-egress",
        "portfolio-site-usage-egress",
        "portfolio-site-refresh-egress",
        "portfolio-front-egress",
    }


def test_portfolio_front_egress_targets_the_pod_it_guards() -> None:
    # Same regression class as
    # test_portfolio_site_egress_targets_the_pod_that_holds_the_clone_token
    # just below: a podSelector that does not match the Deployment's own pod
    # labels silently governs nothing, and nothing here had pinned that this
    # policy (added by #2730, alongside the Deployment) actually reaches the
    # pod it was written for.
    policy = _prod_networkpolicies()["portfolio-front-egress"]
    assert policy["spec"]["podSelector"]["matchLabels"] == {"app": "portfolio-front"}
    assert (
        _portfolio_front()["Deployment"]["spec"]["template"]["metadata"]["labels"]["app"]
        == "portfolio-front"
    )
    # Deny-all egress is deliberate, not a placeholder: this pod serves only
    # what its ConfigMap volumes already hold and calls out to nothing, so
    # unlike every sibling policy above it needs no DNS or HTTPS carve-out.
    assert policy["spec"]["policyTypes"] == ["Egress"]
    assert policy["spec"]["egress"] == []


def test_networkpolicy_is_synced_by_prod() -> None:
    kustomization = yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())
    assert "networkpolicy.yaml" in kustomization["resources"]


def test_portfolio_site_egress_targets_the_pod_that_holds_the_clone_token() -> None:
    policy = _prod_networkpolicies()["portfolio-site-egress"]
    assert policy["spec"]["podSelector"]["matchLabels"] == {"app": "portfolio-site"}
    # This has to match the label the Deployment actually stamps on its pods,
    # or the policy silently governs nothing.
    assert (
        _portfolio_site()["Deployment"]["spec"]["template"]["metadata"]["labels"]["app"]
        == "portfolio-site"
    )


def test_portfolio_site_egress_policy_does_not_touch_ingress() -> None:
    # Deliberately egress-only. ingress-nginx reaches this pod as a
    # hostNetwork DaemonSet (gitops/apps/ingress-nginx.yaml), so its traffic
    # is not attributable to a Pod/Namespace identity the way
    # podSelector/namespaceSelector match -- an Ingress-side rule here would
    # need an ipBlock naming the node itself, which no session can verify
    # without cluster access. If this ever grows an Ingress rule it must be
    # deliberate and reviewed against the live cluster, not a silent
    # side-effect of some other edit -- see the comment at the top of
    # networkpolicy.yaml.
    policy = _prod_networkpolicies()["portfolio-site-egress"]
    assert policy["spec"]["policyTypes"] == ["Egress"]
    assert "ingress" not in policy["spec"]


def test_portfolio_site_egress_dns_is_scoped_to_kube_system() -> None:
    # Same regression class as test_agents_dns_egress_is_scoped_to_kube_
    # system: an unscoped `to:` on port 53 is a DNS-tunneling exfiltration
    # path independent of the HTTPS restriction below.
    policy = _prod_networkpolicies()["portfolio-site-egress"]
    dns_rules = [
        r
        for r in policy["spec"]["egress"]
        if {p["protocol"] for p in r.get("ports", [])} == {"UDP", "TCP"}
        and all(p["port"] == 53 for p in r["ports"])
    ]
    assert len(dns_rules) == 1, dns_rules
    to = dns_rules[0].get("to")
    assert to, "the DNS rule has no `to:` -- it allows port 53 to any destination"
    assert to[0]["namespaceSelector"]["matchLabels"]["kubernetes.io/metadata.name"] == "kube-system"


def test_portfolio_site_egress_cannot_reach_the_kube_apiserver() -> None:
    # Same regression class as test_worker_egress_cannot_reach_the_kube_
    # apiserver: a 443 rule with no `to:` is "port 443 to any destination",
    # which includes 10.43.0.1 (the k3s default `kubernetes` Service, i.e.
    # the API server) -- reachable by a pod that briefly holds a live GitHub
    # clone token, with no automountServiceAccountToken guard to fall back on
    # the way the Codex worker has (portfolio-site does not mount any
    # ServiceAccount token either, but the network route existing at all is
    # the thing this pins shut, the same way it is for the worker).
    policy = _prod_networkpolicies()["portfolio-site-egress"]
    https_rules = [r for r in policy["spec"]["egress"] if r.get("ports") == [{"protocol": "TCP", "port": 443}]]
    assert len(https_rules) == 1, https_rules
    to = https_rules[0].get("to")
    assert to, "the 443 egress rule has no `to:` -- it allows any destination"
    internet = to[0]["ipBlock"]
    assert internet["cidr"] == "0.0.0.0/0"
    for blocked in ("10.42.0.0/16", "10.43.0.0/16", "10.244.0.0/16", "10.10.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"):
        assert blocked in internet["except"], blocked


def test_portfolio_site_credentialed_cronjobs_get_the_same_treatment_as_governor() -> None:
    # Same class of gap `governor-egress` and `worker-egress` already close in
    # `agents`: a pod holding a live ServiceAccount token with RBAC to mutate a
    # cluster resource must not also have unrestricted egress. `landing` is not
    # part of this -- it holds no credential of any kind and calls out to
    # nothing.
    usage_policy = _prod_networkpolicies()["portfolio-site-usage-egress"]
    refresh_policy = _prod_networkpolicies()["portfolio-site-refresh-egress"]

    for policy in (usage_policy, refresh_policy):
        assert policy["spec"]["policyTypes"] == ["Egress"]
        assert "ingress" not in policy["spec"]

    assert usage_policy["spec"]["podSelector"]["matchLabels"] == {
        "app.kubernetes.io/name": "portfolio-site-usage"
    }
    assert refresh_policy["spec"]["podSelector"]["matchLabels"] == {
        "app.kubernetes.io/name": "portfolio-site-refresh"
    }

    # Each selector has to match the label the CronJob's own pod template
    # actually stamps, or the policy silently governs no pod at all -- the
    # same failure mode test_portfolio_site_egress_targets_the_pod_that_holds_
    # the_clone_token guards against for the Deployment above.
    usage_cron = [
        d
        for d in yaml.safe_load_all((ROOT / "prod" / "site-usage.yaml").read_text())
        if d and d["kind"] == "CronJob"
    ][0]
    usage_pod_labels = usage_cron["spec"]["jobTemplate"]["spec"]["template"]["metadata"]["labels"]
    assert usage_pod_labels == {"app.kubernetes.io/name": "portfolio-site-usage"}

    refresh_cron = _portfolio_site()["CronJob"]
    refresh_pod_labels = refresh_cron["spec"]["jobTemplate"]["spec"]["template"]["metadata"]["labels"]
    assert refresh_pod_labels == {"app.kubernetes.io/name": "portfolio-site-refresh"}


def test_portfolio_site_usage_egress_is_scoped_to_dns_and_the_apiserver() -> None:
    # aggregate.py never calls anything but the apiserver (by
    # KUBERNETES_SERVICE_HOST, a fixed IP, so DNS is not load-bearing here --
    # allowed anyway for the same reason governor-egress allows it: cheap
    # insurance, not a requirement).
    policy = _prod_networkpolicies()["portfolio-site-usage-egress"]
    dns_rules = [
        r
        for r in policy["spec"]["egress"]
        if {p["protocol"] for p in r.get("ports", [])} == {"UDP", "TCP"}
        and all(p["port"] == 53 for p in r["ports"])
    ]
    assert len(dns_rules) == 1, dns_rules
    assert dns_rules[0]["to"][0]["namespaceSelector"]["matchLabels"]["kubernetes.io/metadata.name"] == "kube-system"

    https_rules = [r for r in policy["spec"]["egress"] if r.get("ports") == [{"protocol": "TCP", "port": 443}]]
    assert len(https_rules) == 1, https_rules
    # A single address, not a range: unlike the refresh job below, this pod
    # calls nothing else, so the tightest correct rule is the one fixed IP
    # governor-egress already uses for the identical call.
    assert https_rules[0]["to"][0]["ipBlock"]["cidr"] == "10.43.0.1/32"


def test_portfolio_site_refresh_egress_reaches_the_apiserver_and_the_service() -> None:
    # Unlike the usage job above, this pod's own script resolves two names --
    # kubectl's in-cluster config falls back to `kubernetes.default.svc`, and
    # the freshness check curls the `portfolio-site` Service by name -- so DNS
    # is load-bearing here, and the Service's own ClusterIP is not a fixed,
    # predictable address the way the apiserver's is.
    policy = _prod_networkpolicies()["portfolio-site-refresh-egress"]
    dns_rules = [
        r
        for r in policy["spec"]["egress"]
        if {p["protocol"] for p in r.get("ports", [])} == {"UDP", "TCP"}
        and all(p["port"] == 53 for p in r["ports"])
    ]
    assert len(dns_rules) == 1, dns_rules
    assert dns_rules[0]["to"][0]["namespaceSelector"]["matchLabels"]["kubernetes.io/metadata.name"] == "kube-system"

    service_rules = [r for r in policy["spec"]["egress"] if r.get("to", [{}])[0].get("ipBlock")]
    assert len(service_rules) == 1, service_rules
    ipblock = service_rules[0]["to"][0]["ipBlock"]
    # The whole service CIDR, not a single /32 -- the ClusterIP the
    # `portfolio-site` Service gets is assigned by the control plane, not
    # something a session with no cluster access can read or pin down, but
    # the CIDR itself is the same k3s-default constant every other
    # NetworkPolicy in this repo already treats as known.
    assert ipblock["cidr"] == "10.43.0.0/16"
    assert "except" not in ipblock
    ports = {p["port"] for p in service_rules[0]["ports"]}
    assert ports == {80, 443}


def test_portfolio_site_refresh_can_only_restart_the_site() -> None:
    role = _portfolio_site()["Role"]
    assert role["rules"] == [
        {
            "apiGroups": ["apps"],
            "resources": ["deployments"],
            "resourceNames": ["portfolio-site"],
            "verbs": ["get", "patch"],
        }
    ]


def test_portfolio_site_serves_unprivileged_and_read_only() -> None:
    pod = _portfolio_site()["Deployment"]["spec"]["template"]["spec"]
    assert pod["securityContext"]["runAsNonRoot"] is True
    assert pod["automountServiceAccountToken"] is False
    for container in pod["containers"] + pod["initContainers"]:
        sec = container["securityContext"]
        assert sec["readOnlyRootFilesystem"] is True, container["name"]
        assert sec["allowPrivilegeEscalation"] is False, container["name"]
        assert sec["capabilities"]["drop"] == ["ALL"], container["name"]


def test_portfolio_site_fits_the_prod_quota() -> None:
    # The quota is namespace-wide and the landing pod also draws on it, so
    # this only asserts the site cannot single-handedly exhaust it.
    quota = [
        d
        for d in yaml.safe_load_all((ROOT / "prod" / "quota.yaml").read_text())
        if d and d["kind"] == "ResourceQuota"
    ][0]["spec"]["hard"]
    assert quota["requests.cpu"] == "4"
    deployment = _portfolio_site()["Deployment"]
    replicas = deployment["spec"]["replicas"]
    pod = deployment["spec"]["template"]["spec"]
    # Init containers run one at a time and their requests are not additive
    # with the app containers; the scheduler takes the max of the two.
    init_cpu = max(_millicores(c["resources"]["requests"]["cpu"]) for c in pod["initContainers"])
    app_cpu = sum(_millicores(c["resources"]["requests"]["cpu"]) for c in pod["containers"])
    assert replicas * max(init_cpu, app_cpu) < 4000


def _millicores(value: str) -> int:
    return int(value[:-1]) if value.endswith("m") else int(float(value) * 1000)


def test_infra_adopts_existing_servers() -> None:
    inventory = (REPO / "infra" / "inventory.tf").read_text()
    assert "163417666" in inventory
    assert "163580094" in inventory
    assert "cpx52" in inventory
    assert "cpx22" in inventory


def test_agents_app_does_not_reset_governor_state() -> None:
    app = yaml.safe_load((ROOT / "apps" / "agents.yaml").read_text())
    diffs = app["spec"]["ignoreDifferences"]
    assert diffs[0]["name"] == "governor-state"
    assert "/data" in diffs[0]["jsonPointers"]
    assert "RespectIgnoreDifferences=true" in app["spec"]["syncPolicy"]["syncOptions"]
    state = yaml.safe_load((AGENTS / "governor" / "state.yaml").read_text())
    assert state["metadata"]["name"] == "governor-state"


def _cluster_issuers() -> list[dict]:
    path = ROOT / "platform" / "cert-manager" / "issuer.yaml"
    return [d for d in yaml.safe_load_all(path.read_text()) if d and d["kind"] == "ClusterIssuer"]


def test_acme_issuers_hand_no_placeholder_address_to_a_certificate_authority() -> None:
    # An ACME contact is optional (RFC 8555 makes `contact` optional and
    # cert-manager's `email` follows), so the issuers ship without one rather
    # than with a placeholder. The placeholder was the worst of the three
    # options: it either blocks issuance outright or routes expiry warnings to
    # a mailbox nobody reads, and it put an owner action on the critical path
    # to a live site for neither benefit.
    #
    # A real address is welcome here later. What must never come back is a
    # made-up one, so this pins the property (no placeholder) rather than the
    # current value (no email at all).
    placeholders = ("replace-me", "change-me", "changeme", "example.com", "example.org", "@localhost")
    issuers = _cluster_issuers()
    assert issuers, "expected the staging and prod ClusterIssuers"
    for issuer in issuers:
        email = issuer["spec"]["acme"].get("email")
        if email is None:
            continue
        lowered = email.lower()
        assert "@" in lowered, f"{issuer['metadata']['name']}: {email!r} is not an address"
        for token in placeholders:
            assert token not in lowered, f"{issuer['metadata']['name']} still carries a placeholder: {email!r}"


def test_acme_issuers_start_on_staging_and_offer_prod() -> None:
    by_name = {i["metadata"]["name"]: i for i in _cluster_issuers()}
    assert set(by_name) == {"letsencrypt-staging", "letsencrypt-prod"}
    assert "acme-staging-v02" in by_name["letsencrypt-staging"]["spec"]["acme"]["server"]
    assert "acme-staging" not in by_name["letsencrypt-prod"]["spec"]["acme"]["server"]
    # HTTP-01 through ingress-nginx is the only solver this cluster can serve;
    # a DNS-01 solver would need a provider credential nothing here holds.
    for issuer in by_name.values():
        solvers = issuer["spec"]["acme"]["solvers"]
        assert [s["http01"]["ingress"]["class"] for s in solvers] == ["nginx"]


def test_portfolio_site_build_uses_flags_the_build_scripts_accept() -> None:
    # The site is built inside the pod by a shell command in the manifest, not
    # by a script in the repo, so nothing else makes the manifest's command
    # line and the build scripts' actual argument parsing move together. If
    # `build.mjs` renamed `--out=` the only symptom would be prod pods
    # crash-looping after the owner seals the clone token — the one moment
    # nobody wants to be debugging flag names.
    site = _portfolio_site()
    build = [
        c
        for c in site["Deployment"]["spec"]["template"]["spec"]["initContainers"]
        if c["name"] == "build"
    ][0]
    script = build["args"][0]
    # Comments inside the script mention the flags by name, so match the
    # command lines only — otherwise a renamed flag still "passes" on the
    # strength of the comment that documents the old spelling.
    commands = [
        line.strip()
        for line in script.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]

    for source, flag in (("pages/build.mjs", "--out="), ("pages/check.mjs", "--dist=")):
        invocations = [c for c in commands if source in c]
        assert invocations, f"the manifest no longer runs platform/{source}"
        for invocation in invocations:
            assert flag in invocation, f"the manifest no longer passes {flag}: {invocation!r}"
        text = (REPO / "platform" / source).read_text()
        assert flag in text, f"{source} does not parse {flag} that the manifest passes"

    # Both scripts are run bare by `node`, so the build stage must stay
    # dependency-free: there is no npm install step in the pod, and adding one
    # would need network egress the NetworkPolicy does not grant this pod.
    assert "npm install" not in script and "npm ci" not in script


def test_the_generated_front_door_tools_mirror_is_not_committed() -> None:
    # P024: the tree fed the k3s origin retired on 2026-10-01 and the tests
    # build it into a temp dir. Venture PRs kept re-adding thousands of its
    # files (6,202 on 2026-10-20) by running `front-door-tools.mjs --write`
    # with no `--out`; pass `--out <dir>` if you need to inspect it.
    import subprocess

    tracked = subprocess.run(
        ["git", "ls-files", "gitops/prod/front-door-tools"],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout.split()
    assert not tracked, (
        f"{len(tracked)} files are tracked under gitops/prod/front-door-tools/; "
        "`git rm -r` it. It is generated and no longer committed."
    )
