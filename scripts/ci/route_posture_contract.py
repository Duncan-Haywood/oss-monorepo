#!/usr/bin/env python3
"""
Route auth-posture contract coverage.

Three ventures grew a hand-written "route auth posture" contract — a test that
enumerates every HTTP handler the venture serves and fails unless each one
declares whether it answers anonymous callers. Writing them found two real
holes (SEC-019, SEC-020). `docs/ENGINEERING-ROADMAP.md` recorded the obvious
remaining gap: nothing repository-wide holds a venture to having one, so the
three are "three hand-written files, not a control".

Measured 2026-08-01, the gap is worse than that description. A contract that
exists is not a contract that runs:

  * `ventures/ai-first-markets/src/lib/routeAuthPosture.test.ts` is executed by
    no CI gate at all, and on a clean checkout it *fails* — it declares
    `/api/subscribe POST` and floors at three route modules, but that route was
    never committed. It went red the moment it landed and nothing noticed.
  * `ventures/photo-editing/docs-site/src/lib/routeAuthPosture.test.ts` is
    executed by no CI gate either.
  * Only `print-atelier`'s runs, and only incidentally: it happens to sit in
    the `tests/*.test.ts` glob that `platform/coverage-baseline.yaml` measures.

So this audit checks three things, and the middle one is the load-bearing one:

  1. COVERAGE  — every venture that serves HTTP route handlers has a contract.
                 A venture that grows its first route fails here until it
                 declares one.
  2. EXECUTION — that contract is actually reachable by a CI gate. A test file
                 nothing runs is documentation with a `.test.ts` suffix, and
                 that is the specific way this repository has been found to
                 lie before: absence and success sharing an exit code.
  3. FRESHNESS — the declared handler count matches the measured one, in both
                 directions, exactly like `count` in
                 `platform/exception-register.yaml`. Below means a route was
                 deleted and the contract still claims it; above means a route
                 was added and nobody declared its posture. The second is the
                 case that matters: a new unguarded endpoint is precisely what
                 the contract exists to catch, and a contract whose count is
                 allowed to trail reality cannot catch it.

Deliberately fails closed. An undeclared venture, a contract file that does not
exist, a contract no gate can reach, and a stale count are all errors. A
venture that cannot satisfy this yet declares `execution: none` with an owner,
a reason and a dated `exempt_until`, which expires — the same shape the
exception register uses, so an exemption rots into a failure rather than into
a permanent silence.

Usage:
    python3 scripts/ci/route_posture_contract.py            # audit, exit 1 on failure
    python3 scripts/ci/route_posture_contract.py --report   # inventory, always exit 0
    python3 scripts/ci/route_posture_contract.py --json     # machine-readable
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import glob as globlib
import json
import re
import shlex
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

import yaml

REGISTRY_PATH = "platform/route-posture-registry.yaml"
VENTURES_DIR = "ventures"
TEST_CI_PATH = "scripts/test-ci.sh"
COVERAGE_BASELINE_PATH = "platform/coverage-baseline.yaml"

# A Next.js App Router route module. `.tsx` is not hypothetical: Pairwise's
# `/api/og/couple-card` is a `route.tsx`, and a `route.ts`-only scan misses an
# entire anonymous endpoint.
ROUTE_FILENAMES = ("route.ts", "route.tsx", "route.js", "route.jsx", "route.mjs")

# Directories that never contain first-party source, at any depth. Descending
# into these is never right: `node_modules` is somebody else's code, and the
# rest are build output or VCS internals.
VENDOR_DIRS = frozenset({"node_modules", ".next", ".git", ".turbo"})

# Build-output names that are *also* legal URL segments. `/api/build/route.ts`
# is a real endpoint whose directory happens to be called `build`, and pruning
# by name alone made three unguarded handlers invisible to this audit. So these
# are pruned everywhere except inside an App Router tree, where the name is a
# path segment rather than an artifact directory.
ARTIFACT_DIRS = frozenset({"dist", "build", "coverage", "out"})

# Kept for callers that import the old name; it is the union of both sets.
PRUNED_DIRS = VENDOR_DIRS | ARTIFACT_DIRS


def is_pruned_dir(directory: Path, root: Path) -> bool:
    """Should a tree walk rooted at `root` refuse to descend into `directory`?

    The single place this repository decides that question. It was inlined in
    `_walk_routes` and copied nowhere, which is why `scripts/ci/sast_scan.py`
    grew its own bare-name `EXCLUDED_DIRS` prune and shipped exactly the defect
    the comment above `ARTIFACT_DIRS` describes: `src/app/api/build/route.ts` is
    a route, not build output, and a scanner that prunes by name at any depth
    stops reading it. Two copies that agree and are both wrong is a documented
    failure mode here, so the rule lives once and is imported.

    A vendored name is pruned everywhere. An artifact name is pruned everywhere
    except inside an App Router tree, where it is a URL segment. The *ancestors*
    are tested, not the entry itself, so a venture whose App Router root is
    literally `app/build` is still read.
    """
    name = directory.name
    if name in VENDOR_DIRS:
        return True
    if name in ARTIFACT_DIRS:
        try:
            ancestors = directory.resolve().relative_to(root.resolve()).parts[:-1]
        except ValueError:
            ancestors = directory.parts[:-1]
        return "app" not in ancestors
    return False


def walk_source_files(root: Path) -> Iterable[Path]:
    """Every regular file under `root` that `is_pruned_dir` does not prune away.

    Symlinked directories are not followed: a symlinked `node_modules` is how
    ventures get their dependencies in a worktree, and following it would walk
    the whole dependency tree.
    """
    if not root.is_dir():
        return
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = list(current.iterdir())
        except (PermissionError, OSError):
            continue
        for entry in entries:
            if entry.is_symlink():
                continue
            if entry.is_dir():
                if not is_pruned_dir(entry, root):
                    stack.append(entry)
            elif entry.is_file():
                yield entry

# `export async function GET(` / `export const GET =`. Matches functions and arrow-const handlers.
ROUTE_HANDLER_RE = re.compile(r"^\s*export\s+(?:async\s+)?(?:function|(?:const|let|var))\s+([A-Z][A-Z0-9_]*)\b", re.MULTILINE)

# Server Actions: exported functions in files containing `"use server"` or `'use server'`.
ACTION_HANDLER_RE = re.compile(r"^\s*export\s+(?:async\s+)?(?:function|(?:const|let|var))\s+([a-zA-Z0-9_]+)\b", re.MULTILINE)

# `contract` is required unless the venture is exempt: an exempt venture may
# have no contract written yet, which is a different gap from having written
# one that no gate runs. Both expire; conflating them would hide which is which.
REQUIRED_FIELDS = ("venture", "execution", "route_files", "handlers", "owner")
VALID_EXECUTION = ("venture-test-gate", "coverage-ratchet", "none")

# An exemption may not be written further out than this. Same horizon the
# exception register uses; an exemption nobody has to look at again is a
# decision nobody reviews.
MAX_EXEMPTION_DAYS = 180


@dataclass
class Finding:
    severity: str  # "error" | "warn"
    code: str
    where: str
    message: str
    remedy: str

    def format(self) -> str:
        tag = "[ERROR]" if self.severity == "error" else "[WARN] "
        return f"{tag} {self.where}\n  {self.message}\n  → {self.remedy}"


@dataclass
class Surface:
    """The HTTP route surface a venture actually serves, as measured on disk."""

    venture: str
    route_files: List[str] = field(default_factory=list)
    handlers: List[str] = field(default_factory=list)

    @property
    def route_file_count(self) -> int:
        return len(self.route_files)

    @property
    def handler_count(self) -> int:
        return len(self.handlers)


def find_repo_root(start: Optional[Path] = None) -> Path:
    """Locate the repository root by its two invariant directories."""
    here = (start or Path(__file__)).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / VENTURES_DIR).is_dir() and (candidate / "platform").is_dir():
            return candidate
    raise SystemExit("route posture audit: could not locate the repository root")


def _is_route_or_action(entry: Path) -> bool:
    if entry.name in ROUTE_FILENAMES:
        return True
    if entry.suffix in (".ts", ".tsx", ".js", ".jsx", ".mjs"):
        try:
            content = entry.read_text(encoding="utf-8", errors="replace")
            return '"use server"' in content or "'use server'" in content
        except OSError:
            return False
    return False


def _walk_routes(root: Path) -> Iterable[Path]:
    """Yield every route module and server action file under `root`, skipping vendored directories."""
    if not root.is_dir():
        return
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = list(current.iterdir())
        except (PermissionError, OSError):
            continue
        for entry in entries:
            if entry.is_symlink():
                # A symlinked `node_modules` is how ventures get their deps in
                # a worktree. Following it would scan the whole dependency tree.
                continue
            if entry.is_dir():
                # One rule, one implementation — see `is_pruned_dir`.
                if is_pruned_dir(entry, root):
                    continue
                stack.append(entry)
            elif _is_route_or_action(entry):
                yield entry


def measure_surface(repo_root: Path, venture: str) -> Surface:
    """Count the route modules and exported handlers a venture serves."""
    surface = Surface(venture=venture)
    venture_root = repo_root / VENTURES_DIR / venture
    for route in sorted(_walk_routes(venture_root)):
        rel = route.relative_to(repo_root).as_posix()
        surface.route_files.append(rel)
        try:
            source = route.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if route.name in ROUTE_FILENAMES:
            for method in ROUTE_HANDLER_RE.findall(source):
                surface.handlers.append(f"{rel} {method}")
        elif '"use server"' in source or "'use server'" in source:
            for action in ACTION_HANDLER_RE.findall(source):
                surface.handlers.append(f"{rel} {action}")
    return surface


def discover_surfaces(repo_root: Path) -> Dict[str, Surface]:
    """Measure every venture, keeping only those that actually serve routes."""
    ventures_dir = repo_root / VENTURES_DIR
    surfaces: Dict[str, Surface] = {}
    for entry in sorted(ventures_dir.iterdir()) if ventures_dir.is_dir() else []:
        if not entry.is_dir() or entry.is_symlink():
            continue
        surface = measure_surface(repo_root, entry.name)
        if surface.route_file_count:
            surfaces[entry.name] = surface
    return surfaces


def load_registry(repo_root: Path) -> List[dict]:
    """Read the registry, failing closed on a missing or malformed file."""
    path = repo_root / REGISTRY_PATH
    if not path.is_file():
        raise SystemExit(f"route posture audit: {REGISTRY_PATH} is missing")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise SystemExit(f"route posture audit: {REGISTRY_PATH} is not valid YAML: {exc}")
    entries = data.get("ventures")
    if not isinstance(entries, list):
        raise SystemExit(f"route posture audit: {REGISTRY_PATH} has no `ventures:` list")
    return entries


# --------------------------------------------------------------------------
# Execution wiring
#
# The question each of these answers is narrow and concrete: if CI runs, does
# anything execute this specific file? Not "is there a test script", not "is
# the venture mentioned somewhere" — those are the assertions that let a dead
# contract look alive.
# --------------------------------------------------------------------------


def _sh_glob_matches(pattern: str, cwd: Path, target: Path) -> bool:
    """
    Does a shell glob from `cwd` expand to include `target`?

    `recursive=False` is the point, not an oversight. npm runs scripts under
    `sh`, which has no `globstar`, so `src/**/*.test.ts` expands as
    `src/*/*.test.ts` — one directory level, not any depth. Python's glob
    treats `**` as a plain `*` in non-recursive mode, which is exactly that
    behaviour. `ai-first-markets` uses that pattern today and matches its
    contract only by luck of depth: move the file one level deeper and it
    silently stops running, with no error anywhere.
    """
    if not pattern or pattern.startswith("-"):
        return False
    try:
        matches = globlib.glob(pattern, root_dir=str(cwd), recursive=False)
    except (ValueError, OSError):
        return False
    for match in matches:
        if (cwd / match).resolve() == target.resolve():
            return True
    return False


# vitest's default include, which is genuinely recursive — it does its own glob
# expansion rather than relying on the shell. Written as full path globs, not
# basenames: a basename test cannot express `src/**`, and inferring execution
# from a *filename* is precisely the hole this section was found to have.
VITEST_DEFAULT_INCLUDE = ("**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.mjs",
                          "**/*.test.cts", "**/*.test.mts", "**/*.test.jsx", "**/*.test.cjs",
                          "**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.mjs",
                          "**/*.spec.cts", "**/*.spec.mts", "**/*.spec.jsx", "**/*.spec.cjs")

# vitest's default `exclude`. A default-configured project already declines to
# run anything under these, so a contract parked in one is dead on arrival.
VITEST_DEFAULT_EXCLUDE = ("**/node_modules/**", "**/dist/**", "**/cypress/**",
                          "**/.{idea,git,cache,output,temp}/**")

# Config filenames vitest resolves, in its own precedence order. `vitest.*`
# wins over `vite.*`; within each, the first extension that exists is used.
VITEST_CONFIG_NAMES = (
    "vitest.config.ts", "vitest.config.mts", "vitest.config.cts",
    "vitest.config.js", "vitest.config.mjs", "vitest.config.cjs",
    "vite.config.ts", "vite.config.mts", "vite.config.cts",
    "vite.config.js", "vite.config.mjs", "vite.config.cjs",
)

_STRING_RE = re.compile(r"""(['"`])((?:\\.|(?!\1).)*)\1""")


def _strip_js_comments(source: str) -> str:
    """Blank out comments so a commented-out `exclude:` cannot be read as live.

    String-aware, and that is not fastidiousness: `"src/**/*.test.ts"` contains
    `/*`, so a regex stripper eats the rest of the config from inside a glob and
    leaves an include list that matches nothing. Characters are replaced with
    spaces rather than deleted so every offset in the result still lines up with
    the original.
    """
    out = list(source)
    index = 0
    length = len(source)
    while index < length:
        char = source[index]
        if char in "'\"`":
            quote = char
            index += 1
            while index < length:
                if source[index] == "\\":
                    index += 2
                    continue
                if source[index] == quote:
                    index += 1
                    break
                index += 1
            continue
        if source.startswith("//", index):
            while index < length and source[index] != "\n":
                out[index] = " "
                index += 1
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            end = length if end == -1 else end + 2
            for position in range(index, end):
                if out[position] != "\n":
                    out[position] = " "
            index = end
            continue
        index += 1
    return "".join(out)


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Compile one picomatch-style glob into a regex over a `/`-joined path.

    `fnmatch` is not usable here and the difference is the whole defect: its
    `*` crosses `/`, so `*.test.ts` would match `src/lib/a.test.ts` and every
    include glob would look satisfied. `**` spans directories, a single `*`
    does not, `{a,b}` alternates and `?(x)` is an optional group — the four
    constructs vitest's own defaults are written in.
    """
    out: list[str] = []
    i = 0
    n = len(pattern)
    while i < n:
        char = pattern[i]
        if pattern.startswith("**/", i):
            out.append("(?:[^/]+/)*")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif char == "*":
            out.append("[^/]*")
            i += 1
        elif char == "?" and pattern.startswith("?(", i):
            close = pattern.find(")", i)
            if close == -1:
                out.append(re.escape(char))
                i += 1
                continue
            body = pattern[i + 2:close]
            alts = "|".join(re.escape(part) for part in body.split("|"))
            out.append(f"(?:{alts})?")
            i = close + 1
        elif char == "?":
            out.append("[^/]")
            i += 1
        elif char == "{":
            close = pattern.find("}", i)
            if close == -1:
                out.append(re.escape(char))
                i += 1
                continue
            body = pattern[i + 1:close]
            alts = "|".join(re.escape(part) for part in body.split(","))
            out.append(f"(?:{alts})")
            i = close + 1
        elif char == "[":
            close = pattern.find("]", i)
            if close == -1:
                out.append(re.escape(char))
                i += 1
                continue
            out.append(f"[{pattern[i + 1:close]}]")
            i = close + 1
        else:
            out.append(re.escape(char))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def glob_matches_path(pattern: str, relative: str) -> bool:
    """Does `pattern` select the venture-relative posix path `relative`?"""
    normalised = pattern.removeprefix("./")
    if _glob_to_regex(normalised).match(relative):
        return True
    # picomatch treats a leading `**/` as optional, so `**/*.test.ts` also
    # selects a top-level `a.test.ts`. The regex above requires the directory.
    if normalised.startswith("**/") and _glob_to_regex(normalised[3:]).match(relative):
        return True
    return False


def _string_list_after(source: str, key: str, start: int, stop: int) -> Optional[List[str]]:
    """Read `key: [ "a", "b" ]` out of `source[start:stop]`, honouring nesting.

    Only a `key` at brace depth zero *within the slice* is read, so a
    `coverage: { include: [...] }` nested inside `test:` cannot be mistaken for
    the suite's own `include`.
    """
    pattern = re.compile(r"\b" + re.escape(key) + r"\s*:\s*\[")
    for match in pattern.finditer(source, start, stop):
        window = source[start:match.start()]
        depth = window.count("{") - window.count("}") + window.count("[") - window.count("]")
        if depth != 0:
            continue  # nested one level down, e.g. `coverage: { include: [...] }`
        open_bracket = match.end() - 1
        close = source.find("]", open_bracket)
        if close == -1 or close > stop:
            return None
        return [m.group(2) for m in _STRING_RE.finditer(source[open_bracket:close])]
    return None


def _block_after(source: str, key: str) -> tuple[int, int]:
    """The span of the `{ ... }` object that `key:` introduces, or (-1, -1)."""
    match = re.search(r"\b" + re.escape(key) + r"\s*:\s*\{", source)
    if not match:
        return -1, -1
    start = match.end()
    depth = 1
    index = start
    while index < len(source):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return start, index
        index += 1
    return -1, -1


@dataclass
class VitestSelection:
    """The set of files a `vitest run` in some directory would actually execute."""

    where: str
    include: List[str]
    exclude: List[str]
    candidates: List[Path]

    def selects(self, target: Path) -> bool:
        resolved = target.resolve()
        return any(candidate.resolve() == resolved for candidate in self.candidates)


def find_vitest_config(cwd: Path, tokens: Sequence[str]) -> Optional[Path]:
    """The config file a `vitest` invocation in `cwd` would load, if any."""
    for index, token in enumerate(tokens):
        if token in ("--config", "-c") and index + 1 < len(tokens):
            candidate = cwd / tokens[index + 1]
            return candidate if candidate.is_file() else None
        if token.startswith("--config="):
            candidate = cwd / token.split("=", 1)[1]
            return candidate if candidate.is_file() else None
    for name in VITEST_CONFIG_NAMES:
        candidate = cwd / name
        if candidate.is_file():
            return candidate
    return None


def resolve_vitest_selection(cwd: Path, tokens: Sequence[str]) -> VitestSelection:
    """Resolve what `vitest run` in `cwd` selects, by reading its config.

    The check this replaces asked only whether the *filename* looked like a
    test. It never opened `vitest.config.ts`, so a contract that vitest is
    configured to exclude — `quick-pick-survey` excludes
    `**/*.integration.test.ts` — was reported as executed. That is the defect
    the module docstring says this audit exists to close, reproduced inside the
    audit itself.
    """
    config = find_vitest_config(cwd, tokens)
    include: List[str] = list(VITEST_DEFAULT_INCLUDE)
    exclude: List[str] = list(VITEST_DEFAULT_EXCLUDE)
    where = "vitest's built-in defaults (no config file found)"
    if config is not None:
        where = config.name
        source = _strip_js_comments(config.read_text(encoding="utf-8", errors="replace"))
        start, stop = _block_after(source, "test")
        if start != -1:
            declared_include = _string_list_after(source, "include", start, stop)
            declared_exclude = _string_list_after(source, "exclude", start, stop)
            if declared_include is not None:
                include = declared_include
            if declared_exclude is not None:
                exclude = declared_exclude

    candidates: List[Path] = []
    for path in walk_source_files(cwd):
        relative = path.relative_to(cwd).as_posix()
        if not any(glob_matches_path(pattern, relative) for pattern in include):
            continue
        if any(glob_matches_path(pattern, relative) for pattern in exclude):
            continue
        candidates.append(path)
    return VitestSelection(where=where, include=include, exclude=exclude,
                           candidates=sorted(candidates))


def is_vitest_invocation(tokens: Sequence[str]) -> bool:
    return any(tok == "vitest" or tok.endswith("/vitest") for tok in tokens)


def vitest_path_arguments(tokens: Sequence[str]) -> List[str]:
    return [t for t in tokens[1:]
            if not t.startswith("-") and t not in ("vitest", "run", "npx")]


def script_reaches(command: Sequence[str], cwd: Path, target: Path) -> Optional[str]:
    """None if running `command` in `cwd` executes `target`, else why it does not."""
    tokens = list(command)
    if not tokens:
        return "the test script is empty, so it runs nothing"

    if is_vitest_invocation(tokens) and not vitest_path_arguments(tokens):
        selection = resolve_vitest_selection(cwd, tokens)
        # A glob that expands to nothing is a gate that cannot fail: `vitest
        # run` over an empty selection exits 0 and is indistinguishable from a
        # green suite. Refuse it before asking whether the contract is in it.
        if not selection.candidates:
            return (f"the vitest `include` globs in {selection.where} "
                    f"({', '.join(selection.include)}) select no file at all. "
                    f"A run over an empty selection exits 0, so this would be a "
                    f"passing gate that executes nothing")
        if not selection.selects(target):
            relative = target.resolve().relative_to(cwd.resolve()).as_posix()
            hit = next((pattern for pattern in selection.exclude
                        if glob_matches_path(pattern, relative)), None)
            if hit is not None:
                return (f"{selection.where} excludes the contract via `{hit}`, so "
                        f"vitest never runs it — {len(selection.candidates)} other "
                        f"file(s) in the venture are selected, which is why the "
                        f"suite still looks green")
            return (f"{selection.where} declares include "
                    f"{selection.include} and none of those globs select the "
                    f"contract, so vitest never runs it")
        return None

    if any(_sh_glob_matches(tok, cwd, target) for tok in tokens):
        return None
    return (f"the test script's arguments do not expand to the contract file. "
            f"npm runs scripts under sh, which has no globstar, so `**` matches "
            f"one level only")


def command_reaches(command: Sequence[str], cwd: Path, target: Path) -> bool:
    """Would running `command` in `cwd` execute the file at `target`?"""
    return script_reaches(command, cwd, target) is None


def npm_test_script(repo_root: Path, venture: str, contract: Optional[Path] = None) -> tuple[Optional[str], Path]:
    """The venture's `npm test` script and working directory, or (None, venture_dir) if missing."""
    venture_dir = repo_root / VENTURES_DIR / venture
    pkg_dir = venture_dir
    if contract:
        curr = contract.parent
        while curr != repo_root and curr != venture_dir.parent:
            if (curr / "package.json").is_file():
                pkg_dir = curr
                break
            curr = curr.parent
    pkg = pkg_dir / "package.json"
    if not pkg.is_file():
        return None, venture_dir
    try:
        data = json.loads(pkg.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None, pkg_dir
    script = data.get("scripts", {}).get("test")
    return (script if isinstance(script, str) else None), pkg_dir


def test_ci_runs_venture_suite(repo_root: Path, venture: str) -> bool:
    """Does `scripts/test-ci.sh` have a gate that runs this venture's suite?"""
    path = repo_root / TEST_CI_PATH
    if not path.is_file():
        return False
    source = path.read_text(encoding="utf-8")
    # `run_ci_test "<name>" npm --prefix "${REPO_ROOT}/ventures/<venture>" test`
    pattern = re.compile(
        r"^\s*run_ci_test\s+\"[^\"]*\"\s+npm\s+--prefix\s+\"[^\"]*/" + re.escape(venture) + r"(?:/[^\"]*)?\"\s+test\b",
        re.MULTILINE,
    )
    return bool(pattern.search(source))


def coverage_component_for(repo_root: Path, venture: str) -> Optional[dict]:
    """The coverage-baseline component covering this venture, if any."""
    path = repo_root / COVERAGE_BASELINE_PATH
    if not path.is_file():
        return None
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return None
    for component in data.get("components", []) or []:
        comp_path = str(component.get("path", ""))
        if comp_path == f"{VENTURES_DIR}/{venture}":
            return component
    return None


def check_execution(repo_root: Path, entry: dict, contract: Path) -> Optional[str]:
    """
    Verify the declared execution route really reaches the contract file.

    Returns None when the wiring holds, or a human-readable reason when it does
    not. Each branch proves the *specific* mechanism, so relabelling an entry
    cannot make a dead contract pass.
    """
    venture = entry["venture"]
    execution = entry["execution"]

    if execution == "venture-test-gate":
        if not test_ci_runs_venture_suite(repo_root, venture):
            return (f"{TEST_CI_PATH} has no `npm --prefix .../{venture} test` gate, "
                    f"so nothing in CI runs this venture's suite")
        script, cwd = npm_test_script(repo_root, venture, contract)
        if not script:
            return f"{cwd.relative_to(repo_root)}/package.json declares no `test` script"
        reason = script_reaches(shlex.split(script), cwd, contract)
        if reason is not None:
            return f"the venture's test script ({script!r}) does not run the contract: {reason}"
        return None

    if execution == "coverage-ratchet":
        component = coverage_component_for(repo_root, venture)
        if component is None:
            return (f"{COVERAGE_BASELINE_PATH} has no component with "
                    f"path `{VENTURES_DIR}/{venture}`, so the ratchet never runs its tests")
        command = component.get("command") or []
        if not isinstance(command, list):
            return f"{COVERAGE_BASELINE_PATH} component `{component.get('id')}` has a non-list command"
        cwd = repo_root / VENTURES_DIR / venture
        if not command_reaches([str(c) for c in command], cwd, contract):
            return (f"the coverage component's command does not expand to the contract file, "
                    f"so the ratchet measures the venture without running this contract")
        return None

    return None  # "none" is validated separately, by its expiry.


def parse_date(value: object) -> Optional[dt.date]:
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value.strip())
        except ValueError:
            return None
    return None


def audit(repo_root: Path, today: Optional[dt.date] = None) -> List[Finding]:
    today = today or dt.date.today()
    findings: List[Finding] = []
    surfaces = discover_surfaces(repo_root)
    entries = load_registry(repo_root)

    seen: Dict[str, dict] = {}
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            findings.append(Finding("error", "malformed-entry", f"{REGISTRY_PATH}[{index}]",
                                    "registry entry is not a mapping",
                                    "give it the documented fields"))
            continue
        missing = [f for f in REQUIRED_FIELDS if entry.get(f) in (None, "")]
        name = str(entry.get("venture", f"<entry {index}>"))
        if missing:
            findings.append(Finding("error", "incomplete-entry", f"{REGISTRY_PATH}: {name}",
                                    f"missing required field(s): {', '.join(missing)}",
                                    f"every entry needs {', '.join(REQUIRED_FIELDS)}"))
            continue
        if name in seen:
            findings.append(Finding("error", "duplicate-entry", f"{REGISTRY_PATH}: {name}",
                                    "the same venture is declared twice",
                                    "keep one entry per venture"))
            continue
        seen[name] = entry

        if entry["execution"] not in VALID_EXECUTION:
            findings.append(Finding("error", "invalid-execution", f"{REGISTRY_PATH}: {name}",
                                    f"execution `{entry['execution']}` is not one of {VALID_EXECUTION}",
                                    "declare how CI reaches the contract, or `none` with an expiry"))
            continue

        surface = surfaces.get(name)
        if surface is None:
            findings.append(Finding("error", "stale-entry", f"{REGISTRY_PATH}: {name}",
                                    "declared here but serves no route modules on disk",
                                    "remove the entry, or restore the routes it describes"))
            continue

        # --- freshness: the count ratchet, both directions -----------------
        for label, declared, measured in (
            ("route_files", entry["route_files"], surface.route_file_count),
            ("handlers", entry["handlers"], surface.handler_count),
        ):
            if not isinstance(declared, int) or isinstance(declared, bool) or declared < 0:
                findings.append(Finding("error", "invalid-count", f"{REGISTRY_PATH}: {name}",
                                        f"`{label}` must be a non-negative integer, got {declared!r}",
                                        "write the measured count"))
            elif declared != measured:
                direction = "more" if measured > declared else "fewer"
                findings.append(Finding(
                    "error", "stale-count", f"{REGISTRY_PATH}: {name}",
                    f"declares {label}: {declared} but the venture serves {measured} — {direction} than declared",
                    (f"set {label}: {measured} and update "
                     f"{entry['contract']} so every handler declares a posture")))

        # --- exemption handling --------------------------------------------
        if entry["execution"] == "none":
            expiry = parse_date(entry.get("exempt_until"))
            if expiry is None:
                findings.append(Finding("error", "unexpiring-exemption", f"{REGISTRY_PATH}: {name}",
                                        "execution `none` without a valid ISO `exempt_until` date",
                                        "give the exemption a date it stops being true"))
            elif expiry < today:
                findings.append(Finding("error", "expired-exemption", f"{REGISTRY_PATH}: {name}",
                                        f"exemption expired on {expiry.isoformat()}",
                                        "wire the contract into a CI gate, or re-justify the exemption"))
            elif (expiry - today).days > MAX_EXEMPTION_DAYS:
                findings.append(Finding("error", "exemption-too-distant", f"{REGISTRY_PATH}: {name}",
                                        f"exemption runs to {expiry.isoformat()}, beyond the "
                                        f"{MAX_EXEMPTION_DAYS}-day horizon",
                                        "shorten it to something someone will actually revisit"))
            if not str(entry.get("reason", "")).strip():
                findings.append(Finding("error", "unjustified-exemption", f"{REGISTRY_PATH}: {name}",
                                        "execution `none` without a stated reason",
                                        "state what blocks wiring it in"))
            # An exempt venture may legitimately have no contract yet. If it
            # names one, that path must still be real — an exemption pointing
            # at a file that does not exist records progress nobody made.
            declared = entry.get("contract")
            if declared and not (repo_root / str(declared)).is_file():
                findings.append(Finding("error", "missing-contract", f"{REGISTRY_PATH}: {name}",
                                        f"declared contract `{declared}` does not exist",
                                        "write the contract, correct the path, or drop the field"))
            continue

        # --- coverage + execution ------------------------------------------
        if not entry.get("contract"):
            findings.append(Finding("error", "incomplete-entry", f"{REGISTRY_PATH}: {name}",
                                    "a non-exempt entry must name its contract file",
                                    "add `contract:`, or declare `execution: none` with an expiry"))
            continue
        contract = repo_root / str(entry["contract"])
        if not contract.is_file():
            findings.append(Finding("error", "missing-contract", f"{REGISTRY_PATH}: {name}",
                                    f"declared contract `{entry['contract']}` does not exist",
                                    "write the contract, or correct the path"))
            continue

        reason = check_execution(repo_root, entry, contract)
        if reason:
            findings.append(Finding(
                "error", "unexecuted-contract", f"{entry['contract']}",
                f"declared execution `{entry['execution']}` does not reach this file: {reason}",
                "wire it into a CI gate — a contract nothing runs cannot fail, and so controls nothing"))

    # --- coverage: a venture with routes and no entry at all ---------------
    for name, surface in surfaces.items():
        if name not in seen:
            findings.append(Finding(
                "error", "unregistered-route-surface", f"{VENTURES_DIR}/{name}",
                (f"serves {surface.route_file_count} route module(s) and "
                 f"{surface.handler_count} handler(s) but declares no route auth-posture contract"),
                (f"add a `{name}` entry to {REGISTRY_PATH} with a contract that makes every "
                 f"handler declare whether it answers anonymous callers")))

    return findings


def build_report(repo_root: Path) -> dict:
    surfaces = discover_surfaces(repo_root)
    try:
        entries = {str(e.get("venture")): e for e in load_registry(repo_root) if isinstance(e, dict)}
    except SystemExit:
        entries = {}
    ventures = []
    for name, surface in sorted(surfaces.items()):
        entry = entries.get(name)
        ventures.append({
            "venture": name,
            "route_files": surface.route_file_count,
            "handlers": surface.handler_count,
            "contract": (entry or {}).get("contract"),
            "execution": (entry or {}).get("execution", "UNREGISTERED"),
        })
    return {
        "ventures_with_routes": len(surfaces),
        "total_route_files": sum(s.route_file_count for s in surfaces.values()),
        "total_handlers": sum(s.handler_count for s in surfaces.values()),
        "ventures": ventures,
    }


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Audit route auth-posture contract coverage.")
    parser.add_argument("--report", action="store_true",
                        help="print the measured surface and exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(list(argv) if argv is not None else None)

    repo_root = find_repo_root()

    if args.report:
        report = build_report(repo_root)
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(f"Route surface across {report['ventures_with_routes']} venture(s): "
                  f"{report['total_route_files']} route modules, {report['total_handlers']} handlers\n")
            for row in report["ventures"]:
                print(f"  {row['venture']:<28} {row['route_files']:>3} routes  "
                      f"{row['handlers']:>3} handlers  execution={row['execution']}")
        return 0

    findings = audit(repo_root)

    if args.json:
        print(json.dumps({"findings": [f.__dict__ for f in findings]}, indent=2))
    else:
        for finding in findings:
            print(finding.format())

    errors = [f for f in findings if f.severity == "error"]
    if errors:
        print(f"\nroute posture audit: {len(errors)} error(s).")
        return 1
    if not args.json:
        # Report the exemptions in the passing summary. A green line reading
        # "every handler covered" while four of five ventures are exempt is the
        # same lie this audit was written to expose.
        report = build_report(repo_root)
        exempt = [r for r in report["ventures"] if r["execution"] == "none"]
        covered = [r for r in report["ventures"] if r["execution"] not in ("none", "UNREGISTERED")]
        covered_handlers = sum(r["handlers"] for r in covered)
        print(f"route posture audit: {report['ventures_with_routes']} venture(s) with HTTP routes, "
              f"{report['total_handlers']} handlers.")
        print(f"  executed contracts: {len(covered)} venture(s), {covered_handlers} handler(s)")
        if exempt:
            exempt_handlers = sum(r["handlers"] for r in exempt)
            print(f"  EXEMPT (no contract running in CI): {len(exempt)} venture(s), "
                  f"{exempt_handlers} handler(s) — {', '.join(r['venture'] for r in exempt)}")
            print("  Exemptions are dated and fail this gate when they expire.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
