"""Classify whether an advisory describes a surface that only a server ships.

This is the deliberately conservative half of the tool. Deciding that an
advisory does *not* apply is the only decision here that can hurt a user, so
every rule is written to fail towards "it applies".

Three properties keep that honest:

1. **An allowlist of surfaces, not a blocklist of exceptions.** A finding is
   only ever classified server-only when it positively matches a named rule.
   Unrecognised advisory text yields no classification at all.
2. **Any client-or-build-side indicator vetoes the match.** Advisories that
   describe more than one surface are common, and a server-side phrase in an
   advisory that *also* describes a build-time issue must not suppress it.
3. **Every match names the rule that fired.** The evidence record prints it, so
   a reviewer can disagree with a specific rule rather than with a verdict.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SurfaceRule:
    """One named pattern describing a server-only attack surface."""

    name: str
    pattern: re.Pattern
    explanation: str


def _rule(name: str, pattern: str, explanation: str) -> SurfaceRule:
    return SurfaceRule(name, re.compile(pattern, re.IGNORECASE), explanation)


#: Surfaces that exist only when an application server handles requests.
#: A statically exported site serves pre-rendered files from a CDN and reaches
#: none of this code.
SERVER_ONLY_RULES: tuple[SurfaceRule, ...] = (
    _rule(
        "middleware",
        r"\bmiddleware\b",
        "Middleware runs per request in the server runtime",
    ),
    _rule(
        "server-actions",
        r"\bserver action(s)?\b",
        "Server Actions are RPC endpoints handled by the server runtime",
    ),
    _rule(
        "image-optimizer",
        r"\bimage optimi[sz](ation|er)\b|\b_next/image\b",
        "The Image Optimizer is a server route; static export requires it disabled",
    ),
    _rule(
        "request-smuggling",
        r"\brequest smuggling\b",
        "Request smuggling requires a server parsing inbound HTTP",
    ),
    _rule(
        "cache-poisoning",
        r"\bcache (poisoning|confusion)\b",
        "Response-cache poisoning or confusion requires a server-side response cache",
    ),
    _rule(
        "ssrf",
        r"\bserver[- ]side request forgery\b|\bSSRF\b",
        "SSRF requires the server to originate the request",
    ),
    _rule(
        "rewrites-redirects",
        r"\b(rewrites|redirects) configuration\b|\bnext\.config\b.{0,40}\brewrites\b",
        "Rewrite and redirect handling happens in the server routing layer",
    ),
    _rule(
        "server-rendering",
        r"\bserver[- ]side rendering\b|\bSSR\b|\bgetServerSideProps\b",
        "Server-side rendering only executes in a server runtime",
    ),
    _rule(
        "route-handlers",
        r"\broute handler(s)?\b|\bapi route(s)?\b",
        "Route handlers are server endpoints and are not emitted by static export",
    ),
    _rule(
        "server-functions",
        r"\bserver function(s)?\b",
        "Server Functions are RPC endpoints reached by an inbound HTTP request; "
        "a static export emits none",
    ),
)

# There is deliberately no `server-components` rule, and the reason belongs
# next to the rules rather than in a commit message.
#
# The obvious way to catch the React Server Components advisories is a
# `\bserver components?\b` pattern. It is wrong. A statically exported Next.js
# build *does* execute Server Components — at build time, to produce the
# pre-rendered HTML. What it does not have is the request-handling half: the
# advisories that matter here all describe "a specially crafted HTTP request
# sent to any App Router Server Function endpoint", and it is the **endpoint**
# a static export lacks, not the component model.
#
# So `server-functions` above matches the endpoint, exactly as `server-actions`
# already does for the other name of the same thing, and the RSC advisories are
# caught because each one names the endpoint it is reached through. An RSC
# advisory describing build-time rendering would not be suppressed — which is
# correct, and is what a "Server Components" pattern would have got wrong.

#: Any of these vetoes a server-only classification, because they describe code
#: that a static build either executes at build time or ships to the browser.
CLIENT_OR_BUILD_RULES: tuple[SurfaceRule, ...] = (
    _rule(
        "build-time",
        r"\bbuild[- ]time\b|\bduring the build\b|\bbuild process\b",
        "describes build-time behaviour, which a static export still performs",
    ),
    _rule(
        "client-side",
        r"\bclient[- ]side\b|\bin the browser\b|\bbrowser\b",
        "describes browser-side behaviour, which ships with a static export",
    ),
    _rule(
        "xss",
        r"\bcross[- ]site scripting\b|\bXSS\b",
        "cross-site scripting can execute in pre-rendered markup",
    ),
    _rule(
        "prototype-pollution",
        r"\bprototype pollution\b",
        "prototype pollution can affect bundled client code",
    ),
    _rule(
        "static-generation",
        r"\bstatic(ally)? (generat|render|export)\w*\b|\bgetStaticProps\b",
        "explicitly mentions the static path, so a static export is in scope",
    ),
)


#: Advisories scoped explicitly to the development server. `next dev` is not
#: what `next build` emits, so these describe code no production deployment
#: contains — independently of whether that deployment is static or a server.
DEV_SERVER_RE = re.compile(
    r"\bdev(elopment)? server\b|\bnext dev\b", re.IGNORECASE
)

#: Vetoes the dev-server rule. An advisory that also names production is not
#: scoped to development, whatever else it says.
DEV_SERVER_VETO_RE = re.compile(
    r"\bproduction\b|\bnext build\b|\bnext start\b", re.IGNORECASE
)


@dataclass(frozen=True)
class SurfaceVerdict:
    """The outcome of classifying one advisory's text."""

    server_only: bool
    matched_rule: str | None
    explanation: str | None
    vetoed_by: str | None = None


def is_dev_server_only(text: str) -> bool:
    """Whether ``text`` describes a vulnerability scoped to the dev server.

    Deliberately stricter than :func:`classify`: it requires an explicit mention
    of the development server and no mention of production, because this rule
    suppresses regardless of deployment mode and so carries the most weight.
    """
    if not text or not text.strip():
        return False
    return bool(DEV_SERVER_RE.search(text)) and not DEV_SERVER_VETO_RE.search(text)


def _first_match(rules: tuple[SurfaceRule, ...], text: str) -> SurfaceRule | None:
    if not text or not text.strip():
        return None
    return next((rule for rule in rules if rule.pattern.search(text)), None)


def classify(summary: str, details: str = "") -> SurfaceVerdict:
    """Decide whether the advisory describes an exclusively server-side surface.

    Matches against ``summary`` first, and only falls back to the combined
    ``summary + details`` if nothing in the summary matches. An advisory's
    ``details`` often mention more than one server mechanism in passing — e.g.
    "...via crafted Server Actions requests...", followed later by "...also
    touches middleware/proxy authorization..." — and searching the whole
    concatenated text for the *first* pattern in ``SERVER_ONLY_RULES`` that
    hits anywhere picks whichever rule happens to be listed earliest in that
    tuple, not the one the advisory is actually about. The summary is written
    to state the subject; a mechanism it names should win over one only the
    details happen to mention in a supporting clause.

    Returns ``server_only=False`` for anything unrecognised, which is what makes
    an unknown advisory count as shipped.
    """
    combined = f"{summary}\n{details}".strip()
    if not combined:
        return SurfaceVerdict(False, None, None)

    match = _first_match(SERVER_ONLY_RULES, summary) or _first_match(
        SERVER_ONLY_RULES, combined
    )
    if match is None:
        return SurfaceVerdict(False, None, None)

    veto = _first_match(CLIENT_OR_BUILD_RULES, combined)
    if veto is not None:
        return SurfaceVerdict(False, match.name, None, vetoed_by=veto.name)

    return SurfaceVerdict(True, match.name, match.explanation)
