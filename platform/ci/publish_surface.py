#!/usr/bin/env python3
"""Derive, from the workflow files, what a merge to `main` can publish.

    python3 platform/ci/publish_surface.py           # the table
    python3 platform/ci/publish_surface.py --json    # machine-readable
    python3 platform/ci/publish_surface.py --check   # compare to the snapshot

This answers a factual question -- what does a merge to `main` actually
publish? -- from the workflow files. It does not block merging product
code. Agents merge product PRs; this tool says whether that merge also
goes live. The answer used to be hand-derived into prose in four places
and then frozen:

  - `portfolio/ledger/asks.yaml`, as free-text `unlocks:` strings
  - `CLAUDE.md`'s agent-decidable list, which names no ventures at all
  - `portfolio/research/a11y-contrast-decidability/README.md` ("that venture
    has no deploy workflow")
  - two 2026-08-20 ledger entries that each re-derived the same table by hand

Frozen prose about a live configuration goes stale silently. `asks.yaml`'s
`next-16-upgrade` note asserted that #372 was "owner-gated only because merging
fires deploys to live sites"; on the evidence below no such deploy fires, and
nothing turned red when that sentence stopped being true. Adding a deploy
workflow, or deleting one `if:` gate, would falsify all four claims the same
way.

So this derives the surface instead of restating it, and `--check` pins the
result so the next change to it has to be deliberate.

## What counts as publishing

A step publishes if it matches `PUBLISH_ACTIONS` (by `uses:` prefix) or
`PUBLISH_COMMANDS` (by `run:` substring). Both lists are explicit and
deliberately narrow: this tool can only recognise mechanisms it has been told
about, so a novel one would be missed. That limit is the reason `--check`
compares the whole table rather than a summary count -- a new workflow shows up
as an unexpected entry even when its steps are unrecognised, because the
snapshot also records the workflows that publish *nothing*.

## What counts as reachable

Reachable means: `on:` includes `push` matching the default branch, and the
publishing step carries no `if:` gate at either the job or the step level. A
publish that fires only on `workflow_dispatch`, or only when an owner-set
secret or variable is non-empty, is not something a merge does.

Four classifications result, and only the first means a merge publishes:

  live         reachable on a push to `main`, ungated
  gated        reachable trigger, but every publish step is behind an `if:`
  dispatch     publishes, but no push trigger can reach it
  none         no publishing step at all

## GitOps is also a publish surface

Everything above reads `.github/workflows/`, which was the whole delivery path
when this tool was written. It stopped being so on 2026-08-29, when the
portfolio site moved to the hel1 cluster: Argo CD watches `main` and syncs
`gitops/`, so a manifest merged to `main` *is* the deploy. No workflow runs, no
`uses:` matches, and this tool reported "no workflow publishes anything on a
push to main" -- true of workflows, and the wrong answer to the question in the
first line of this docstring.

That mattered because the answer is load-bearing. `portfolio/DIRECTION.md`
gates "deploy beats another build" on this tool reporting nothing live, so an
instrument blind to the portfolio's own chosen delivery path kept the gate shut
by construction, and would have gone on reporting nothing live on the day the
site went up. This is the same failure the tool was built to prevent -- a frozen
claim about a live configuration -- arriving from the direction the tool could
not see.

So `gitops_survey()` reads the Argo `Application` resources too, and the same
four words classify them:

  live         syncs `main` automatically and at least one hostname answers
  gated        has hostnames, but every one fails closed on a Secret git lacks
  dispatch     no automated sync policy, so a human must press Sync
  none         reaches no public Ingress

Classification is computed **per hostname** and the Application takes the best
state any of them reaches. Per-Application was the first cut and it was wrong
here: `gitops/prod` holds the content site on `tools.marisstella.dev`, whose pod
clones the repo and waits on the unsealed token, *and* an annotation-only 301
for the apex and `www`, which needs no workload and no Secret. Lumping them
together reported all three as blocked -- the same conflation the 2026-08-30
ledger entry made in prose. Two of those three answer on merge today.

Which then needs saying out loud, because "2 of 3 hosts live" is a worse
falsehood than the one it replaced: both are 301s *to the blocked host*, so no
visitor reaches content either way. `dead_end_redirects()` derives that from the
annotation rather than leaving the reader to notice, and the table prints it
under the hosts it contradicts.

`--check` pins these rows beside the workflow ones, so sealing the token, or
adding a second public host, has to be a deliberate change here as well.

## The `gh-pages` branch is a third publish surface, and a staler one

`platform/pages/publish-branch.sh` builds the site here and commits it to an
orphan `gh-pages` branch, so serving it needs neither an Actions runner nor the
k3s cluster -- which on 2026-09-05 was the only one of the three routes
downstream of nothing that was down. That makes it the likeliest route to a
public surface, and it was invisible to this tool for the same reason Argo CD
was: it publishes without a workflow and without a manifest.

It differs from both in a way that matters here. The workflow and gitops
surfaces describe what a merge *would* do, and are therefore true until someone
edits them. This one is a **snapshot already taken**: the branch holds a build
of one particular commit, and every later merge to `main` silently widens the
gap between what is staged and what the repository says. On 2026-09-05 the
staged artifact was a build of #3334, whose share-link feature was broken in
exactly the way `regen.mjs` exists to catch -- and nothing anywhere reported
that the thing the owner was being asked to serve was a build of a red commit.

So `pages_branch_survey()` reports the staleness rather than asserting
freshness, and three of its four states are deliberately not failures:

  current        built from the tip of `main`; serving it serves today's repo
  behind         built from an ancestor, N commits back
  unfetched      no local `gh-pages` ref -- says nothing about whether one exists
  unknown        a ref, but no parseable source commit in its message

`unfetched` carries its own warning because CI clones are shallow and do not
fetch this branch: an absent measurement must never read as "no artifact is
staged", which is the direction the whole 2026-08-30..09-04 "nothing is served"
episode failed in.

These rows are deliberately **not** pinned by `--check`. The other two surfaces
change only when a human edits a file, so freezing them is what makes an
unintended change visible; this one changes on every merge to `main`, so pinning
it would fail `--check` constantly and teach everyone to re-run `--write`
without reading it. Staleness is a reading to print, not an invariant to hold.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO / ".github" / "workflows"
SNAPSHOT = Path(__file__).resolve().parent / "publish-surface.yaml"

DEFAULT_BRANCH = "main"

# Actions that transmit an artifact to a destination outside this repository.
# Matched as a prefix of `uses:`, so a SHA pin or version tag still matches.
#
# `actions/upload-pages-artifact` is deliberately absent: it hands a tarball to
# the Actions artifact store, which `actions/deploy-pages` then publishes. The
# upload alone reaches no audience, and treating it as a publish would mark
# retail-pilot-intel live on a run whose deploy job demonstrably skipped.
PUBLISH_ACTIONS = (
    "cloudflare/wrangler-action",
    "actions/deploy-pages",
    "amondnet/vercel-action",
    "JamesIves/github-pages-deploy-action",
    "peaceiris/actions-gh-pages",
    "pypa/gh-action-pypi-publish",
    "docker/build-push-action",
    "softprops/action-gh-release",
    "ncipollo/release-action",
)

# Substrings of a `run:` block that ship something outward.
PUBLISH_COMMANDS = (
    "npm publish",
    "pnpm publish",
    "yarn publish",
    "npm run deploy",
    "pnpm deploy",
    "pnpm run deploy",
    "wrangler pages deploy",
    "wrangler deploy",
    "vercel --prod",
    "vercel deploy",
    "netlify deploy",
    "firebase deploy",
    "twine upload",
    "docker push",
    "gh release create",
    "aws s3 sync",
    "aws s3 cp",
    "gcloud app deploy",
    "gcloud run deploy",
    # This repository's own publisher, and the one route here that reaches an
    # audience without `actions/deploy-pages`. `platform/pages/publish-branch.sh`
    # force-pushes the built site to the `gh-pages` branch, which GitHub serves
    # directly when Settings -> Pages -> Source is "Deploy from a branch".
    #
    # It is listed for the same reason the `gitops/` Argo surface had to be
    # taught to this tool (see the header): a merge that reaches users through
    # a mechanism this list does not name is reported as publishing *nothing*,
    # and that answer is indistinguishable from a workflow that genuinely
    # publishes nothing. The script only pushes when invoked with `PUSH=1`, so
    # a step that runs it with `PUSH=0` is a build-and-verify and is classified
    # by its own `if:` gate like any other.
    "publish-branch.sh",
)

# `platform/pages/publish-branch.sh` refuses to run without this, because it
# rewrites a branch. That makes it a reliable marker of a step that actually
# invokes the script, as opposed to one that merely names the file -- see
# `publish_marker`.
CONFIRM_TOKEN = "publish-pages-branch"

CLASSIFICATIONS = ("live", "gated", "dispatch", "none")


class DuplicateKeyError(yaml.YAMLError):
    """A mapping in the document repeats a key."""


class _StrictLoader(yaml.SafeLoader):
    """SafeLoader that rejects duplicate mapping keys rather than keeping the last.

    Shares `validate_workflows.py`'s reasoning: PyYAML keeps the last of a
    repeated key, so a second `if:` on a job would silently replace the gate
    this tool is reading.
    """

    def construct_mapping(self, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            try:
                duplicate = key in seen
            except TypeError:  # unhashable key; SafeLoader reports it itself
                continue
            if duplicate:
                raise DuplicateKeyError(f"duplicate key {key!r} at {key_node.start_mark}")
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


def _triggers(data):
    """Return the `on:` block, tolerating YAML 1.1 resolving `on` to True."""
    if "on" in data:
        return data["on"]
    return data.get(True)


def pushes_to_default_branch(data) -> bool:
    """Does a push to the default branch start this workflow?

    A `push` trigger with no `branches` filter matches every branch, including
    the default one, so absence of a filter is reachable rather than unknown.
    """
    on = _triggers(data)
    if isinstance(on, str):
        return on == "push"
    if isinstance(on, list):
        return "push" in on
    if not isinstance(on, dict):
        return False
    if "push" not in on:
        return False
    push = on["push"]
    if not isinstance(push, dict):
        return True
    branches = push.get("branches")
    if branches is None:
        return "branches-ignore" not in push
    if isinstance(branches, str):
        branches = [branches]
    return DEFAULT_BRANCH in branches


def publish_marker(step) -> str | None:
    """Name the publishing mechanism in this step, or None if it has none."""
    if not isinstance(step, dict):
        return None
    uses = step.get("uses")
    if isinstance(uses, str):
        for action in PUBLISH_ACTIONS:
            if uses.startswith(action):
                return f"uses {action}"
    run = step.get("run")
    if isinstance(run, str):
        for command in PUBLISH_COMMANDS:
            if command not in run:
                continue
            # `publish-branch.sh` is the one entry here that is a path in this
            # repository rather than a third-party command, so a bare substring
            # match also hits steps that merely *name* the file. Two checks
            # narrow it to a step that actually publishes, and both come from
            # the script's own contract rather than from how it happens to be
            # spelled today:
            #
            # 1. It refuses to run without `CONFIRM=publish-pages-branch`, so a
            #    step that does not set that token cannot be running it. This
            #    is what separates a real invocation from the `shellcheck`
            #    step in `hetzner-gitops-ci.yml`, which passes the path as an
            #    argument to a linter -- without this, adding the script to
            #    this list reclassified that whole workflow as `live`, i.e. a
            #    false claim that every merge to main publishes the site.
            # 2. It transmits nothing unless invoked with `PUSH=1`. A step
            #    running it with `PUSH=0` is a build-and-verify, and reporting
            #    that as a publisher would print its `if:` gate as the
            #    condition under which the site goes live -- for the verify
            #    half of a two-step publisher, the *negation* of the real one.
            #
            # Both read literals only. An expression this tool cannot evaluate
            # leaves the step classified as a publisher, which is the safe
            # direction to be wrong in.
            if command == "publish-branch.sh":
                env = step.get("env") or {}
                confirm = f"{CONFIRM_TOKEN}" in run or str(
                    env.get("CONFIRM", "")
                ).strip() == CONFIRM_TOKEN
                if not confirm:
                    continue
                if str(env.get("PUSH", "")).strip() == "0":
                    continue
            return f"runs {command!r}"
    return None


def _gate(value) -> str | None:
    """Normalise an `if:` value to a comparable string, or None if absent."""
    if value is None:
        return None
    return " ".join(str(value).split())


def publish_steps(data) -> list[dict]:
    """Every publishing step in the workflow, with the gates guarding it."""
    found = []
    jobs = data.get("jobs")
    if not isinstance(jobs, dict):
        return found
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        job_gate = _gate(job.get("if"))
        steps = job.get("steps")
        if not isinstance(steps, list):
            continue
        for step in steps:
            marker = publish_marker(step)
            if marker is None:
                continue
            gates = [g for g in (job_gate, _gate(step.get("if"))) if g]
            found.append({"job": job_name, "step": marker, "gates": gates})
    return found


def classify(data) -> tuple[str, list[dict]]:
    steps = publish_steps(data)
    if not steps:
        return "none", steps
    if not pushes_to_default_branch(data):
        return "dispatch", steps
    if any(not step["gates"] for step in steps):
        return "live", steps
    return "gated", steps


def survey() -> tuple[list[dict], list[str]]:
    """Classify every workflow file. Returns (rows, errors)."""
    rows, errors = [], []
    paths = sorted(p for p in WORKFLOWS.iterdir() if p.suffix in {".yml", ".yaml"})
    for path in paths:
        name = path.name
        try:
            data = yaml.load(path.read_text(), Loader=_StrictLoader)
        except yaml.YAMLError as exc:
            errors.append(f"{name}: unreadable, so its publish surface is unknown -- {exc}")
            continue
        if not isinstance(data, dict):
            errors.append(f"{name}: top level is not a mapping")
            continue
        classification, steps = classify(data)
        rows.append({"workflow": name, "classification": classification, "publishes": steps})
    return rows, errors


def render(rows) -> str:
    by_class = {c: [r for r in rows if r["classification"] == c] for c in CLASSIFICATIONS}
    out = ["What a merge to `main` can publish", ""]
    live = by_class["live"]
    if live:
        out.append(f"  {len(live)} workflow(s) publish on a push to {DEFAULT_BRANCH}, ungated:")
        for row in live:
            for step in row["publishes"]:
                out.append(f"    {row['workflow']}  [{step['job']}] {step['step']}")
    else:
        out.append(f"  No workflow publishes anything on a push to {DEFAULT_BRANCH}.")
    out.append("")

    for classification, heading in (
        ("gated", "publish only behind an owner-set gate"),
        ("dispatch", "publish, but no push trigger reaches them"),
    ):
        group = by_class[classification]
        if not group:
            continue
        out.append(f"  {len(group)} workflow(s) {heading}:")
        for row in group:
            out.append(f"    {row['workflow']}")
            for step in row["publishes"]:
                gates = "; ".join(step["gates"]) or "no gate"
                out.append(f"      [{step['job']}] {step['step']}")
                out.append(f"        gated by: {gates}")
        out.append("")

    out.append(f"  {len(by_class['none'])} workflow(s) publish nothing at all.")
    out.append("")
    out.append(
        "  Recognises only the mechanisms in PUBLISH_ACTIONS/PUBLISH_COMMANDS; a "
        "novel\n  one would be missed, which is why --check pins every workflow "
        "and not a count."
    )
    return "\n".join(out)


# ---------------------------------------------------------------- GitOps
#
# Argo CD is the portfolio's other delivery path, and the one the public site
# actually uses. See "GitOps is also a publish surface" in the module docstring
# for why a tool about workflows grew a second reader.

GITOPS = REPO / "gitops"

# This repository, as an Argo `repoURL` spells it. Compared case-insensitively
# with any `.git` suffix and scheme stripped, because an Application pointing at
# a *different* repo (the ingress-nginx or cert-manager charts, say) is somebody
# else's artifact and not something a merge here publishes.
REPO_REMOTE = "github.com/duncan-haywood/monorepo-projects"


def _normalise_remote(url) -> str:
    if not isinstance(url, str):
        return ""
    text = url.strip().lower()
    for prefix in ("https://", "http://", "ssh://", "git@"):
        if text.startswith(prefix):
            text = text[len(prefix) :]
    return text.removesuffix(".git").rstrip("/").replace(":", "/")


def _documents(path):
    """Every YAML document in a file, skipping ones that are not mappings."""
    try:
        loaded = list(yaml.safe_load_all(path.read_text()))
    except yaml.YAMLError:
        return []
    return [d for d in loaded if isinstance(d, dict)]


def _kustomize_resources(directory):
    """The files a `kustomization.yaml` actually applies, resolved to paths.

    Presence of a file on disk is not the question. `gitops/prod/secrets/`
    holds `portfolio-repo-token.template.yaml`, which is a *template* the owner
    fills in and seals -- it is committed, and it is deliberately absent from
    the kustomization, so nothing it names exists in the cluster. Reading the
    directory instead of the resource list would report the site's clone token
    as provided and the whole deploy as live, which is the one answer this
    section exists to get right.
    """
    kustomization = directory / "kustomization.yaml"
    if not kustomization.is_file():
        # No kustomization: Argo applies every manifest in the directory.
        return sorted(p for p in directory.glob("*.yaml") if p.name != "kustomization.yaml")
    data = yaml.safe_load(kustomization.read_text()) or {}
    resources = data.get("resources")
    if not isinstance(resources, list):
        return []
    paths = []
    for entry in resources:
        if not isinstance(entry, str):
            continue
        target = (directory / entry).resolve()
        if target.is_file():
            paths.append(target)
        elif target.is_dir():
            paths.extend(_kustomize_resources(target))
    return paths


def _walk(node):
    """Every mapping nested anywhere inside a manifest."""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


# ingress-nginx annotations that make the controller answer the request itself.
# An Ingress carrying one never reaches its backend Service, so whatever the
# backend needs to start is irrelevant to whether that hostname responds.
#
# This distinction is not academic. `gitops/prod` holds two Ingresses that both
# name the `portfolio-site` Service: the content site on `tools.marisstella.dev`,
# whose pod clones the repo and therefore waits on the unsealed token, and the
# apex redirect on `marisstella.dev` / `www.marisstella.dev`, which is
# annotation-only ("no volume, no workload and no secret", per its own comment).
# Classifying per Application rather than per host reported all three as blocked
# on `portfolio-site-repo` -- the same conflation the 2026-08-30 ledger entry
# made in prose when it said "the apex redirect goes live on the same sealed
# clone token the site itself already waits on". Two of those three hosts go
# live on merge, today, with nothing sealed.
REDIRECT_ANNOTATIONS = (
    "nginx.ingress.kubernetes.io/permanent-redirect",
    "nginx.ingress.kubernetes.io/temporal-redirect",
)


def _serves_its_own_response(ingress) -> bool:
    annotations = ingress.get("metadata", {}).get("annotations") or {}
    return any(key in annotations for key in REDIRECT_ANNOTATIONS)


def _backend_services(ingress) -> set[str]:
    names = set()
    for rule in ingress.get("spec", {}).get("rules") or []:
        if not isinstance(rule, dict):
            continue
        http = rule.get("http") or {}
        for entry in http.get("paths") or []:
            if not isinstance(entry, dict):
                continue
            service = (entry.get("backend") or {}).get("service") or {}
            if isinstance(service.get("name"), str):
                names.add(service["name"])
    return names


def _workload_secrets_by_service(docs) -> dict[str, set[str]]:
    """Secrets each Service's backing workload must mount to start.

    Matched by name rather than by label selector: everything in this tree names
    its Deployment and its Service alike, and a selector walk would add a second
    thing to keep true for no gain in what it can decide.
    """
    by_name = {}
    for doc in docs:
        if doc.get("kind") not in {"Deployment", "StatefulSet", "DaemonSet"}:
            continue
        name = doc.get("metadata", {}).get("name")
        if isinstance(name, str):
            by_name.setdefault(name, set()).update(mounted_secrets([doc]))
    return by_name


def public_hosts(docs) -> list[str]:
    """Ingress hostnames in these manifests — the surface a stranger can reach."""
    hosts = []
    for doc in docs:
        if doc.get("kind") != "Ingress":
            continue
        for rule in doc.get("spec", {}).get("rules") or []:
            if isinstance(rule, dict) and isinstance(rule.get("host"), str):
                hosts.append(rule["host"])
    return sorted(set(hosts))


def host_rows(docs) -> list[dict]:
    """One row per public hostname, with what it needs before it answers."""
    provided = provided_secrets(docs)
    tls = _tls_secret_names(docs)
    secrets_for = _workload_secrets_by_service(docs)
    rows = {}
    for doc in docs:
        if doc.get("kind") != "Ingress":
            continue
        if _serves_its_own_response(doc):
            needed = set()
            serves = "redirect"
        else:
            serves = "workload"
            needed = set()
            for service in _backend_services(doc):
                needed |= secrets_for.get(service, set())
        unmet = sorted(needed - provided - tls)
        for rule in doc.get("spec", {}).get("rules") or []:
            if not isinstance(rule, dict) or not isinstance(rule.get("host"), str):
                continue
            rows[rule["host"]] = {
                "host": rule["host"],
                "serves": serves,
                "unmet_secrets": unmet,
            }
    return [rows[h] for h in sorted(rows)]


def _tls_secret_names(docs) -> set[str]:
    """Ingress `tls.secretName`s.

    Excluded from the unmet-Secret test on purpose: cert-manager mints these
    from the ClusterIssuer when the Ingress is admitted, so they are correctly
    absent from git and their absence blocks nothing.
    """
    names = set()
    for doc in docs:
        if doc.get("kind") != "Ingress":
            continue
        for entry in doc.get("spec", {}).get("tls") or []:
            if isinstance(entry, dict) and isinstance(entry.get("secretName"), str):
                names.add(entry["secretName"])
    return names


def mounted_secrets(docs) -> set[str]:
    """Secret names a workload needs in order to start."""
    names = set()
    for doc in docs:
        for node in _walk(doc):
            ref = node.get("secretKeyRef") or node.get("secretRef")
            if isinstance(ref, dict) and isinstance(ref.get("name"), str):
                names.add(ref["name"])
            secret = node.get("secret")
            if isinstance(secret, dict) and isinstance(secret.get("secretName"), str):
                names.add(secret["secretName"])
    return names


def provided_secrets(docs) -> set[str]:
    """Secret names git supplies, sealed or plain."""
    names = set()
    for doc in docs:
        if doc.get("kind") not in {"Secret", "SealedSecret"}:
            continue
        name = doc.get("metadata", {}).get("name")
        if isinstance(name, str):
            names.add(name)
    return names


def redirect_targets(docs) -> dict[str, str]:
    """Each redirecting hostname mapped to the host it sends visitors to."""
    targets = {}
    for doc in docs:
        if doc.get("kind") != "Ingress" or not _serves_its_own_response(doc):
            continue
        annotations = doc.get("metadata", {}).get("annotations") or {}
        target = next(
            (annotations[k] for k in REDIRECT_ANNOTATIONS if isinstance(annotations.get(k), str)),
            None,
        )
        if not target:
            continue
        host = _normalise_remote(target).split("/")[0]
        for rule in doc.get("spec", {}).get("rules") or []:
            if isinstance(rule, dict) and isinstance(rule.get("host"), str):
                targets[rule["host"]] = host
    return targets


def dead_end_redirects(rows) -> list[str]:
    """Redirect hosts whose destination is itself blocked.

    A 301 answers on merge, so per-host it is correctly `live` — but a visitor
    following it lands on a host that serves nothing, and "two of three hosts
    are live" then reads as a working public URL when there is none. The whole
    point of this tool is that nobody has to hold that distinction in their
    head, so it derives it: the redirect target is in the annotation, and
    whether that target is blocked is already computed one row over.
    """
    problems = []
    for row in rows:
        by_host = {h["host"]: h for h in row["hosts"]}
        for host, target in (row.get("redirects") or {}).items():
            blocked = by_host.get(target, {}).get("unmet_secrets") or []
            if blocked:
                problems.append(
                    f"{row['application']}: https://{host}/ answers on merge but 301s to "
                    f"https://{target}/, which is waiting on Secret "
                    f"{', '.join(blocked)}. No visitor reaches content until that is sealed."
                )
    return problems


def classify_application(app, docs) -> tuple[str, dict]:
    """Classify one Argo Application against the same four words as a workflow.

    The Application takes the best state any of its hosts reaches, because the
    question is "does a merge publish anything?" and one answering hostname is
    enough for yes. The per-host rows carry the rest, so a `live` Application
    with a blocked host still shows which is which rather than rounding to one
    word.
    """
    hosts = host_rows(docs)
    automated = bool(app.get("spec", {}).get("syncPolicy", {}).get("automated"))
    unmet = sorted({s for h in hosts for s in h["unmet_secrets"]})
    detail = {"hosts": hosts, "unmet_secrets": unmet, "redirects": redirect_targets(docs)}
    if not hosts:
        return "none", detail
    if not automated:
        return "dispatch", detail
    if any(not host["unmet_secrets"] for host in hosts):
        return "live", detail
    return "gated", detail


def gitops_survey() -> tuple[list[dict], list[str]]:
    """Classify every Argo Application that syncs this repository."""
    rows, errors = [], []
    if not GITOPS.is_dir():
        return rows, errors
    for path in sorted(GITOPS.rglob("*.yaml")):
        for doc in _documents(path):
            if doc.get("kind") != "Application":
                continue
            source = doc.get("spec", {}).get("source") or {}
            if _normalise_remote(source.get("repoURL")) != REPO_REMOTE:
                continue
            if source.get("targetRevision") not in (DEFAULT_BRANCH, "HEAD", None):
                continue
            synced = source.get("path")
            if not isinstance(synced, str):
                continue
            directory = (REPO / synced).resolve()
            if not directory.is_dir():
                errors.append(f"{path.name}: syncs {synced!r}, which is not a directory")
                continue
            docs = [d for f in _kustomize_resources(directory) for d in _documents(f)]
            classification, detail = classify_application(doc, docs)
            rows.append(
                {
                    "application": doc.get("metadata", {}).get("name") or path.stem,
                    "path": synced,
                    "classification": classification,
                    "hosts": detail["hosts"],
                    "unmet_secrets": detail["unmet_secrets"],
                    "redirects": detail["redirects"],
                }
            )
    rows.sort(key=lambda r: r["application"])
    return rows, errors


def render_gitops(rows) -> str:
    out = ["", f"What a merge to `{DEFAULT_BRANCH}` deploys through Argo CD", ""]
    if not rows:
        out.append("  No Argo Application in gitops/ syncs this repository.")
        return "\n".join(out)
    for classification, heading in (
        ("live", "serve a public host on merge, synced automatically"),
        ("gated", "would serve a public host but every one fails closed"),
        ("dispatch", "serve a public host but need a manual Argo sync"),
    ):
        group = [r for r in rows if r["classification"] == classification]
        if not group:
            continue
        out.append(f"  {len(group)} Application(s) {heading}:")
        for row in group:
            out.append(f"    {row['application']}  ({row['path']})")
            for host in row["hosts"]:
                # "would serve", not "serves". This tool reads manifests; it
                # never makes a request, so it cannot know whether anything is
                # listening. Saying "serves content" here is how CLAUDE.md came
                # to assert the apex was serving 169 tools while every hostname
                # refused connections on 443 (measured 2026-09-04, run
                # 33887885219). `platform/ci/public_surface.py` is the tool that
                # can answer the other question; this wording sends you there.
                note = (
                    "301 redirect at the ingress"
                    if host["serves"] == "redirect"
                    else "would serve content once synced"
                )
                if host["unmet_secrets"]:
                    note += f", waiting on Secret {', '.join(host['unmet_secrets'])}"
                    mark = "-"
                else:
                    mark = "+"
                out.append(f"      {mark} https://{host['host']}/  ({note})")
        out.append("")
    quiet = [r for r in rows if r["classification"] == "none"]
    out.append(f"  {len(quiet)} Application(s) reach no public Ingress.")
    dead_ends = dead_end_redirects(rows)
    if dead_ends:
        out.append("")
        out.append("  No stranger can reach content yet, despite the hosts marked + above:")
        for problem in dead_ends:
            out.append(f"    - {problem}")
    return "\n".join(out)


PAGES_BRANCH = "gh-pages"

# The message `publish-branch.sh` writes. Matched rather than assumed: a commit
# on this branch that does not carry it was not written by that script, and
# calling its tree "the staged site" would be a guess.
_PAGES_SOURCE_RE = re.compile(r"^Publish site built from ([0-9a-f]{7,40})\b", re.MULTILINE)


def _git(*args: str) -> str | None:
    """Run git in the repo, or return None if it fails for any reason.

    Every caller below treats None as "cannot tell", never as "no". This tool
    is otherwise hermetic -- it reads files and opens no sockets -- and git is
    the one exception, so it is kept to this single choke point where a missing
    binary, a bare tree, or a shallow clone all degrade to the same honest
    answer instead of a traceback.
    """
    try:
        done = subprocess.run(
            ("git", "-C", str(REPO), *args),
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if done.returncode != 0:
        return None
    return done.stdout.strip()


def _resolve(*refs: str) -> tuple[str, str] | None:
    for ref in refs:
        sha = _git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
        if sha:
            return ref, sha
    return None


# The remote-tracking ref comes FIRST in both lookups below, and the order is
# the whole correctness of this reading (measured 2026-09-11).
#
# It used to prefer `refs/heads/`, and in a web session that is reliably the
# wrong ref. The clone arrives carrying a local `main` at whatever commit the
# session branch was cut from, and `git fetch origin main` -- the command
# CLAUDE.md tells every session to run before reading anything -- updates only
# `refs/remotes/origin/main`. So the local ref goes stale on the *default* path
# here, not in some corner case.
#
# Measured on this checkout: `gh-pages` was staged from ff63c5d55, which was
# the tip of `origin/main`, and the local `main` sat 6829 commits away on a
# diverged branch. The tool reported the live deploy route as "6829 commit(s)
# behind `main`" and told the reader to restage an artifact that was already
# current.
#
# That direction merely wastes a publish. The other direction is the one worth
# the comment: when the stale local ref is BEHIND the snapshot's source commit,
# `rev-list --count source..main` is 0 and the row renders `current` -- an
# artifact that really is lagging `main` reading as fresh, which is precisely
# the silent failure ("the live site silently lagging `main`, with no error
# anywhere to say so") that this whole section exists to make visible.
#
# `refs/heads/` stays as the fallback rather than being dropped: a CI clone
# that fetched only the branch under test may have no remote-tracking ref at
# all, and a local ref is a better answer there than `unfetched`. For the
# artifact the same order is right for a second reason -- serving reads the
# *pushed* branch, so a local `gh-pages` that was built and never pushed is not
# what a visitor receives.
def pages_branch_survey() -> dict:
    """What the `gh-pages` branch has staged, and how far behind `main` it is."""
    found = _resolve(f"refs/remotes/origin/{PAGES_BRANCH}", f"refs/heads/{PAGES_BRANCH}")
    if not found:
        # Not "there is no artifact". A shallow CI clone fetches one branch, so
        # this is the expected reading there and it must not be reported as an
        # absence of staged content.
        return {"branch": PAGES_BRANCH, "state": "unfetched", "source": None, "behind": None}

    ref, tip = found
    message = _git("log", "-1", "--format=%B", tip) or ""
    match = _PAGES_SOURCE_RE.search(message)
    if not match:
        return {"branch": PAGES_BRANCH, "state": "unknown", "source": None, "behind": None, "ref": ref, "tip": tip}

    source = match.group(1)
    main = _resolve(f"refs/remotes/origin/{DEFAULT_BRANCH}", f"refs/heads/{DEFAULT_BRANCH}")
    row = {"branch": PAGES_BRANCH, "source": source, "ref": ref, "tip": tip, "behind": None}
    if not main:
        row["state"] = "unknown"
        return row

    # `--count <source>..<main>` needs both objects present. In a shallow clone
    # the source commit is usually not, and that failure is indistinguishable
    # here from a source commit that was force-pushed away -- so both land on
    # "unknown" rather than on a number that would be wrong in one of the cases.
    behind = _git("rev-list", "--count", f"{source}..{main[1]}")
    if behind is None or not behind.isdigit():
        row["state"] = "unknown"
        return row

    row["behind"] = int(behind)
    row["state"] = "current" if row["behind"] == 0 else "behind"
    return row


def render_pages_branch(row) -> str:
    out = ["", f"What the `{PAGES_BRANCH}` branch has staged for a branch-source Pages flip", ""]
    state = row["state"]
    if state == "unfetched":
        out.append(f"  No local `{PAGES_BRANCH}` ref, so nothing can be said about it here.")
        out.append("  This is the normal reading in a shallow clone; it is not evidence")
        out.append(f"  that no artifact is staged. `git fetch origin {PAGES_BRANCH}` to look.")
        return "\n".join(out)
    if state == "unknown":
        out.append(f"  `{PAGES_BRANCH}` exists but its source commit could not be determined,")
        out.append("  so how stale it is cannot be read. Re-run platform/pages/publish-branch.sh")
        out.append("  to restage it from a known commit.")
        return "\n".join(out)

    behind = row["behind"]
    if state == "current":
        out.append(f"  + built from {row['source'][:9]}, the tip of `{DEFAULT_BRANCH}`.")
        out.append("    Serving it would serve today's repository.")
    else:
        out.append(f"  - built from {row['source'][:9]}, which is {behind} commit(s) behind `{DEFAULT_BRANCH}`.")
        out.append("    Serving it would serve the repository as of that commit, not as of now.")
        out.append("    Re-run platform/pages/publish-branch.sh to restage it.")
    # Said in both cases, because staleness and servedness are different
    # questions and this tool can only answer the first.
    #
    # This block used to assert the second one anyway: "Staged, not served:
    # enabling Pages is the account owner's decision". That was written to stop
    # a fresh artifact being misread as a live site -- a mistake this repository
    # really had made -- and it was true when written. It became false on
    # 2026-09-06, when GitHub's own managed builder ran on `gh-pages` and
    # succeeded, which happens only for the configured Pages source. So the
    # branch IS served and `deploy-settings` IS granted, while this tool went on
    # telling every session the opposite.
    #
    # The bug is not the stale date, it is the shape: a tool that reads git and
    # the manifests, and never the Pages API, stated a conclusion about the
    # Pages API. Guarding against overclaiming by hard-coding the *negative*
    # claim is still a claim, and it fails in the more expensive direction --
    # it invites a duplicate owner ask for a switch already flipped, and ranks
    # a granted route as blocking. So this now says what it can see and names
    # the tool that measures the rest, rather than answering for it.
    out.append("")
    out.append("  Whether this artifact is actually SERVED is not visible from here:")
    out.append("  this tool reads git and the manifests, never the Pages API. A fresh")
    out.append("  artifact is not evidence of a live site, and a stale one is not")
    out.append("  evidence of a dark one. Ask the tool that measures it:")
    out.append("")
    out.append("      python3 platform/ci/pages_state.py      # read its `deployed` row")
    out.append("")
    out.append("  If that reports the branch is not the Pages source, the owner's flip is")
    out.append(f"  Settings -> Pages -> Source 'Deploy from a branch' -> {PAGES_BRANCH} / root.")
    return "\n".join(out)


def load_snapshot():
    if not SNAPSHOT.exists():
        return None
    return yaml.safe_load(SNAPSHOT.read_text())


def check_gitops(rows, snapshot) -> list[str]:
    """Compare the derived Argo surface to the committed snapshot.

    A snapshot written before this section existed has no `gitops:` key. That is
    not drift and must not read as "no Application publishes" -- it means the
    snapshot predates the reader, so say exactly that rather than reporting a
    clean comparison against nothing.
    """
    problems: list[str] = []
    if "gitops" not in snapshot:
        return [
            f"{SNAPSHOT.name} predates the GitOps section and cannot pin it; "
            f"re-run with --write to record the {len(rows)} Application(s) now derived."
        ]
    expected = {r["application"]: r for r in snapshot.get("gitops") or []}
    actual = {r["application"]: r for r in rows}

    for name in sorted(set(actual) - set(expected)):
        row = actual[name]
        problems.append(
            f"{name}: new Argo Application, classified {row['classification']!r} and not in "
            f"{SNAPSHOT.name}. Add it there once you have confirmed the classification is intended."
        )
    for name in sorted(set(expected) - set(actual)):
        problems.append(f"{name}: in {SNAPSHOT.name} but no longer an Application in gitops/")

    for name in sorted(set(actual) & set(expected)):
        want, got = expected[name], actual[name]
        if want.get("classification") != got["classification"]:
            problems.append(
                f"{name}: classification changed {want.get('classification')!r} -> "
                f"{got['classification']!r}. A merge to {DEFAULT_BRANCH} now deploys a "
                "different public surface than the snapshot records."
            )
            continue
        if (want.get("hosts") or []) != got["hosts"]:
            problems.append(
                f"{name}: public hosts changed. Expected {want.get('hosts') or []}, "
                f"derived {got['hosts']}."
            )
        if (want.get("unmet_secrets") or []) != got["unmet_secrets"]:
            problems.append(
                f"{name}: the Secrets it waits on changed. Expected "
                f"{want.get('unmet_secrets') or []}, derived {got['unmet_secrets']}."
            )
        if (want.get("redirects") or {}) != got.get("redirects", {}):
            problems.append(
                f"{name}: where its hostnames redirect changed. Expected "
                f"{want.get('redirects') or {}}, derived {got.get('redirects', {})}."
            )
    return problems


def check(rows, gitops_rows=None) -> list[str]:
    """Compare the derived surface to the committed snapshot.

    `gitops_rows=None` means the caller surveyed workflows only, so the Argo
    section is not compared. That is deliberately distinct from an empty list,
    which asserts that this repository has no Application at all and would
    report every pinned one as deleted.
    """
    problems: list[str] = []
    snapshot = load_snapshot()
    if snapshot is None:
        return problems + [f"{SNAPSHOT.name} is missing; run with --write to create it"]
    expected = {r["workflow"]: r for r in snapshot.get("workflows", [])}
    actual = {r["workflow"]: r for r in rows}

    for name in sorted(set(actual) - set(expected)):
        row = actual[name]
        problems.append(
            f"{name}: new workflow, classified {row['classification']!r} and not in "
            f"{SNAPSHOT.name}. Add it there once you have confirmed the classification is intended."
        )
    for name in sorted(set(expected) - set(actual)):
        problems.append(f"{name}: in {SNAPSHOT.name} but no longer present in .github/workflows/")

    for name in sorted(set(actual) & set(expected)):
        want, got = expected[name], actual[name]
        if want.get("classification") != got["classification"]:
            problems.append(
                f"{name}: classification changed {want.get('classification')!r} -> "
                f"{got['classification']!r}. A merge to {DEFAULT_BRANCH} now reaches a "
                "different set of publish steps than the snapshot records."
            )
            continue
        if (want.get("publishes") or []) != got["publishes"]:
            problems.append(
                f"{name}: publish steps or their `if:` gates changed. Expected "
                f"{want.get('publishes') or []}, derived {got['publishes']}."
            )
    if gitops_rows is None:
        return problems
    return problems + check_gitops(list(gitops_rows), snapshot)


# `vars.NAME` / `vars['NAME']` / `secrets.NAME` inside an `if:` expression.
#
# Secrets count alongside variables because the question this answers is "what
# one owner action arms this deploy", and a job gated on `secrets.X != ''` is
# armed by pasting that secret. Reading only `vars.` reported such a workflow as
# *ungated* -- the right verdict for the wrong reason, and the message then told
# the reader to add a gate the workflow already had.
_OWNER_SWITCH_REF = re.compile(
    r"(?:vars|secrets)\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*['\"]([A-Za-z_]\w*)['\"]\s*\])"
)

# Every action that replaces this repository's one Pages site. A subset of
# PUBLISH_ACTIONS, and it has to stay in step with it: matching only
# `actions/deploy-pages` left the invariant blind to a workflow that deployed
# with `peaceiris/actions-gh-pages` instead, which is the same single-instance
# resource reached by a different name.
PAGES_DEPLOY_ACTIONS = (
    "actions/deploy-pages",
    "JamesIves/github-pages-deploy-action",
    "peaceiris/actions-gh-pages",
)


def pages_deploy_gates(rows) -> dict[str, set[str]]:
    """
    Workflows that publish the repository's GitHub Pages site, mapped to the set of
    owner-set `vars.*` / `secrets.*` names that gate them.

    A workflow with no gating switch maps to the empty set: nothing has to be
    switched on for it to publish.
    """
    found = {}
    for row in rows:
        gates = set()
        deploys = False
        for step in row.get("publishes") or []:
            marker = step.get("step") or ""
            if not any(action in marker for action in PAGES_DEPLOY_ACTIONS):
                continue
            deploys = True
            for gate in step.get("gates") or []:
                gates.update(
                    name for pair in _OWNER_SWITCH_REF.findall(str(gate)) for name in pair if name
                )
        if deploys:
            found[row["workflow"]] = gates
    return found


def check_single_pages_deployer(rows) -> list[str]:
    """
    GitHub serves exactly one Pages site per repository, and `actions/deploy-pages`
    replaces the whole thing. Two workflows that both deploy are not two sites —
    they are two builds fighting over one origin, and the winner is whichever
    finishes last. A shared `concurrency` group would only make them take turns;
    the live site would still alternate between two different builds.

    The invariant is therefore about a single owner action: **no one variable flip
    may arm two Pages deployments.** Two workflows gated on *different* variables
    are a deliberate either/or — `retail-pilot-intel-deploy-docs.yml` is gated on
    `RETAIL_PILOT_INTEL_PAGES` precisely so the portfolio flip does not publish it —
    and that stays legal. Two gated on the *same* variable, or any that is ungated,
    is the bug.

    This is a real incident, not a hypothetical. On 2026-08-26 two sessions
    independently solved "the portfolio has no public URL" and both landed:
    `pages.yml` (#1724, a Python builder) and `portfolio-pages.yml` (#1718, a Node
    one). Each reasoned -- correctly, in isolation -- that it should reuse the
    existing `GITHUB_PAGES_ENABLED` variable rather than open a second owner ask.
    Neither could see the other.

    Both trigger on a push to `main`, both match `ventures/**`, and both call
    `actions/deploy-pages` against the single Pages site GitHub gives a repository.
    Their `concurrency:` groups differ, so GitHub does not serialise them: they run
    together and whichever finishes last wins. The owner's one flip would have
    published a site that changed nondeterministically between two different builds
    on every push.

    Nothing in the repo caught it, and nothing could have: both workflows are
    individually valid, both were correctly recorded in the snapshot as gated, and
    the collision is invisible until the moment someone sets the variable -- at
    which point it presents as a live site that flaps rather than as a failed
    deploy. The snapshot pins each workflow against its own past self; this looks
    across them.

    The same cadence that caused the incident then produced two implementations of
    this very check -- #1735's, hardened by #1762, and #1776's `check_one_origin_
    per_gate` -- with duplicate `PAGES_DEPLOY_ACTIONS` constants where the later
    definition silently rebound the earlier. They were consolidated here into one.
    """
    gated = pages_deploy_gates(rows)
    problems = []

    ungated = sorted(w for w, v in gated.items() if not v)
    if ungated and len(gated) > 1:
        problems.append(
            "these workflows deploy GitHub Pages with no owner-set variable or secret gating them: "
            + ", ".join(ungated)
            + ". With another deployer present they can publish over each other unbidden."
        )

    by_var = {}
    for workflow, variables in gated.items():
        for name in variables:
            by_var.setdefault(name, []).append(workflow)

    for name, workflows in sorted(by_var.items()):
        if len(workflows) > 1:
            problems.append(
                f"setting {name} would arm {len(workflows)} GitHub Pages deployments: "
                + ", ".join(sorted(workflows))
                + ". The repository has one Pages site, so they would race on every push and "
                "the live site would be whichever finished last. Exactly one workflow may keep "
                "its deploy job; the others should build and check only."
            )

    return problems


def write_snapshot(rows, gitops_rows=()) -> None:
    header = (
        "# Derived by platform/ci/publish_surface.py --write. Do not hand-edit.\n"
        "#\n"
        "# What a merge to `main` can publish, per workflow and per Argo\n"
        "# Application. `publish_surface.py --check` re-derives this from\n"
        "# .github/workflows/ and gitops/ and fails if it has moved, so the claim\n"
        "# that a venture \"deploys nothing\" cannot go stale without a check\n"
        "# turning red.\n"
        "#\n"
        "# classification: live | gated | dispatch | none  (see the module docstring)\n"
    )
    body = yaml.safe_dump(
        {"workflows": rows, "gitops": list(gitops_rows)}, sort_keys=False, width=100
    )
    SNAPSHOT.write_text(header + body)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--check", action="store_true", help="compare to the snapshot, for CI")
    parser.add_argument("--write", action="store_true", help="rewrite the snapshot")
    args = parser.parse_args()

    if not WORKFLOWS.is_dir():
        print(f"No {WORKFLOWS.relative_to(REPO)} directory; nothing to survey.")
        return 0

    rows, errors = survey()
    gitops_rows, gitops_errors = gitops_survey()
    errors = errors + gitops_errors
    if errors:
        print("Could not derive the publish surface:\n", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    # Ahead of both --write and the snapshot comparison. A second Pages deployer
    # is wrong whether or not the snapshot happens to record it, so `--write`
    # must not be the way past it -- which it was while this sat inside the
    # `--check` branch, contradicting the comment that said otherwise.
    conflicts = check_single_pages_deployer(rows)
    if conflicts:
        print("Publish-surface conflict:\n", file=sys.stderr)
        for conflict in conflicts:
            print(f"  - {conflict}", file=sys.stderr)
        return 1

    if args.write:
        write_snapshot(rows, gitops_rows)
        print(
            f"Wrote {SNAPSHOT.relative_to(REPO)} "
            f"({len(rows)} workflows, {len(gitops_rows)} Argo Applications)."
        )
        return 0

    if args.check:
        problems = check(rows, gitops_rows)
        if problems:
            print(f"{len(problems)} publish-surface change(s) not reflected in the snapshot:\n", file=sys.stderr)
            for problem in problems:
                print(f"  - {problem}", file=sys.stderr)
            print(
                "\nIf the change is intended, re-run with --write and say in the pull "
                "request what a merge can now publish.",
                file=sys.stderr,
            )
            return 1
        live = sum(1 for r in rows if r["classification"] == "live")
        # Count hostnames that actually put content in front of a visitor: a
        # hostname whose only job is to 301 somewhere blocked is not one of
        # them, and summarising by Application classification would report the
        # portfolio as publishing while every route dead-ends.
        dead_ends = dead_end_redirects(gitops_rows)
        serving = sum(
            1
            for row in gitops_rows
            for host in row["hosts"]
            if host["serves"] == "workload" and not host["unmet_secrets"]
        )
        summary = (
            f"Publish surface matches the snapshot ({len(rows)} workflows, {live} live; "
            f"{len(gitops_rows)} Argo Applications, {serving} hostname(s) configured to serve)."
        )
        print(summary)
        # Said on every clean run, because the failure this guards against is
        # a reader taking the line above as a statement about the live site.
        # It is not one: nothing here opens a socket.
        print(
            "  (Read from the manifests. For what the hostnames actually "
            "return, dispatch `Public surface check`.)"
        )
        for problem in dead_ends:
            print(f"  note: {problem}")
        return 0

    # Surveyed after --write and --check have returned, and deliberately absent
    # from both: see "The `gh-pages` branch is a third publish surface" in the
    # module docstring. Pinning a value that changes on every merge would make
    # --check cry wolf, and a --check nobody believes is worse than one that
    # says less.
    pages_row = pages_branch_survey()

    if args.json:
        print(
            json.dumps(
                {
                    "default_branch": DEFAULT_BRANCH,
                    "workflows": rows,
                    "gitops": gitops_rows,
                    "pages_branch": pages_row,
                },
                indent=2,
            )
        )
        return 0

    print(render(rows))
    print(render_gitops(gitops_rows))
    print(render_pages_branch(pages_row))
    return 0


if __name__ == "__main__":
    sys.exit(main())
