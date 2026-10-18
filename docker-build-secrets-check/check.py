#!/usr/bin/env python3
"""Find Dockerfile instructions that bake a build-time secret into the image,
or copy an obviously sensitive local file into the build context.

    python3 check.py                       # scan every Dockerfile under .
    python3 check.py /path/to/repo         # scan a specific checkout
    python3 check.py --format json         # machine-readable
    python3 check.py --fail-on-risk        # exit 2 if any high-risk finding exists

## The risk this catches

Docker's own "Build secrets" documentation states the problem this tool
mechanises: passing a secret through `ARG` or `ENV` "is not recommended,
since this data is present in the final image and can be viewed by anyone
with access to the image using the `docker history` or `docker inspect`
commands" (docs.docker.com/build/building/secrets/). Two instruction shapes
create that exposure:

  - `ENV NAME=value` for a secret-looking `NAME` -- an `ENV` value is always
    baked into the image's config layer, whether it is a literal string or
    resolved from a build arg (`ARG TOKEN` then `ENV TOKEN=$TOKEN`).
  - `ARG NAME=value` for a secret-looking `NAME` *with a literal default* --
    the value is committed straight into the Dockerfile text, which is
    normally version-controlled.

A third shape is lower-severity and reported separately: `ARG NAME` for a
secret-looking `NAME` with **no** default. Nothing is committed to the
Dockerfile itself, but the instruction invites a caller to pass a secret via
`--build-arg`, which BuildKit still records for the build -- the safer route
is a `--mount=type=secret`, not a plain `ARG`.

This also flags `COPY`/`ADD` of a handful of well-known credential file
names (`.env`, `id_rsa`, `.npmrc`, `.aws/credentials`, ...) into the build
context, since a file baked into an image layer that way persists in the
image even if it is later deleted in a subsequent instruction (removed from
the filesystem a later stage sees, not from the layer history).

## What this is, and is not

A static, read-only, name-pattern scanner over Dockerfile text. It has no
idea whether a given `ARG`/`ENV` name actually holds a secret -- `API_KEY`
looks like one and might be a public, non-sensitive identifier; a value
named `TOKEN_EXPIRY_SECONDS` looks unlike one and holds a number. It cannot
see the *value* a build actually resolves at build time, only the
Dockerfile text, so a secret passed under a name this tool does not
recognise is a false negative it cannot close. It never inspects a real
image, never reads your actual secret material, and makes no network calls
of any kind.

## Classification

  - `env-secret`     -- an ENV instruction whose name looks like a secret.
                         Always flagged: an ENV value is unconditionally
                         baked into the image config.
  - `arg-literal`     -- an ARG instruction whose name looks like a secret
                         and which carries a literal default value in the
                         Dockerfile itself.
  - `arg-declared`    -- an ARG instruction whose name looks like a secret
                         with no default value. Advisory only: nothing is
                         committed to the Dockerfile, but the instruction
                         invites a `--build-arg` secret that BuildKit still
                         records unless passed as `--mount=type=secret`.
  - `sensitive-copy`  -- a COPY or ADD instruction naming a well-known
                         credential file as a source.

Exit status: 0 normally (even with findings, unless --fail-on-risk), 2 if
--fail-on-risk was given and at least one `env-secret`, `arg-literal`, or
`sensitive-copy` finding exists. `arg-declared` alone never trips
--fail-on-risk.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ENV_SECRET = "env-secret"
ARG_LITERAL = "arg-literal"
ARG_DECLARED = "arg-declared"
SENSITIVE_COPY = "sensitive-copy"

RISK_CLASSIFICATIONS = frozenset({ENV_SECRET, ARG_LITERAL, SENSITIVE_COPY})

# Name-pattern heuristic, not a value scanner. Checked against the
# instruction name with underscores/hyphens stripped and upper-cased, so
# DB_PASSWORD, db-password and dbPassword all normalise to "DBPASSWORD" and
# match the same substring -- word-boundary regexes do not help here because
# an underscore is itself a word character, so \bPASSWORD\b never matches
# inside DB_PASSWORD.
SECRET_NAME_SUBSTRINGS = (
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "PWD",
    "TOKEN",
    "APIKEY",
    "ACCESSKEY",
    "PRIVATEKEY",
    "CLIENTSECRET",
    "CREDENTIAL",
    "SIGNINGKEY",
    "ENCRYPTIONKEY",
    "SSHKEY",
    "GPGKEY",
    "AUTHKEY",
)

# Sensitive source filenames/paths for COPY and ADD. Matched against the
# basename (case-insensitive) or, for the path-fragment entries, against the
# full lowered source token -- so `secrets/.aws/credentials` is caught even
# though its basename alone (`credentials`) is not in the basename list.
_SENSITIVE_BASENAME_RE = re.compile(
    r"^("
    r"\.env(\..+)?"
    r"|id_rsa|id_dsa|id_ecdsa|id_ed25519"
    r"|.*\.pem"
    r"|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.htpasswd|\.dockercfg"
    r"|credentials\.json"
    r")$",
    re.IGNORECASE,
)
_SENSITIVE_PATH_SUBSTRINGS = (".aws/credentials", ".docker/config.json", ".kube/config", "/.ssh/")

_INSTRUCTION_RE = re.compile(r"^\s*(ARG|ENV|COPY|ADD)\s+(.*)$", re.IGNORECASE)
_ENV_PAIR_RE = re.compile(r'([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|\'[^\']*\'|\S*)')
_ARG_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$")


def looks_secret(name):
    normalized = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    return any(sub in normalized for sub in SECRET_NAME_SUBSTRINGS)


def _strip_quotes(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def iter_logical_lines(text):
    """Yield (start_lineno, joined_text) per Dockerfile logical line, joining
    a trailing backslash continuation onto the following physical line.

    A small joiner, not a real Dockerfile parser: it does not understand
    quoting around a trailing backslash, which is the same simplification
    `docker-base-image-pin-check/check.py` makes for `FROM`, applied here to
    instructions (`ENV`, `COPY`) that commonly do span more than one line.
    A comment line (starts with `#` once stripped) is never joined, matching
    Dockerfile's own rule that a comment cannot appear mid-instruction.
    """
    lines = text.splitlines()
    i = 0
    n = len(lines)
    while i < n:
        start = i + 1
        if lines[i].strip().startswith("#"):
            yield start, lines[i]
            i += 1
            continue
        parts = [lines[i]]
        while parts[-1].rstrip().endswith("\\") and i + 1 < n:
            parts[-1] = parts[-1].rstrip()[:-1]
            i += 1
            parts.append(lines[i])
        yield start, " ".join(p.strip() for p in parts)
        i += 1


def parse_env_pairs(rest):
    """Parse an ENV instruction's remainder into (name, value) pairs.

    Handles both the modern `ENV KEY=VALUE [KEY2=VALUE2 ...]` form and the
    legacy `ENV KEY value with spaces` single-pair form.
    """
    pairs = _ENV_PAIR_RE.findall(rest)
    if pairs:
        return [(name, _strip_quotes(value)) for name, value in pairs]
    parts = rest.split(None, 1)
    if len(parts) == 2:
        return [(parts[0], _strip_quotes(parts[1]))]
    if len(parts) == 1:
        return [(parts[0], "")]
    return []


def parse_arg(rest):
    """Parse an ARG instruction's remainder into (name, default_or_none).

    `default_or_none` is `None` when the instruction has no `=` at all --
    the "declared but never assigned in this file" case -- and a (possibly
    empty) string when it does.
    """
    match = _ARG_RE.match(rest.strip())
    if not match:
        return None, None
    name, default = match.group(1), match.group(2)
    if default is None:
        return name, None
    return name, _strip_quotes(default)


def _is_sensitive_source(token):
    token = token.strip("\"'")
    lowered = token.lower()
    if any(sub in lowered for sub in _SENSITIVE_PATH_SUBSTRINGS):
        return True
    basename = lowered.rsplit("/", 1)[-1]
    return bool(_SENSITIVE_BASENAME_RE.match(basename))


def parse_copy_sources(rest):
    """Extract candidate source paths from a COPY/ADD instruction's remainder.

    Supports the JSON-array form (`COPY ["a", "b", "dest"]`) and the plain
    shell form, skipping `--flag=value` tokens (`--from=`, `--chown=`, ...)
    in the shell form. The last remaining token is the destination and is
    never treated as a source.
    """
    stripped = rest.strip()
    if stripped.startswith("["):
        try:
            tokens = json.loads(stripped)
        except (json.JSONDecodeError, ValueError):
            return []
        if not isinstance(tokens, list) or len(tokens) < 2:
            return []
        return [str(t) for t in tokens[:-1]]

    tokens = [t for t in stripped.split() if not t.startswith("--")]
    if len(tokens) < 2:
        return []
    return tokens[:-1]


def scan_text(text, filename="<Dockerfile>"):
    """Scan one Dockerfile's text. Returns a list of finding dicts."""
    findings = []
    for lineno, line in iter_logical_lines(text):
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        match = _INSTRUCTION_RE.match(line)
        if not match:
            continue
        instruction = match.group(1).upper()
        rest = match.group(2)

        if instruction == "ENV":
            for name, value in parse_env_pairs(rest):
                if not value or not looks_secret(name):
                    continue
                findings.append({
                    "file": filename,
                    "line": lineno,
                    "instruction": instruction,
                    "name": name,
                    "classification": ENV_SECRET,
                    "remediation": (
                        f"Pass {name} with a BuildKit build secret instead: "
                        f"RUN --mount=type=secret,id={name.lower()} ... "
                        "(docs.docker.com/build/building/secrets/) -- a secret mounted "
                        "this way is available only during that RUN step and is never "
                        "written to a layer or the final image config."
                    ),
                })
        elif instruction == "ARG":
            name, default = parse_arg(rest)
            if not name or not looks_secret(name):
                continue
            if default:
                findings.append({
                    "file": filename,
                    "line": lineno,
                    "instruction": instruction,
                    "name": name,
                    "classification": ARG_LITERAL,
                    "remediation": (
                        f"A literal default for {name} is committed to this Dockerfile. "
                        "Remove the default and pass the value with a BuildKit build "
                        f"secret instead: RUN --mount=type=secret,id={name.lower()} ..."
                    ),
                })
            elif default is None:
                findings.append({
                    "file": filename,
                    "line": lineno,
                    "instruction": instruction,
                    "name": name,
                    "classification": ARG_DECLARED,
                    "remediation": (
                        f"If {name} is meant to carry a secret at build time, mount it "
                        f"as a BuildKit build secret (RUN --mount=type=secret,id={name.lower()}) "
                        "rather than --build-arg, which BuildKit still records for the build."
                    ),
                })
        elif instruction in ("COPY", "ADD"):
            for source in parse_copy_sources(rest):
                if not _is_sensitive_source(source):
                    continue
                findings.append({
                    "file": filename,
                    "line": lineno,
                    "instruction": instruction,
                    "name": source,
                    "classification": SENSITIVE_COPY,
                    "remediation": (
                        f"Add {source} to .dockerignore so it is never sent to the build "
                        "context. If the build genuinely needs it transiently, use "
                        "RUN --mount=type=secret or a multi-stage build that discards the "
                        "stage that copied it."
                    ),
                })
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
        return f"Scanned {len(files)} Dockerfile(s); no secret-looking findings."

    risky = [f for f in findings if f["classification"] in RISK_CLASSIFICATIONS]
    advisory = [f for f in findings if f["classification"] == ARG_DECLARED]

    lines = []
    for f in findings:
        marker = "!!" if f["classification"] in RISK_CLASSIFICATIONS else " ~"
        lines.append(f"{marker} {f['file']}:{f['line']}  {f['instruction']} {f['name']}  [{f['classification']}]")
        lines.append(f"     fix: {f['remediation']}")
        lines.append("")

    lines.append(
        f"{len(risky)} high-risk finding(s), {len(advisory)} advisory-only (bare ARG declaration)."
    )
    if risky:
        lines.append(
            "A secret-looking ENV value, a literal ARG default, or a copied credential "
            "file is baked into the image and visible via `docker history`/`docker "
            "inspect` regardless of later instructions. Use a BuildKit build secret "
            "(RUN --mount=type=secret) instead."
        )
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
        help="exit 2 when any env-secret, arg-literal, or sensitive-copy finding is found",
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
