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


def test_root_tracks_main_of_this_repo() -> None:
    root = yaml.safe_load((ROOT / "root.yaml").read_text())
    assert root["spec"]["source"]["repoURL"].endswith("Duncan-Haywood/monorepo-projects.git")
    assert root["spec"]["source"]["targetRevision"] == "main"
    assert root["spec"]["source"]["path"] == "gitops/apps"


def test_prod_landing_has_no_marisstella_ingress() -> None:
    landing = Path(ROOT / "prod" / "landing.yaml").read_text()
    assert "kind: Ingress" not in landing
    assert "marisstella.dev" in landing  # mentioned as do-not-hijack


def _portfolio_site() -> dict[str, dict]:
    docs = list(yaml.safe_load_all((ROOT / "prod" / "portfolio-site.yaml").read_text()))
    return {d["kind"]: d for d in docs if d}


def test_portfolio_site_is_synced_by_prod() -> None:
    kustomization = yaml.safe_load((ROOT / "prod" / "kustomization.yaml").read_text())
    assert "portfolio-site.yaml" in kustomization["resources"]


def test_portfolio_site_takes_a_subdomain_not_the_apex() -> None:
    # infra/README.md records that marisstella.dev already resolves to this
    # box for something else, and landing.yaml says the stack must not hijack
    # it. ingress-nginx only answers for hosts a rule names, so a subdomain is
    # safe and the bare apex is not.
    ingress = _portfolio_site()["Ingress"]
    hosts = [rule["host"] for rule in ingress["spec"]["rules"]]
    assert hosts == ["tools.marisstella.dev"]
    for host in hosts:
        assert host not in {"marisstella.dev", "www.marisstella.dev"}
    assert ingress["spec"]["tls"][0]["hosts"] == hosts


def test_portfolio_site_types_es_modules_as_javascript() -> None:
    # nginx's mime.types has no .mjs entry (verified against 1.24: it maps
    # `js` and nothing else), so .mjs falls through to
    # default_type application/octet-stream — and a browser refuses to
    # execute an ES module with a non-JavaScript MIME type, which the
    # nosniff header below makes absolute. The site ships 551 .mjs files
    # loaded with <script type="module"> on 261 pages, so without this the
    # calculators render and silently do not compute. GitHub Pages types
    # .mjs correctly, which is why this never showed on that host.
    conf = _portfolio_site()["ConfigMap"]["data"]["default.conf"]
    # An empty `types { }` immediately before the default_type is
    # load-bearing, so assert the adjacency rather than the two parts: a
    # POPULATED types block in this context replaces the inherited mime map
    # instead of extending it, stripping the content type off every other
    # file on the site.
    for suffix, mime in ((r"\.mjs$", "text/javascript"), (r"\.webmanifest$", "application/manifest+json")):
        block = f"location ~ {suffix} {{\n    types {{ }}\n    default_type {mime};"
        assert block in conf, f"missing or reordered: {suffix} -> {mime}"


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
    blocks = [b for b in _location_blocks(_portfolio_site()["ConfigMap"]["data"]["default.conf"]) if "add_header" in b]
    assert len(blocks) == 4, [b.splitlines()[0] for b in blocks]
    for block in blocks:
        assert "X-Content-Type-Options nosniff" in block, block.splitlines()[0]


def test_portfolio_site_starts_on_the_staging_certificate_issuer() -> None:
    # Argo auto-syncs prod, so this Ingress exists before DNS for its host
    # does. Against the prod issuer, challenges that cannot resolve burn
    # Let's Encrypt limits for a name nobody can reach. Flipping to
    # letsencrypt-prod is the last step of publishing, not part of landing
    # the manifest — so this asserts the safe default rather than the
    # eventual one.
    ingress = _portfolio_site()["Ingress"]
    issuer = ingress["metadata"]["annotations"]["cert-manager.io/cluster-issuer"]
    assert issuer == "letsencrypt-staging"


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
