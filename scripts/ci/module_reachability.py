#!/usr/bin/env python3
"""
Module reachability — which venture source files anything actually loads.

`scripts/ci/cap_ratchet.py` pins money constants in thirty print-atelier files
under `src/lib/`, and its PASS line reports "87 pinned venture numbers, each at
its declared value". That sentence is true and, for part of the population, it
is a statement about nothing: several of those files are imported by no
entrypoint of the application and by no module any entrypoint reaches. Their
only importer is their own test. The pin is a spend control over a function
that never runs, and the venture already has the corrected version of this
exact shape recorded in its own history — a dead `channel-budget-plans.ts`
allocator sitting beside the live `marketplace.ts` one, both computing a budget,
only one of them reachable.

So this control measures the thing the pin population assumed: for each
enrolled venture, the set of tracked source modules that the framework's own
entrypoints can reach, transitively, following static imports.

Why transitive and not "does anything import this"
--------------------------------------------------
A direct-importer scan calls a module reachable when any other file names it.
That is wrong in exactly the case that matters: a dead module imported by a
second dead module is counted live, and dead code arrives in clusters because
a feature is built as a group of files. Measured on print-atelier at d357a64b,
a direct-importer scan reported 58 unreachable modules under `src/lib`, and the
transitive closure reports 63. The five it missed were dead modules held up by
other dead modules.

Test files are not entrypoints, and their edges confer nothing
--------------------------------------------------------------
This is the whole point of the measurement, so it is stated as a rule rather
than as a filter: a test file is removed from the graph entirely, not merely
excluded from the answer. `node --test tests/*.test.ts` imports every one of the
unreachable modules below — that is why they have coverage, and why every
existing control reports them as healthy source. A suite is evidence that a
module *works*; it is not evidence that anything *calls* it.

Where entrypoints come from
---------------------------
Not from a list in this file. For a Next.js project the framework itself
decides what is loaded, and the rule is the App Router's file-system contract:

  * `<app>/**/{page,layout,template,loading,error,global-error,not-found,
    default,route,sitemap,robots,manifest,icon,apple-icon,opengraph-image,
    twitter-image}.{ts,tsx,js,jsx}` — Next builds a route for each of these by
    finding the file, with no import anywhere. Every other file under `app/` is
    ordinary colocated source: reachable only if something imports it, which is
    also what Next does with it.
  * `middleware.*` and `instrumentation.*` at the project or `src/` root — the
    two files Next loads by name rather than by import.
  * the config files the build reads by name: `next.config.*`,
    `tailwind.config.*`, `postcss.config.*`, `eslint.config.*`.
  * `convex/**` when `convex` is a dependency: the Convex CLI deploys every
    module in that directory as a function endpoint, so the directory is a set
    of roots in the same sense the App Router's tree is.
  * files directly inside the project's `scripts/` directory, which are run by a
    human or a workflow rather than imported. Only depth one: a helper module in
    `scripts/lib/` is reachable if a script imports it and dead if not, which is
    the same question this control asks everywhere else.
  * any tracked source file named as an argument in a `package.json` script —
    `tsx prisma/seed.ts`, `node build.mjs`. A test file named there stays a test
    file; `npm test` naming a suite does not make the suite a root.

A project this file cannot classify is reported as unmeasured rather than
measured as zero. A vite app and a `tsc -p` library have different load rules
and guessing at them would produce a confident zero, which is the failure mode
`docs/` calls a shipped feature that quietly does nothing.

The budget, and why it is not written here by hand
--------------------------------------------------
Each measured project declares a `MAX_UNREACHABLE_*` constant below. Two
independent things hold those numbers, and deliberately not one:

1. They carry a `MAX_` prefix in `scripts/ci/`, so
   `tests/test_cap_ratchet.py::test_every_bound_constant_in_the_ci_scripts_is_watched`
   refuses to pass until each appears in `cap_ratchet.WATCHES`. Once watched,
   each is held to the lowest value it has ever held in git — a bound derived
   from history rather than from a line someone typed. Raising one is refused
   by a control that is not this one.
2. `--emit-budgets` regenerates the whole block from a live measurement, so the
   numbers are never hand-kept. A hand-written baseline in this repository has
   been forged twice; the defence that worked was making the baseline a thing
   you re-derive rather than a thing you assert.

The comparison is two-directional, as `coverage_ratchet.py`'s is. Above budget
fails: dead code grew. Below budget also fails: the budget is stale, and the
diff that deleted the dead module must lower it in the same change or the
headroom stays available to the next one.

The cross-check this exists for
-------------------------------
`cap_ratchet`'s pin population is imported here rather than re-typed, and every
pin whose file the closure does not reach is a finding. That pairing — a
money constant guarded at an exact value, in a file nothing loads — is the
false register the assignment behind this control names, and it must be
argued for one path at a time in `PINS_ON_UNREACHABLE_MODULES` rather than
tolerated in bulk. The registry is checked in both directions: an entry whose
module has become reachable, or which no longer carries a pin, is itself a
failure, so the list cannot outlive its reasons.

Deliberately fails closed. An unreadable `tsconfig.json`, a git failure, a
budget for a project that no longer exists, and a measured project with no
budget are each a failure rather than a skip.

What it does not do: it does not prove a reachable module is *used* — a
function exported from a reached module and called by nobody is invisible here,
and finding those needs a symbol-level graph. It also does not follow a
specifier built at runtime; there are none in the enrolled tree today, and
`tests/test_module_reachability.py` fails if a computed `import()` appears,
because that is the one construct that would make this measurement an
overestimate without saying so.

Usage:
    python3 scripts/ci/module_reachability.py                 # audit, exit 1 on failure
    python3 scripts/ci/module_reachability.py --report        # measure, always exit 0
    python3 scripts/ci/module_reachability.py --json          # machine-readable
    python3 scripts/ci/module_reachability.py --list <path>   # name the dead modules
    python3 scripts/ci/module_reachability.py --emit-budgets  # regenerate the block below
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, FrozenSet, Iterable, List, Optional, Sequence, Set, Tuple

CI_DIR = Path(__file__).resolve().parent
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import cap_ratchet

REPO_ROOT = Path(__file__).resolve().parents[2]

#: The tree this control measures. Ventures only: `platform/` and `portfolio/`
#: are Python and shell, and `scripts/ci/gate_wiring.py` already answers the
#: "does anything run this" question for the controls themselves.
VENTURES_ROOT = "ventures/"

#: Extensions that are modules in the graph. `.d.ts` is deliberately absent: a
#: declaration file is consumed by the type-checker rather than loaded at
#: runtime, so asking whether anything imports it is a different question with a
#: different answer, and counting them would inflate every number below.
SOURCE_EXTENSIONS: Tuple[str, ...] = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")

#: The order a bare specifier is tried in. TypeScript's resolver prefers the
#: TypeScript sources, and so does `tsx`, which is what `package.json` runs.
RESOLUTION_EXTENSIONS: Tuple[str, ...] = SOURCE_EXTENSIONS

#: Extensions a specifier may carry that must be re-tried against a TypeScript
#: source. `import "./x.js"` from a `.ts` module resolves to `./x.ts` under
#: NodeNext, and writing it the other way is a type error, so the mapping is
#: one-directional.
REWRITTEN_SPECIFIER_EXTENSIONS: Tuple[str, ...] = (".js", ".mjs", ".cjs", ".jsx")

#: Next.js App Router file conventions. Each of these is loaded by the framework
#: because of where it sits and what it is called — no import names it. This is
#: the entrypoint rule for an app directory, taken from the router's contract
#: rather than guessed; anything else under `app/` is colocated source.
NEXT_ROUTER_STEMS: FrozenSet[str] = frozenset(
    {
        "page",
        "layout",
        "template",
        "loading",
        "error",
        "global-error",
        "not-found",
        "default",
        "route",
        "sitemap",
        "robots",
        "manifest",
        "icon",
        "apple-icon",
        "opengraph-image",
        "twitter-image",
    }
)

#: The modules Next loads by name from the project or `src/` root. `proxy` is
#: Next 16's rename of `middleware`, and both spellings are live in this tree:
#: quick-pick-survey and local-site-studio are on 16.x and ship `src/proxy.ts`,
#: ai-first-markets and photo-editing/docs-site are on 15.x and ship
#: `src/middleware.ts`. Recognising only the older name reported
#: quick-pick-survey's origin check — the file that stands in front of eighteen
#: mutating API handlers — as code nothing loads.
NEXT_ROOT_STEMS: FrozenSet[str] = frozenset({"middleware", "proxy", "instrumentation"})

#: A tool config at the project root, read by filename rather than imported:
#: `next.config.mjs`, `tailwind.config.ts`, `playwright.config.ts`,
#: `open-next.config.ts`, `vitest.integration.config.ts`. Written as the shape
#: rather than as a list of the five tools this tree happens to use today,
#: because a curated list cannot fail on the config it omits — and the way it
#: fails is by reporting a live config, and everything only it imports, as dead.
CONFIG_NAME_RE = re.compile(r"\.config\.[cm]?[jt]sx?$")

#: Directories whose contents are test material: fixtures, helpers, harness
#: setup and end-to-end specs. Excluded from the product graph in the same way
#: and for the same reason a `*.test.ts` file is — `src/test/integration/db.ts`
#: and `tests/support/print-files.ts` are loaded by a runner, not by the
#: application, and counting them as unreachable product code would put noise
#: in front of the finding this control exists to report.
TEST_DIRS: FrozenSet[str] = frozenset(
    {"test", "tests", "e2e", "__tests__", "__mocks__", "fixtures", "testing"}
)

NEXT_APP = "next-app"
UNCLASSIFIED = "unclassified"


# ---------------------------------------------------------------------------
# Per-project budgets.
#
# Regenerate with `python3 scripts/ci/module_reachability.py --emit-budgets`.
# Do not edit by hand: the number is the measurement, and a measurement someone
# typed is the shape `docs/` records as a forged baseline.
#
# Each is watched in `cap_ratchet.WATCHES`, which holds it to the lowest value
# it has ever held in git. That is what makes "may only go down" a property of
# the repository rather than a sentence in this comment.
# ---------------------------------------------------------------------------

MAX_UNREACHABLE_AI_FIRST_MARKETS = 0
MAX_UNREACHABLE_LOCAL_SITE_STUDIO = 1
MAX_UNREACHABLE_PHOTO_EDITING_DOCS_SITE = 0
MAX_UNREACHABLE_PRINT_ATELIER = 63
MAX_UNREACHABLE_QUICK_PICK_SURVEY = 7
MAX_UNREACHABLE_REAL_ESTATE_AGENT_PHOTO_APP_DOCS_SITE = 0
MAX_UNREACHABLE_REAL_ESTATE_AGENT_PHOTO_APP_RESEARCH = 0

BUDGETS: Dict[str, int] = {
    "ventures/ai-first-markets": MAX_UNREACHABLE_AI_FIRST_MARKETS,
    "ventures/local-site-studio": MAX_UNREACHABLE_LOCAL_SITE_STUDIO,
    "ventures/photo-editing/docs-site": MAX_UNREACHABLE_PHOTO_EDITING_DOCS_SITE,
    "ventures/print-atelier": MAX_UNREACHABLE_PRINT_ATELIER,
    "ventures/quick-pick-survey": MAX_UNREACHABLE_QUICK_PICK_SURVEY,
    "ventures/real-estate-agent-photo-app/docs-site": MAX_UNREACHABLE_REAL_ESTATE_AGENT_PHOTO_APP_DOCS_SITE,
    "ventures/real-estate-agent-photo-app/research": MAX_UNREACHABLE_REAL_ESTATE_AGENT_PHOTO_APP_RESEARCH,
}


def budget_constant_name(project: str) -> str:
    """The `MAX_UNREACHABLE_*` name a project's budget must be declared under.

    Derived from the path so the link between the dict entry and the watched
    constant is mechanical. `tests/test_module_reachability.py` re-derives every
    name with this function and fails on a mismatch, which is what stops a
    budget being declared under a name `cap_ratchet` happens not to watch.
    """
    stem = project[len(VENTURES_ROOT) :] if project.startswith(VENTURES_ROOT) else project
    return "MAX_UNREACHABLE_" + re.sub(r"[^A-Za-z0-9]+", "_", stem).upper()


@dataclass(frozen=True)
class PinOnUnreachableModule:
    """A cap_ratchet pin standing on a module nothing loads, and the argument for it.

    Not an exemption in the ordinary sense: nothing here says the pairing is
    fine. It says the pairing is known, whose it is, and when the argument
    expires. `evaluate` fails on an entry whose module has become reachable and
    on an entry whose file no longer carries a pin, so the registry cannot
    accumulate rows that stopped meaning anything — the failure mode a waiver
    list reaches by being append-only.
    """

    path: str
    owner: str
    expires: str
    why: str


#: Registered pairings, one path at a time.
#:
#: Every row below is the *defect*, recorded rather than waived: a money number
#: guarded at an exact value inside a file no entrypoint reaches. The right
#: resolution for each is either to wire the module into the checkout path it
#: was written for, or to delete it and drop its pin — both of which lower
#: `MAX_UNREACHABLE_PRINT_ATELIER` and shorten this list in the same diff.
#: Until one of those happens the pairing is at least visible, which is more
#: than the PASS line said before.
PINS_ON_UNREACHABLE_MODULES: Tuple[PinOnUnreachableModule, ...] = ()


class ReachabilityError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class Finding:
    check: str
    message: str


@dataclass
class Project:
    path: str
    kind: str
    modules: Tuple[str, ...] = ()
    entrypoints: Tuple[str, ...] = ()
    reached: Tuple[str, ...] = ()
    unreachable: Tuple[str, ...] = ()
    #: Every source file under the project, including tests, for the report's
    #: denominator. A test file is not in `modules` and not in the graph.
    tests: Tuple[str, ...] = ()


@dataclass
class Measurement:
    projects: List[Project] = field(default_factory=list)
    unmeasured: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def by_path(self) -> Dict[str, Project]:
        return {project.path: project for project in self.projects}


def _git(repo_root: Path, *args: str) -> str:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    proc = subprocess.run(
        ["git", *args], cwd=repo_root, capture_output=True, text=True, env=env
    )
    if proc.returncode != 0:
        raise ReachabilityError(
            f"git {' '.join(args)} failed: {proc.stderr.strip() or 'no stderr'}"
        )
    return proc.stdout


def tracked_files(repo_root: Path, root: str = VENTURES_ROOT) -> List[str]:
    """Every tracked path under `root`, sorted.

    From `git ls-files`, never from a filesystem walk. A `readdirSync`-style
    scan in this repository has already been found counting a developer's
    `.next/` output, which made a control's number differ between the working
    tree and a clean clone; the whole value of a reachability number is that it
    is the same everywhere.
    """
    return sorted(line for line in _git(repo_root, "ls-files", "--", root).splitlines() if line)


def is_skipped(rel: str) -> bool:
    return any(part in cap_ratchet.VENTURE_SKIP_DIRS for part in rel.split("/"))


def is_test(rel: str) -> bool:
    """Is this file test material rather than product source?

    Two ways to be: the `*.test.ts` / `*.spec.ts` naming `cap_ratchet` already
    enumerates by, and living inside a directory that exists to hold a suite.
    Both are removed from the graph entirely rather than filtered out of the
    answer, so a test importing a module confers nothing on it.
    """
    if cap_ratchet.VENTURE_TEST_FILE.search(rel) is not None:
        return True
    return any(part in TEST_DIRS for part in rel.split("/")[:-1])


def is_source(rel: str) -> bool:
    return rel.endswith(SOURCE_EXTENSIONS) and not rel.endswith(".d.ts")


def strip_json_comments(text: str) -> str:
    """Enough of JSONC to read a `tsconfig.json`.

    String-aware: a `//` inside a quoted path must survive, or `"@/*": ["./src/*"]`
    reads as a truncated object and the alias table comes back empty — which
    would report every `@/`-imported module as unreachable and be indistinguishable
    from a real finding.
    """
    out: List[str] = []
    index = 0
    length = len(text)
    while index < length:
        char = text[index]
        if char == '"':
            out.append(char)
            index += 1
            while index < length:
                out.append(text[index])
                if text[index] == "\\":
                    index += 1
                    if index < length:
                        out.append(text[index])
                        index += 1
                    continue
                if text[index] == '"':
                    index += 1
                    break
                index += 1
            continue
        if char == "/" and index + 1 < length and text[index + 1] == "/":
            while index < length and text[index] != "\n":
                index += 1
            continue
        if char == "/" and index + 1 < length and text[index + 1] == "*":
            index += 2
            while index + 1 < length and not (text[index] == "*" and text[index + 1] == "/"):
                index += 1
            index += 2
            continue
        out.append(char)
        index += 1
    return "".join(out)


def read_jsonc(repo_root: Path, rel: str) -> dict:
    raw = strip_json_comments((repo_root / rel).read_text(encoding="utf-8"))
    raw = re.sub(r",(\s*[}\]])", r"\1", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ReachabilityError(f"{rel}: not readable as JSON ({exc})") from exc
    if not isinstance(data, dict):
        raise ReachabilityError(f"{rel}: expected an object at the top level")
    return data


def alias_table(repo_root: Path, project: str, tracked: Sequence[str]) -> Dict[str, List[str]]:
    """`compilerOptions.paths` for a project, as repository-relative prefixes.

    Read from the project's own `tsconfig.json`. Guessing that `@/` means
    `src/` would be right for all seven projects here and silently wrong for the
    eighth, and a resolver that silently fails to resolve reports dead code that
    is not dead.
    """
    config = f"{project}/tsconfig.json"
    if config not in tracked:
        return {}
    data = read_jsonc(repo_root, config)
    options = data.get("compilerOptions") or {}
    base_url = options.get("baseUrl") or "."
    paths = options.get("paths") or {}
    if not isinstance(paths, dict):
        raise ReachabilityError(f"{config}: `compilerOptions.paths` is not an object")
    table: Dict[str, List[str]] = {}
    for pattern, targets in paths.items():
        if not isinstance(targets, list):
            raise ReachabilityError(f"{config}: `paths[{pattern!r}]` is not a list")
        resolved = [
            os.path.normpath(os.path.join(project, str(base_url), str(target)))
            for target in targets
        ]
        table[str(pattern)] = resolved
    return table


#: Static module specifiers. Three shapes, and each is a real edge:
#:
#:   * `import x from "s"`, `import "s"`, `import type {T} from "s"`
#:   * `export {x} from "s"`, `export * from "s"`
#:   * `import("s")` and `require("s")` with a literal argument
#:
#: A dynamic `import(variable)` is not matched — it cannot be, statically — and
#: the contract test refuses one in the enrolled tree rather than letting this
#: file quietly overestimate.
SPECIFIER_RE = re.compile(
    r"""(?:^|[^.\w$])(?:import|export)\s*(?:type\s+)?
        (?:[\s\S]*?\sfrom\s*)?["']([^"'\n]+)["']
      | (?:^|[^.\w$])(?:import|require)\s*\(\s*["']([^"'\n]+)["']\s*\)
    """,
    re.M | re.X,
)

COMPUTED_IMPORT_RE = re.compile(r"(?:^|[^.\w$])import\s*\(\s*(?![\"'\)])")

BLOCK_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")


def strip_comments(source: str) -> str:
    """Remove comments without eating a `//` inside a string or a regex literal.

    A naive `//.*` strip deletes the tail of `import x from "https://…"`. That
    would silently drop edges, and a dropped edge is a module reported dead.
    """
    without_blocks = BLOCK_COMMENT_RE.sub(" ", source)
    out: List[str] = []
    for line in without_blocks.split("\n"):
        index = 0
        quote: Optional[str] = None
        cut: Optional[int] = None
        while index < len(line):
            char = line[index]
            if quote:
                if char == "\\":
                    index += 2
                    continue
                if char == quote:
                    quote = None
                index += 1
                continue
            if char in "\"'`":
                quote = char
                index += 1
                continue
            if char == "/" and index + 1 < len(line) and line[index + 1] == "/":
                cut = index
                break
            index += 1
        out.append(line if cut is None else line[:cut])
    return "\n".join(out)


def specifiers_in(source: str) -> List[str]:
    body = strip_comments(source)
    found: List[str] = []
    for match in SPECIFIER_RE.finditer(body):
        specifier = match.group(1) or match.group(2)
        if specifier:
            found.append(specifier)
    return found


def has_computed_import(source: str) -> bool:
    return COMPUTED_IMPORT_RE.search(strip_comments(source)) is not None


def resolve(
    specifier: str,
    importer: str,
    project: str,
    aliases: Dict[str, List[str]],
    tracked: FrozenSet[str],
) -> Optional[str]:
    """A specifier as a tracked repository path, or None if it is not one of ours.

    None means a package (`react`, `node:crypto`, `@retail-pilot/schemas`) or an
    asset that is not a module in this graph. It is not an error: the graph is
    over this repository's own files.
    """
    bases: List[str] = []
    if specifier.startswith("."):
        bases.append(os.path.normpath(os.path.join(os.path.dirname(importer), specifier)))
    else:
        for pattern, targets in aliases.items():
            if pattern.endswith("/*"):
                prefix = pattern[:-1]
                if specifier.startswith(prefix):
                    tail = specifier[len(prefix) :]
                    bases.extend(
                        os.path.normpath(target[:-1] + tail)
                        for target in targets
                        if target.endswith("*")
                    )
            elif pattern == specifier:
                bases.extend(targets)
    if not bases:
        return None

    candidates: List[str] = []
    for base in bases:
        candidates.append(base)
        for extension in RESOLUTION_EXTENSIONS:
            candidates.append(base + extension)
        for suffix in REWRITTEN_SPECIFIER_EXTENSIONS:
            if base.endswith(suffix):
                stem = base[: -len(suffix)]
                candidates.extend(stem + extension for extension in RESOLUTION_EXTENSIONS)
        for extension in RESOLUTION_EXTENSIONS:
            candidates.append(f"{base}/index{extension}")
    for candidate in candidates:
        if candidate in tracked and is_source(candidate):
            return candidate
    return None


def package_script_paths(repo_root: Path, project: str, tracked: FrozenSet[str]) -> List[str]:
    """Tracked source files named as arguments in this project's `package.json` scripts.

    `tsx prisma/seed.ts` and `node build.mjs` are entrypoints: something runs
    them, and nothing imports them. A test file named in a script is still a
    test file — `npm test` naming a suite does not make the suite a root, and
    treating it as one would hand every module its own test's reachability,
    which is the exact confusion this control exists to remove.
    """
    manifest = f"{project}/package.json"
    if manifest not in tracked:
        return []
    scripts = read_jsonc(repo_root, manifest).get("scripts") or {}
    found: Set[str] = set()
    for command in scripts.values():
        if not isinstance(command, str):
            continue
        try:
            tokens = shlex.split(command)
        except ValueError:
            tokens = command.split()
        for token in tokens:
            if "*" in token or not token.endswith(SOURCE_EXTENSIONS):
                continue
            candidate = os.path.normpath(os.path.join(project, token))
            if candidate in tracked and is_source(candidate) and not is_test(candidate):
                found.add(candidate)
    return sorted(found)


def next_entrypoints(
    repo_root: Path, project: str, modules: Sequence[str], tracked: FrozenSet[str], convex: bool
) -> List[str]:
    """The roots the framework loads without anyone importing them.

    Every clause is a rule of Next's, not a preference of this file's; the
    module docstring names the contract each comes from.
    """
    roots: Set[str] = set()
    app_prefixes = (f"{project}/app/", f"{project}/src/app/")
    root_prefixes = (f"{project}/", f"{project}/src/")
    for rel in modules:
        name = rel.rsplit("/", 1)[-1]
        stem = name.rsplit(".", 1)[0]
        if rel.startswith(app_prefixes) and stem in NEXT_ROUTER_STEMS:
            roots.add(rel)
        head = rel.rsplit("/", 1)[0] + "/"
        if head in root_prefixes and stem in NEXT_ROOT_STEMS:
            roots.add(rel)
        if head == f"{project}/" and CONFIG_NAME_RE.search(name):
            roots.add(rel)
        if head == f"{project}/scripts/":
            roots.add(rel)
        if rel.startswith(f"{project}/public/"):
            # `public/` is served verbatim at the site root, so a module there is
            # fetched by a browser rather than imported by anything.
            # quick-pick-survey's service worker is the case in this tree.
            roots.add(rel)
        if convex and rel.startswith(f"{project}/convex/"):
            roots.add(rel)
    roots.update(package_script_paths(repo_root, project, tracked))
    return sorted(roots)


def discover_projects(repo_root: Path, tracked: Sequence[str]) -> List[Tuple[str, str, bool]]:
    """`(project, kind, uses_convex)` for every tracked `package.json` under ventures.

    Enumerated, not listed: a new venture is enrolled by having a manifest, or
    not at all. A curated population cannot fail on the member it omits.
    """
    found: List[Tuple[str, str, bool]] = []
    for rel in tracked:
        if not rel.endswith("/package.json") or is_skipped(rel):
            continue
        project = rel[: -len("/package.json")]
        manifest = read_jsonc(repo_root, rel)
        dependencies = dict(manifest.get("dependencies") or {})
        dependencies.update(manifest.get("devDependencies") or {})
        has_app = any(
            path.startswith((f"{project}/app/", f"{project}/src/app/")) for path in tracked
        )
        kind = NEXT_APP if "next" in dependencies and has_app else UNCLASSIFIED
        found.append((project, kind, "convex" in dependencies))
    return sorted(found)


def measure(repo_root: Path) -> Measurement:
    tracked_list = tracked_files(repo_root)
    tracked = frozenset(tracked_list)
    measurement = Measurement()
    discovered = discover_projects(repo_root, tracked_list)
    owners = [project for project, _, _ in discovered]

    for project, kind, convex in discovered:
        if kind != NEXT_APP:
            measurement.unmeasured.append(project)
            continue
        # A file belongs to the innermost project that contains it, so a nested
        # workspace package is measured under its own rules and not twice.
        nested = [other for other in owners if other != project and other.startswith(project + "/")]
        sources = [
            rel
            for rel in tracked_list
            if rel.startswith(project + "/")
            and is_source(rel)
            and not is_skipped(rel)
            and not any(rel.startswith(inner + "/") for inner in nested)
        ]
        modules = tuple(rel for rel in sources if not is_test(rel))
        tests = tuple(rel for rel in sources if is_test(rel))
        entrypoints = tuple(
            next_entrypoints(repo_root, project, modules, tracked, convex)
        )
        aliases = alias_table(repo_root, project, tracked_list)

        edges: Dict[str, Tuple[str, ...]] = {}
        for rel in modules:
            source = (repo_root / rel).read_text(encoding="utf-8")
            targets = {
                target
                for target in (
                    resolve(specifier, rel, project, aliases, tracked)
                    for specifier in specifiers_in(source)
                )
                if target is not None and not is_test(target)
            }
            edges[rel] = tuple(sorted(targets))

        reached: Set[str] = set()
        stack = list(entrypoints)
        while stack:
            current = stack.pop()
            if current in reached:
                continue
            reached.add(current)
            stack.extend(edges.get(current, ()))

        measurement.projects.append(
            Project(
                path=project,
                kind=kind,
                modules=modules,
                entrypoints=entrypoints,
                reached=tuple(sorted(reached)),
                unreachable=tuple(sorted(set(modules) - reached)),
                tests=tests,
            )
        )
    return measurement


def pinned_paths() -> List[str]:
    """Every path `cap_ratchet` guards a number in.

    Imported rather than re-typed. A second copy of a path list checks its copy,
    not the population — the failure `split_literal_census_population` was
    written to avoid, one file over.
    """
    paths: Set[str] = {pin.path for pin in cap_ratchet.PINS}
    paths.update(watch.path for watch in cap_ratchet.WATCHES if watch.kind == "ts-constant")
    return sorted(paths)


def evaluate(
    measurement: Measurement,
    budgets: Optional[Dict[str, int]] = None,
    registered: Sequence[PinOnUnreachableModule] = PINS_ON_UNREACHABLE_MODULES,
    pins: Optional[Sequence[str]] = None,
) -> List[Finding]:
    budgets = BUDGETS if budgets is None else budgets
    pins = pinned_paths() if pins is None else list(pins)
    findings: List[Finding] = []
    projects = measurement.by_path()

    for project in measurement.projects:
        count = len(project.unreachable)
        name = budget_constant_name(project.path)
        if project.path not in budgets:
            findings.append(
                Finding(
                    check="unbudgeted-project",
                    message=(
                        f"{project.path}: measured {count} unreachable module(s) and declares no "
                        f"budget. Add `{name}` to scripts/ci/module_reachability.py and to "
                        f"cap_ratchet.WATCHES — run `--emit-budgets` to generate the block. A "
                        f"project that enrolls itself silently is a project whose dead code has "
                        f"no ceiling."
                    ),
                )
            )
            continue
        budget = budgets[project.path]
        if count > budget:
            findings.append(
                Finding(
                    check="unreachable-grew",
                    message=(
                        f"{project.path}: {count} module(s) are reachable from no entrypoint, above "
                        f"the declared budget of {budget} (`{name}`). Wire the new module into the "
                        f"path it was written for, or delete it. Raising `{name}` is refused by "
                        f"scripts/ci/cap_ratchet.py, which holds it to the lowest value it has ever "
                        f"had. `--list {project.path}` names them."
                    ),
                )
            )
        elif count < budget:
            findings.append(
                Finding(
                    check="budget-stale",
                    message=(
                        f"{project.path}: {count} unreachable module(s), below the declared budget "
                        f"of {budget} (`{name}`). Dead code was removed and the budget was not "
                        f"lowered with it, so the headroom is still there for the next module. "
                        f"Run `--emit-budgets` and commit the block in the same diff."
                    ),
                )
            )

    for path in sorted(budgets):
        if path not in projects:
            findings.append(
                Finding(
                    check="budget-unmeasured",
                    message=(
                        f"{path}: a budget is declared for a project this control no longer "
                        f"measures — it was renamed, removed, or stopped being classifiable as a "
                        f"Next.js app. A budget over nothing reads as a passing gate. Remove the "
                        f"entry, or restore what it measured."
                    ),
                )
            )

    unreachable_by_path: Dict[str, str] = {}
    for project in measurement.projects:
        for rel in project.unreachable:
            unreachable_by_path[rel] = project.path
    registered_paths = {entry.path for entry in registered}

    for path in pins:
        if path not in unreachable_by_path or path in registered_paths:
            continue
        findings.append(
            Finding(
                check="pin-on-unreachable-module",
                message=(
                    f"{path}: scripts/ci/cap_ratchet.py pins a number in this file, and no "
                    f"entrypoint of {unreachable_by_path[path]} reaches it — its only importers "
                    f"are its own tests. The pin is a spend control over code that does not run, "
                    f"and cap_ratchet's PASS line counts it as a held venture number. Wire the "
                    f"module in, delete it with its pin, or register the pairing in "
                    f"PINS_ON_UNREACHABLE_MODULES with an owner, an expiry and the argument."
                ),
            )
        )

    pinned = set(pins)
    for entry in registered:
        if entry.path not in pinned:
            findings.append(
                Finding(
                    check="stale-pin-registration",
                    message=(
                        f"{entry.path}: registered as a pin standing on unreachable code, but "
                        f"cap_ratchet pins nothing in it any more. The row has outlived its "
                        f"reason; delete it."
                    ),
                )
            )
        elif entry.path not in unreachable_by_path:
            findings.append(
                Finding(
                    check="stale-pin-registration",
                    message=(
                        f"{entry.path}: registered as a pin standing on unreachable code, but the "
                        f"module is reachable now. The argument was answered; delete the row so "
                        f"the registry keeps meaning what it says."
                    ),
                )
            )
    return findings


def emit_budgets(measurement: Measurement) -> str:
    """Regenerate the budget block from a live measurement.

    Printed rather than written, so the number reaches the file through a diff a
    person reads. See the module docstring for why a baseline in this repository
    is a thing you re-derive.
    """
    lines: List[str] = []
    for project in measurement.projects:
        lines.append(f"{budget_constant_name(project.path)} = {len(project.unreachable)}")
    lines.append("")
    lines.append("BUDGETS: Dict[str, int] = {")
    for project in measurement.projects:
        lines.append(f'    "{project.path}": {budget_constant_name(project.path)},')
    lines.append("}")
    return "\n".join(lines)


def emit_watches(measurement: Measurement) -> str:
    """The `cap_ratchet.WATCHES` rows the budgets above require, ready to paste."""
    lines: List[str] = []
    for project in measurement.projects:
        lines.append("    Watch(")
        lines.append('        path="scripts/ci/module_reachability.py",')
        lines.append('        kind="python-constant",')
        lines.append(f'        locator="{budget_constant_name(project.path)}",')
        lines.append("        direction=DOWN,")
        lines.append(
            f'        why="the number of {project.path} modules no entrypoint reaches",'
        )
        lines.append("    ),")
    return "\n".join(lines)


def format_report(measurement: Measurement, findings: Sequence[Finding]) -> str:
    lines = ["=== Module reachability ==="]
    width = max((len(p.path) for p in measurement.projects), default=0)
    for project in measurement.projects:
        budget = BUDGETS.get(project.path)
        declared = "no budget" if budget is None else f"budget {budget}"
        lines.append(
            f"  {project.path.ljust(width)}  {len(project.unreachable):>3} unreachable of "
            f"{len(project.modules):>3} modules  ({len(project.entrypoints)} entrypoints, "
            f"{len(project.tests)} test files not in the graph)  [{declared}]"
        )
    for path in measurement.unmeasured:
        lines.append(
            f"  {path.ljust(width)}   NOT MEASURED — no reachability model for this project's "
            f"loader; it is not a Next.js app"
        )
    for note in measurement.notes:
        lines.append(f"NOTE: {note}")
    lines.append("")
    if findings:
        lines.append(f"FAIL: {len(findings)} finding(s)")
        for finding in findings:
            lines.append(f"  [{finding.check}] {finding.message}")
    else:
        total = sum(len(p.unreachable) for p in measurement.projects)
        modules = sum(len(p.modules) for p in measurement.projects)
        lines.append(
            f"PASS: {len(measurement.projects)} project(s) measured, {modules} modules, "
            f"{total} reachable from no entrypoint and none above its declared budget; "
            f"{len(pinned_paths())} cap_ratchet-pinned file(s), "
            f"{len(PINS_ON_UNREACHABLE_MODULES)} of them standing on unreachable code and each "
            f"registered."
        )
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Refuse venture source that no entrypoint can reach, and money pins that stand on it."
    )
    parser.add_argument("--report", action="store_true", help="measure and print, always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--list", default=None, help="name the unreachable modules of one project")
    parser.add_argument(
        "--emit-budgets", action="store_true", help="regenerate the budget block from a measurement"
    )
    parser.add_argument(
        "--emit-watches", action="store_true", help="print the cap_ratchet.WATCHES rows the budgets need"
    )
    parser.add_argument("--repo-root", default=None, help="repository root (default: two levels up)")
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else REPO_ROOT

    try:
        measurement = measure(repo_root)
        findings = evaluate(measurement)
    except ReachabilityError as exc:
        if args.json:
            print(json.dumps({"error": str(exc), "ok": False, "measured": False}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.emit_budgets:
        print(emit_budgets(measurement))
        return 0
    if args.emit_watches:
        print(emit_watches(measurement))
        return 0
    if args.list:
        target = measurement.by_path().get(args.list)
        if target is None:
            print(f"FAIL: {args.list} is not a measured project", file=sys.stderr)
            return 1
        for rel in target.unreachable:
            print(rel)
        return 0

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not findings,
                    "measured": True,
                    "projects": [asdict(p) for p in measurement.projects],
                    "unmeasured": measurement.unmeasured,
                    "notes": measurement.notes,
                    "findings": [asdict(f) for f in findings],
                },
                indent=2,
            )
        )
    else:
        print(format_report(measurement, findings))

    if args.report:
        return 0
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
