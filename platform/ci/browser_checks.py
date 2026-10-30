#!/usr/bin/env python3
"""Run the seven browser checks against a build, and prove what answered.

Why this exists. `platform/pages/` carries seven checks CI cannot run --
`journey.mjs` (the customer journey), `sweep.mjs` (does every tool still
compute), `contrast.mjs` (can every page be read and reached),
`roundtrip.mjs` (does a shared bid arrive as the bid that was sent),
`presets.mjs` (does picking "no preset" leave the takeoff alone),
`highlight.mjs` (does a rejected input get pointed at) and
`sideways.mjs` (does any page scroll sideways on a phone). They need
Playwright, which is not a dependency of this repo, so no workflow runs
them -- and that is still true now that Actions runners are back (they
returned 2026-09-01, after being starved from 2026-08-26). No CI check
covers this ground either way, which makes these the only thing standing
between a merge and a page that renders perfectly and does nothing -- the
failure `sweep.mjs`'s own header says this repo has shipped before.

Nothing orchestrates them. `platform/pages/README.md` hands you seven
commands plus a server you start yourself, and both `journey.mjs` and
`sweep.mjs` spend a paragraph each on the same trap:

    A server left running by an earlier build keeps the port, the second
    `http.server` exits with "Address already in use", and the run passes
    against the old tree without a word. It cost a false clean report on
    2026-08-28.

Their advice is to curl for "something only the build under test has",
which works and asks every session to invent a different probe. This runs
the checks against a **sentinel** instead: a random token written into the
tree under test and read back over HTTP before any browser starts. If the
port is answering an older build, the token is absent or stale and this
refuses to run rather than reporting a pass. That is the whole reason to
prefer it over seven hand-typed commands.

    python3 platform/ci/browser_checks.py
    python3 platform/ci/browser_checks.py --dist platform/pages/dist
    python3 platform/ci/browser_checks.py --checks sweep,sideways
    python3 platform/ci/browser_checks.py --only ebay-fee-calculator
    python3 platform/ci/browser_checks.py --base-url https://tools.marisstella.dev

With no `--dist` it builds into a temporary directory, so the default run
is always against the current tree and never against a stale `dist/` a
previous session left behind.

`--only` scopes the run to one or more venture slugs. A whole-site run is
the reason `browser-checks-ci.yml` is nightly rather than a pull-request
gate -- it is the whole catalogue and takes 20-30 minutes -- and a pull
request almost always touches one venture. Three of the seven
(`presets`, `roundtrip`, `highlight`) already took slugs as positional
argv; this reaches all of them, because the harness runs each check as
`node <path>` with no arguments and only the environment gets through.
`journey` is a single narrative over the whole site and ignores it.

A filter is a way to verify **less**, so two things are enforced rather
than trusted. A slug that is not in the built site stops the run with exit
2 before a browser starts, so a typo names itself instead of quietly
reducing the run to nothing; and every green summary line from a filtered
run carries `[FILTERED: ...]`, because "all 7 browser checks passed" over
four pages is the most misleading true sentence this file could print.

`--base-url` points the checks at a site someone else is serving (a
deployment, or a server you started yourself). There is no sentinel in
that mode -- this cannot write into a tree it does not own -- so the
report says the origin was taken on trust.

**A check that could not run is not a check that failed.** All seven exit
`1` for a real defect and `2` for "nothing was verified" -- no Playwright,
no axe-core, an empty page list, a `DIST` that is not there. This
distinguishes the two everywhere it reports: a `2` prints as `skip`, never
as `FAILED`, and the run's own exit code is `1` only when something
actually failed, `2` when everything that ran passed but something did not
run, and `0` when all seven answered.

That mattered because the one dependency that is not Playwright is
`axe-core`, and it belongs to `contrast` -- the WCAG check, the only thing
here that speaks for users who cannot read a low-contrast page. Without
it, `contrast` exits 2 and this used to report `1 of 6 checks failed:
contrast`. A missing npm package presented as an accessibility regression
is read one of two ways, and both are wrong: as a defect that is chased
and not found, or as a suite not worth running. This repo has three
paragraphs in `CLAUDE.md` on absent CI not being failed CI; the same
conflation was living in its own tooling.

What it does not do. It does not install Playwright or axe-core.
`PLAYWRIGHT` and `AXE` name those modules explicitly, and an explicit
choice is always passed through untouched. When they are unset, this looks
for each in the places a module is normally installed -- `NODE_PATH`, this
repo, `platform/pages/`, and the global npm root -- so the usual
`PLAYWRIGHT=$(npm root -g)/playwright/index.js` incantation is only needed
where the answer is not discoverable. Nothing found means nothing changed,
and the skip reports itself with the command that fixes it.

Installing it is two commands, and worth knowing because several ledger
entries record "no headless browser available in this environment" and
merged on unit tests alone. In a Claude Code web session a Chromium is
already at `/opt/pw-browsers`; only the npm packages are missing, and they
go in a scratch directory rather than this repo, which has no
`package.json` and should not grow one for a check that is not in CI:

    cd "$SCRATCH" && npm install playwright axe-core
    PLAYWRIGHT="$SCRATCH/node_modules/playwright/index.js" \\
    AXE="$SCRATCH/node_modules/axe-core/axe.min.js" \\
    python3 platform/ci/browser_checks.py --dist=path/to/site

`axe-core` is `contrast`'s dependency alone; without it that one check
skips and the other six still run and still report. Do not run
`npx playwright install`
-- see the paragraph below on why the version pin does not matter here.
Verified on 2026-08-31: all seven checks ran this way against a
`tools.marisstella.dev`-stamped artifact, and `journey`'s sitemap step
found a real bug in itself doing so.

It does find a browser, but only when you did not name one. `CHROME_PATH`
still reuses a Chromium already on the machine and is passed through
untouched; when it is unset, `PLAYWRIGHT_BROWSERS_PATH` is searched for one
and the newest build found is used. That exists because Playwright pins a
browser *build number* and refuses to launch anything else -- so an install
pinned at 1234 will not touch the `chromium-1194` sitting beside it, and
says so with "run npx playwright install", which is the wrong advice in a
container that ships browsers at a fixed path and blocks the download.
Following it costs a run. Setting `executablePath` sidesteps the pin, and
that is all this does; a Chromium found this way is not the build
Playwright was tested against, so a launch that still fails is worth
reading rather than working around further.
"""

import argparse
import glob
import http.server
import os
import re
import secrets
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGES = os.path.join(REPO_ROOT, "platform", "pages")

# Ordered cheapest-first so a broken build fails the fast check before
# `journey.mjs` spends several minutes proving the same thing.
#
# `highlight` was written on 2026-08-29 and left out of this list, so a
# session running "the browser checks" ran six of the seven and was not told.
# It is the only one that asks whether a rejected input gets pointed at --
# the check that found 0 of 103 tools drawing any highlight at all, on forms
# with twenty to forty numeric fields where the message said "check the
# highlighted input" and nothing was highlighted. A check nobody runs is the
# same gate-that-never-opens this file's exit-code handling exists to stop.
CHECKS = ("sideways", "presets", "roundtrip", "highlight", "contrast", "optout", "sweep", "journey")

SENTINEL_NAME = ".browser-checks-sentinel"

# The exit-code contract every check in `platform/pages/` already follows:
# 0 answered and passed, 1 found a real defect, 2 could not verify anything
# (no Playwright, no axe-core, an empty page list, a DIST that is not there).
# `journey.mjs`, `sweep.mjs`, `contrast.mjs`, `roundtrip.mjs`, `presets.mjs`,
# `highlight.mjs` and `sideways.mjs` all reserve 2 for that; this is the
# reader that acts on it rather than collapsing 1 and 2 into "non-zero".
SKIP_EXIT = 2

# A timeout is not the check's own verdict -- `run_check` invents 124 for it,
# nothing in the tree exits it -- and it is a failure: the check was running
# and did not finish, which is exactly the shape of a page that hangs.
TIMEOUT_EXIT = 124

SUMMARY_MARK = {"ok": "ok  ", "skip": "skip", "fail": "FAIL"}


def classify(rc: int) -> str:
    """One of "ok", "skip", "fail" for a check's exit code."""
    if rc == 0:
        return "ok"
    if rc == SKIP_EXIT:
        return "skip"
    return "fail"


def is_skip(rc: int) -> bool:
    return classify(rc) == "skip"


def is_failure(rc: int) -> bool:
    return classify(rc) == "fail"


def outcome_label(rc: int) -> str:
    """How one check's result reads in the per-check banner."""
    if rc == 0:
        return "ok"
    if rc == SKIP_EXIT:
        return "did not run (exit 2) — nothing verified"
    if rc == TIMEOUT_EXIT:
        return f"FAILED (timed out, exit {rc})"
    return f"FAILED (exit {rc})"


def free_port() -> int:
    """An ephemeral port the OS says is free right now.

    Racy by nature -- something can take it between this closing and the
    server binding -- but the sentinel below catches that case, which is
    the one that actually matters: a port answering someone else's tree.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D102 - silence per-request logging
        pass


def serve(directory: str, port: int):
    """Start a background HTTP server for `directory`. Returns the server."""
    handler = lambda *a, **kw: _QuietHandler(*a, directory=directory, **kw)  # noqa: E731
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def build(out_dir: str, base_url: str | None) -> int:
    """Build the site into `out_dir`. Returns build.mjs's exit code."""
    env = dict(os.environ)
    if base_url:
        env["PAGES_BASE_URL"] = base_url
    proc = subprocess.run(
        ["node", os.path.join(PAGES, "build.mjs"), f"--out={out_dir}"],
        cwd=REPO_ROOT, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    if proc.returncode != 0:
        sys.stdout.write(proc.stdout)
    return proc.returncode


def write_sentinel(dist: str) -> str:
    token = secrets.token_hex(16)
    with open(os.path.join(dist, SENTINEL_NAME), "w", encoding="utf-8") as fh:
        fh.write(token)
    return token


def confirm_sentinel(base: str, token: str, timeout: float = 10.0) -> tuple[bool, str]:
    """Prove the origin is serving the tree we just wrote the token into.

    Returns (ok, detail). A mismatch means something else holds the port --
    the 2026-08-28 false-clean-report shape -- and the caller must not run
    the checks against it.
    """
    url = f"{base}/{SENTINEL_NAME}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            got = resp.read().decode("utf-8", "replace").strip()
    except urllib.error.HTTPError as exc:
        return False, f"{url} returned HTTP {exc.code} — the port is answering another tree"
    except Exception as exc:  # connection refused, timeout, ...
        return False, f"{url} could not be read: {exc}"
    if got != token:
        return False, f"{url} served a different token — the port is answering another build"
    return True, "sentinel matched"


def playwright_available(env) -> bool:
    """Whether the checks will be able to import Playwright at all."""
    spec = env.get("PLAYWRIGHT") or "playwright"
    probe = (
        "const p = await import(process.argv[1]);"
        "if (!(p.chromium ?? p.default?.chromium)) process.exit(3);"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", probe, spec],
        cwd=REPO_ROOT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc.returncode == 0


# `npm root -g` shells out, and both discoveries below want the same answer.
# None is a real result here ("npm could not tell us"), so a sentinel object
# distinguishes it from "not asked yet" and the subprocess runs at most once.
_UNASKED = object()
_npm_global_root_cache: object | str | None = _UNASKED


def npm_global_root(env) -> str | None:
    """Where a `npm install -g` puts its packages, or None if npm cannot say."""
    global _npm_global_root_cache
    if _npm_global_root_cache is not _UNASKED:
        return _npm_global_root_cache  # type: ignore[return-value]
    root = None
    try:
        proc = subprocess.run(
            ["npm", "root", "-g"], env=env, timeout=30,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        candidate = proc.stdout.strip()
        if proc.returncode == 0 and candidate and os.path.isdir(candidate):
            root = candidate
    except (OSError, subprocess.SubprocessError):
        root = None  # no npm on PATH, or it hung -- neither is worth failing over
    _npm_global_root_cache = root
    return root


def module_search_roots(env) -> list[str]:
    """`node_modules` directories to look in, nearest first.

    Deliberately not `npm ls` or a resolver: this only needs to find a file
    that is either there or not, and shelling out per candidate would cost
    more than the search saves.
    """
    roots = [
        part
        for part in (env.get("NODE_PATH") or "").split(os.pathsep)
        if part
    ]
    roots.append(os.path.join(REPO_ROOT, "node_modules"))
    roots.append(os.path.join(PAGES, "node_modules"))
    global_root = npm_global_root(env)
    if global_root:
        roots.append(global_root)
    return roots


def discover_module(env, relpath: str) -> str | None:
    """The first readable `<root>/<relpath>`, or None when nothing has it."""
    for root in module_search_roots(env):
        candidate = os.path.join(root, relpath)
        if os.path.isfile(candidate) and os.access(candidate, os.R_OK):
            return candidate
    return None


def discover_axe(env) -> str | None:
    """axe-core's bundle, when `AXE` was not given.

    `contrast.mjs` resolves `axe-core/axe.min.js` relative to itself, which
    finds a copy installed into this repo and nothing else -- and this repo
    has no `package.json` and should not grow one for a check that is not in
    CI. So the usual install is a global one or a scratch directory, and
    neither is on that path. Filling in `AXE` when the file is findable is
    what keeps the WCAG check from skipping on a machine that already has it.

    Returns None when the caller already chose, or when nothing was found --
    both mean "change nothing".
    """
    if env.get("AXE"):
        return None  # an explicit choice always wins
    return discover_module(env, os.path.join("axe-core", "axe.min.js"))


def discover_playwright(env) -> str | None:
    """Playwright's entry point, when `PLAYWRIGHT` was not given.

    Only consulted after a bare `import('playwright')` has already failed,
    which is the common shape in a container that installs it globally:
    the package is right there, and every check refuses to start because
    node will not resolve a global module from this repo's cwd.
    """
    if env.get("PLAYWRIGHT"):
        return None  # an explicit choice always wins
    return discover_module(env, os.path.join("playwright", "index.js"))


def _build_number(path: str) -> int:
    match = re.search(r"chromium(?:_headless_shell)?-(\d+)", path)
    return int(match.group(1)) if match else -1


def chrome_candidates(env) -> list[str]:
    """Every Chromium in the browsers tree, best first. Pure path logic.

    Two shapes live under `PLAYWRIGHT_BROWSERS_PATH`, and both can drive the
    checks: the full browser (`chromium-*/chrome-linux/chrome`) and the
    headless shell (`chromium_headless_shell-*/chrome-linux/headless_shell`),
    which is the binary Playwright itself launches by default for
    `headless: true` — which is the only mode any check here runs in.

    Full builds are offered first because they are the more capable binary and
    were the only ones this ever returned. The shell is a fallback rather than
    an equal: it is the right answer only when the full build will not start.
    Within each shape the newest build wins, so a stale tree left by an older
    install does not win on alphabetical order.

    Ordering is all this decides. Which candidate is actually usable is
    settled by launching it — see `chrome_launches`.
    """
    root = env.get("PLAYWRIGHT_BROWSERS_PATH")
    if not root or not os.path.isdir(root):
        return []

    def matches(*patterns: str) -> list[str]:
        found = [
            path
            for pattern in patterns
            for path in glob.glob(os.path.join(root, pattern))
            if os.access(path, os.X_OK)
        ]
        return sorted(set(found), key=_build_number, reverse=True)

    return [
        *matches("chromium-*/chrome-linux/chrome", "chromium/chrome-linux/chrome"),
        *matches("chromium_headless_shell-*/chrome-linux/headless_shell"),
    ]


def chrome_launches(env, path: str | None) -> bool:
    """Whether Playwright can actually start this binary and open a page.

    A file that exists and is executable is not evidence that it runs. The
    binaries under a browsers tree are built against the host they shipped
    for, and a mismatch shows up as a launch that dies on a signal rather
    than as a missing file — so the only honest test is to launch it.
    """
    spec = env.get("PLAYWRIGHT") or "playwright"
    probe = (
        "const p = await import(process.argv[1]);"
        "const chromium = p.chromium ?? p.default?.chromium;"
        "const exe = process.argv[2];"
        "const b = await chromium.launch(exe ? { executablePath: exe } : {});"
        "await (await b.newPage()).setContent('<p>probe</p>');"
        "await b.close();"
    )
    try:
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", probe, spec, path or ""],
            cwd=REPO_ROOT, env=env, timeout=120,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except (subprocess.TimeoutExpired, OSError):
        return False
    return proc.returncode == 0


def discover_chrome(env) -> str | None:
    """A Chromium already on this machine, when `CHROME_PATH` was not given.

    Playwright pins a browser *build number* in the package, and refuses to
    launch anything else: an install whose pin is 1234 will not touch a
    `chromium-1194` sitting right beside it. Its error says to run
    `npx playwright install`, which is the wrong advice in a container that
    ships browsers at a fixed path and blocks the download — and following it
    is how a session spends its run installing a second copy of a browser it
    already has.

    `executablePath` sidesteps the pin, which is what `CHROME_PATH` is for.
    All this does is fill it in when the answer is discoverable, so the
    override stays available for the case where it is not.

    **It launches each candidate before offering it (changed 2026-09-07), and
    the reason is that guessing here fails in the shape this repository keeps
    paying for: a wrong answer that reads as a broken catalogue.** Measured
    that day, on the image these sessions run on: the full
    `chromium-1194/chrome-linux/chrome` dies on SIGTRAP the moment Playwright
    connects to it, while `chromium_headless_shell-1194` — the build the old
    code documented an exclusion for — starts and renders fine, and so does a
    bare `chromium.launch()` with no `executablePath` at all. So this filled
    in the one binary on the box that does not work, and all seven checks came
    back `FAILED` with a stack trace about a closed target. Nothing in that
    output says "your browser will not start"; it reads exactly like the
    catalogue being broken, which is the reading that costs a session its run.

    Returns None when the caller already chose, when nothing was found, or
    when nothing found will start. All three mean "change nothing" — and the
    last is not a dead end, because Playwright's own default resolution still
    gets its turn, which on that same image is a resolution that works.
    """
    if env.get("CHROME_PATH") or env.get("CHROMIUM_PATH"):
        return None  # an explicit choice always wins

    for path in chrome_candidates(env):
        if chrome_launches(env, path):
            return path
    return None


def run_check(name: str, base: str, env, timeout: int) -> tuple[int, str]:
    """Run one check. Returns (exit code, tail of its output)."""
    path = os.path.join(PAGES, f"{name}.mjs")
    child = dict(env)
    child["BASE_URL"] = base
    try:
        proc = subprocess.run(
            ["node", path], cwd=REPO_ROOT, env=child, timeout=timeout,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {timeout}s"
    tail = "\n".join(proc.stdout.strip().splitlines()[-25:])
    return proc.returncode, tail


def _count_html(dist: str | None) -> int | None:
    """HTML files in the built artifact, for the reading's `pages` field.

    Counted from the tree rather than parsed out of a check's own output:
    every check words its total differently, and a regex over seven message
    formats is a maintenance bill for a number that is only ever context.
    """
    if not dist or not os.path.isdir(dist):
        return None
    total = 0
    for _root, _dirs, files in os.walk(dist):
        total += sum(1 for f in files if f.endswith(".html"))
    return total or None


def _built_at() -> str | None:
    """HEAD right now, captured *before* the build so the reading can name it.

    A whole-site run takes 20-30 minutes, and `browser_state.record` used to
    fill the reading's commit in from `head_commit()` at the moment it wrote
    the file -- i.e. at the end. This repository runs up to four concurrent
    sessions in a fifteen-minute window (`session_gate.py`) and merges into a
    working tree constantly, so a `git merge` landing mid-run stamped the
    reading with a commit whose changes no check had ever seen: coverage
    claimed for pages built after the artifact under test was already on
    disk. That is the same laundering `browser_state.py`'s refusals exist to
    prevent, arriving through the one field nobody was looking at.
    """
    try:
        p = subprocess.run(("git", "-C", REPO_ROOT, "rev-parse", "HEAD"),
                           capture_output=True, text=True)
    except OSError:
        return None
    return p.stdout.strip() or None if p.returncode == 0 else None


def _record_reading(names, only, base_url, dist, commit=None) -> None:
    """Write a passing run to browser_state.json.

    A full run is recorded as `scope: "full"` and is the only kind that can
    establish coverage for a check.

    A `--only` run is recorded as `scope: "ventures"` with the slugs it
    named. That is not a relaxation of the FILTERED stamp -- it is what the
    stamp means, written down. `browser_state.latest_full_for` will not let
    a scoped reading serve as a base, so it can only ever top a full reading
    up for the ventures it actually visited, which is the post-merge case
    that used to cost 25 minutes or get skipped. Whole-site checks are
    dropped from a scoped reading because `--only` does not scope them:
    recording `journey` here would claim a narrative this run never ran
    against the rest of the catalogue.

    A `--base-url` run is still refused outright: it trusted an origin this
    process did not build and could place no sentinel in, so it cannot
    honestly be tied to the commit this working tree is on, which is what
    staleness is computed against.
    """
    if base_url:
        print("not recorded: --base-url trusts an origin this run did not build, "
              "so the reading\ncannot be tied to this tree's commit.", file=sys.stderr)
        return
    try:
        import browser_state
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import browser_state
    # The reading names the commit the artifact was BUILT from, not HEAD at
    # the moment of writing -- see `_built_at`. If they differ, the run is
    # still honest about what it checked; it just does not get credit for
    # whatever landed underneath it.
    if commit and commit != browser_state.head_commit():
        print(f"note: HEAD moved during this run; recording the commit the "
              f"artifact was built from ({commit[:8]}).", file=sys.stderr)

    if only:
        scoped = [n for n in names if n not in browser_state.WHOLE_SITE_CHECKS]
        dropped = [n for n in names if n in browser_state.WHOLE_SITE_CHECKS]
        if dropped:
            print(f"not recorded for {', '.join(dropped)}: --only does not scope "
                  f"a whole-site check.", file=sys.stderr)
        if not scoped:
            return
        reading = browser_state.record(scoped, result="pass", scope="ventures",
                                       slugs=only, commit=commit)
        where = os.path.relpath(browser_state.STATE, os.getcwd())
        print(f"recorded (scoped): {', '.join(reading['checks'])} passing over "
              f"{', '.join(reading['slugs'])} at {reading['commit'][:8]} → {where}")
        return

    reading = browser_state.record(names, result="pass", pages=_count_html(dist),
                                   commit=commit)
    where = os.path.relpath(browser_state.STATE, os.getcwd())
    print(f"recorded: {', '.join(reading['checks'])} passing at "
          f"{reading['commit'][:8]} → {where}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dist", help="serve this built directory instead of building one")
    ap.add_argument("--base-url", help="run against an origin someone else serves "
                                       "(no sentinel: the origin is taken on trust)")
    ap.add_argument("--checks", default=",".join(CHECKS),
                    help="comma-separated subset of: " + ", ".join(CHECKS))
    ap.add_argument("--port", type=int, help="serve on this port (default: a free one)")
    ap.add_argument("--timeout", type=int, default=2700,
                    help="per-check timeout in seconds (default 2700)")
    ap.add_argument("--stamp-base-url", metavar="URL",
                    help="build with PAGES_BASE_URL=URL, to check the artifact a "
                         "deployment would actually serve")
    ap.add_argument("--only", metavar="SLUG,SLUG",
                    help="restrict the checks to these venture slugs, so a pull "
                         "request that touches one venture can run them in about a "
                         "minute instead of 25. `journey` is a whole-site narrative "
                         "and ignores this. A filtered run is stamped FILTERED in "
                         "the summary and never reports as a full one.")
    ap.add_argument("--record", action="store_true",
                    help="on an unskipped, passing run, write the reading to "
                         "platform/ci/browser_state.json so the next session can "
                         "see when these last ran instead of re-running 30 minutes "
                         "of checks or skipping them. A full run is recorded as the "
                         "catalogue reading; an --only run is recorded as a scoped "
                         "reading over just those ventures, which tops a full "
                         "reading up but can never stand in for one. Refused for "
                         "--base-url runs, which trust an origin this process did "
                         "not build.")
    args = ap.parse_args(argv)

    names = [c.strip() for c in args.checks.split(",") if c.strip()]
    unknown = [c for c in names if c not in CHECKS]
    if unknown:
        print(f"unknown check(s): {', '.join(unknown)}\nknown: {', '.join(CHECKS)}",
              file=sys.stderr)
        return 2
    if args.base_url and (args.dist or args.stamp_base_url):
        print("--base-url runs against a site you did not build; pass it alone",
              file=sys.stderr)
        return 2
    only = [s.strip() for s in (args.only or "").split(",") if s.strip()]
    if only and "journey" in names and len(names) == 1:
        # Not an error worth refusing over, but saying nothing would let
        # `--only x --checks journey` look like it verified venture x.
        print("Note: `journey` is a whole-site narrative and ignores --only, so "
              "this run\nis not scoped to the slug(s) you named.", file=sys.stderr)
    # Settle every argument before probing the environment. A typo'd --dist
    # reported as "Playwright is missing" sends you to install a browser you
    # already have.
    if args.dist:
        args.dist = os.path.abspath(args.dist)
        if not os.path.isdir(args.dist):
            print(f"no such directory: {args.dist}", file=sys.stderr)
            return 2

    env = dict(os.environ)
    if not playwright_available(env):
        # A global install is the common case in this container, and node will
        # not resolve one from this repo's cwd. Point at it before giving up.
        found = discover_playwright(env)
        if found:
            env["PLAYWRIGHT"] = found
            print(f"Using the Playwright already here: {found}")
    if not playwright_available(env):
        spec = env.get("PLAYWRIGHT", "playwright")
        print(f"Playwright ({spec}) is not importable here, so the browser checks\n"
              "cannot run. This is a skip, not a failure — nothing was verified.\n"
              "  npm install playwright   (then npx playwright install chromium)\n"
              "  PLAYWRIGHT=$(npm root -g)/playwright/index.js  for a global install",
              file=sys.stderr)
        return 2

    chrome = discover_chrome(env)
    if chrome:
        env["CHROME_PATH"] = chrome
        print(f"Using the Chromium already here: {chrome}")
    elif not (env.get("CHROME_PATH") or env.get("CHROMIUM_PATH")) and chrome_candidates(env):
        # Said out loud, because the alternative is seven identical stack
        # traces about a closed target and no hint that the browser, rather
        # than the catalogue, is what did not work.
        print("Note: a Chromium is present but would not launch, so the checks will use\n"
              "Playwright's own resolution instead. If they now fail to start at all,\n"
              "that is the browser and not these pages — set CHROME_PATH to override.")

    # One launch before the build, with whatever the checks will use. Until
    # 2026-10-30 a browser that would not start (the nightly of 2026-10-21 to
    # 10-29: Playwright 1.56 could not install Chromium on Ubuntu 26.04 and
    # the install step is `continue-on-error`) reached all eight checks, each
    # died with the same "Executable doesn't exist" trace, and the run said
    # "8 of 8 checks failed" -- a site defect reading for a missing browser.
    # Nothing can be verified without one, which is exit 2 by this file's
    # own contract.
    if not chrome_launches(env, env.get("CHROME_PATH") or env.get("CHROMIUM_PATH")):
        print("Chromium would not start here, so the browser checks cannot run.\n"
              "This is a skip, not a failure — nothing was verified.\n"
              "  npx playwright install chromium   (with the same Playwright the checks use)\n"
              "  CHROME_PATH=/path/to/chrome       to name a browser that does start",
              file=sys.stderr)
        return 2

    # Only when `contrast` is actually being run: this is the one search that
    # shells out to npm, and no other check reads AXE.
    axe = discover_axe(env) if "contrast" in names else None
    if axe:
        env["AXE"] = axe
        print(f"Using the axe-core already here: {axe}")
    elif "contrast" in names and not env.get("AXE"):
        # Said now rather than after a full build and a served tree, so the
        # one-line fix arrives before the wait instead of after it.
        print("Note: axe-core was not found, so `contrast` (the WCAG check) will\n"
              "skip. The other checks are unaffected. To include it:\n"
              '  cd "$SCRATCH" && npm install axe-core\n'
              '  AXE="$SCRATCH/node_modules/axe-core/axe.min.js" ...',
              file=sys.stderr)

    # Captured before the build, so a merge landing during the 20-30 minute
    # run cannot make the reading claim pages no check ever saw.
    built_at = _built_at()

    tmp = None
    httpd = None
    try:
        if args.base_url:
            base = args.base_url.rstrip("/")
            print(f"Running {len(names)} check(s) against {base}")
            print("  origin taken on trust: --base-url cannot place a sentinel.\n")
        else:
            dist = args.dist  # already absolute and known to exist
            if not dist:
                tmp = tempfile.mkdtemp(prefix="browser-checks-")
                dist = os.path.join(tmp, "dist")
                print("Building the site (no --dist given, so nothing stale can be used)…")
                rc = build(dist, args.stamp_base_url)
                if rc != 0:
                    print("build.mjs failed; not running the checks", file=sys.stderr)
                    return 1

            # sideways.mjs, presets.mjs, roundtrip.mjs, contrast.mjs and
            # highlight.mjs each walk the built tree on disk (to list pages,
            # or to compare served output against source) in addition to
            # fetching over BASE_URL. Without DIST they fall back to
            # `<script-dir>/dist`, which is empty in the common case (no
            # --dist given, built fresh under a tempdir) and stale in the
            # dangerous case (an old platform/pages/dist a previous build
            # left lying around matches by coincidence). sweep.mjs and
            # journey.mjs never read DIST, which is why this was invisible
            # until a run actually exercised the other four.
            env["DIST"] = dist

            # Refuse a filter that names something the build did not produce,
            # before any browser starts. Without this a typo is indistinguishable
            # from a pass: every check would find nothing for that slug, and the
            # ones that report an empty run as a skip would hand back "the checks
            # that ran passed". A filter is a way to verify less, so the one thing
            # it must never do is verify nothing and stay quiet -- the failure
            # this repo has already paid for three times (see only-slugs.mjs).
            if only:
                built = {
                    name for name in os.listdir(dist)
                    if os.path.isfile(os.path.join(dist, name, "index.html"))
                }
                unknown_slugs = sorted(set(only) - built)
                if unknown_slugs:
                    print(f"--only names {len(unknown_slugs)} slug(s) that are not in "
                          f"the built site: {', '.join(unknown_slugs)}\n"
                          "Nothing was verified. A venture's slug is its directory "
                          "name under `ventures/`,\nand only ventures that build to a "
                          "static page appear here.", file=sys.stderr)
                    return 2

            port = args.port or free_port()
            base = f"http://127.0.0.1:{port}"
            token = write_sentinel(dist)
            try:
                httpd = serve(dist, port)
            except OSError as exc:
                print(f"could not bind {base}: {exc}\n"
                      "Something already holds that port. Re-run without --port to "
                      "take a free one.", file=sys.stderr)
                return 2

            ok, detail = confirm_sentinel(base, token)
            if not ok:
                print(f"Refusing to run: {detail}.\n"
                      "This is the trap journey.mjs and sweep.mjs document — a server "
                      "left\nover from an earlier build answering for the one under "
                      "test. Nothing was verified.", file=sys.stderr)
                return 2
            print(f"Serving {dist} at {base} ({detail})")
            print(f"Running {len(names)} check(s): {', '.join(names)}\n")

        # After the --base-url branch too: an origin someone else serves can
        # still be asked about one venture, it just cannot be pre-validated
        # against a tree this process does not own.
        if only:
            env["ONLY_SLUGS"] = ",".join(only)
            print(f"FILTERED to {len(only)} venture(s): {', '.join(sorted(only))}"
                  "  (`journey` ignores this)\n")

        results = []
        for name in names:
            print(f"--- {name} ---", flush=True)
            rc, tail = run_check(name, base, env, args.timeout)
            results.append((name, rc))
            if tail:
                print(tail)
            print(f"--- {name}: {outcome_label(rc)} ---\n", flush=True)

        failed = [n for n, rc in results if is_failure(rc)]
        skipped = [n for n, rc in results if is_skip(rc)]
        print("=" * 60)
        for name, rc in results:
            print(f"  {SUMMARY_MARK[classify(rc)]}  {name}")

        # Reported before the verdict: a skip is the quiet outcome, and
        # burying it under "all checks passed" is how a gate stops being one.
        if skipped:
            print(f"\n{len(skipped)} of {len(results)} checks did NOT run: "
                  f"{', '.join(skipped)}\n"
                  "Nothing was verified for those — see each one's message above "
                  "for the\nmissing dependency. This is a skip, not a failure.")
        if failed:
            print(f"\n{len(failed)} of {len(results)} checks failed: {', '.join(failed)}")
            return 1
        # "FILTERED" rather than nothing, on both green lines. Whoever reads a
        # pasted summary has no other way to tell a one-venture run from a
        # whole-site one, and "all 7 browser checks passed" over 4 pages is the
        # most misleading true sentence this file could print.
        scope = f" [FILTERED: {', '.join(sorted(only))}]" if only else ""
        if skipped:
            ran = len(results) - len(skipped)
            print(f"\nthe {ran} check(s) that ran passed against {base}{scope}")
            # Deliberately not recorded. A skip is the outcome this repository
            # is worst at noticing, and writing it down beside the passes is
            # how "nothing was verified" becomes "verified" one session later.
            if args.record:
                print("not recorded: a run with skips says nothing about the "
                      "checks that did not run.", file=sys.stderr)
            return 2
        print(f"\nall {len(results)} browser checks passed against {base}{scope}")
        if args.record:
            _record_reading(names, only, args.base_url,
                            dist if not args.base_url else None, commit=built_at)
        return 0
    finally:
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()
        if tmp is not None:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
