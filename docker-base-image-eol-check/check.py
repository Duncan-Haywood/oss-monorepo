#!/usr/bin/env python3
"""Find Dockerfile `FROM` lines pinned to a base image release that is
already past its publisher's own end-of-life date, or due to go past it soon.

    python3 check.py                       # scan every Dockerfile under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any `eol` finding exists
    python3 check.py --warn-days 30        # narrow the eol-soon window (default 90)

## The risk this catches

A Dockerfile can pin `FROM node:18` to an exact digest, pass every linter,
and still build on a base image release whose publisher stopped shipping
security fixes for it months ago. Pinning (see the sibling
`docker-base-image-pin-check`) answers "can this reference be silently
repointed" -- a completely different question from "is anyone still patching
this release line." A build can be perfectly immutable and perfectly
unsupported at the same time.

## What this tool actually does, and does not do

It is a static, read-only line scanner. It reads every `Dockerfile`,
`Dockerfile.*`, and `*.dockerfile` already on disk, extracts each `FROM`
image and tag, and looks the release line up in a small **curated,
dated** end-of-life table checked into this tool (`EOL_DATA` below) --
never a live network lookup. It makes no network calls of any kind.

**This is a snapshot, not a live feed, and it says so on every finding.**
Every row in `EOL_DATA` carries a `source` (which project's own schedule it
was read from) and a `confidence` (`confirmed` for a project's own published,
fixed date; `estimated` for a date inferred from that project's stated
support-window policy rather than an explicit end date). Re-verify a finding
against the upstream project's own page before treating it as fact --
particularly a `confidence: estimated` row, and particularly if you are
reading this file long after `DATASET_AS_OF` below.

This tool never claims a build is "secure" or "compliant" -- only that a
specific base-image release line has, or has not, passed the date its own
publisher named (or the date implied by its own stated support-length
policy) as when patches stop.

## Classification

  - `eol`              -- the release line's end-of-life date has passed.
  - `eol-soon`          -- not past EOL yet, but within `--warn-days` (default
                           90) of it.
  - `supported`         -- neither of the above, per the checked-in table.
  - `deprecated-image`  -- the image repository itself was discontinued by
                           its publisher (e.g. `openjdk`), independent of tag.
  - `unknown-tag`       -- no tag, `latest`, or a tag this tool's normalizer
                           could not parse into a release line. Skipped --
                           resolve which release `latest` currently means and
                           re-run with an explicit tag.
  - `unknown-image`     -- the image is not in this tool's curated table.
                           Not evidence of anything either way.
  - `stage` / `scratch` / `variable` -- same meaning as in
    `docker-base-image-pin-check`: not a registry pull, skipped.

Exit status: 0 normally (even with `eol` findings, unless --fail-on-risk),
2 if --fail-on-risk was given and at least one `eol` finding exists.
"""

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

EOL = "eol"
EOL_SOON = "eol-soon"
SUPPORTED = "supported"
DEPRECATED_IMAGE = "deprecated-image"
UNKNOWN_TAG = "unknown-tag"
UNKNOWN_IMAGE = "unknown-image"
STAGE = "stage"
SCRATCH = "scratch"
VARIABLE = "variable"

RISK_CLASSIFICATIONS = frozenset({EOL, DEPRECATED_IMAGE})
WARNING_CLASSIFICATIONS = frozenset({EOL_SOON})

DEFAULT_WARN_DAYS = 90

# Curated end-of-life table. Not a live feed -- see the module docstring.
# `cycle` is the normalized release line this tool's tag parser can produce
# (see `FAMILIES` below); `eol` is an ISO date; `confidence` is "confirmed"
# (the project names this exact date itself) or "estimated" (derived from
# that project's own stated support-length policy applied to its release
# date, because the project does not publish a fixed end date this far out).
DATASET_AS_OF = "2026-09-01"

EOL_DATA = {
    "node": {
        "source": "Node.js Release Working Group schedule (nodejs.org/en/about/previous-releases)",
        "cycles": {
            "14": {"eol": "2023-04-30", "confidence": "confirmed"},
            "16": {"eol": "2023-09-11", "confidence": "confirmed"},
            "18": {"eol": "2025-04-30", "confidence": "confirmed"},
            "19": {"eol": "2023-06-01", "confidence": "confirmed"},
            "20": {"eol": "2026-04-30", "confidence": "confirmed"},
            "21": {"eol": "2024-06-01", "confidence": "confirmed"},
            "22": {"eol": "2027-04-30", "confidence": "confirmed"},
            "23": {"eol": "2025-06-01", "confidence": "confirmed"},
            "24": {"eol": "2028-04-30", "confidence": "confirmed"},
        },
    },
    "python": {
        "source": "CPython devguide (devguide.python.org/versions)",
        "cycles": {
            "3.7": {"eol": "2023-06-27", "confidence": "confirmed"},
            "3.8": {"eol": "2024-10-07", "confidence": "confirmed"},
            "3.9": {"eol": "2025-10-05", "confidence": "confirmed"},
            "3.10": {"eol": "2026-10-04", "confidence": "confirmed"},
            "3.11": {"eol": "2027-10-24", "confidence": "confirmed"},
            "3.12": {"eol": "2028-10-02", "confidence": "confirmed"},
            "3.13": {"eol": "2029-10-31", "confidence": "estimated"},
        },
    },
    "ubuntu": {
        "source": "Ubuntu release cycle wiki -- standard support window, not ESM",
        "codenames": {"bionic": "18.04", "focal": "20.04", "jammy": "22.04", "noble": "24.04"},
        "cycles": {
            "18.04": {"eol": "2023-05-31", "confidence": "confirmed"},
            "20.04": {"eol": "2025-05-29", "confidence": "confirmed"},
            "22.04": {"eol": "2027-04-01", "confidence": "confirmed"},
            "24.04": {"eol": "2029-05-31", "confidence": "estimated"},
        },
    },
    "debian": {
        "source": "Debian LTS wiki -- regular security support window, before community LTS extends it",
        "codenames": {"stretch": "9", "buster": "10", "bullseye": "11", "bookworm": "12", "trixie": "13"},
        "cycles": {
            "9": {"eol": "2020-07-06", "confidence": "confirmed"},
            "10": {"eol": "2022-09-10", "confidence": "confirmed"},
            "11": {"eol": "2024-08-14", "confidence": "confirmed"},
            "12": {"eol": "2026-06-30", "confidence": "estimated"},
            "13": {"eol": "2028-06-30", "confidence": "estimated"},
        },
    },
    "alpine": {
        "source": "Alpine Linux releases wiki -- each branch's stated ~2-year support window",
        "cycles": {
            "3.15": {"eol": "2023-11-01", "confidence": "confirmed"},
            "3.16": {"eol": "2024-05-23", "confidence": "confirmed"},
            "3.17": {"eol": "2024-11-22", "confidence": "confirmed"},
            "3.18": {"eol": "2025-05-09", "confidence": "confirmed"},
            "3.19": {"eol": "2025-11-01", "confidence": "confirmed"},
            "3.20": {"eol": "2026-04-01", "confidence": "estimated"},
            "3.21": {"eol": "2026-11-01", "confidence": "estimated"},
        },
    },
    "php": {
        "source": "PHP Supported Versions page (php.net/supported-versions)",
        "cycles": {
            "7.4": {"eol": "2022-11-28", "confidence": "confirmed"},
            "8.0": {"eol": "2023-11-26", "confidence": "confirmed"},
            "8.1": {"eol": "2025-12-31", "confidence": "confirmed"},
            "8.2": {"eol": "2026-12-31", "confidence": "confirmed"},
            "8.3": {"eol": "2027-12-31", "confidence": "confirmed"},
            "8.4": {"eol": "2028-12-31", "confidence": "confirmed"},
        },
    },
    "ruby": {
        "source": "Ruby maintenance branches page (www.ruby-lang.org, ~3-year support per minor)",
        "cycles": {
            "2.7": {"eol": "2023-03-31", "confidence": "confirmed"},
            "3.0": {"eol": "2024-03-31", "confidence": "confirmed"},
            "3.1": {"eol": "2025-03-31", "confidence": "confirmed"},
            "3.2": {"eol": "2026-03-31", "confidence": "estimated"},
            "3.3": {"eol": "2027-03-31", "confidence": "estimated"},
        },
    },
}

# Image repositories with more than one Docker Hub name for the same family
# (the tag namespace is identical, so they share EOL_DATA's "node" table).
FAMILY_ALIASES = {
    "node": "node",
    "python": "python",
    "ubuntu": "ubuntu",
    "debian": "debian",
    "alpine": "alpine",
    "php": "php",
    "ruby": "ruby",
}

# Image repositories that were discontinued outright by their publisher,
# independent of which tag is used.
DEPRECATED_IMAGES = {
    "openjdk": {
        "note": (
            "Docker Hub's official `openjdk` image was deprecated by its "
            "maintainers in 2022 and receives no new builds. Use "
            "`eclipse-temurin` instead (same Adoptium/Temurin binaries)."
        ),
    },
}

# Per-family tag -> release-cycle normalizer. Each takes the tag string
# (already lowercased, with the OS/variant suffix such as "-slim" or
# "-alpine3.19" stripped) and returns the cycle key EOL_DATA expects, or
# None if the tag can't be read as a release line.
_MAJOR_ONLY = re.compile(r"^(\d+)")
_MAJOR_MINOR = re.compile(r"^(\d+)\.(\d+)")


def _cycle_node(tag):
    m = _MAJOR_ONLY.match(tag)
    return m.group(1) if m else None


def _cycle_major_minor(tag):
    m = _MAJOR_MINOR.match(tag)
    return f"{m.group(1)}.{m.group(2)}" if m else None


def _cycle_debian(tag, family):
    codenames = EOL_DATA[family]["codenames"]
    if tag in codenames:
        return codenames[tag]
    m = _MAJOR_ONLY.match(tag)
    return m.group(1) if m else None


def _cycle_ubuntu(tag, family):
    codenames = EOL_DATA[family]["codenames"]
    if tag in codenames:
        return codenames[tag]
    return _cycle_major_minor(tag)


CYCLE_RESOLVERS = {
    "node": lambda tag: _cycle_node(tag),
    "python": lambda tag: _cycle_major_minor(tag),
    "ruby": lambda tag: _cycle_major_minor(tag),
    "php": lambda tag: _cycle_major_minor(tag),
    "alpine": lambda tag: _cycle_major_minor(tag),
    "ubuntu": lambda tag: _cycle_ubuntu(tag, "ubuntu"),
    "debian": lambda tag: _cycle_debian(tag, "debian"),
}

_FROM_RE = re.compile(
    r"^\s*FROM\s+(?:--platform=\S+\s+)?(?P<ref>\S+)(?:\s+AS\s+(?P<alias>\S+))?\s*(?:#.*)?$",
    re.IGNORECASE,
)


def normalize_tag(tag):
    """Strip a variant suffix like `-slim`, `-alpine3.19`, `-jdk` and return
    the leading version-shaped fragment, lowercased. `18-bookworm` -> `18`;
    `3.11.9-slim` -> `3.11.9`; `jammy` -> `jammy` (codenames carry no `-`)."""
    return tag.lower().split("-", 1)[0]


def split_name_and_tag(ref):
    """Same convention as the pin-check sibling: the tag is read only from
    the last `/`-separated path segment, so a `registry:port/` prefix is
    never misread as a tag. Digest references (`@sha256:...`) have no tag
    to classify by, since the digest alone names no release line."""
    if "@" in ref:
        name = ref.split("@", 1)[0]
        return name, None
    last_slash = ref.rfind("/")
    tail = ref[last_slash + 1 :]
    if ":" in tail:
        prefix = ref[: last_slash + 1]
        repo, tag = tail.rsplit(":", 1)
        return f"{prefix}{repo}", tag
    return ref, None


def repo_basename(name):
    """The last path segment of an image name, lowercased -- `library/node`
    and `node` both resolve to `node` for table lookup, matching how Docker
    Hub treats official-image references."""
    return name.rsplit("/", 1)[-1].lower()


def classify_from(ref, stage_names, today, warn_days):
    if ref in stage_names:
        return {"classification": STAGE, "image": ref, "tag": None}
    if ref.lower() == "scratch":
        return {"classification": SCRATCH, "image": ref, "tag": None}
    if "$" in ref:
        return {"classification": VARIABLE, "image": ref, "tag": None}

    name, tag = split_name_and_tag(ref)
    basename = repo_basename(name)

    if basename in DEPRECATED_IMAGES:
        return {
            "classification": DEPRECATED_IMAGE,
            "image": name,
            "tag": tag,
            "note": DEPRECATED_IMAGES[basename]["note"],
        }

    family = FAMILY_ALIASES.get(basename)
    if family is None:
        return {"classification": UNKNOWN_IMAGE, "image": name, "tag": tag}

    if tag is None or tag.lower() in ("latest",):
        return {"classification": UNKNOWN_TAG, "image": name, "tag": tag}

    normalized = normalize_tag(tag)
    cycle = CYCLE_RESOLVERS[family](normalized)
    if cycle is None or cycle not in EOL_DATA[family]["cycles"]:
        return {"classification": UNKNOWN_TAG, "image": name, "tag": tag}

    row = EOL_DATA[family]["cycles"][cycle]
    eol_date = date.fromisoformat(row["eol"])
    result = {
        "image": name,
        "tag": tag,
        "cycle": cycle,
        "eol": row["eol"],
        "confidence": row["confidence"],
        "source": EOL_DATA[family]["source"],
    }
    if eol_date < today:
        result["classification"] = EOL
        result["days_past_eol"] = (today - eol_date).days
    elif eol_date <= today + timedelta(days=warn_days):
        result["classification"] = EOL_SOON
        result["days_until_eol"] = (eol_date - today).days
    else:
        result["classification"] = SUPPORTED
    return result


def scan_text(text, filename="<Dockerfile>", today=None, warn_days=DEFAULT_WARN_DAYS):
    today = today or date.today()
    findings = []
    stage_names = set()
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        match = _FROM_RE.match(line)
        if not match:
            continue
        ref = match.group("ref")
        alias = match.group("alias")
        result = classify_from(ref, stage_names, today, warn_days)
        if alias:
            stage_names.add(alias)
        if result["classification"] in (STAGE, SCRATCH, VARIABLE):
            continue
        result["file"] = filename
        result["line"] = lineno
        findings.append(result)
    return findings


def discover_dockerfiles(root):
    root_path = Path(root)
    if not root_path.is_dir():
        return []
    files = []
    for path in root_path.rglob("*"):
        if not path.is_file():
            continue
        if any(part in (".git", "node_modules") for part in path.parts):
            continue
        name = path.name
        if name == "Dockerfile" or name.startswith("Dockerfile.") or name.lower().endswith(".dockerfile"):
            files.append(path)
    return sorted(files)


def scan_path(root, today=None, warn_days=DEFAULT_WARN_DAYS):
    findings = []
    for path in discover_dockerfiles(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=str(path), today=today, warn_days=warn_days))
    return findings


def has_unresolved_risk(findings):
    return any(f["classification"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root):
    if not findings:
        files = discover_dockerfiles(root)
        if not files:
            return "No Dockerfile, Dockerfile.*, or *.dockerfile found under " + str(root)
        return f"Scanned {len(files)} Dockerfile(s); no FROM lines found to classify."

    order = {EOL: 0, DEPRECATED_IMAGE: 1, EOL_SOON: 2}
    risky = sorted(
        [f for f in findings if f["classification"] in order], key=lambda f: order[f["classification"]]
    )
    other = [f for f in findings if f["classification"] not in order]

    lines = []
    for f in risky:
        ref = f"{f['image']}:{f['tag']}" if f.get("tag") else f["image"]
        if f["classification"] == DEPRECATED_IMAGE:
            lines.append(f"!! {f['file']}:{f['line']}  FROM {ref}  [deprecated image]")
            lines.append(f"     {f['note']}")
        elif f["classification"] == EOL:
            lines.append(
                f"!! {f['file']}:{f['line']}  FROM {ref}  [eol {f['days_past_eol']}d ago, {f['eol']}]"
            )
            lines.append(f"     source: {f['source']} ({f['confidence']})")
        else:
            lines.append(
                f"!  {f['file']}:{f['line']}  FROM {ref}  [eol in {f['days_until_eol']}d, {f['eol']}]"
            )
            lines.append(f"     source: {f['source']} ({f['confidence']})")
        lines.append("")

    counts = {}
    for f in findings:
        counts[f["classification"]] = counts.get(f["classification"], 0) + 1
    summary = ", ".join(f"{v} {k}" for k, v in sorted(counts.items()))
    lines.append(summary)
    if not risky:
        lines.append("No base image in this scan is past end-of-life or within the warning window.")
    lines.append(
        f"Dataset snapshot as of {DATASET_AS_OF} -- verify a finding against the upstream "
        "project's own EOL page before relying on it, especially any row marked 'estimated'."
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", nargs="?", default=".", help="directory to scan (default: current directory)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument(
        "--fail-on-risk",
        action="store_true",
        help="exit 2 when any eol or deprecated-image finding exists",
    )
    parser.add_argument(
        "--warn-days", type=int, default=DEFAULT_WARN_DAYS, help="eol-soon window in days (default 90)"
    )
    parser.add_argument(
        "--dump-data", action="store_true", help=argparse.SUPPRESS
    )  # internal: classify.test.mjs parity check against the JS table
    args = parser.parse_args(argv)

    if args.dump_data:
        print(json.dumps(EOL_DATA, sort_keys=True))
        return 0

    findings = scan_path(args.path, warn_days=args.warn_days)

    if args.format == "json":
        print(json.dumps(findings, indent=2, default=str))
    else:
        print(render_text(findings, args.path))

    if args.fail_on_risk and has_unresolved_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
