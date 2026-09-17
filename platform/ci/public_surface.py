#!/usr/bin/env python3
"""Ask the portfolio's public hostnames what they actually serve, from outside.

Why this exists
---------------
`publish_surface.py` answers "what does a merge to `main` publish?" from the
manifests. It is a good answer and it is the wrong kind of evidence: it reads
what this repository *ships*, never what a stranger *receives*. Every claim in
`CLAUDE.md`, `portfolio/DIRECTION.md` and the ledger about what
`marisstella.dev` returns is derived that way, and one of them ("nothing is
live") sat stale for five days because nothing in the repo could contradict it.

`bootstrap/preflight.sh` was supposed to be the contradiction. It curls the
ingress over loopback on the control-plane box and prints the status code per
hostname, which is real evidence -- but it needs SSH, which needs the Actions
secret `HETZNERSSHKEY`, and **that secret holds a public key**: measured
2026-09-04 on run 33884253173, job 101060068559, where the preflight job exits
in under a second on `HETZNERSSHKEY holds a public key, not a private key`. So
the one mechanism the portfolio had for verifying its own public surface has
never once produced a reading, and nothing recorded that.

This module is the reading that needs no credential at all.

The thing that makes it possible
--------------------------------
`CLAUDE.md` says, correctly, that a session cannot check this: outbound HTTPS
from an agent container is intercepted by the egress proxy, which answers
`CONNECT tunnel failed, response 403` for any host not on its allowlist. That
is a property of the *session sandbox*, and the repo has been reading it as a
property of the portfolio.

A GitHub Actions runner is not in that sandbox. It has ordinary outbound
internet. So a job that runs `python3 platform/ci/public_surface.py` reaches
`https://marisstella.dev/` the way a visitor does -- through real DNS, real
TLS, and the real ingress -- which is *better* evidence than preflight's
loopback curl, not a weaker substitute for it. Both DNS and TLS are excluded
from a Host-header request to 127.0.0.1, and both are things that can break.

What it checks
--------------
Not a hand-written list of URLs. Three sources, all generated:

  * **Which hostnames, and what each should do**, from `gitops_survey()` in
    `publish_surface.py` -- the same per-host classification the snapshot test
    already pins. A host with no unmet Secret is expected to answer; a host
    that fails closed on a Secret git does not carry is expected not to. So
    this reports a *disagreement between what we ship and what we serve*,
    which is the only finding worth waking someone for, and it keeps working
    when a seal lands without anyone editing this file.

  * **The GitHub Pages origin**, from `DEFAULT_BASE_URL` in
    `platform/pages/build.mjs` -- the address the canonical tag of every
    generated page and every venture `sitemap.xml` in the tree names -- paired
    with `portfolio-pages.yml`'s own classification from
    `publish_surface.survey()`. This is a *second, independent* origin: it
    needs no k3s, no SSH key and no sealed clone token, so it can be serving
    while the cluster is down or dark while the cluster is fine, and until
    2026-09-04 nothing in the repository ever asked it anything.

  * **Which paths to probe on the apex**, from
    `gitops/prod/front-door/sitemap.xml` -- the sitemap the deployment itself
    publishes. Probing URLs we tell crawlers to fetch is the check that
    catches a dead link in the one document search engines read first.

Restating either list here would be the mistake `CLAUDE.md` records twice as
having cost live product (a constant copied out of `build.mjs` froze half a
rule in place and left seven finished pages public nowhere). Both are read.

What it deliberately does not do
--------------------------------
No credential, no secret, no token: every request is one a stranger could make.
It writes nothing anywhere, mutates no cluster state, and follows redirects
only to report where they land. A failing run means the public surface
disagrees with the manifests -- it never means this tool changed anything.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import publish_surface

REPO = Path(__file__).resolve().parents[2]
APEX_SITEMAP = REPO / "gitops" / "prod" / "front-door" / "sitemap.xml"

# The canonical site build. `DEFAULT_BASE_URL` in this file is the origin every
# page it generates names in its own `<link rel="canonical">` and in every
# venture `sitemap.xml` committed to the tree -- so it is the address the whole
# catalogue tells search engines it lives at, second only to the apex.
#
# It is *read*, never restated. `CLAUDE.md` records the same mistake twice:
# copying a constant out of `build.mjs` froze half a rule in place and left
# seven finished pages public nowhere. `test_public_surface.py` asserts the
# value parsed here still matches the module's own export.
BUILD_MJS = REPO / "platform" / "pages" / "build.mjs"

# The workflow that would publish that origin. `publish_surface.survey()`
# already classifies it; this names which row to read, so the gate itself is
# never duplicated here either.
PAGES_WORKFLOW = "portfolio-pages.yml"

# The *other* way that same origin can be served, and the reason a gated
# workflow no longer implies a dark Pages site.
#
# `platform/pages/publish-branch.sh` builds the catalogue and commits it to an
# orphan `gh-pages` branch. GitHub then serves that branch directly when the
# owner sets Settings -> Pages -> Source to "Deploy from a branch" -- no
# workflow runs, so `PAGES_ENABLED` is never consulted and no runner is needed.
# That is the whole point of the route: it is downstream of neither the metered
# Actions allowance nor the k3s cluster.
#
# It matters here because the two routes reach *one* origin. Predicting that
# origin from the workflow alone says "gated" while the branch route may be
# serving the very same URL, and `Result.agrees` would then score a working
# deploy as a discrepancy -- turning the day the catalogue goes live into a red
# check reading "probe disagrees with the manifests".
PUBLISH_BRANCH_SCRIPT = REPO / "platform" / "pages" / "publish-branch.sh"

# Long enough that a cold pod or a slow TLS handshake is not read as an
# outage, short enough that a black-holed port cannot ride the runner to its
# default 360-minute ceiling. The workflow sets its own `timeout-minutes` too;
# this is the per-request half.
TIMEOUT_SECONDS = 20

# Identify the prober. A hostname that starts blocking this is telling us
# something we want to see in the report rather than diagnose as a network
# fault, and an unidentified scraper is the thing operators block first.
USER_AGENT = "marisstella-public-surface-check/1 (+https://marisstella.dev/about/)"

# A body this small is a stub, an error page, or an empty ConfigMap mount --
# not a served document. `preflight.sh` makes the same distinction in prose
# ("200 with a non-trivial body = that hostname is serving"); this is that
# sentence as a number, so a 200 that carries nothing cannot pass as serving.
MIN_SERVED_BYTES = 512

# How many sitemap URLs to probe when `--all` is not given. Spread evenly
# across the file rather than taken from the front: the first entries are the
# hub and the category pages, which are the least likely to be broken and the
# least representative of the 600-odd tool pages behind them.
DEFAULT_SAMPLE = 24

# The expectation for an origin whose serving state is set outside the
# repository. See `Result.agrees` for why this is reported rather than scored.
UNPREDICTABLE = "unpredictable"

# Signatures of the agent egress gateway refusing the request before it ever
# left the sandbox. See `Result.blocked` for why these must never be scored.
#
# Two shapes, both observed on 2026-09-05 from a session container:
#   - the CONNECT tunnel is refused, and urllib raises URLError whose reason
#     stringifies as `Tunnel connection failed: 403 Forbidden`;
#   - the gateway terminates TLS itself (its certificate is issued by
#     `Anthropic Egress Gateway SDS Issuing CA`) and answers the request with
#     a 403 carrying `x-deny-reason: host_not_allowed`.
TUNNEL_REFUSED_MARKER = "tunnel connection failed"
DENY_REASON_HEADER = "x-deny-reason"
BLOCKED_DENY_REASONS = frozenset({"host_not_allowed"})


@dataclass(frozen=True)
class Probe:
    """One request to make, and what the manifests predict it will do."""

    url: str
    expect: str  # "serves" | "gated" | "unpredictable"
    why: str


@dataclass
class Result:
    probe: Probe
    status: int | None = None
    body_bytes: int = 0
    content_type: str = ""
    final_url: str = ""
    error: str = ""
    redirected_to: str = ""
    deny_reason: str = ""

    @property
    def blocked(self) -> bool:
        """Did this request die at the agent egress gateway, unsent?

        This is the difference between "the origin is dark" and "I was never
        allowed to look", and the two are not distinguishable from the status
        line alone -- a refused CONNECT and a refused origin both arrive as
        "unreachable", and the gateway's own 403 is a perfectly well-formed
        HTTP answer that came from no server of ours.

        The module docstring above already knew the sandbox intercepts
        outbound HTTPS; what it did not do was stop this tool from *scoring*
        that interception. Run from a session container, every probe failed
        and the report read `26 probe(s) disagree with the manifests` -- the
        same sentence it would print on a day the site was perfectly healthy,
        because the reading never touched the site either way. That is the
        exact failure this repository has paid for repeatedly (CLAUDE.md,
        "nothing is served"): a claim derived from something other than the
        thing it claims about. An unmeasured probe must read as unmeasured.
        """
        if self.deny_reason.strip().lower() in BLOCKED_DENY_REASONS:
            return True
        return TUNNEL_REFUSED_MARKER in self.error.lower()

    @property
    def serving(self) -> bool:
        """Did a real document come back?

        A redirect is not serving. Both apex names were annotation-only 301s
        into a host that answers nothing until its clone token is sealed, and
        `publish_surface.py`'s own docstring records that counting those as
        live was "a worse falsehood than the one it replaced" -- so a 3xx is
        reported with its target and never scored as content.
        """
        return self.status == 200 and self.body_bytes >= MIN_SERVED_BYTES

    @property
    def agrees(self) -> bool:
        """Does reality match what the manifests said this host would do?

        `unpredictable` is not a third answer to that question -- it is the
        admission that the repository cannot ask it. The GitHub Pages origin is
        served, or not, according to a Settings choice that lives in the
        account and appears in no file here, so *either* outcome is consistent
        with everything this tool can read. Scoring it would invent a
        prediction the repo never made, and the direction that invention fails
        in is the expensive one: the workflow route is gated today, so a
        `gated` expectation would mark the origin as disagreeing on the exact
        day the branch route starts serving the catalogue. A green check that
        says "serving, as we could not have predicted" is worth more than a red
        one that calls a working deploy a discrepancy.
        """
        # A blocked probe agrees with nothing and disagrees with nothing: no
        # claim about the origin can be built from a request that never
        # reached it. Reporting `True` here is deliberate -- it keeps a
        # sandbox run out of the disagreement count -- but it is never the
        # whole answer, so `render` and `main` both consult `blocked` rather
        # than reading this flag as evidence the surface is healthy.
        if self.blocked:
            return True
        if self.probe.expect == UNPREDICTABLE:
            return True
        if self.probe.expect == "serves":
            return self.serving
        return not self.serving

    def summary(self) -> str:
        if self.blocked:
            return "not measured: blocked by the agent egress gateway"
        if self.error:
            return self.error
        parts = [str(self.status)]
        if self.redirected_to:
            parts.append(f"→ {self.redirected_to}")
        parts.append(f"{self.body_bytes} bytes")
        if self.content_type:
            parts.append(self.content_type.split(";")[0])
        return ", ".join(parts)


def _opener():
    """A urllib opener that reports redirects instead of silently following.

    The default `HTTPRedirectHandler` would make a 301 into whatever it points
    at, which is exactly the conflation this module exists to avoid.
    """

    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
            return None

    return urllib.request.build_opener(_NoRedirect)


def fetch(url: str, opener=None) -> tuple[int | None, bytes, dict, str]:
    """GET `url`. Returns (status, body, headers, error).

    Every failure mode -- DNS, TLS, connection refused, timeout, an HTTP error
    status -- comes back as data rather than an exception, because a report
    that stops at the first unreachable host is the report nobody can act on.
    """
    opener = opener or _opener()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read(), dict(response.headers), ""
    except urllib.error.HTTPError as exc:
        # 3xx arrives here because `_NoRedirect` declines to follow it, and so
        # do 4xx/5xx. All three are answers, not failures to reach the host.
        try:
            body = exc.read()
        except Exception:  # pragma: no cover - a truncated error body
            body = b""
        return exc.code, body, dict(exc.headers or {}), ""
    except urllib.error.URLError as exc:
        return None, b"", {}, f"unreachable: {exc.reason}"
    except Exception as exc:  # pragma: no cover - defensive
        return None, b"", {}, f"failed: {exc.__class__.__name__}: {exc}"


def run_probe(probe: Probe, opener=None) -> Result:
    status, body, headers, error = fetch(probe.url, opener=opener)
    # Read the deny header off both paths: the gateway's refusal arrives as a
    # 403 *with* headers, so capturing it only on the success path would miss
    # the shape that actually occurs.
    deny = ""
    for key, value in (headers or {}).items():
        if key.lower() == DENY_REASON_HEADER:
            deny = value or ""
            break
    result = Result(probe=probe, status=status, error=error, deny_reason=deny)
    if error:
        return result
    result.body_bytes = len(body)
    result.content_type = headers.get("Content-Type", "") or ""
    if status is not None and 300 <= status < 400:
        result.redirected_to = headers.get("Location", "") or ""
    return result


def host_probes(rows=None) -> list[Probe]:
    """One probe per public hostname, with the manifests' own prediction.

    `rows` is `publish_surface.gitops_survey()`'s first element; passed in by
    the tests, read from the manifests otherwise.
    """
    if rows is None:
        rows, _ = publish_surface.gitops_survey()
    probes: dict[str, Probe] = {}
    for application in rows:
        for host in application.get("hosts") or []:
            name = host["host"]
            unmet = host.get("unmet_secrets") or []
            if unmet:
                expect, why = "gated", f"fails closed on {', '.join(unmet)}"
            elif host.get("serves") == "redirect":
                # A redirect host is not expected to carry a document of its
                # own; whether its target does is that host's own row.
                expect, why = "gated", "redirects rather than serving"
            else:
                expect, why = "serves", f"{application['path']} serves it, no unmet Secret"
            # A host claimed by two Applications takes the serving claim: one
            # answering route is enough for a visitor.
            if name not in probes or expect == "serves":
                probes[name] = Probe(url=f"https://{name}/", expect=expect, why=why)
    return [probes[name] for name in sorted(probes)]


def pages_base_url(path: Path | None = None) -> str | None:
    """The origin `platform/pages/build.mjs` publishes to, read from build.mjs.

    Returns `None` if the export cannot be found, which is a reason to probe
    nothing rather than to guess an address: a wrong origin here would report a
    404 against a URL the portfolio does not claim, and that reads as an outage.
    """
    path = path or BUILD_MJS
    if not path.is_file():
        return None
    match = re.search(
        r"^export\s+const\s+DEFAULT_BASE_URL\s*=\s*['\"]([^'\"]+)['\"]",
        path.read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    return match.group(1) if match else None


def pages_probes(rows=None, base_url=None, branch_route=None) -> list[Probe]:
    """One probe for the GitHub Pages origin, with the workflow's prediction.

    Why this is here at all
    -----------------------
    `host_probes` reads the Argo manifests, so it sees the three
    `marisstella.dev` names and nothing else. But the portfolio ships to *two*
    independent origins, and the second one is the one every page points at:
    `build.mjs` writes `duncan-haywood.github.io/...` into the canonical tag of
    all ~670 generated pages and into every venture `sitemap.xml` in the tree.

    Nothing measured that origin. So the repo could not tell the difference
    between "Pages is dark" and "Pages is serving a stale or broken copy", and
    on the day the owner flips `PAGES_ENABLED` nothing would confirm the flip
    worked. That is the same shape of blind spot `CLAUDE.md` records the apex
    having for five days -- a claim derived from what we ship, never checked
    against what a stranger receives -- and it is worth closing *before* the
    flip rather than after, because a check that only exists after the fact
    cannot tell you the flip is what changed anything.

    It matters more than a second copy of the apex check, too: the two origins
    fail independently. GitHub Pages needs no k3s, no SSH key and no sealed
    clone token, so it can be serving while the cluster is down, or dark while
    the cluster is fine. One probe cannot stand in for the other.

    Two routes, one origin
    ----------------------
    Added 2026-09-05, and it is the half that made the prediction wrong rather
    than merely thin. This function read `portfolio-pages.yml` and nothing
    else, so a gated deploy job produced `expect="gated"` -- a positive claim
    that the origin does *not* serve. But `platform/pages/publish-branch.sh`
    stages the same catalogue on an orphan `gh-pages` branch that GitHub serves
    with no workflow at all, and whether it does is a Settings choice no file
    here records. So the honest expectation once that route exists is
    `unpredictable`: see `Result.agrees` for why reporting beats scoring, and
    `platform/ci/pages_state.py` for reading how close the branch route is.

    `rows` is `publish_surface.survey()`'s first element; passed in by the
    tests, read from the workflows otherwise. `branch_route` is whether the
    staged-branch publisher exists; the tests set it, and it is read from the
    tree otherwise.
    """
    base_url = pages_base_url() if base_url is None else base_url
    if not base_url:
        return []
    if rows is None:
        rows, _ = publish_surface.survey()
    if branch_route is None:
        branch_route = PUBLISH_BRANCH_SCRIPT.is_file()
    row = next((r for r in rows if r["workflow"] == PAGES_WORKFLOW), None)
    if row is None:
        # The workflow was renamed or removed. Saying nothing about the
        # *workflow* is honest -- but the branch route publishes this origin
        # without it, so an origin that something still stages is not an origin
        # to fall silent about.
        if branch_route:
            return [Probe(
                url=base_url,
                expect=UNPREDICTABLE,
                why=f"no {PAGES_WORKFLOW}, but publish-branch.sh stages this origin on "
                    "gh-pages; whether Pages serves that branch is an account setting",
            )]
        return []
    if row["classification"] == "live":
        expect, why = "serves", f"{PAGES_WORKFLOW} deploys it on a push to main, ungated"
    else:
        gates = [g for step in row["publishes"] for g in step["gates"]]
        detail = f"gated by {'; '.join(gates)}" if gates else row["classification"]
        if branch_route:
            expect = UNPREDICTABLE
            why = (
                f"{PAGES_WORKFLOW} deploy is {detail}, but publish-branch.sh stages "
                "the same origin on gh-pages, which GitHub serves with no workflow; "
                "whether it does is Settings -> Pages -> Source, which no file here "
                "records"
            )
        else:
            expect, why = "gated", f"{PAGES_WORKFLOW} deploy is {detail}"
    return [Probe(url=base_url, expect=expect, why=why)]


def sitemap_urls(path: Path | None = None) -> list[str]:
    """Every `<loc>` in the apex sitemap the deployment publishes."""
    path = path or APEX_SITEMAP
    if not path.is_file():
        return []
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", path.read_text(encoding="utf-8"))


def sample(urls: list[str], limit: int) -> list[str]:
    """`limit` URLs spread evenly across `urls`, deterministically.

    Deterministic on purpose: a sampling check that probes different URLs on
    every run turns a real regression into an intermittent one, and this
    report is meant to be comparable between runs.
    """
    if limit <= 0 or len(urls) <= limit:
        return list(urls)
    step = len(urls) / limit
    return [urls[int(i * step)] for i in range(limit)]


def sitemap_probes(limit: int = DEFAULT_SAMPLE, urls: list[str] | None = None) -> list[Probe]:
    """Probes for URLs the published sitemap tells crawlers to fetch.

    Every one of these is expected to serve. A sitemap is a promise to a search
    engine, so a 404 behind a `<loc>` is a defect in the marketing surface even
    when the host itself is healthy.
    """
    urls = sitemap_urls() if urls is None else urls
    return [
        Probe(url=url, expect="serves", why="listed in the published sitemap")
        for url in sample(urls, limit)
    ]


def run_probes(probes: list[Probe], opener=None, workers: int = 8) -> list[Result]:
    """Probe concurrently, but return results in the order asked for."""
    if not probes:
        return []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(lambda p: run_probe(p, opener=opener), probes))


def disagreements(results: list[Result]) -> list[Result]:
    return [r for r in results if not r.blocked and not r.agrees]


def unmeasured(results: list[Result]) -> list[Result]:
    """The probes that never left the sandbox."""
    return [r for r in results if r.blocked]


def measured_nothing(results: list[Result]) -> bool:
    """True when every probe was blocked, so the run has no reading at all.

    Distinguished from "some were blocked" because the two call for different
    actions: a partial block is a note beside a real reading, while a total
    block means this invocation is worthless as evidence and the caller must
    go and run it somewhere with ordinary outbound internet.
    """
    return bool(results) and len(unmeasured(results)) == len(results)


def render(host_results: list[Result], page_results: list[Result]) -> str:
    """A GitHub step summary: what the manifests promised, what answered."""
    out: list[str] = ["## Public surface, measured from outside the cluster", ""]
    everything = host_results + page_results
    if measured_nothing(everything):
        # Lead with this. It must be impossible to skim the table below and
        # come away with a belief about the origin, because every cell in it
        # describes the gateway rather than the site.
        return "\n".join(
            [
                "## Public surface — NOT MEASURED",
                "",
                f"All {len(everything)} probe(s) were refused by the agent egress "
                "gateway before leaving the sandbox. **This run says nothing about "
                "whether the portfolio is reachable** — neither that it is up nor "
                "that it is down.",
                "",
                "This tool only produces evidence from somewhere with ordinary "
                "outbound internet. Dispatch the `Public surface check` workflow "
                "(it needs no secret) and read its step summary instead.",
                "",
                "_No credential was used._",
            ]
        )
    if not host_results:
        out += ["No public hostname found in the manifests.", ""]
    else:
        out += [
            "| Hostname | Manifests say | Actually | Agrees |",
            "| --- | --- | --- | --- |",
        ]
        for r in host_results:
            # `n/a` rather than `yes` for an origin nothing here predicts: a
            # tick would claim the repository called this one right, and the
            # whole point of `unpredictable` is that it made no call. The
            # `Actually` column beside it still carries the reading, which is
            # the part worth having.
            if r.blocked:
                mark = "n/a — not measured"
            elif r.probe.expect == UNPREDICTABLE:
                mark = f"n/a — {'serving' if r.serving else 'dark'}"
            else:
                mark = "yes" if r.agrees else "**NO**"
            out.append(
                f"| `{r.probe.url}` | {r.probe.expect} ({r.probe.why}) "
                f"| {r.summary()} | {mark} |"
            )
        out.append("")

    if page_results:
        broken = disagreements(page_results)
        skipped = unmeasured(page_results)
        # Denominator excludes the blocked ones rather than counting them as
        # served: "24/24 served" built from 24 requests that never left the
        # sandbox is the most confident wrong sentence this tool could print.
        countable = len(page_results) - len(skipped)
        out += [
            f"### Sitemap sample: {countable - len(broken)}/{countable} served",
            "",
        ]
        if skipped:
            out += [
                f"{len(skipped)} URL(s) not measured — blocked by the agent "
                "egress gateway, so they are excluded from the count above.",
                "",
            ]
        if broken:
            out += ["| URL | Result |", "| --- | --- |"]
            out += [f"| `{r.probe.url}` | {r.summary()} |" for r in broken]
        else:
            out.append("Every sampled URL from the published sitemap returned a document.")
        out.append("")

    bad = disagreements(host_results + page_results)
    out.append(
        "All probes agree with the manifests."
        if not bad
        else f"**{len(bad)} probe(s) disagree with the manifests — see the rows marked NO above.**"
    )
    out += [
        "",
        "_No credential was used. Every request here is one a stranger could make._",
    ]
    return "\n".join(out)


def as_json(host_results: list[Result], page_results: list[Result]) -> str:
    def row(r: Result) -> dict:
        return {
            "url": r.probe.url,
            "expect": r.probe.expect,
            "why": r.probe.why,
            "status": r.status,
            "bytes": r.body_bytes,
            "content_type": r.content_type,
            "redirected_to": r.redirected_to,
            "error": r.error,
            "serving": r.serving,
            "agrees": r.agrees,
            "blocked": r.blocked,
        }

    everything = host_results + page_results
    return json.dumps(
        {
            "hosts": [row(r) for r in host_results],
            "pages": [row(r) for r in page_results],
            "disagreements": len(disagreements(everything)),
            "unmeasured": len(unmeasured(everything)),
            # A consumer that reads only one key should read this one: it is
            # false exactly when the rest of this document is evidence.
            "measured": not measured_nothing(everything),
        },
        indent=2,
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--all",
        action="store_true",
        help="probe every URL in the published sitemap, not a sample",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=DEFAULT_SAMPLE,
        help=f"how many sitemap URLs to probe (default {DEFAULT_SAMPLE})",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON instead of markdown")
    parser.add_argument(
        "--json-out",
        metavar="PATH",
        help=(
            "also write the JSON reading to PATH. Exists so one invocation can "
            "produce both the human summary and the machine copy: probing twice "
            "to get two formats would double the requests we make to our own "
            "site, and with --all that is 1,328 rather than 664."
        ),
    )
    parser.add_argument(
        "--hosts-only",
        action="store_true",
        help="skip the sitemap sample; probe only the public hostnames",
    )
    args = parser.parse_args(argv)

    # Both origins in one list: they share a report, an exit code and a
    # verdict, because "is the portfolio reachable?" is one question with two
    # independent answers and reading only one of them is how the apex went
    # five days unchallenged.
    hosts = run_probes(host_probes() + pages_probes())
    pages: list[Result] = []
    if not args.hosts_only:
        limit = 0 if args.all else args.sample
        urls = sitemap_urls()
        pages = run_probes(sitemap_probes(limit=limit or len(urls), urls=urls))

    if args.json_out:
        Path(args.json_out).write_text(as_json(hosts, pages), encoding="utf-8")
    print(as_json(hosts, pages) if args.json else render(hosts, pages))
    # Exit 1 on a disagreement, so the job that runs this is red exactly when
    # the public surface stops matching what this repository ships -- and
    # green while a gated host stays correctly dark.
    #
    # Exit 2 is a third answer, and it is not a worse 1: "I could not look" and
    # "it is broken" call for different actions, and collapsing them is how a
    # sandbox run gets filed as an outage. A caller that only checks `!= 0`
    # still treats it as not-green, which is the safe default.
    everything = hosts + pages
    if measured_nothing(everything):
        return 2
    return 1 if disagreements(everything) else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
