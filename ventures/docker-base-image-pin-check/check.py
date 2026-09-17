#!/usr/bin/env python3
"""Find Dockerfile `FROM` lines that trust a mutable tag instead of a pinned
content digest.

    python3 check.py                       # scan every Dockerfile under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any mutable finding exists

## The risk this catches

A Dockerfile line like:

    FROM node:18

trusts whatever image `node:18` currently resolves to *right now* on
Docker Hub (or whatever registry you pull from). Nothing stops the image
publisher from pushing a new build to that same tag tomorrow -- and unlike a
version bump you would review, a rebuild of an *existing* tag is silent: your
next `docker build` just pulls different bytes under the same name. This is a
documented supply-chain hardening practice (see Docker's own "Pin base image
versions" guidance and the SLSA build-provenance framework's material
requirements), not a novel claim: pin a base image to its content digest
(`@sha256:<64-hex>`) instead of a tag, because a digest addresses one exact
set of bytes and cannot be repointed.

**A specific-looking tag is not pinned either.** `node:18` looks more
deliberate than bare `node` or `node:latest`, but Docker still resolves
`node:18` to whatever the `18` tag points at right now -- the publisher
routinely repoints `18` at new patch builds for the lifetime of that Node
release line. Only a digest reference removes that. This is the one
distinction this tool exists to draw that a quick skim of a Dockerfile misses:
"it has an explicit version tag" reads as safe and is not the same claim as
"it is pinned."

## What this tool actually does, and does not do

It is a static, read-only line scanner. It reads every `Dockerfile`,
`Dockerfile.*`, and `*.dockerfile` already on disk and classifies each `FROM`
line's image reference. It makes **no network calls of any kind** -- it never
pulls an image, never resolves a tag to a digest, and never contacts a
registry. When it flags a mutable reference, it prints the exact `docker
buildx imagetools inspect` command *you* can run to look up the digest that
tag currently resolves to; running that command, and deciding whether to pin
to the digest it reports, is entirely up to you.

This tool never claims a build is "secure" or "supply-chain safe" -- only that
a specific `FROM` line does or does not reference a base image by content
digest. Supply-chain risk in a container build is broader than base-image
pinning alone (compromised build dependencies, a malicious `RUN` step, the
registry itself being compromised); this addresses one specific, well-
documented piece of it.

## Classification

  - `pinned`   -- the reference includes `@<algorithm>:<hex digest>` (the
                  form Docker's own documentation calls a digest reference).
  - `mutable`  -- a tag (`:18`, `:latest`) or no tag at all (which resolves to
                  `:latest`) -- flagged, regardless of how specific the tag
                  looks.
  - `stage`    -- the reference names an earlier `FROM ... AS <name>` build
                  stage in the same file, not a registry pull. Skipped.
  - `scratch`  -- `FROM scratch`, Docker's empty virtual base image. It is
                  not pulled from anywhere and cannot be repointed. Skipped.
  - `variable` -- the reference contains a build-arg substitution (`$FOO` or
                  `${FOO}`) anywhere in it, so the actual image cannot be
                  determined from this file alone. Skipped -- resolve the
                  build arg's value yourself and re-run.

Exit status: 0 normally (even with mutable findings, unless --fail-on-risk),
2 if --fail-on-risk was given and at least one mutable finding exists.
"""

import argparse
import json
import re
import sys
from pathlib import Path

PINNED = "pinned"
MUTABLE = "mutable"
STAGE = "stage"
SCRATCH = "scratch"
VARIABLE = "variable"

RISK_CLASSIFICATIONS = frozenset({MUTABLE})

# A digest reference is `@<algorithm>:<hex>` -- sha256 is what every current
# registry and buildkit version actually produces, but the reference grammar
# (github.com/distribution/reference) allows any lowercase alphanumeric
# algorithm name, so this does not hardcode "sha256" the way it would if it
# only mattered for messaging.
_DIGEST_RE = re.compile(r"^[a-z0-9]+(?:[+._-][a-z0-9]+)*:[0-9a-f]{32,}$")

# Matches a `FROM` instruction, tolerating the optional `--platform=...` flag
# and an optional `AS <stage-name>` suffix. Dockerfile instructions are
# case-insensitive by convention. This is a small regex scanner rather than a
# real Dockerfile parser on purpose: `FROM` lines are simple enough that this
# never disagrees with BuildKit's own parser in practice, it has zero
# dependencies, and classify.mjs in the browser can use the exact same
# approach with no Dockerfile-parsing library, so the CLI and the page never
# drift.
_FROM_RE = re.compile(
    r"^\s*FROM\s+(?:--platform=\S+\s+)?(?P<ref>\S+)(?:\s+AS\s+(?P<alias>\S+))?\s*(?:#.*)?$",
    re.IGNORECASE,
)


def looks_variable(text):
    return "$" in text


def split_name_and_ref(ref):
    """Split an image reference into (name, tag_or_none, digest_or_none).

    `name` is everything before the tag/digest. The tag is read from only the
    *last* `/`-separated path segment, which is what keeps a `registry:port/`
    prefix from being misread as a tag -- the port's colon lives in an
    earlier segment, never the last one.
    """
    if "@" in ref:
        name, digest = ref.rsplit("@", 1)
        return name, None, digest

    last_slash = ref.rfind("/")
    tail = ref[last_slash + 1 :]
    if ":" in tail:
        prefix = ref[: last_slash + 1]
        repo, tag = tail.rsplit(":", 1)
        return f"{prefix}{repo}", tag, None
    return ref, None, None


def classify_from(ref, stage_names):
    """Classify one `FROM` reference. Returns (classification, name, tag, digest)."""
    if ref in stage_names:
        return STAGE, ref, None, None
    if ref.lower() == "scratch":
        return SCRATCH, ref, None, None
    if looks_variable(ref):
        return VARIABLE, ref, None, None

    name, tag, digest = split_name_and_ref(ref)

    if digest is not None:
        if _DIGEST_RE.match(digest.lower()):
            return PINNED, name, None, digest
        # Malformed digest-shaped suffix -- not a form buildkit would accept,
        # but not this tool's job to validate Dockerfile syntax either. Treat
        # it as mutable rather than silently dropping the finding.
        return MUTABLE, name, None, digest

    return MUTABLE, name, tag, None


def remediation_command(name, tag):
    """The exact, read-only command to look up the digest a mutable tag
    currently resolves to. This tool never runs it."""
    ref = f"{name}:{tag}" if tag else f"{name}:latest"
    return f"docker buildx imagetools inspect {ref}"


def scan_text(text, filename="<Dockerfile>"):
    """Scan one Dockerfile's text. Returns a list of finding dicts."""
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
        classification, name, tag, digest = classify_from(ref, stage_names)
        if alias:
            stage_names.add(alias)
        if classification not in (PINNED, MUTABLE):
            continue  # stage/scratch/variable: not a third-party pull, not this tool's concern
        finding = {
            "file": filename,
            "line": lineno,
            "image": name,
            "tag": tag,
            "digest": digest,
            "classification": classification,
        }
        if classification == MUTABLE:
            finding["remediation"] = remediation_command(name, tag)
        findings.append(finding)
    return findings


def discover_dockerfiles(root):
    """Every `Dockerfile`, `Dockerfile.*`, and `*.dockerfile` under root,
    skipping `.git` and `node_modules`, sorted for stable output."""
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


def scan_path(root):
    """Scan every Dockerfile under root. Returns a flat list of findings."""
    findings = []
    for path in discover_dockerfiles(root):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=str(path)))
    return findings


def has_unresolved_risk(findings):
    return any(f["classification"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root):
    if not findings:
        files = discover_dockerfiles(root)
        if not files:
            return "No Dockerfile, Dockerfile.*, or *.dockerfile found under " + str(root)
        return f"Scanned {len(files)} Dockerfile(s); no FROM lines found to classify."

    mutable = [f for f in findings if f["classification"] == MUTABLE]
    pinned = [f for f in findings if f["classification"] == PINNED]

    lines = []
    for f in mutable:
        ref_display = f"{f['image']}:{f['tag']}" if f["tag"] else f"{f['image']} (no tag -- resolves to :latest)"
        if f.get("digest"):
            ref_display = f"{f['image']}@{f['digest']} (malformed digest)"
        lines.append(f"!! {f['file']}:{f['line']}  FROM {ref_display}")
        if f.get("remediation"):
            lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(mutable)} mutable base image reference(s) found, {len(pinned)} already pinned to a digest."
    )
    if mutable:
        lines.append(
            "A tag -- even a specific-looking one like :18 -- can be repointed at a "
            "different image by its publisher at any time. Run the imagetools command "
            "above for each finding, copy the Digest it prints, and replace :<tag> with "
            "@<that digest> (keep the tag as a trailing comment, e.g. `node@sha256:<digest> # 18`)."
        )
    else:
        lines.append("Every base image reference is pinned to a content digest.")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "path", nargs="?", default=".", help="directory to scan (default: current directory)"
    )
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="output format"
    )
    parser.add_argument(
        "--fail-on-risk",
        action="store_true",
        help="exit 2 when any mutable (unpinned) base image reference is found",
    )
    args = parser.parse_args(argv)

    findings = scan_path(args.path)

    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.path))

    if args.fail_on_risk and has_unresolved_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
