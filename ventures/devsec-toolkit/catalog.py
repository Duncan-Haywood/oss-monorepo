"""The checks devsec-toolkit runs, and how to read each one's output.

Every check here is a separate, already-tested tool in this repository
(``ventures/<venture>/``). This file does not reimplement any of them. For each
one it records:

* how to invoke it (runtime, entry file, arguments; it always runs with the
  scanned directory as its working directory and ``.`` as the path, so every
  file it reports is relative to the scan root);
* which files make it applicable (globs; a repo with none is "not applicable"
  rather than a silent pass);
* which of its output items are risks, mirroring the check's own
  ``--fail-on-risk`` logic (``test_devsec.py`` fails if a Python check's
  ``RISK_CLASSIFICATIONS`` drifts from the set here);
* a severity per rule. The tools disagree on vocabulary (some have none), so
  the toolkit maps everything onto high / medium / low. These are this
  toolkit's defaults, chosen for how directly a finding is exploitable, and a
  repo can override any of them in ``.devsec.json``.

Adding a check: add an entry to ``CHECKS`` with an adapter, then add a fixture
case to ``tests/fixtures/vulnerable-repo`` that makes it fire.
"""

from __future__ import annotations

import json

SEVERITIES = ("high", "medium", "low")
SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}

CATEGORIES = {
    "ci-cd": "GitHub Actions workflows",
    "containers": "Dockerfiles and Compose",
    "kubernetes": "Kubernetes manifests",
    "supply-chain": "Dependencies, registries and runtimes",
    "code": "Application source",
    "ai-agents": "AI coding-agent configuration",
}

WORKFLOWS = (".github/workflows/*.yml", ".github/workflows/*.yaml")
DOCKERFILES = ("Dockerfile", "*/Dockerfile", "**/Dockerfile", "Dockerfile.*", "**/Dockerfile.*", "*.dockerfile", "**/*.dockerfile")
COMPOSE = ("docker-compose*.yml", "docker-compose*.yaml", "compose*.yml", "compose*.yaml",
           "**/docker-compose*.yml", "**/docker-compose*.yaml", "**/compose*.yml", "**/compose*.yaml")
YAML = ("*.yml", "*.yaml", "**/*.yml", "**/*.yaml")
PY_JS_TS = ("*.py", "**/*.py", "*.js", "**/*.js", "*.mjs", "**/*.mjs", "*.cjs", "**/*.cjs", "*.ts", "**/*.ts", "*.tsx", "**/*.tsx", "*.jsx", "**/*.jsx")
DEP_MANIFESTS = ("requirements*.txt", "**/requirements*.txt", "pip.conf", "**/pip.conf", "pyproject.toml", "**/pyproject.toml",
                 "package.json", "**/package.json", ".npmrc", "**/.npmrc")
NODE_PINS = ("package.json", "**/package.json", ".nvmrc", "**/.nvmrc", ".node-version", "**/.node-version",
             ".tool-versions", "**/.tool-versions") + DOCKERFILES + WORKFLOWS
AGENT_CONFIGS = (".claude/settings.json", ".claude/settings.local.json", ".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json")
DEPENDABOT_TRIGGERS = ("package.json", "**/package.json", "requirements*.txt", "**/requirements*.txt", "pyproject.toml",
                       "**/pyproject.toml", "go.mod", "**/go.mod", "Cargo.toml", "**/Cargo.toml", "Gemfile", "**/Gemfile",
                       "composer.json", "**/composer.json", "pom.xml", "**/pom.xml", "build.gradle", "**/build.gradle") + DOCKERFILES + WORKFLOWS


def _finding(rule, severity, file, line, message, fix=""):
    return {
        "rule": rule,
        "severity": severity,
        "file": file or "",
        "line": int(line) if isinstance(line, int) or (isinstance(line, str) and line.isdigit()) else None,
        "message": (message or "").strip(),
        "fix": (fix or "").strip(),
    }


# --- adapters: raw stdout -> list of normalised findings ----------------------


def classified_list(key, severity_by_rule, message=None, fix=None, headlines=None):
    """Python checks printing a JSON list where ``item[key]`` names the rule.

    Only rules in ``severity_by_rule`` are risks (the check's own
    RISK_CLASSIFICATIONS); every other item is informational and dropped.
    ``headlines`` gives a plain sentence for rules whose ``detail`` is only the
    matched snippet (an expression, an action name).
    """

    def adapt(stdout, _stderr, _code):
        out = []
        for item in json.loads(stdout or "[]"):
            rule = item.get(key)
            if rule not in severity_by_rule:
                continue
            if message:
                text = message(item)
            else:
                detail = item.get("detail") or item.get("name") or ""
                headline = (headlines or {}).get(rule)
                text = f"{headline}: {detail}" if headline and detail else headline or detail or rule
            out.append(_finding(
                rule,
                severity_by_rule[rule],
                item.get("file"),
                item.get("line"),
                text,
                fix(item) if fix else item.get("remediation", ""),
            ))
        return out

    adapt.risk_key = key
    adapt.risk_rules = frozenset(severity_by_rule)
    return adapt


def self_rated_list(stdout, _stderr, _code):
    """Python checks that rate their own findings high / medium / low."""
    out = []
    for item in json.loads(stdout or "[]"):
        sev = item.get("severity")
        if sev not in SEVERITY_RANK:
            continue
        where = f" ({item['resource']})" if item.get("resource") else ""
        out.append(_finding(item.get("type"), sev, item.get("file"), item.get("line"),
                            (item.get("detail") or item.get("type")) + where, item.get("remediation", "")))
    return out


def node_version_drift(stdout, _stderr, _code):
    data = json.loads(stdout or "{}")
    sev = {"risk": "medium", "notice": "low"}
    return [
        _finding(f.get("kind"), sev[f.get("severity")], f.get("file"), f.get("line"), f.get("message"))
        for f in data.get("findings", [])
        if f.get("severity") in sev
    ]


def regex_redos(stdout, _stderr, _code):
    data = json.loads(stdout or "{}")
    sev = {"error": "medium", "warn": "low"}
    out = []
    for f in data.get("findings", []):
        if f.get("severity") not in sev:
            continue
        pattern = f" Pattern: /{f['pattern']}/" if f.get("pattern") else ""
        out.append(_finding(f.get("rule"), sev[f["severity"]], f.get("file"), f.get("line"), f.get("message", "") + pattern))
    return out


def agent_permission_config(stdout, stderr, _code):
    text = (stdout or "").strip()
    if not text.startswith("["):
        # "No config file found among: ..." -- nothing to check.
        return []
    out = []
    for entry in json.loads(text):
        for f in (entry.get("result") or {}).get("findings", []):
            if f.get("severity") not in SEVERITY_RANK:
                continue  # "info" notes are advice, not risks
            out.append(_finding(f.get("kind"), f["severity"], entry.get("file"), f.get("line"), f.get("message")))
    return out


def dependabot_config(stdout, stderr, code):
    text = (stdout or "").strip()
    if not text.startswith("{"):
        if "No .github/dependabot.yml found" in (stderr or ""):
            return [_finding(
                "dependabot-config-missing", "low", ".github/dependabot.yml", None,
                "No .github/dependabot.yml: Dependabot version updates are off, so vulnerable dependency versions are never bumped automatically.",
                "Generate a starter config with `node ventures/dependabot-config-check/cli.mjs . --generate > .github/dependabot.yml` and review it.",
            )]
        raise ValueError((stderr or "").strip() or f"no JSON output (exit {code})")
    data = json.loads(text)
    cfg = (data.get("config") or ".github/dependabot.yml").removeprefix("./")
    sev = {"error": "medium", "warn": "low"}
    return [
        _finding(f.get("rule"), sev[f["severity"]], cfg, f.get("line"), f.get("message"), f.get("fix", ""))
        for f in data.get("findings", [])
        if f.get("severity") in sev
    ]


# --- the catalogue ------------------------------------------------------------


def _py(venture, extra=()):
    return {"runtime": "python", "entry": f"{venture}/check.py", "args": ["--format", "json", *extra, "."]}


def _ref(item):
    return f"{item.get('action') or item.get('image')}@{item.get('ref') or item.get('tag')}"


CHECKS = [
    # CI/CD: GitHub Actions
    dict(id="actions-injection", venture="actions-injection-check", category="ci-cd",
         title="Pwn-request checkouts and script injection", applies=WORKFLOWS, **_py("actions-injection-check"),
         adapt=classified_list("type", {"pwn-request-checkout": "high", "script-injection": "high"},
                               headlines={"pwn-request-checkout": "Privileged pull_request_target/workflow_run job checks out the pull request's own code",
                                          "script-injection": "Untrusted event text is interpolated straight into a shell command"})),
    dict(id="actions-artifact-poisoning", venture="actions-artifact-poisoning-check", category="ci-cd",
         title="Artifacts from untrusted runs executed in privileged jobs", applies=WORKFLOWS, **_py("actions-artifact-poisoning-check"),
         adapt=classified_list("type", {"artifact-executed-after-untrusted-download": "high", "unscoped-artifact-download": "medium"},
                               headlines={"artifact-executed-after-untrusted-download": "A privileged job executes files downloaded from a fork-triggered run",
                                          "unscoped-artifact-download": "Privileged job downloads every artifact a fork-triggered run uploaded"})),
    dict(id="actions-cache-poisoning", venture="actions-cache-poisoning-check", category="ci-cd",
         title="Cache writes reachable from untrusted triggers", applies=WORKFLOWS, **_py("actions-cache-poisoning-check"),
         adapt=classified_list("type", {"cache-write-on-untrusted-trigger": "high", "unscoped-restore-keys": "medium"},
                               headlines={"cache-write-on-untrusted-trigger": "A job reachable from forks writes the shared Actions cache (cache poisoning)",
                                          "unscoped-restore-keys": "restore-keys can restore a cache entry another, less trusted run wrote"})),
    dict(id="actions-secret-leak", venture="actions-secret-leak-check", category="ci-cd",
         title="Secrets transformed past log masking", applies=WORKFLOWS, **_py("actions-secret-leak-check"),
         adapt=classified_list("type", {"transformed-secret": "high", "unmasked-env-export": "medium"},
                               headlines={"transformed-secret": "A secret is re-encoded, so log masking no longer hides it",
                                          "unmasked-env-export": "A secret is exported to the environment where later steps can print it unmasked"})),
    dict(id="actions-secrets-inherit", venture="actions-secrets-inherit-check", category="ci-cd",
         title="secrets: inherit to external or untrusted workflows", applies=WORKFLOWS, **_py("actions-secrets-inherit-check"),
         adapt=classified_list("type", {"secrets-inherit-untrusted-trigger": "high", "secrets-inherit-external-workflow": "medium"},
                               headlines={"secrets-inherit-untrusted-trigger": "Every secret is handed to a job a fork can trigger",
                                          "secrets-inherit-external-workflow": "Every secret is handed to a reusable workflow in another repository"})),
    dict(id="actions-self-hosted-exposure", venture="actions-self-hosted-exposure-check", category="ci-cd",
         title="Self-hosted runners reachable from forks", applies=WORKFLOWS, **_py("actions-self-hosted-exposure-check"),
         adapt=classified_list("classification", {"fork-exposed": "high"})),
    dict(id="actions-permissions", venture="actions-permissions-check", category="ci-cd",
         title="GITHUB_TOKEN permissions left at write-all or unset", applies=WORKFLOWS, **_py("actions-permissions-check"),
         adapt=classified_list("classification", {"write-all": "high", "unspecified": "medium"},
                               message=lambda i: f"{i.get('scope')}: {i.get('detail')}",
                               fix=lambda i: "Declare `permissions:` explicitly with the least access the job needs (start from `contents: read`).")),
    dict(id="actions-checkout-credentials", venture="actions-checkout-credentials-check", category="ci-cd",
         title="actions/checkout leaving the token in .git/config", applies=WORKFLOWS, **_py("actions-checkout-credentials-check"),
         adapt=classified_list("type", {"checkout-persists-credentials-with-upload": "high", "checkout-persists-credentials": "low"})),
    dict(id="pinned-actions", venture="pinned-actions-check", category="ci-cd",
         title="Third-party actions referenced by a mutable tag", applies=WORKFLOWS, **_py("pinned-actions-check"),
         adapt=classified_list("classification", {"mutable": "medium"},
                               message=lambda i: f"{_ref(i)} is a mutable ref: whoever controls the tag controls what runs with this job's token.",
                               fix=lambda i: f"Pin to a full commit SHA. Resolve it with: {i.get('remediation')}")),
    dict(id="actions-runtime-deprecation", venture="actions-runtime-deprecation-check", category="ci-cd",
         title="Actions on deprecated or shut-down runtimes", applies=WORKFLOWS, **_py("actions-runtime-deprecation-check"),
         adapt=classified_list("type", {"shut-down-version": "medium", "deprecated-runtime": "low"})),
    dict(id="actions-timeout", venture="actions-timeout-check", category="ci-cd",
         title="Jobs with no timeout (6-hour default)", applies=WORKFLOWS, **_py("actions-timeout-check"),
         adapt=classified_list("type", {"job-missing-timeout": "low", "job-timeout-at-default": "low"})),

    # Containers
    dict(id="docker-build-secrets", venture="docker-build-secrets-check", category="containers",
         title="Secrets baked into image layers", applies=DOCKERFILES, **_py("docker-build-secrets-check"),
         adapt=classified_list("classification", {"env-secret": "high", "arg-literal": "high", "sensitive-copy": "high"},
                               headlines={"env-secret": "Secret set with ENV is stored in the image config for anyone who pulls it",
                                          "arg-literal": "Secret given a literal ARG default is committed and recorded in the image history",
                                          "sensitive-copy": "A credential file is copied into an image layer"})),
    dict(id="docker-compose-security", venture="docker-compose-security-check", category="containers",
         title="Privileged, socket-mounting and exposed Compose services", applies=COMPOSE, **_py("docker-compose-security-check"),
         adapt=self_rated_list),
    dict(id="docker-base-image-eol", venture="docker-base-image-eol-check", category="containers",
         title="Base images past end of life", applies=DOCKERFILES, **_py("docker-base-image-eol-check"),
         adapt=classified_list("classification", {"eol": "medium", "deprecated-image": "medium"},
                               message=lambda i: f"{i.get('image')}:{i.get('tag')} reached end of life on {i.get('eol')} and no longer gets security fixes.",
                               fix=lambda i: f"Move to a supported {i.get('image')} release (source: {i.get('source')}).")),
    dict(id="docker-base-image-pin", venture="docker-base-image-pin-check", category="containers",
         title="Base images referenced by a mutable tag", applies=DOCKERFILES, **_py("docker-base-image-pin-check"),
         adapt=classified_list("classification", {"mutable": "low"},
                               message=lambda i: f"FROM {i.get('image')}:{i.get('tag')} is a mutable tag: a rebuild can silently pull a different image.",
                               fix=lambda i: f"Pin by digest (image:tag@sha256:...). Resolve it with: {i.get('remediation')}")),

    # Kubernetes
    dict(id="k8s-pod-security", venture="k8s-pod-security-check", category="kubernetes",
         title="Privileged pods, host namespaces, root containers", applies=YAML, **_py("k8s-pod-security-check"),
         adapt=self_rated_list),

    # Supply chain
    dict(id="dependency-confusion", venture="dependency-confusion-check", category="supply-chain",
         title="Dependency-confusion exposure (extra index URLs, unscoped private names)", applies=DEP_MANIFESTS,
         **_py("dependency-confusion-check"),
         adapt=classified_list("type", {"pip-extra-index-url": "high", "npm-unscoped-private-dependency": "high"},
                               headlines={"pip-extra-index-url": "--extra-index-url lets a public package with your internal name win",
                                          "npm-unscoped-private-dependency": "Unscoped private npm dependency can be claimed on the public registry"})),
    dict(id="node-version-drift", venture="node-version-drift-check", category="supply-chain",
         title="End-of-life or disagreeing Node.js versions", applies=NODE_PINS,
         runtime="node", entry="node-version-drift-check/cli.mjs", args=[".", "--format", "json"], adapt=node_version_drift),
    dict(id="dependabot-config", venture="dependabot-config-check", category="supply-chain",
         title="Dependabot missing or not covering every ecosystem", applies=DEPENDABOT_TRIGGERS,
         runtime="node", entry="dependabot-config-check/cli.mjs", args=[".", "--format", "json"], adapt=dependabot_config),

    # Application code
    dict(id="jwt-verification-misuse", venture="jwt-verification-misuse-check", category="code",
         title="JWT signature or claim verification switched off", applies=PY_JS_TS, **_py("jwt-verification-misuse-check"),
         adapt=classified_list("type", {
             "jwt-alg-none": "high", "jwt-verify-disabled": "high", "jwt-decode-without-verify": "high",
             "jwt-user-controlled-key": "high", "jwt-hardcoded-secret": "high", "jwt-weak-secret": "medium",
             "jwt-algorithms-not-pinned": "medium", "jwt-expiry-disabled": "medium", "jwt-not-before-disabled": "low",
         })),
    dict(id="regex-redos", venture="regex-redos-check", category="code",
         title="Regular expressions open to catastrophic backtracking (ReDoS)", applies=PY_JS_TS,
         runtime="node", entry="regex-redos-check/cli.mjs", args=["scan", ".", "--json"], adapt=regex_redos),

    # AI coding agents
    dict(id="agent-permission-config", venture="agent-permission-config-check", category="ai-agents",
         title="Over-broad AI agent permissions and MCP servers", applies=AGENT_CONFIGS,
         runtime="node", entry="agent-permission-config-check/cli.mjs", args=["check", "--root", ".", "--json"],
         adapt=agent_permission_config),
]

BY_ID = {c["id"]: c for c in CHECKS}
