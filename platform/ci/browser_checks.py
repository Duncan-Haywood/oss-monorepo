#!/usr/bin/env python3
"""Run the six browser checks against a build, and prove what answered.

Why this exists. `platform/pages/` carries six checks CI cannot run --
`journey.mjs` (the customer journey), `sweep.mjs` (does every tool still
compute), `contrast.mjs` (can every page be read and reached),
`roundtrip.mjs` (does a shared bid arrive as the bid that was sent),
`presets.mjs` (does picking "no preset" leave the takeoff alone) and
`sideways.mjs` (does any page scroll sideways on a phone). They need
Playwright, which is not a dependency of this repo, so no workflow runs
them. Since 2026-08-26 no workflow runs at all, which makes them the only
thing standing between a merge and a page that renders perfectly and does
nothing -- the failure `sweep.mjs`'s own header says this repo has shipped
before.

Nothing orchestrates them. `platform/pages/README.md` hands you six
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
prefer it over six hand-typed commands.

    python3 platform/ci/browser_checks.py
    python3 platform/ci/browser_checks.py --dist platform/pages/dist
    python3 platform/ci/browser_checks.py --checks sweep,sideways
    python3 platform/ci/browser_checks.py --base-url https://tools.marisstella.dev

With no `--dist` it builds into a temporary directory, so the default run
is always against the current tree and never against a stale `dist/` a
previous session left behind.

`--base-url` points the checks at a site someone else is serving (a
deployment, or a server you started yourself). There is no sentinel in
that mode -- this cannot write into a tree it does not own -- so the
report says the origin was taken on trust.

What it does not do. It does not install Playwright. `PLAYWRIGHT` names the
module when it is not resolvable from this repo (a global install:
`PLAYWRIGHT=$(npm root -g)/playwright/index.js`), and a missing Playwright
is reported as a skip with that instruction rather than as a failure,
because "the browser is not installed here" and "the site is broken" are
not the same result.

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
CHECKS = ("sideways", "presets", "roundtrip", "contrast", "sweep", "journey")

SENTINEL_NAME = ".browser-checks-sentinel"


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

    Returns None when the caller already chose, or when nothing was found —
    both mean "change nothing", and a launch failure then reports itself.
    """
    if env.get("CHROME_PATH") or env.get("CHROMIUM_PATH"):
        return None  # an explicit choice always wins

    root = env.get("PLAYWRIGHT_BROWSERS_PATH")
    if not root or not os.path.isdir(root):
        return None

    # The full browser, never `chromium_headless_shell-*`: the checks drive a
    # real page, and the shell build is a different binary with a different
    # name under the same tree.
    found = [
        path
        for pattern in ("chromium-*/chrome-linux/chrome", "chromium/chrome-linux/chrome")
        for path in glob.glob(os.path.join(root, pattern))
        if os.access(path, os.X_OK)
    ]
    if not found:
        return None

    def build_number(path: str) -> int:
        match = re.search(r"chromium-(\d+)", path)
        return int(match.group(1)) if match else -1

    # Newest build when a machine carries several, so a stale tree left by an
    # older install does not win on alphabetical order.
    return max(found, key=build_number)


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

        results = []
        for name in names:
            print(f"--- {name} ---", flush=True)
            rc, tail = run_check(name, base, env, args.timeout)
            results.append((name, rc))
            if tail:
                print(tail)
            print(f"--- {name}: {'ok' if rc == 0 else f'FAILED (exit {rc})'} ---\n",
                  flush=True)

        failed = [n for n, rc in results if rc != 0]
        print("=" * 60)
        for name, rc in results:
            print(f"  {'ok  ' if rc == 0 else 'FAIL'}  {name}")
        if failed:
            print(f"\n{len(failed)} of {len(results)} checks failed: {', '.join(failed)}")
            return 1
        print(f"\nall {len(results)} browser checks passed against {base}")
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
