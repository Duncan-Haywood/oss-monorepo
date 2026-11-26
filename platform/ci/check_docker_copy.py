#!/usr/bin/env python3
"""Flag a Node Docker image whose entry point imports a file the image never copies.

71 of the 72 tracked Dockerfiles list their files by name (`COPY calc.mjs
hub.mjs server.mjs ./`) rather than copying the folder. Nothing read those
lists: a run that adds `payrules.mjs` and imports it from `server.mjs` passes
every test (the tests import from the source tree) and ships an image that
dies at start with ERR_MODULE_NOT_FOUND. A ventures run on 2026-11-15 named
the gap for shift-roster-builder ("a new hub module silently breaks the Docker
image unless added; no test catches it").

For each Dockerfile whose final stage runs `node <entry>` (CMD or ENTRYPOINT),
this builds the image's file list from the final stage's WORKDIR and COPY/ADD
lines, then walks the static relative imports from the entry: `import ... from
"./x"`, `import "./x"`, `export ... from "./x"`, `import("./x")` and
`require("./x")` with a literal path, and `new URL("./x", import.meta.url)`
(workers, sibling files read at runtime). A target the image lacks is a hit.
Files copied from another stage (`COPY --from=`) and bare package names are
trusted. The build context is the nearest folder, from the Dockerfile's own
upward, that holds every plain COPY source; a source no such folder holds is a
hit too. Test fixtures (`/fixtures/` in the path) are skipped.

A line checked and intended (an optional import in a try block) may carry
`docker-copy: ok`. Exit 1 lists each hit.
Usage: python3 platform/ci/check_docker_copy.py [Dockerfile ...]
"""
import fnmatch
import json
import posixpath
import re
import shlex
import sys
from pathlib import Path
from repo_files import ls_files

ROOT = Path(__file__).resolve().parents[2]
ALLOW = "docker-copy: ok"
JS = (".mjs", ".js", ".cjs")

SPEC = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])(\.{1,2}/[^"'\n]+)\1"""
    r"""|\bnew\s+URL\s*\(\s*(["'])(\.{1,2}/[^"'\n]+)\3\s*,\s*import\.meta\.url""")
COMMENT = re.compile(r"/\*.*?\*/", re.S)


def tracked_dockerfiles(root=ROOT):
    out = ls_files(root, "*Dockerfile", "*Dockerfile.*")
    return [root / p for p in out if "/fixtures/" not in p and "node_modules" not in p
            and not p.endswith(".dockerignore")]


def instructions(text):
    """(KEYWORD, rest) per instruction, continuations joined, comments dropped."""
    lines, buf = [], ""
    for raw in text.splitlines():
        s = raw.strip()
        if not buf and (not s or s.startswith("#")):
            continue
        if s.endswith("\\"):
            buf += s[:-1] + " "
            continue
        buf += s
        if buf:
            kw, _, rest = buf.partition(" ")
            lines.append((kw.upper(), rest.strip()))
        buf = ""
    return lines


def final_stage(instrs):
    start = 0
    for i, (kw, _) in enumerate(instrs):
        if kw == "FROM":
            start = i
    return instrs[start:]


def args_of(rest):
    """Exec form (JSON array) or shell form, flags split off."""
    if rest.startswith("["):
        try:
            parts = json.loads(rest)
        except ValueError:
            parts = shlex.split(rest)
    else:
        parts = shlex.split(rest)
    flags = [p for p in parts if p.startswith("--")]
    return flags, [p for p in parts if not p.startswith("--")]


def node_entry(stage):
    cmd = entry = None
    for kw, rest in stage:
        if kw == "CMD":
            cmd = args_of(rest)[1]
        elif kw == "ENTRYPOINT":
            entry = args_of(rest)[1]
    argv = (entry or []) + (cmd or []) if entry else (cmd or [])
    if len(argv) >= 2 and posixpath.basename(argv[0]) == "node":
        for a in argv[1:]:
            if not a.startswith("-"):
                return a
    return None


def sources_of(stage):
    """Plain COPY/ADD sources of the stage (not --from, not URLs)."""
    for kw, rest in stage:
        if kw not in ("COPY", "ADD"):
            continue
        flags, parts = args_of(rest)
        if any(f.startswith("--from") for f in flags) or len(parts) < 2:
            continue
        for src in parts[:-1]:
            if "://" not in src:
                yield src


def build_context(dockerfile, stage):
    """Nearest folder, from the Dockerfile's up to the repo root, holding every source."""
    srcs = [s for s in sources_of(stage) if not any(c in s for c in "*?[")]
    folder = dockerfile.parent
    while True:
        if all((folder / s).exists() for s in srcs):
            return folder, []
        if folder == ROOT or folder.parent == folder:
            break
        folder = folder.parent
    here = dockerfile.parent
    return here, [s for s in srcs if not (here / s).exists()]


def image_files(stage, context):
    """{image path: repo path} for the stage's plain copies; set of --from destinations."""
    files, foreign, workdir = {}, [], "/"
    for kw, rest in stage:
        if kw == "WORKDIR":
            workdir = posixpath.normpath(posixpath.join(workdir, rest.strip('"')))
            continue
        if kw not in ("COPY", "ADD"):
            continue
        flags, parts = args_of(rest)
        if len(parts) < 2:
            continue
        dest = posixpath.join(workdir, parts[-1])
        if any(f.startswith("--from") for f in flags):
            foreign.append(posixpath.normpath(dest))
            continue
        srcs = []
        for s in parts[:-1]:
            if "://" in s:
                continue
            if any(c in s for c in "*?["):
                srcs += [p for p in sorted(context.glob(s))]
            elif (context / s).exists():
                srcs.append(context / s)
        multi = len(parts) > 2 or parts[-1].endswith("/") or any(c in "".join(parts[:-1]) for c in "*?[")
        for src in srcs:
            if src.is_dir():
                for f in src.rglob("*"):
                    if f.is_file():
                        files[posixpath.normpath(posixpath.join(dest, f.relative_to(src).as_posix()))] = f
            else:
                target = posixpath.join(dest, src.name) if multi else dest
                files[posixpath.normpath(target)] = src
    return files, foreign, workdir


def specifiers(path):
    """(line number, relative specifier) for each static import-like reference."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    lines = text.splitlines()
    stripped = COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    for no, line in enumerate(stripped.splitlines(), 1):
        code = line.split("//")[0] if not re.search(r"""["'][^"']*//""", line) else line
        if code.lstrip().startswith("*"):
            continue
        prev = lines[no - 2] if no >= 2 else ""
        if ALLOW in lines[no - 1] or ALLOW in prev:
            continue
        for m in SPEC.finditer(code):
            spec = m.group(2) or m.group(4)
            if "${" in spec:
                continue
            yield no, spec


def check(dockerfile):
    """List of problem strings for one Dockerfile."""
    rel = dockerfile.relative_to(ROOT).as_posix()
    stage = final_stage(instructions(dockerfile.read_text(encoding="utf-8")))
    entry = node_entry(stage)
    if not entry:
        return []
    context, missing_src = build_context(dockerfile, stage)
    problems = [f"{rel}: COPY source {s} is not in the build context ({context.relative_to(ROOT).as_posix() or '.'})"
                for s in missing_src]
    files, foreign, workdir = image_files(stage, context)

    def present(p):
        # A directory reference (`new URL("../fonts/", import.meta.url)`) is satisfied by
        # any file the image holds under that directory.
        return (p in files or any(p == f or p.startswith(f + "/") for f in foreign)
                or any(k.startswith(p + "/") for k in files))

    start = posixpath.normpath(posixpath.join(workdir, entry))
    if not present(start):
        return problems + [f"{rel}: entry {entry} is never copied into the image"]
    seen, todo = set(), [start]
    while todo:
        img = todo.pop()
        if img in seen or img not in files:
            continue
        seen.add(img)
        src = files[img]
        if not src.name.endswith(JS):
            continue
        for no, spec in specifiers(src):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(img), spec.split("?")[0]))
            if present(target):
                todo.append(target)
                continue
            where = src.relative_to(ROOT).as_posix()
            on_disk = (src.parent / spec).resolve()
            note = "" if on_disk.exists() else " (and not in the source tree either)"
            problems.append(f"{rel}: {where}:{no} references {spec}, which the image never copies{note}")
    return problems


def main(argv):
    paths = [Path(a).resolve() for a in argv] or tracked_dockerfiles()
    problems, checked = [], 0
    for p in paths:
        found = check(p)
        stage = final_stage(instructions(p.read_text(encoding="utf-8")))
        checked += bool(node_entry(stage))
        problems += found
    for line in problems:
        print(line)
    print(f"{checked} node images checked; {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
