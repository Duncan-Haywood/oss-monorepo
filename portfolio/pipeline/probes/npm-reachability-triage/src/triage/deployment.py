"""Detect whether a Next.js project ships a server runtime or static files.

This is the input that ``portfolio/research/cra-advisory-reachability/``
measured as the discriminating one: two products in that sample scored ~98%
false positives and four scored 0–4%, and the split was exactly whether
``next.config.*`` sets ``output: "export"``. A statically exported site ships
pre-rendered HTML to a CDN and runs no Next.js server, so advisories describing
Server Actions, Middleware, the Image Optimizer, rewrites, cache poisoning or
request smuggling describe code that is never deployed.

The detection here is textual rather than an evaluation of the config module,
because evaluating an arbitrary config file means executing untrusted code from
the repository being scanned. That is a real limitation and it is why the
profile carries an explicit :attr:`DeploymentProfile.confidence`: anything less
than certain resolves to :data:`UNKNOWN`, which suppresses nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

#: Config filenames Next.js recognises, in the order it resolves them.
CONFIG_FILENAMES = (
    "next.config.js",
    "next.config.mjs",
    "next.config.cjs",
    "next.config.ts",
)

STATIC_EXPORT = "static-export"
SERVER = "server"
UNKNOWN = "unknown"


@dataclass(frozen=True)
class DeploymentProfile:
    """What the scanned project actually deploys.

    ``mode`` is one of :data:`STATIC_EXPORT`, :data:`SERVER` or :data:`UNKNOWN`.
    ``evidence`` records the literal source line the decision was made from, so
    the evidence record can show its work rather than assert a conclusion.
    """

    mode: str
    confidence: str
    evidence: tuple[str, ...] = ()
    config_path: str | None = None

    @property
    def ships_server_runtime(self) -> bool | None:
        """Tri-state: True, False, or None when it could not be determined."""
        if self.mode == STATIC_EXPORT:
            return False
        if self.mode == SERVER:
            return True
        return None


_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT_RE = re.compile(r"(?<![:'\"])//[^\n]*")

# Matches `output: "export"` with either quote style and flexible whitespace.
# Requiring a quoted literal is deliberate: a ternary or a variable reference
# will not match, and so resolves to UNKNOWN rather than to a false negative.
_OUTPUT_LITERAL_RE = re.compile(r"""\boutput\s*:\s*['"](?P<value>[a-z]+)['"]""")
_OUTPUT_ANY_RE = re.compile(r"\boutput\s*:")
_UNOPTIMIZED_RE = re.compile(r"""\bunoptimized\s*:\s*true\b""")


def _strip_comments(source: str) -> str:
    """Remove JS comments so a commented-out directive is not read as active."""
    return _LINE_COMMENT_RE.sub("", _BLOCK_COMMENT_RE.sub("", source))


def detect_from_source(source: str, config_path: str | None = None) -> DeploymentProfile:
    """Classify a Next.js config given its source text."""
    stripped = _strip_comments(source)

    literal = _OUTPUT_LITERAL_RE.search(stripped)
    if literal is None:
        if _OUTPUT_ANY_RE.search(stripped):
            # `output` is set to something non-literal — a ternary, a variable,
            # an env lookup. The value is genuinely unknown without executing
            # the config, so say so instead of assuming either way.
            return DeploymentProfile(
                UNKNOWN,
                "low",
                ("`output` is set to a non-literal expression; "
                 "cannot determine deployment mode without executing the config",),
                config_path,
            )
        # No `output` key at all is the Next.js default, which runs a server.
        return DeploymentProfile(
            SERVER,
            "medium",
            ("no `output` key in config; Next.js defaults to a server build",),
            config_path,
        )

    value = literal.group("value")
    if value != "export":
        return DeploymentProfile(
            SERVER,
            "high",
            (f'`output: "{value}"` builds a server artifact',),
            config_path,
        )

    evidence = ['`output: "export"` — build emits pre-rendered static files']
    if _UNOPTIMIZED_RE.search(stripped):
        # Static export requires this, so its presence corroborates the mode.
        evidence.append("`unoptimized: true` — the Image Optimizer is not deployed")
    return DeploymentProfile(STATIC_EXPORT, "high", tuple(evidence), config_path)


def detect(project_dir: str | Path) -> DeploymentProfile:
    """Find and classify the Next.js config in ``project_dir``.

    A project with no Next.js config is not necessarily a Next.js project at
    all, so the result is :data:`UNKNOWN` rather than an assumption.
    """
    directory = Path(project_dir)
    for filename in CONFIG_FILENAMES:
        candidate = directory / filename
        if candidate.is_file():
            return detect_from_source(
                candidate.read_text(encoding="utf-8"), str(candidate)
            )

    return DeploymentProfile(
        UNKNOWN,
        "low",
        ("no next.config.* found; deployment mode not determined",),
        None,
    )
