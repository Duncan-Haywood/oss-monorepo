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


def _run_refresh(repo: Path, state: Path):
    env = {
        **os.environ,
        "SITE_REPO_DIR": str(repo),
        "SITE_STATE_DIR": str(state),
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
