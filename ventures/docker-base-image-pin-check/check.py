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
  - `unresolved` -- the reference uses a build arg (`$FOO`, `${FOO}`) that
                  no `ARG` line before the first `FROM` gives a default, so
                  the image cannot be known from this file. Flagged and
                  counted as a risk: nothing in the file shows it is pinned.

Build args. An `ARG NAME=value` before the first `FROM` is a global build arg
and the only kind a `FROM` line can use (Docker's Dockerfile reference,
"Understand how ARG and FROM interact"). Such defaults are substituted
(`$X`, `${X}`, `${X:-word}`, `${X-word}`, `${X:+word}`, `${X+word}`) and the
result classified as above, with the original text kept in `from_arg`. A
`--build-arg` at build time can override a default; this tool reads the
file, so it checks the default a plain `docker build` would use.

Exit status: 0 normally (even with mutable findings, unless --fail-on-risk),
2 if --fail-on-risk was given and at least one mutable or unresolved finding
exists.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

PINNED = "pinned"
MUTABLE = "mutable"
STAGE = "stage"
SCRATCH = "scratch"
VARIABLE = "variable"
UNRESOLVED = "unresolved"

RISK_CLASSIFICATIONS = frozenset({MUTABLE, UNRESOLVED})

# A digest reference is `@<algorithm>:<hex>`. The reference grammar
# (github.com/distribution/reference) allows any lowercase alphanumeric
# algorithm name with at least 32 hex characters, and the OCI image spec
# (descriptor.md, "Registered algorithms") fixes the two registered ones:
# sha256 is exactly 64 and sha512 exactly 128 lowercase hex characters.
# Docker rejects `@sha256:` with 40 hex characters or upper case, so those
# are not pinned.
_DIGEST_RE = re.compile(r"^(?P<algo>[a-z0-9]+(?:[+._-][a-z0-9]+)*):(?P<hex>[0-9a-fA-F]{32,})$")
_REGISTERED_DIGEST_HEX = {"sha256": 64, "sha512": 128}


def digest_is_valid(digest):
    match = _DIGEST_RE.match(digest)
    if not match:
        return False
    want = _REGISTERED_DIGEST_HEX.get(match.group("algo"))
    if want is None:
        return True
    hex_part = match.group("hex")
    return len(hex_part) == want and hex_part == hex_part.lower()


_ARG_RE = re.compile(r"^\s*ARG\s+(?P<body>.+?)\s*$", re.IGNORECASE)
_VAR_RE = re.compile(
    r"\$(?:\{(?P<braced>[A-Za-z_][A-Za-z0-9_]*)(?:(?P<op>:?[-+])(?P<word>[^}]*))?\}"
    r"|(?P<bare>[A-Za-z_][A-Za-z0-9_]*))"
)


def parse_arg(body, args):
    """Record each `NAME` or `NAME=value` of one ARG instruction in args.
    A name with no default maps to None. Values may use earlier args."""
    for token in body.split():
        name, eq, value = token.partition("=")
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            continue
        if not eq:
            args.setdefault(name, None)
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        expanded, missing = expand_args(value, args)
        args[name] = None if missing else expanded


def expand_args(text, args):
    """Substitute build args the way a plain `docker build` (no --build-arg)
    would. Returns (text, names_with_no_value)."""
    missing = []

    def sub(match):
        name = match.group("braced") or match.group("bare")
        value = args.get(name)
        is_set = value is not None
        op = match.group("op")
        word = match.group("word") or ""
        if op == ":-":
            return value if is_set and value != "" else word
        if op == "-":
            return value if is_set else word
        if op == ":+":
            return word if is_set and value != "" else ""
        if op == "+":
            return word if is_set else ""
        if not is_set:
            missing.append(name)
            return match.group(0)
        return value

    out = _VAR_RE.sub(sub, text)
    if "$" in out and not missing:
        missing.append(out)
    return out, missing

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
    # BuildKit matches stage names case-insensitively; scan_text stores them
    # lowercased.
    if ref.lower() in stage_names:
        return STAGE, ref, None, None
    if ref.lower() == "scratch":
        return SCRATCH, ref, None, None
    if looks_variable(ref):
        return VARIABLE, ref, None, None

    name, tag, digest = split_name_and_ref(ref)

    if digest is not None:
        if digest_is_valid(digest):
            return PINNED, name, None, digest
        # Malformed digest-shaped suffix -- not a form buildkit would accept,
        # but not this tool's job to validate Dockerfile syntax either. Treat
        # it as mutable rather than silently dropping the finding.
        return MUTABLE, name, None, digest

    return MUTABLE, name, tag, None


def remediation_command(name, tag):
    """The exact, read-only command to look up the digest a mutable tag
    currently resolves to. This tool never runs it."""
    if not tag:
        # A malformed digest on a tagged image (`node:18@sha256:abc`) keeps
        # its tag in `name`; look that tag up rather than `node:18:latest`.
        name, tag, _ = split_name_and_ref(name)
    ref = f"{name}:{tag}" if tag else f"{name}:latest"
    return f"docker buildx imagetools inspect {ref}"


_DIRECTIVE_RE = re.compile(r"^#\s*([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(.+?)\s*$")
_KNOWN_DIRECTIVES = {"syntax", "escape", "check"}


def escape_char(text):
    """The line-continuation character a `# escape=` parser directive sets,
    or a backslash. BuildKit reads directives only at the very top of the
    file, before any blank line, comment or instruction, and an unknown
    directive ends the run. Windows Dockerfiles set escape=` so a path
    like `C:\\app\\` at the end of a line is not a continuation.
    Mirrors classify.mjs's escapeChar."""
    escape = "\\"
    for line in text.splitlines():
        match = _DIRECTIVE_RE.match(line.strip())
        if not match or match.group(1).lower() not in _KNOWN_DIRECTIVES:
            break
        if match.group(1).lower() == "escape" and match.group(2) in ("\\", "`"):
            escape = match.group(2)
    return escape


def logical_lines(text):
    """Join continued lines into one instruction, the way BuildKit reads
    them, and drop comment lines. The continuation character is a
    backslash unless an `# escape=` directive changes it. Returns
    (start_lineno, text) pairs. Comment and blank lines inside a
    continuation are skipped, as BuildKit does. Mirrors classify.mjs's
    logicalLines."""
    escape = escape_char(text)
    out = []
    buffer = None
    start = 0
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if buffer is None:
            if stripped.startswith("#"):
                continue
            start = lineno
            buffer = ""
        elif not stripped or stripped.startswith("#"):
            continue
        trimmed = line.rstrip()
        if trimmed.endswith(escape):
            buffer += trimmed[:-1] + " "
        else:
            out.append((start, buffer + line))
            buffer = None
    if buffer is not None:
        out.append((start, buffer))
    return out


def scan_text(text, filename="<Dockerfile>", stats=None):
    """Scan one Dockerfile's text. Returns a list of finding dicts. When
    `stats` is a dict, its "from_lines" count is increased by the number of
    FROM instructions read, findings or not."""
    findings = []
    stage_names = set()
    global_args = {}
    seen_from = False
    for lineno, line in logical_lines(text):
        if not seen_from:
            arg = _ARG_RE.match(line)
            if arg:
                parse_arg(arg.group("body"), global_args)
                continue
        match = _FROM_RE.match(line)
        if not match:
            continue
        seen_from = True
        if stats is not None:
            stats["from_lines"] = stats.get("from_lines", 0) + 1
        ref = match.group("ref")
        alias = match.group("alias")
        original = ref
        missing = []
        if looks_variable(ref):
            ref, missing = expand_args(ref, global_args)
        if missing:
            classification, name, tag, digest = UNRESOLVED, original, None, None
            _, _, after_at = original.rpartition("@")
            if "@" in original and "$" not in after_at and digest_is_valid(after_at):
                # The digest is literal even though the name varies.
                classification, digest = PINNED, after_at
                name = original.rsplit("@", 1)[0]
        else:
            classification, name, tag, digest = classify_from(ref, stage_names)
        if alias:
            stage_names.add(alias.lower())
        if classification not in (PINNED, MUTABLE, UNRESOLVED):
            continue  # stage/scratch: not a third-party pull, not this tool's concern
        finding = {
            "file": filename,
            "line": lineno,
            "image": name,
            "tag": tag,
            "digest": digest,
            "classification": classification,
        }
        if original != ref or missing:
            finding["from_arg"] = original
        if classification == MUTABLE:
            finding["remediation"] = remediation_command(name, tag)
        if classification == UNRESOLVED:
            names = sorted({m for m in missing if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m)})
            finding["unresolved_args"] = names
            finding["note"] = (
                "no ARG default before the first FROM sets "
                + (", ".join(names) if names else "this substitution")
                + "; give it one pinned to a digest, or check what --build-arg passes"
            )
        findings.append(finding)
    return findings


def discover_dockerfiles(root):
    """Every `Dockerfile`, `Dockerfile.*`, and `*.dockerfile` under root,
    skipping `.git` and `node_modules`, sorted for stable output. A file
    named directly is scanned whatever its name: pre-commit hooks and CI
    steps pass file names, and skipping one passed the file the gate exists
    to reject (red-team 2026-11-19)."""
    root_path = Path(root)
    if root_path.is_file():
        return [root_path]
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


def scan_path(root, stats=None):
    """Scan every Dockerfile under root. Returns a flat list of findings."""
    findings = []
    for path in discover_dockerfiles(root):
        try:
            # utf-8-sig drops a byte order mark the way BuildKit does, so a
            # BOM no longer hides the first FROM; a stray non-UTF-8 byte (a
            # Latin-1 comment) is replaced rather than crashing the scan.
            text = path.read_text(encoding="utf-8-sig", errors="replace")
        except OSError as exc:
            print(f"warning: could not read {path}: {exc}", file=sys.stderr)
            continue
        findings.extend(scan_text(text, filename=str(path), stats=stats))
    return findings


def has_unresolved_risk(findings):
    return any(f["classification"] in RISK_CLASSIFICATIONS for f in findings)


def render_text(findings, root, from_lines=None):
    if not findings:
        files = discover_dockerfiles(root)
        if not files:
            return "No Dockerfile, Dockerfile.*, or *.dockerfile found under " + str(root)
        if from_lines:
            return (
                f"Scanned {len(files)} Dockerfile(s); all {from_lines} FROM line(s) are "
                "scratch or earlier build stages, so nothing is pulled from a registry."
            )
        return f"Scanned {len(files)} Dockerfile(s); no FROM lines found to classify."

    mutable = [f for f in findings if f["classification"] == MUTABLE]
    pinned = [f for f in findings if f["classification"] == PINNED]
    unresolved = [f for f in findings if f["classification"] == UNRESOLVED]

    lines = []
    for f in unresolved:
        lines.append(f"?? {f['file']}:{f['line']}  FROM {f['image']} (build arg with no default)")
        lines.append(f"     {f['note']}")
        lines.append("")
    for f in mutable:
        ref_display = f"{f['image']}:{f['tag']}" if f["tag"] else f"{f['image']} (no tag -- resolves to :latest)"
        if f.get("digest"):
            ref_display = f"{f['image']}@{f['digest']} (malformed digest)"
        if f.get("from_arg"):
            ref_display += f" (from {f['from_arg']} with its ARG defaults)"
        lines.append(f"!! {f['file']}:{f['line']}  FROM {ref_display}")
        if f.get("remediation"):
            lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    summary = f"{len(mutable)} mutable base image reference(s) found, {len(pinned)} already pinned to a digest."
    if unresolved:
        summary += f" {len(unresolved)} built from a build arg with no default, so not shown to be pinned."
    lines.append(summary)
    if unresolved and not mutable:
        lines.append("No mutable tag was found, but the unresolved line(s) above are not shown to be pinned.")
    elif mutable:
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
        "path", nargs="?", default=".",
        help="directory to scan, or one Dockerfile (default: current directory)",
    )
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="output format"
    )
    parser.add_argument(
        "--fail-on-risk",
        action="store_true",
        help="exit 2 when any mutable or unresolved (unpinned) base image reference is found",
    )
    args = parser.parse_args(argv)
    if not os.path.exists(args.path):
        # A mistyped path used to print "No Dockerfile found" and exit 0, so a
        # CI gate with a typo passed forever.
        sys.exit(f"path not found: {args.path}")  # exit 1; 2 means "risk found"

    stats = {}
    findings = scan_path(args.path, stats=stats)

    if args.format == "json":
        print(json.dumps(findings, indent=2))
    else:
        print(render_text(findings, args.path, stats.get("from_lines", 0)))

    if args.fail_on_risk and has_unresolved_risk(findings):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
