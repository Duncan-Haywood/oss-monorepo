"""Tests for host-mode serving of the portfolio site. No cluster, no network.

`gitops/prod/host/` is the third host-mode path in this repository, after
`gitops/agents/host/` (the Codex worker) and `gitops/ci/host/` (the Actions
runner). It is the one whose failure a *user* sees: it is what makes a box with
no k3s on it answer a stranger's request with the catalogue.

Most of what follows guards properties that are cheap to state and expensive to
discover in production:

- `refresh-site.sh` is fail-closed. A build that does not pass `check.mjs`
  leaves the previous release serving. This is the whole basis for letting a
  timer redeploy the site unattended, so it is tested directly rather than
  read off the source.
- The nginx templates carry no placeholder the installer cannot fill. The
  installer already refuses at render time; this catches it in CI instead, on
  the commit that added the placeholder.
- Both templates type `.mjs` as JavaScript. nginx's stock `mime.types` has no
  `.mjs` entry, and a browser *refuses* to execute an ES module served as
  `application/octet-stream` rather than merely mistyping it -- so getting this
  wrong leaves every request answering 200 and every calculator on the site
  inert. Measured on a real nginx before the block existed; that is precisely
  the kind of failure no page-level check notices.
"""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
HOST = ROOT / "prod" / "host"
INSTALLER = REPO / "bootstrap" / "scripts" / "install-portfolio-site-host.sh"
REFRESH = HOST / "refresh-site.sh"
HTTP_CONF = HOST / "portfolio-site.http.conf"
TLS_CONF = HOST / "portfolio-site.tls.conf"
SERVICE = HOST / "portfolio-site-refresh.service"
TIMER = HOST / "portfolio-site-refresh.timer"

# Every placeholder `render_conf` in the installer knows how to substitute.
# Kept as a literal list rather than parsed out of the shell, so that adding a
# placeholder to a template *and* to the installer still has to be reflected
# here deliberately -- the point is to notice the change, not to auto-agree
# with it.
FILLED = {
    "@@SERVER_NAME@@",
    "@@WEBROOT@@",
    "@@ACME_WEBROOT@@",
    "@@CERT_FULLCHAIN@@",
    "@@CERT_PRIVKEY@@",
}


# ------------------------------------------------------------------ the files


def test_every_piece_host_mode_needs_is_present():
    for path in (INSTALLER, REFRESH, HTTP_CONF, TLS_CONF, SERVICE, TIMER):
        assert path.is_file(), f"{path.relative_to(REPO)} is missing"


def test_scripts_are_executable():
    for path in (INSTALLER, REFRESH):
        mode = path.stat().st_mode
        assert mode & stat.S_IXUSR, (
            f"{path.relative_to(REPO)} is not executable. The installer runs "
            f"refresh-site.sh directly and systemd's ExecStart names it."
        )


@pytest.mark.parametrize("conf", [HTTP_CONF, TLS_CONF], ids=["http", "tls"])
def test_templates_only_use_placeholders_the_installer_fills(conf: Path):
    used = set(re.findall(r"@@[A-Z_]+@@", conf.read_text()))
    unknown = used - FILLED
    assert not unknown, (
        f"{conf.relative_to(REPO)} uses {sorted(unknown)}, which "
        f"install-portfolio-site-host.sh's render_conf() does not substitute. "
        f"nginx would receive a literal placeholder, and one inside a comment "
        f"or a quoted string would not even be rejected."
    )


@pytest.mark.parametrize("conf", [HTTP_CONF, TLS_CONF], ids=["http", "tls"])
def test_mjs_is_typed_as_javascript(conf: Path):
    text = conf.read_text()
    assert re.search(r"location\s+~\s+\\\.mjs\$", text), (
        f"{conf.relative_to(REPO)} has no `.mjs` location. nginx's stock "
        f"mime.types has no entry for it, so every ES module would be served "
        f"as application/octet-stream and refused by the browser -- with a "
        f"200 on every request, so nothing else here would notice."
    )
    assert "default_type application/javascript;" in text


@pytest.mark.parametrize("conf", [HTTP_CONF, TLS_CONF], ids=["http", "tls"])
def test_every_content_location_repeats_the_security_headers(conf: Path):
    """`add_header` does not inherit into a location that sets any of its own.

    So a location that adds one header silently drops the rest. This walks the
    locations that actually serve content and asserts the full set is present
    in each, which is the same rule gitops/prod/portfolio-site.yaml keeps.
    """
    text = conf.read_text()
    required = [
        "X-Content-Type-Options nosniff",
        "X-Frame-Options DENY",
        "Referrer-Policy strict-origin-when-cross-origin",
    ]
    # Split the file into its `location` blocks. These configs never nest one
    # inside another, so each block runs from its own header to the next -- and
    # anchoring on a line that *starts* with `location` avoids matching the
    # word where it appears in the surrounding prose, which is frequent here.
    starts = [m.start() for m in re.finditer(r"^[ \t]*location\s", text, re.M)]
    assert starts, f"{conf.relative_to(REPO)} declares no location blocks"
    bounds = list(zip(starts, starts[1:] + [len(text)]))

    # A block that serves content is one that hands back a file: `try_files`
    # (documents) or a `default_type` override (the .mjs modules). That
    # deliberately excludes the ACME challenge (fetched by a CA, not a
    # browser), /healthz (a fixed string), and the TLS config's port-80
    # `location /`, which is a bare redirect.
    checked = 0
    for start, end in bounds:
        body = text[start:end]
        if "try_files" not in body and "default_type application/javascript" not in body:
            continue
        checked += 1
        header_line = body.splitlines()[0].strip()
        for header in required:
            assert header in body, (
                f"{conf.relative_to(REPO)}: `{header_line}` does not send "
                f"{header!r}. add_header does not inherit, so this location "
                f"serves content without it."
            )
    assert checked >= 2, (
        f"{conf.relative_to(REPO)}: expected at least the document and .mjs "
        f"blocks to serve content, found {checked}"
    )


def test_tls_config_sends_hsts_and_http_config_does_not():
    """HSTS over cleartext is meaningless and, on a first visit, harmful.

    The HTTP block is what answers before a certificate exists; a max-age
    committed from there would pin a browser to HTTPS this box cannot yet
    speak.
    """
    assert "Strict-Transport-Security" in TLS_CONF.read_text()
    assert "Strict-Transport-Security" not in HTTP_CONF.read_text()


def test_no_preload_directive_is_ever_sent():
    """`preload` is a submission to a browser-vendor list -- owner territory.

    It is also effectively irreversible on the timescale a mistake matters.
    Checked against the emitted header value rather than the file text: the
    word "HSTS-preloaded" appears throughout these comments, which is the
    subject they are explaining.
    """
    for line in TLS_CONF.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        if "Strict-Transport-Security" in stripped:
            assert "preload" not in stripped, f"preload directive sent: {stripped}"


def test_acme_challenge_survives_the_https_redirect():
    """Renewal must work on a box whose certificate has already expired.

    If the challenge location sat below the catch-all redirect, an expired
    certificate would make renewal unreachable through the very server that
    needs renewing -- a failure that cannot recover itself.
    """
    text = TLS_CONF.read_text()
    challenge = text.find("location ^~ /.well-known/acme-challenge/")
    redirect = text.find("return 301 https://")
    assert challenge != -1 and redirect != -1
    assert challenge < redirect, (
        "the ACME challenge location must precede the HTTPS redirect in the "
        "port-80 server block"
    )


def test_timer_is_persistent_and_reasonably_paced():
    text = TIMER.read_text()
    assert "Persistent=true" in text
    assert "OnUnitActiveSec=" in text


def test_refresh_unit_can_only_write_its_own_trees():
    """A deploy that can rewrite nginx's own config is a deploy that can take

    the site down in a way no rollback of the artifact recovers.
    """
    text = SERVICE.read_text()
    assert "ProtectSystem=strict" in text
    rw = re.search(r"ReadWritePaths=(.+)", text)
    assert rw, "the unit declares no ReadWritePaths under ProtectSystem=strict"
    paths = rw.group(1).split()
    assert set(paths) == {"/opt/portfolio-site", "/var/lib/portfolio-site"}, (
        f"unexpected writable paths {paths}: host mode should only ever write "
        f"its checkout and its releases."
    )


def test_no_secret_is_committed_in_any_host_file():
    """The credential arrives via stdin at install time and lives 0600 on the

    box. Nothing here should ever carry one.
    """
    for path in (INSTALLER, REFRESH, SERVICE, TIMER, HTTP_CONF, TLS_CONF):
        text = path.read_text()
        assert "ghp_" not in text and "github_pat_" not in text, (
            f"{path.relative_to(REPO)} looks like it contains a token"
        )


# ------------------------------------------------------- refresh-site.sh, live
#
# These run the real script against a fake "repository" whose build and check
# steps are stubs, so they exercise the ordering and the failure handling
# without a 25-second site build. What is under test is the swap logic, which
# is the part that can destroy a working site.


def _commit(repo: Path, message: str) -> None:
    """Commit everything and mirror it to the fake origin, so the next refresh

    fetches it exactly as a real one fetches a merge to `main`.
    """
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(repo), "commit", "-qm", message], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "push", "-q", "origin", "HEAD:main"], check=True
    )


def _fake_repo(tmp_path: Path, *, check_exit: int = 0, build_exit: int = 0) -> Path:
    """A git checkout whose build.mjs/check.mjs are stubs with chosen exits.

    It gets a real (bare, local) `origin` so `git fetch origin main` succeeds:
    without one the script correctly takes its uncredentialed "hold" branch,
    and every test below would pass for the wrong reason.
    """
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "init", "-q", "--bare", str(origin)], check=True)

    repo = tmp_path / "repo"
    (repo / "platform" / "pages").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.email", "t@t"], check=True)
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "t"], check=True)
    subprocess.run(
        ["git", "-C", str(repo), "remote", "add", "origin", str(origin)], check=True
    )

    # build.mjs writes a marker file into --out so a successful build is
    # distinguishable from a no-op.
    (repo / "platform" / "pages" / "build.mjs").write_text(
        "import fs from 'node:fs';\n"
        "const out = process.argv.find(a => a.startsWith('--out=')).slice(6);\n"
        "fs.mkdirSync(out, { recursive: true });\n"
        "fs.writeFileSync(out + '/index.html', 'built');\n"
        f"process.exit({build_exit});\n"
    )
    (repo / "platform" / "pages" / "check.mjs").write_text(f"process.exit({check_exit});\n")
    (repo / "README").write_text("x")
    _commit(repo, "init")
    return repo


def _run_refresh(repo: Path, state: Path, **extra_env: str):
    env = {
        **os.environ,
        "SITE_REPO_DIR": str(repo),
        "SITE_STATE_DIR": str(state),
        **extra_env,
    }
    env.pop("GH_TOKEN", None)
    return subprocess.run(
        ["bash", str(REFRESH)], env=env, capture_output=True, text=True
    )


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_first_run_builds_from_the_local_checkout_when_it_cannot_fetch(tmp_path):
    """An uncredentialed box with nothing served must still end up serving.

    Holding here would be the exact failure gitops/agents/host/README.md
    records paying for: an install that reports success onto a box which then
    serves nothing.
    """
    repo = _fake_repo(tmp_path)
    # Take the origin away: this is a box that was rsync'd a checkout and has
    # no credential (or no route) to reach GitHub yet.
    subprocess.run(["git", "-C", str(repo), "remote", "remove", "origin"], check=True)

    state = tmp_path / "state"
    result = _run_refresh(repo, state)
    assert result.returncode == 0, result.stderr
    assert (state / "current" / "index.html").read_text() == "built"
    assert "building from the local checkout" in result.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_a_failing_check_leaves_the_previous_release_serving(tmp_path):
    """The fail-closed property the unattended timer rests on."""
    repo = _fake_repo(tmp_path)
    state = tmp_path / "state"
    assert _run_refresh(repo, state).returncode == 0
    good = (state / "current").resolve()

    # Now make check.mjs reject everything, and change the commit so the
    # "already serving" short-circuit does not hide the real path.
    (repo / "platform" / "pages" / "check.mjs").write_text("process.exit(1);\n")
    _commit(repo, "break")

    result = _run_refresh(repo, state)
    assert result.returncode != 0, "a rejected build must not report success"
    assert (state / "current").resolve() == good, (
        "check.mjs failed but the live symlink moved -- the site would have "
        "been replaced by a build known to be broken"
    )
    assert (state / "current" / "index.html").read_text() == "built"
    # And no half-built staging directory is left behind to be promoted later.
    assert not list((state / "releases").glob(".staging-*"))


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_a_failing_build_leaves_the_previous_release_serving(tmp_path):
    repo = _fake_repo(tmp_path)
    state = tmp_path / "state"
    assert _run_refresh(repo, state).returncode == 0
    good = (state / "current").resolve()

    (repo / "platform" / "pages" / "build.mjs").write_text("process.exit(1);\n")
    _commit(repo, "break")

    result = _run_refresh(repo, state)
    assert result.returncode != 0
    assert (state / "current").resolve() == good
    assert not list((state / "releases").glob(".staging-*"))


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_a_second_run_on_an_unchanged_commit_is_a_no_op(tmp_path):
    """The timer ticks every ten minutes; a tick that finds nothing must not

    rebuild 175 tools, and must not churn the release directory.
    """
    repo = _fake_repo(tmp_path)
    state = tmp_path / "state"
    assert _run_refresh(repo, state).returncode == 0
    first = (state / "current").resolve()

    result = _run_refresh(repo, state)
    assert result.returncode == 0
    assert "nothing to do" in result.stdout
    assert (state / "current").resolve() == first
    assert len(list((state / "releases").glob("2*"))) == 1


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_releases_are_pruned_but_a_rollback_target_is_kept(tmp_path):
    repo = _fake_repo(tmp_path)
    state = tmp_path / "state"
    env_keep = {**os.environ, "SITE_KEEP": "2"}
    env_keep.pop("GH_TOKEN", None)

    seen = []
    for i in range(4):
        (repo / "README").write_text(f"rev {i}")
        _commit(repo, f"r{i}")
        result = subprocess.run(
            ["bash", str(REFRESH)],
            env={**env_keep, "SITE_REPO_DIR": str(repo), "SITE_STATE_DIR": str(state)},
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        seen.append((state / "current").resolve())

    kept = sorted(p.name for p in (state / "releases").glob("2*"))
    assert len(kept) == 2, f"expected SITE_KEEP=2 releases, found {kept}"
    assert seen[-1].name in kept, "the live release was pruned"


def test_pruning_never_deletes_the_release_being_served(tmp_path):
    """The invariant, forced rather than waited for.

    The test above builds four real releases and hopes their timestamps differ.
    They are `<%Y%m%dT%H%M%SZ>-<sha8>` and four `build.mjs` runs can land inside
    one second, at which point the only thing separating two names is the commit
    sha -- which is not chronological. Sorting names then puts the live release
    somewhere arbitrary in the order and the tail is deleted, so `current`
    dangles and nginx answers 404 for every path on the site. It reproduced
    about two runs in five before the fix.

    Waiting for a flake to reappear is not a regression test, so this one builds
    the collision by hand: same timestamp, same mtime, three different shas,
    with `current` pointed at the one a name-sort ranks *last*.
    """
    releases = tmp_path / "state" / "releases"
    releases.mkdir(parents=True)
    current = tmp_path / "state" / "current"

    stamp = "20260906T042340Z"
    names = [f"{stamp}-aaaaaaaa", f"{stamp}-bbbbbbbb", f"{stamp}-cccccccc"]
    for name in names:
        (releases / name).mkdir()
        os.utime(releases / name, (1_757_000_000, 1_757_000_000))
    live = releases / names[0]  # sorts first descending, so `sort -r | tail` drops it
    current.symlink_to(live)

    subprocess.run(
        ["bash", "-c", _PRUNE_ONLY],
        env={**os.environ, "RELEASES": str(releases), "CURRENT": str(current), "KEEP": "2"},
        check=True,
        capture_output=True,
        text=True,
    )

    survivors = sorted(p.name for p in releases.glob("2*"))
    assert len(survivors) == 2, survivors
    assert live.name in survivors, "the live release was pruned"
    assert current.resolve().is_dir(), "current is dangling"


# The prune block lifted out of refresh-site.sh so it can be driven against a
# hand-built directory. Extracted by marker rather than retyped: a copy would
# pass forever after the original changed, which is the failure mode of every
# test that restates its subject.
def _prune_block() -> str:
    src = REFRESH.read_text()
    start = src.index("# Keep a few predecessors")
    end = src.index("# nginx resolves `root` per request")
    return src[start:end]


_PRUNE_ONLY = "set -euo pipefail\nlog() { :; }\n" + _prune_block()


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_releases_are_world_readable_so_nginx_can_serve_them(tmp_path):
    """nginx's workers run unprivileged. A release tree built under a

    restrictive umask produces a clean build, a clean swap, and a 404 on every
    request with `stat() ... (13: Permission denied)` in the error log.
    """
    repo = _fake_repo(tmp_path)
    state = tmp_path / "state"
    env = {
        **os.environ,
        "SITE_REPO_DIR": str(repo),
        "SITE_STATE_DIR": str(state),
    }
    env.pop("GH_TOKEN", None)
    # Deliberately hostile inherited umask, as a hardened unit could carry.
    result = subprocess.run(
        ["bash", "-c", f"umask 077; exec bash {REFRESH}"],
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    page = state / "current" / "index.html"
    assert page.stat().st_mode & stat.S_IROTH, "release files are not world-readable"
    assert (state / "current").resolve().stat().st_mode & stat.S_IXOTH, (
        "the release directory is not world-traversable"
    )


# ------------------------------------------------------ naming the package
#
# `apt-get install node` does not install Node. On Debian and Ubuntu `node` is
# the Amateur Packet Radio Node program; the JavaScript runtime is `nodejs`.
# The installer used to print the *binary* names it had found missing, so on
# the fresh `ubuntu-24.04` both boxes are built from -- which has neither nginx
# nor node -- following its own remediation left the operator with a ham-radio
# daemon installed, still no `node`, and the same refusal on the next run.
#
# `install-codex-host.sh` already guarded this and had a test naming it. This
# one did not, which is the ordinary way a rule that lives in two scripts goes
# stale in one of them.

# `INSTALLER` is already defined at the top of this file; these cases use it.

# Everything the installer shells out to before it reports prerequisites. A
# case that wants to hide `node` from `command -v` cannot just prepend a
# directory, so it builds a PATH holding only these plus what it means to keep.
_INSTALLER_TOOLS = (
    "bash", "sh", "cat", "chmod", "grep", "id",
    "install", "mktemp", "mv", "rm", "sed", "stat",
    # The script resolves its own ROOT with these before anything else; without
    # them it fails at "source tree" and never reaches the prerequisite report,
    # which a case looking only for a substring can mistake for a pass.
    "dirname", "readlink", "pwd",
)


def _path_without(tmp_path, *hidden):
    """A PATH with the installer's own tools and every prerequisite but `hidden`.

    The four prerequisites are *stubbed* rather than symlinked from the host.
    Symlinking would make each case depend on what the machine running the
    tests happens to have installed -- and this image has no nginx, so the one
    case that actually pins the node/nodejs mapping skipped itself here while
    reporting green. A guard that skips on the developer's machine and runs
    only on CI is the shape CLAUDE.md keeps recording the cost of; stubs make
    the case measure the installer instead of the container.
    """
    bindir = tmp_path / "prereq-bin"
    bindir.mkdir(exist_ok=True)
    for tool in _INSTALLER_TOOLS:
        found = shutil.which(tool)
        if found is None:
            return None
        link = bindir / tool
        if not link.exists():
            link.symlink_to(found)
    for tool in ("nginx", "node", "git", "curl"):
        if tool in hidden:
            continue
        stub = bindir / tool
        # node's stub has to answer --version: the installer parses it against
        # a floor of 18, and an unreadable version is itself a refusal.
        stub.write_text(
            "#!/bin/sh\necho v22.0.0\n" if tool == "node" else "#!/bin/sh\nexit 0\n"
        )
        stub.chmod(0o755)
    return str(bindir)


def _check(tmp_path, *hidden):
    path = _path_without(tmp_path, *hidden)
    if path is None:
        pytest.skip("the test host is missing one of the installer's own tools")
    result = subprocess.run(
        ["bash", str(INSTALLER), "--check"],
        env=dict(os.environ, PATH=path),
        capture_output=True,
        text=True,
        timeout=120,
    )
    return result.stdout + result.stderr


def test_a_missing_node_is_remediated_as_the_nodejs_package(tmp_path):
    out = _check(tmp_path, "node")
    assert "missing: node" in out
    assert "nodejs" in out
    # The bug: the apt-get line naming the binary rather than the package.
    assert "--no-install-recommends node\n" not in out


def test_a_package_whose_name_matches_its_binary_is_unchanged(tmp_path):
    """Only `node` differs; `nginx` must not be rewritten into something else."""
    out = _check(tmp_path, "nginx")
    assert "missing: nginx" in out
    assert "nginx" in out.split("apt-get")[-1]


def test_check_is_read_only_even_though_the_install_now_apt_gets(tmp_path):
    """`--check` reports; supplying packages is the install path's job alone."""
    out = _check(tmp_path, "node", "nginx")
    assert "apt-get update && apt-get install" in out
    # The advisory line, not a report of having done it.
    assert "Installing them from the distribution archive" not in out


# --------------------------------------------- refresh-site.sh, IndexNow announce
#
# This box is the only publisher in the repository with real egress to
# api.indexnow.org: an agent sandbox 403s that host, and the Actions route
# needs a runner. Since `pages_state.py`'s `indexing` row measured that
# sitemap auto-discovery has never happened for this catalogue, IndexNow is
# the one enumeration route left -- so the announcement running here is the
# difference between having that route and only owning the code for it.
#
# What these pin is the pair of properties that make it safe to leave in an
# unattended timer: it always reports, and it never fails a deploy that has
# already succeeded.


def _with_indexnow_stub(repo: Path, *, exit_code: int = 0) -> Path:
    """Give the fake repo an indexnow.mjs that records its argv and exits.

    Recording argv is the point: the announcement must name the release that
    was actually swapped in, not some other publisher's branch.
    """
    marketing = repo / "platform" / "marketing"
    marketing.mkdir(parents=True, exist_ok=True)
    log = repo / "indexnow-argv.txt"
    (marketing / "indexnow.mjs").write_text(
        "import fs from 'node:fs';\n"
        f"fs.writeFileSync({str(log)!r}, process.argv.slice(2).join('\\n'));\n"
        f"process.exit({exit_code});\n"
    )
    _commit(repo, "add indexnow stub")
    return log


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_a_successful_swap_announces_the_release_it_actually_serves(tmp_path):
    repo = _fake_repo(tmp_path)
    log = _with_indexnow_stub(repo)
    state = tmp_path / "state"

    result = _run_refresh(repo, state, SITE_BASE_URL="https://marisstella.dev/")
    assert result.returncode == 0, result.stderr

    argv = log.read_text().splitlines()
    assert "--submit" in argv
    assert "--base-url" in argv
    assert argv[argv.index("--base-url") + 1] == "https://marisstella.dev/"

    # The directory announced must be the one the symlink now points at. A
    # payload describing a release that is not being served is worse than no
    # payload: it asks a crawler to fetch pages this box may not have.
    served = (state / "current").resolve()
    assert Path(argv[argv.index("--dir") + 1]).resolve() == served
    assert "IndexNow: submitted." in result.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_no_base_url_configured_still_announces(tmp_path):
    """Without SITE_BASE_URL the script omits the flag and lets indexnow.mjs

    read the origin out of the artifact's own catalog.json, which is the
    fallback `resolveBaseUrl` exists for.
    """
    repo = _fake_repo(tmp_path)
    log = _with_indexnow_stub(repo)

    result = _run_refresh(repo, tmp_path / "state")
    assert result.returncode == 0, result.stderr
    argv = log.read_text().splitlines()
    assert "--base-url" not in argv
    assert "--submit" in argv


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
@pytest.mark.parametrize(
    "exit_code, expected",
    [
        # EXIT_NO_EGRESS. Expected on a proxied box; nothing sent, nothing broken.
        (3, "no egress to api.indexnow.org"),
        # A real rejection -- a bad key, a host mismatch. Loud, still not fatal.
        (1, "submission rejected"),
    ],
)
def test_a_failed_announcement_never_fails_a_deploy_that_succeeded(
    tmp_path, exit_code, expected
):
    """The swap has already happened by the time this runs.

    Failing here would put the systemd unit in a failed state and make a box
    that is serving correct content look broken -- the same reasoning
    publish-branch.sh gives for returning 0 from its own announcement.
    """
    repo = _fake_repo(tmp_path)
    _with_indexnow_stub(repo, exit_code=exit_code)
    state = tmp_path / "state"

    result = _run_refresh(repo, state)
    assert result.returncode == 0, result.stderr
    assert expected in result.stdout
    # And the site is live regardless.
    assert (state / "current" / "index.html").read_text() == "built"
    assert "done." in result.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_site_indexnow_0_skips_the_announcement_but_still_says_so(tmp_path):
    repo = _fake_repo(tmp_path)
    log = _with_indexnow_stub(repo)

    result = _run_refresh(repo, tmp_path / "state", SITE_INDEXNOW="0")
    assert result.returncode == 0, result.stderr
    assert not log.exists(), "SITE_INDEXNOW=0 must not run the announcer"
    assert "IndexNow: skipped (SITE_INDEXNOW=0)" in result.stdout


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_a_checkout_without_the_announcer_holds_rather_than_failing(tmp_path):
    """An older checkout predating indexnow.mjs. Not an error, and not silent.

    A refresh that died here would take the whole site down on a box whose
    only fault is being a few commits behind.
    """
    repo = _fake_repo(tmp_path)  # no platform/marketing at all
    state = tmp_path / "state"

    result = _run_refresh(repo, state)
    assert result.returncode == 0, result.stderr
    assert "no platform/marketing/indexnow.mjs" in result.stdout
    assert (state / "current" / "index.html").read_text() == "built"


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_a_no_op_refresh_does_not_re_announce(tmp_path):
    """Nothing was published, so there is nothing to tell a crawler about.

    The timer ticks every ten minutes; re-announcing an unchanged catalogue
    on every tick would spend the API's goodwill on no new information.
    """
    repo = _fake_repo(tmp_path)
    log = _with_indexnow_stub(repo)
    state = tmp_path / "state"

    _run_refresh(repo, state)
    assert log.exists()
    log.unlink()

    second = _run_refresh(repo, state)
    assert second.returncode == 0, second.stderr
    assert "nothing to do" in second.stdout
    assert not log.exists(), "an unchanged commit must not re-announce"
