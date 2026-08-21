"""Minimal semver comparison and range matching.

Scope is deliberately narrow: enough to decide whether a resolved lockfile
version falls inside an advisory's affected range. It is not a general semver
implementation and does not try to be one.

Two range dialects are supported:

* **OSV structured ranges** — ``introduced`` / ``fixed`` / ``last_affected``
  event lists. This is the preferred input because it is unambiguous. Bounds go
  through :func:`parse_bound`, which zero-fills partial values and strips
  leading zeros; see its docstring for why that coercion is correct here and
  wrong for npm range strings.
* **npm range strings** — ``">=10.2.0 <10.5.0"``, ``"<14.2.32"``, ``"1.2.3"``.
  Comparator sets separated by ``||`` are supported.

Anything this module cannot parse raises :class:`UnparseableRange` rather than
guessing. Callers are expected to treat that as "assume affected" — see
``triage.py``. Silently dropping a finding we failed to parse would be the one
failure mode this whole tool exists to avoid.
"""

from __future__ import annotations

import re
from typing import NamedTuple


class UnparseableRange(ValueError):
    """Raised when a range string is not in a dialect this module understands."""


class Version(NamedTuple):
    """A parsed semantic version.

    ``prerelease`` is the dot-separated identifier list following ``-``. Build
    metadata (following ``+``) is parsed and discarded, per semver §10, which
    states it MUST be ignored when determining precedence.
    """

    major: int
    minor: int
    patch: int
    prerelease: tuple[str | int, ...] = ()


_VERSION_RE = re.compile(
    r"""^
    v?                                  # tolerate a leading 'v'
    (?P<major>0|[1-9]\d*)
    \.(?P<minor>0|[1-9]\d*)
    \.(?P<patch>0|[1-9]\d*)
    (?:-(?P<prerelease>[0-9A-Za-z.\-]+))?
    (?:\+(?P<build>[0-9A-Za-z.\-]+))?
    $""",
    re.VERBOSE,
)


def parse(text: str) -> Version:
    """Parse ``text`` into a :class:`Version`.

    Raises :class:`UnparseableRange` on anything that is not a plain
    ``major.minor.patch`` semver, including partial versions like ``"1.2"``.
    """
    match = _VERSION_RE.match(text.strip())
    if match is None:
        raise UnparseableRange(f"not a semver version: {text!r}")

    prerelease: tuple[str | int, ...] = ()
    if match.group("prerelease"):
        prerelease = tuple(
            int(part) if part.isdigit() else part
            for part in match.group("prerelease").split(".")
        )

    return Version(
        int(match.group("major")),
        int(match.group("minor")),
        int(match.group("patch")),
        prerelease,
    )


_NUMERIC_COMPONENT_RE = re.compile(r"^\d+$")


def parse_bound(text: str) -> Version:
    """Parse an **OSV event bound** into a :class:`Version`.

    Distinct from :func:`parse` on purpose. An OSV ``introduced`` / ``fixed`` /
    ``last_affected`` value is a single point on a version timeline, so a
    partial value like ``"13.0"`` denotes exactly one version — ``13.0.0``. In
    an *npm range string* the same text means something else entirely (``1.2``
    is the X-range ``>=1.2.0 <1.3.0``), which is why this coercion lives here
    and never in :func:`parse`.

    Two lossless numeric readings are applied, in this order:

    * **Missing components are zero-filled.** ``"8"`` → ``8.0.0``,
      ``"13.0"`` → ``13.0.0``. There is no version between ``13.0`` and
      ``13.0.0``; they are the same point.
    * **Leading zeros are stripped.** ``"2026.05.1"`` → ``2026.5.1``. Semver §2
      forbids leading zeros, so npm cannot have published the literal string;
      the numeric value is the only available reading.

    Anything else still raises :class:`UnparseableRange`. A commit SHA, a
    Ruby-style ``3.5.0.pre0``, or a Python-style ``0.30.0b3`` has no unambiguous
    semver point, and guessing one could silently drop a real finding — which is
    the failure mode this tool exists to avoid.
    """
    stripped = text.strip()
    try:
        return parse(stripped)
    except UnparseableRange:
        pass

    candidate = stripped[1:] if stripped[:1] == "v" else stripped
    components = candidate.split(".")
    if not 1 <= len(components) <= 3:
        raise UnparseableRange(f"not a coercible OSV bound: {text!r}")
    if not all(_NUMERIC_COMPONENT_RE.match(part) for part in components):
        raise UnparseableRange(f"not a coercible OSV bound: {text!r}")

    components += ["0"] * (3 - len(components))
    return parse(".".join(str(int(part)) for part in components))


def _precedence(version: Version) -> tuple:
    """Return a sort key implementing semver precedence.

    The subtlety is that a version *with* a prerelease sorts **below** the
    equivalent version without one (``1.0.0-alpha`` < ``1.0.0``), which is the
    reverse of how an empty tuple would naturally sort. The leading flag
    handles that.
    """
    has_release = 1 if not version.prerelease else 0
    # Numeric identifiers always sort below alphanumeric ones (semver §11).
    ordered = tuple(
        (0, part, "") if isinstance(part, int) else (1, 0, part)
        for part in version.prerelease
    )
    return (version.major, version.minor, version.patch, has_release, ordered)


def compare(left: Version, right: Version) -> int:
    """Return -1, 0 or 1 as ``left`` sorts before, equal to, or after ``right``."""
    a, b = _precedence(left), _precedence(right)
    return (a > b) - (a < b)


_COMPARATOR_RE = re.compile(r"^(?P<op>>=|<=|>|<|=|==)?\s*(?P<version>.+)$")

_OPERATORS = {
    ">": lambda c: c > 0,
    ">=": lambda c: c >= 0,
    "<": lambda c: c < 0,
    "<=": lambda c: c <= 0,
    "=": lambda c: c == 0,
    "==": lambda c: c == 0,
}


def _satisfies_comparator_set(version: Version, comparators: str) -> bool:
    """Evaluate a space-separated comparator set, which is an implicit AND."""
    parts = comparators.split()
    if not parts:
        raise UnparseableRange("empty comparator set")

    for part in parts:
        match = _COMPARATOR_RE.match(part)
        if match is None:
            raise UnparseableRange(f"unparseable comparator: {part!r}")
        op = match.group("op") or "="
        bound = parse(match.group("version"))
        if not _OPERATORS[op](compare(version, bound)):
            return False
    return True


def satisfies(version_text: str, range_text: str) -> bool:
    """Return whether ``version_text`` falls within the npm range ``range_text``.

    ``*`` and an empty range mean "all versions", matching npm's own semantics
    for an unbounded advisory range.
    """
    version = parse(version_text)
    normalised = range_text.strip()
    if normalised in ("", "*"):
        return True

    return any(
        _satisfies_comparator_set(version, alternative)
        for alternative in normalised.split("||")
    )


def in_osv_range(version_text: str, events: list[dict]) -> bool:
    """Return whether ``version_text`` is affected per an OSV ``events`` list.

    OSV semantics: events are checkpoints along a version timeline. A version is
    affected if the most recent ``introduced`` checkpoint at or below it is not
    cancelled by a ``fixed`` checkpoint at or below it. ``last_affected`` is the
    inclusive variant of ``fixed``.

    Rather than rely on the file's ordering, sort the events by version and walk
    them, because OSV records are not guaranteed to list events in order.
    """
    version = parse(version_text)

    checkpoints: list[tuple[Version, int, str]] = []
    for index, event in enumerate(events):
        for kind in ("introduced", "fixed", "last_affected"):
            if kind not in event:
                continue
            raw = event[kind]
            if kind == "introduced" and raw == "0":
                # OSV's sentinel for "from the beginning of time".
                checkpoints.append((Version(0, 0, 0, ("0",)), index, kind))
            else:
                checkpoints.append((parse_bound(raw), index, kind))

    if not checkpoints:
        return False

    checkpoints.sort(key=lambda item: (_precedence(item[0]), item[1]))

    affected = False
    for bound, _, kind in checkpoints:
        relation = compare(version, bound)
        if kind == "introduced":
            if relation >= 0:
                affected = True
        elif kind == "fixed":
            if relation >= 0:
                affected = False
        elif kind == "last_affected":
            if relation > 0:
                affected = False
    return affected
