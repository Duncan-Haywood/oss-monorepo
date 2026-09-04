"""Execute the public site's init-container scripts against stubbed tools.

`gitops/prod/portfolio-site.yaml` builds the whole portfolio inside the pod on
every start, which makes the site's availability depend on GitHub, a 90-day
clone token and a clean `main` *at the moment a pod starts*. The cache volume
is what stops any one of those failing from taking the site to zero, and the
fallback logic that reads it lives in a shell script embedded in YAML — the
kind of code that is normally only ever grepped.

So run it. Nothing here reaches the network or a cluster: `git` and `node`
are stubs, and the absolute paths the containers use are rewritten to a
tmpdir. What is asserted is the behaviour the outage argument rests on:

  * a clean build publishes, and only then caches;
  * a build that fails `check.mjs` is neither published nor cached, and the
    previous cache survives it intact;
  * a pod with no checkout and no build still serves, from cache;
  * a pod with neither a build nor a cache fails, because there is nothing
    to serve;
  * `fetch` never fails the pod on its own, because it cannot see whether a
    cache exists to fall back on.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "prod" / "portfolio-site.yaml"

# The four absolute paths the pod's containers share. Matched only where one
# *starts* a path: a plain substring pass rewrites the `/site` inside
# `/cache/site` as well, producing `<root>/cache<root>/site`. The lookbehind
# is what keeps `/cache/site` and `/build/site` single-rooted, and the
# lookahead keeps `/site` from matching `/sitemap.xml`.
PATH_RE = re.compile(r"(?<![\w./-])(/(?:workspace|build|site|cache))(?![\w-])")


def _docs() -> list[dict]:
    return [d for d in yaml.safe_load_all(MANIFEST.read_text()) if d]


def _kind(kind: str, name: str) -> dict:
    for doc in _docs():
        if doc["kind"] == kind and doc["metadata"]["name"] == name:
            return doc
    raise AssertionError(f"{kind}/{name} is not in {MANIFEST}")


def _deployment() -> dict:
    return _kind("Deployment", "portfolio-site")


def _init_script(name: str) -> str:
    for container in _deployment()["spec"]["template"]["spec"]["initContainers"]:
        if container["name"] == name:
            return container["args"][0]
    raise AssertionError(f"no init container named {name}")


def _localise(script: str, root: Path) -> str:
    """Point the container's absolute paths at a tmpdir."""
    return PATH_RE.sub(lambda m: f"{root}{m.group(1)}", script)


def _run(script: str, root: Path, *, env: dict[str, str] | None = None,
         path_prepend: Path | None = None) -> subprocess.CompletedProcess:
    localised = _localise(script, root)
    full_env = {"PATH": "/usr/bin:/bin", "HOME": str(root / "workspace")}
    if path_prepend is not None:
        full_env["PATH"] = f"{path_prepend}:{full_env['PATH']}"
    full_env.update(env or {})
    return subprocess.run(
        ["sh", "-ec", localised],
        capture_output=True,
        text=True,
        env=full_env,
        cwd=str(root),
    )


def _stub(bin_dir: Path, name: str, body: str) -> None:
    target = bin_dir / name
    target.write_text("#!/bin/sh\n" + body)
    target.chmod(0o755)


@pytest.fixture()
def site(tmp_path: Path):
    """A pod's-eye view: the four directories the init containers share."""
    for part in ("workspace", "build", "site", "cache", "bin"):
        (tmp_path / part).mkdir()
    return tmp_path


def _checkout(root: Path) -> None:
    (root / "workspace" / "repo" / "platform" / "pages").mkdir(parents=True)


def _node_stub(bin_dir: Path, *, build_ok: bool = True, check_ok: bool = True) -> None:
    """Stand in for `node build.mjs --out=DIR` and `node check.mjs --dist=DIR`.

    The real pair takes ~36s over 169 ventures. What this script does with
    their exit codes is the whole subject here, so the stub reproduces the
    contract (write the site, then verify it) and nothing else.
    """
    _stub(
        bin_dir,
        "node",
        f"""
script="$1"
out=""
for arg in "$@"; do
  case "$arg" in
    --out=*) out="${{arg#--out=}}" ;;
    --dist=*) out="${{arg#--dist=}}" ;;
  esac
done
case "$script" in
  *build.mjs)
    [ "{int(build_ok)}" = "1" ] || {{ echo "build.mjs: boom" >&2; exit 1; }}
    mkdir -p "$out"
    echo "<!doctype html>hub" > "$out/index.html"
    echo "ok" > "$out/robots.txt"
    ;;
  *check.mjs)
    [ "{int(check_ok)}" = "1" ] || {{ echo "check.mjs: dead link" >&2; exit 1; }}
    ;;
esac
exit 0
""",
    )


def _seed_cache(root: Path, marker: str = "yesterday") -> None:
    cached = root / "cache" / "site"
    cached.mkdir(parents=True)
    (cached / "index.html").write_text(marker)


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------


def test_clean_build_is_served_and_cached(site: Path) -> None:
    _checkout(site)
    _node_stub(site / "bin")

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert result.returncode == 0, result.stderr
    assert (site / "site" / "index.html").read_text().startswith("<!doctype html>")
    assert "status=fresh" in (site / "site" / "buildinfo.txt").read_text()
    # Cached for the next pod that cannot build.
    assert (site / "cache" / "site" / "index.html").exists()
    # No staging or lock left behind for the next run to trip over.
    assert not (site / "cache" / ".stage").exists()
    assert not (site / "cache" / ".writelock").exists()
    assert not (site / "cache" / ".old").exists()


def test_the_build_never_writes_into_the_served_directory_until_it_passes(site: Path) -> None:
    """A half-written /site is worse than a stale one: nginx would serve it."""
    _checkout(site)
    _node_stub(site / "bin", check_ok=False)
    _seed_cache(site)

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert result.returncode == 0, result.stderr
    # The failed build's own output never reached /site — the cache did.
    assert (site / "site" / "index.html").read_text() == "yesterday"
    assert "status=stale" in (site / "site" / "buildinfo.txt").read_text()


def test_a_failing_check_does_not_overwrite_the_cache(site: Path) -> None:
    """The fallback is only worth having if a bad commit cannot poison it."""
    _checkout(site)
    _node_stub(site / "bin", check_ok=False)
    _seed_cache(site)

    _run(_init_script("build"), site,
         path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert (site / "cache" / "site" / "index.html").read_text() == "yesterday"


def test_a_failing_build_does_not_overwrite_the_cache(site: Path) -> None:
    _checkout(site)
    _node_stub(site / "bin", build_ok=False)
    _seed_cache(site)

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert result.returncode == 0, result.stderr
    assert (site / "cache" / "site" / "index.html").read_text() == "yesterday"


def test_no_checkout_falls_back_to_the_cache(site: Path) -> None:
    """The expired-token case: `fetch` cloned nothing, so there is no repo."""
    _node_stub(site / "bin")
    _seed_cache(site)

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert result.returncode == 0, result.stderr
    assert (site / "site" / "index.html").read_text() == "yesterday"
    assert "SERVING THE CACHED SITE" in result.stderr


def test_no_checkout_and_no_cache_fails_the_pod(site: Path) -> None:
    """A first-ever start that cannot clone has nothing to serve, and says so."""
    _node_stub(site / "bin")

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert result.returncode != 0
    assert "nothing to serve" in result.stderr


def test_the_write_lock_serialises_the_two_replicas(site: Path) -> None:
    """A held lock makes the loser skip publishing, not fail or corrupt."""
    _checkout(site)
    _node_stub(site / "bin")
    _seed_cache(site)
    (site / "cache" / ".writelock").mkdir()

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-bbb"})

    assert result.returncode == 0, result.stderr
    # Still served its own fresh build...
    assert (site / "site" / "index.html").read_text().startswith("<!doctype html>")
    assert "status=fresh" in (site / "site" / "buildinfo.txt").read_text()
    # ...and left the cache to whoever holds the lock.
    assert (site / "cache" / "site" / "index.html").read_text() == "yesterday"
    assert "sibling replica" in result.stdout


# --------------------------------------------------------------------------
# fetch
# --------------------------------------------------------------------------


def _git_stub(bin_dir: Path, *, clone_ok: bool) -> None:
    _stub(
        bin_dir,
        "git",
        f"""
case "$1" in
  clone)
    [ "{int(clone_ok)}" = "1" ] || {{ echo "fatal: Authentication failed" >&2; exit 128; }}
    # The real clone creates the target directory; the fallback logic keys
    # on its presence, so the stub has to as well.
    dest=""
    for arg in "$@"; do dest="$arg"; done
    mkdir -p "$dest"
    ;;
  config) ;;
  -C) echo "abc1234" ;;
esac
exit 0
""",
    )


def test_fetch_survives_an_empty_token(site: Path) -> None:
    """It cannot see the cache, so it must not be the thing that fails the pod."""
    _git_stub(site / "bin", clone_ok=True)

    result = _run(_init_script("fetch"), site,
                  path_prepend=site / "bin", env={"GH_TOKEN": ""})

    assert result.returncode == 0, result.stderr
    assert not (site / "workspace" / "repo").exists()
    assert "GH_TOKEN empty" in result.stderr


def test_fetch_survives_a_rejected_credential(site: Path) -> None:
    """The 90-day PAT expiring is the expected way into this branch."""
    _git_stub(site / "bin", clone_ok=False)

    result = _run(_init_script("fetch"), site,
                  path_prepend=site / "bin", env={"GH_TOKEN": "expired"})

    assert result.returncode == 0, result.stderr
    # A partial clone would look like a usable worktree to `build`.
    assert not (site / "workspace" / "repo").exists()
    assert "clone failed" in result.stderr


def test_fetch_removes_the_credential_file_on_both_paths(site: Path) -> None:
    for clone_ok in (True, False):
        for part in ("workspace",):
            target = site / part
            for child in target.iterdir():
                subprocess.run(["rm", "-rf", str(child)], check=True)
        _git_stub(site / "bin", clone_ok=clone_ok)
        _run(_init_script("fetch"), site,
             path_prepend=site / "bin", env={"GH_TOKEN": "tok"})
        assert not (site / "workspace" / ".git-credentials").exists(), clone_ok


# --------------------------------------------------------------------------
# manifest shape
# --------------------------------------------------------------------------


def test_the_cache_claim_exists_and_the_build_mounts_it() -> None:
    claim = _kind("PersistentVolumeClaim", "portfolio-site-cache")
    assert claim["spec"]["accessModes"] == ["ReadWriteOnce"]

    spec = _deployment()["spec"]["template"]["spec"]
    volume = next(v for v in spec["volumes"] if v["name"] == "cache")
    assert volume["persistentVolumeClaim"]["claimName"] == "portfolio-site-cache"

    build = next(c for c in spec["initContainers"] if c["name"] == "build")
    assert {"cache", "build-out", "site"} <= {m["name"] for m in build["volumeMounts"]}

    # RWO is only safe because both replicas are pinned to the same node.
    assert spec["nodeSelector"] == {"hcloud/node-role": "control-plane"}


def test_nginx_serves_buildinfo_uncached() -> None:
    conf = _kind("ConfigMap", "portfolio-site-nginx")["data"]["default.conf"]
    assert "location = /buildinfo.txt" in conf
    # A cached copy would let a stale deploy report itself fresh for the whole
    # window the refresh alarm runs in.
    assert 'add_header Cache-Control "no-store" always;' in conf


def _nginx_conf() -> str:
    return _kind("ConfigMap", "portfolio-site-nginx")["data"]["default.conf"]


def _location_block(conf: str, needle: str) -> str:
    start = conf.index(needle)
    depth = 0
    for i, ch in enumerate(conf[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return conf[start:i + 1]
    raise AssertionError(f"unterminated block at {needle!r}")


def test_the_embed_query_param_gets_a_permissive_frame_policy() -> None:
    """`platform/pages/embed.mjs` (PR #2561) ships an `<iframe>` snippet whose
    `src` always appends `?pfEmbed=1`; without this, `X-Frame-Options: DENY`
    -- sent on every page, including that one -- makes every browser refuse
    to render it regardless of what the page's own HTML or JS says. Neither
    `check.mjs` nor `build.test.mjs` could have caught this: the defect is a
    response header, not anything a built page carries in its own markup.

    `add_header` cannot itself branch on a query string, so the conditional
    lives in two `map`s read by `location /`.
    """
    conf = _nginx_conf()

    frame_options_map = _location_block(conf, "map $arg_pfEmbed $portfolio_frame_options")
    assert "default DENY;" in frame_options_map
    assert re.search(r'\b1\s+"";', frame_options_map), frame_options_map

    ancestors_map = _location_block(conf, "map $arg_pfEmbed $portfolio_frame_ancestors")
    assert re.search(r'default\s+"";', ancestors_map), ancestors_map
    assert re.search(r'\b1\s+"frame-ancestors \*;";', ancestors_map), ancestors_map

    root_location = _location_block(conf, "\n  location / {")
    assert "add_header X-Frame-Options $portfolio_frame_options always;" in root_location
    assert "add_header Content-Security-Policy $portfolio_frame_ancestors always;" in root_location
    # The literal DENY must be gone from this one location -- a hardcoded
    # value alongside the mapped one would win or lose depending on nginx's
    # own tie-break, not on the query string a visitor's browser sent.
    assert "X-Frame-Options DENY" not in root_location


def test_every_other_location_still_denies_framing_unconditionally() -> None:
    """The embed exception above must stay scoped to `location /` alone."""
    conf = _nginx_conf()
    root_location = _location_block(conf, "\n  location / {")
    without_root = conf.replace(root_location, "")
    # Every other location that sets its own headers, plus the server-level
    # default, still hardcodes DENY -- unaffected by the map, and a floor
    # rather than a target so a stricter location added later cannot make
    # this start failing.
    assert without_root.count("add_header X-Frame-Options DENY always;") >= 7


def test_the_refresh_job_waits_for_the_rollout_it_triggers() -> None:
    job = _kind("CronJob", "portfolio-site-refresh")
    container = job["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    script = container["args"][0]

    assert "kubectl rollout restart deployment/portfolio-site" in script
    # `maxUnavailable: 0` means a rollout into un-startable pods disturbs
    # nothing, so firing and forgetting reports success on an outage-in-waiting.
    assert "observedGeneration" in script
    assert "availableReplicas" in script
    assert "did NOT complete" in script
    # And a rollout that completes onto the cache is still not a publish.
    assert "buildinfo.txt" in script
    assert "status=stale" in script


def test_the_refresh_role_stays_narrow() -> None:
    """`rollout status` would need watch, which resourceNames cannot restrict.

    The polling loop exists so this Role does not have to widen from "one
    named Deployment" to "every Deployment in prod".
    """
    rules = _kind("Role", "portfolio-site-refresh")["rules"]
    assert len(rules) == 1
    assert rules[0]["resourceNames"] == ["portfolio-site"]
    assert sorted(rules[0]["verbs"]) == ["get", "patch"]


def test_the_rollout_still_cannot_take_the_site_to_zero() -> None:
    strategy = _deployment()["spec"]["strategy"]["rollingUpdate"]
    assert strategy["maxUnavailable"] == 0


def test_a_broken_cache_volume_does_not_stop_the_site_serving(site: Path) -> None:
    """The fallback is a safety net, not a dependency.

    A full or unwritable cache volume must cost the *next* pod its fallback,
    never this pod its site — it has already built one. Simulated by failing
    every `cp` into /cache rather than by permissions, because the test runs
    as a user that permissions do not stop.
    """
    _checkout(site)
    _node_stub(site / "bin")
    _stub(
        site / "bin",
        "cp",
        f"""
for arg in "$@"; do
  case "$arg" in
    {site}/cache/*) echo "cp: no space left on device" >&2; exit 1 ;;
  esac
done
exec /bin/cp "$@"
""",
    )

    result = _run(_init_script("build"), site,
                  path_prepend=site / "bin", env={"POD_NAME": "portfolio-site-aaa"})

    assert result.returncode == 0, result.stderr
    assert (site / "site" / "index.html").read_text().startswith("<!doctype html>")
    assert "status=fresh" in (site / "site" / "buildinfo.txt").read_text()
    assert "could NOT write the cache" in result.stderr
    # The lock is released either way, so a later pod can still try.
    assert not (site / "cache" / ".writelock").exists()
    # And no half-written staging directory is left to be mistaken for a cache.
    assert not (site / "cache" / "site").exists()
