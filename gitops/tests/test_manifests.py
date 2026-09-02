"""Shape and safety checks on the GitOps tree. No cluster required."""

from __future__ import annotations

from pathlib import Path

import yaml

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


def test_no_live_secrets_in_git() -> None:
    for path in list(ROOT.rglob("*")) + list((REPO / "infra").glob("*.tf")) + list(
        (REPO / "bootstrap").rglob("*")
    ):
        if not path.is_file():
            continue
        if path.suffix in {".png", ".jpg"}:
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
    # uncanonical copies of all 518 pages in front of crawlers.
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


def test_portfolio_apex_redirects_permanently_to_the_canonical_host() -> None:
    # A 301 to the canonical host, not a second copy of the site: build.mjs
    # stamps one canonical base into all 518 pages, and serving those bytes
    # under two more names would contradict it on every page.
    apex = _portfolio_apex()
    annotations = apex["metadata"]["annotations"]
    target = annotations["nginx.ingress.kubernetes.io/permanent-redirect"]
    assert target == "https://tools.marisstella.dev/"
    assert annotations["nginx.ingress.kubernetes.io/permanent-redirect-code"] == "301"

    # The redirect target must stay the host the content Ingress actually
    # serves. If someone renames that host and forgets this file, the front
    # door 301s everyone into a name nothing answers for.
    served = _portfolio_site()["Ingress"]["spec"]["rules"][0]["host"]
    assert target == f"https://{served}/"


def test_portfolio_apex_backend_is_the_real_site_not_a_stub() -> None:
    # The backend is unreachable while the redirect annotation is set, so its
    # only job is to decide what happens if that annotation is ever dropped:
    # pointing at the live Service degrades to serving the site (whose pages
    # carry the canonical tag anyway), while a stub would degrade to a 503.
    site_service = None
    for doc in yaml.safe_load_all((ROOT / "prod" / "portfolio-site.yaml").read_text()):
        if doc and doc["kind"] == "Service":
            site_service = doc["metadata"]["name"]
    assert site_service is not None
    for rule in _portfolio_apex()["spec"]["rules"]:
        for path in rule["http"]["paths"]:
            assert path["backend"]["service"]["name"] == site_service


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
    for suffix, mime in (
        (r"\.mjs$", "text/javascript"),
        (r"\.webmanifest$", "application/manifest+json"),
        (r"\.csv$", "text/csv"),
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
    # reading this: 7 today (.mjs, .webmanifest, .csv, /feed.xml, /sw.js,
    # /buildinfo.txt, /). Bumping the number is the reminder to restate the
    # headers in the block being added, which is the whole point of the loop
    # below — and it has worked twice now: /buildinfo.txt and /feed.xml were
    # both written with their three headers because this test refused the
    # block without them.
    blocks = [b for b in _location_blocks(_portfolio_site()["ConfigMap"]["data"]["default.conf"]) if "add_header" in b]
    assert len(blocks) == 7, [b.splitlines()[0] for b in blocks]
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
    docs = list(yaml.safe_load_all((ROOT / "prod" / "networkpolicy.yaml").read_text()))
    return {d["metadata"]["name"]: d for d in docs if d}


def test_portfolio_site_is_the_only_prod_workload_with_a_networkpolicy() -> None:
    assert set(_prod_networkpolicies()) == {"portfolio-site-egress"}


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
