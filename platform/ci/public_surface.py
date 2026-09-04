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
Not a hand-written list of URLs. Two sources, both generated:

  * **Which hostnames, and what each should do**, from `gitops_survey()` in
    `publish_surface.py` -- the same per-host classification the snapshot test
    already pins. A host with no unmet Secret is expected to answer; a host
    that fails closed on a Secret git does not carry is expected not to. So
    this reports a *disagreement between what we ship and what we serve*,
    which is the only finding worth waking someone for, and it keeps working
    when a seal lands without anyone editing this file.

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


@dataclass(frozen=True)
class Probe:
    """One request to make, and what the manifests predict it will do."""

    url: str
    expect: str  # "serves" | "gated"
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
        """Does reality match what the manifests said this host would do?"""
        if self.probe.expect == "serves":
            return self.serving
        return not self.serving

    def summary(self) -> str:
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
    result = Result(probe=probe, status=status, error=error)
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
    return [r for r in results if not r.agrees]


def render(host_results: list[Result], page_results: list[Result]) -> str:
    """A GitHub step summary: what the manifests promised, what answered."""
    out: list[str] = ["## Public surface, measured from outside the cluster", ""]
    if not host_results:
        out += ["No public hostname found in the manifests.", ""]
    else:
        out += [
            "| Hostname | Manifests say | Actually | Agrees |",
            "| --- | --- | --- | --- |",
        ]
        for r in host_results:
            mark = "yes" if r.agrees else "**NO**"
            out.append(
                f"| `{r.probe.url}` | {r.probe.expect} ({r.probe.why}) "
                f"| {r.summary()} | {mark} |"
            )
        out.append("")

    if page_results:
        broken = [r for r in page_results if not r.agrees]
        out += [
            f"### Sitemap sample: {len(page_results) - len(broken)}/{len(page_results)} served",
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
        }

    return json.dumps(
        {
            "hosts": [row(r) for r in host_results],
            "pages": [row(r) for r in page_results],
            "disagreements": len(disagreements(host_results + page_results)),
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
        "--hosts-only",
        action="store_true",
        help="skip the sitemap sample; probe only the public hostnames",
    )
    args = parser.parse_args(argv)

    hosts = run_probes(host_probes())
    pages: list[Result] = []
    if not args.hosts_only:
        limit = 0 if args.all else args.sample
        urls = sitemap_urls()
        pages = run_probes(sitemap_probes(limit=limit or len(urls), urls=urls))

    print(as_json(hosts, pages) if args.json else render(hosts, pages))
    # Exit 1 on a disagreement, so the job that runs this is red exactly when
    # the public surface stops matching what this repository ships -- and
    # green while a gated host stays correctly dark.
    return 1 if disagreements(hosts + pages) else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
