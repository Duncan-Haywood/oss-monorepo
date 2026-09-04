"""Serve the front door's own ConfigMaps with a real nginx and fetch from it.

## Why this exists

Every other check on the apex reads the config as *text*. They can tell you the
`location` blocks mention `gzip_static`, that the mirror's keys look like
`<slug>__<file>.gz`, and that the shards are inside etcd's object cap. None of
them can tell you whether a request for `/tools/roofing-bid-calculator/`
actually returns the page, because none of them runs nginx.

That gap has a shape, and the gzip-only mirror walked straight into it twice:

- `try_files /$1__$2 =404` stats the *uncompressed* name. In a mirror that
  stores only `.gz` it 404s before `gzip_static` ever runs — the whole mirror
  dark, behind a config every text-level check passes.
- `rewrite ^ /$1__index.html break` looks right and resolves `$1` to the empty
  string, because a `rewrite` replacement's captures come from the rewrite's
  own regex, not from the enclosing `location`. Every tool asks for
  `__index.html` and 404s. Again, textually fine.

Both are silent, both take the entire product surface down rather than
degrading it, and `maxUnavailable: 0` means the symptom in production is a
*stale* front door rather than a loud one. So the only check worth having is
the one that asks nginx.

## What it serves

The built ConfigMaps, not the source tree. `_front_door_configmaps` rebuilds
them from the kustomizations the same way `test_manifests.py` does — including
the base64 round-trip through `binaryData` that gzip output takes — and lays
them out exactly as `portfolio-front.yaml` mounts them: `html` at
`/usr/share/nginx/html`, the merged tool shards at `/usr/share/nginx/tools`,
and the nginx ConfigMap's own `default.conf`. What is under test is therefore
the artifact Argo would apply, not the files a generator happened to write.

## When it skips

nginx is not a dependency of this repository and the self-hosted runner image
has no apt, so this skips with a reason when the binary is missing or was built
without `--with-http_gzip_static_module` / `--with-http_gunzip_module`. A skip
is visible in `pytest -v`, which is what the workflow runs. It is not a pass:
if this is skipping everywhere it is buying nothing, and the fix is to install
nginx on the runner rather than to delete the test.
"""

from __future__ import annotations

import base64
import functools
import gzip
import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]

# The image `gitops/prod/portfolio-front.yaml` runs. Both modules are compiled
# into it; a local nginx that lacks either cannot answer the question this file
# asks, so it skips rather than reporting a failure that is about the runner.
REQUIRED_MODULES = ("--with-http_gzip_static_module", "--with-http_gunzip_module")


def _nginx() -> str:
    for candidate in ("nginx", "/usr/sbin/nginx"):
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    pytest.skip("nginx is not installed, so the front door cannot be served here")


def _require_modules(binary: str) -> None:
    banner = subprocess.run([binary, "-V"], capture_output=True, text=True).stderr
    missing = [m for m in REQUIRED_MODULES if m not in banner]
    if missing:
        pytest.skip(f"this nginx was built without {', '.join(missing)}")


# Cached because it reads every one of the mirror's ~1,200 files and several
# tests below ask for it. Uncached this file spent minutes re-reading the same
# 5 MB, which is the kind of cost that gets a useful test deleted.
@functools.lru_cache(maxsize=1)
def _front_door_configmaps() -> dict[str, dict[str, bytes]]:
    """The front door's generated ConfigMaps, as {name: {key: decoded bytes}}.

    Deliberately goes through base64 for anything that is not valid UTF-8, so
    the bytes served here are the bytes that survive a `binaryData` round trip
    rather than the bytes on disk. That is where a gzip mirror could differ,
    and it is the only place it could differ silently.
    """
    built: dict[str, dict[str, bytes]] = {}
    for kustomization in sorted(ROOT.rglob("kustomization.yaml")):
        parsed = yaml.safe_load(kustomization.read_text()) or {}
        for entry in parsed.get("configMapGenerator", []):
            if not entry["name"].startswith("portfolio-front"):
                continue
            keys: dict[str, bytes] = {}
            for spec in entry.get("files", []):
                key, _, rel = spec.partition("=")
                raw = (kustomization.parent / (rel or key)).read_bytes()
                try:
                    keys[key] = raw.decode().encode()
                except UnicodeDecodeError:
                    keys[key] = base64.b64decode(base64.b64encode(raw))
            built[entry["name"]] = keys
    return built


@functools.lru_cache(maxsize=1)
def _mirror() -> dict[str, bytes]:
    """Every mirror key merged the way the projected volume merges the shards."""
    return {
        key: value
        for name, keys in _front_door_configmaps().items()
        if "tools" in name
        for key, value in keys.items()
    }


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def front_door(tmp_path_factory) -> str:
    """A running nginx serving the built front door. Yields its base URL."""
    binary = _nginx()
    _require_modules(binary)

    maps = _front_door_configmaps()
    tools = _mirror()
    assert tools, "no mirror shards were built, so there would be nothing to serve"
    # A duplicate key across two shards makes the real projected volume fail to
    # mount; here it would silently overwrite, so the merge is checked.
    shard_keys = [k for name, keys in maps.items() if "tools" in name for k in keys]
    assert len(shard_keys) == len(tools), "two shards offer the same key"

    # Only the sampled keys are written to disk, not all ~1,200. What is under
    # test is the *routing*, and the routes name no venture — one file of each
    # shape exercises every `location` block there is. Materialising the whole
    # mirror cost minutes of wall clock for no additional coverage, and a
    # serving check that slow is one a future session deletes rather than runs.
    # `front-door-tools.test.mjs` is what proves every key is present and
    # inflates correctly; the merged view is still checked in memory above.
    served = {key: tools[key] for _, _, key in _sample_paths()}
    # An aliased name has no stored bytes of its own — `dedupeMirror` keeps one
    # copy and `00-mirror-alias.conf` points the other names at it — so serving
    # it exercises a route the sampled keys above cannot: the `map` lookup. The
    # canonical key is what has to be on disk for it to resolve.
    alias_sample = _alias_sample()
    if alias_sample:
        _, canonical_key = alias_sample
        served[canonical_key] = tools[canonical_key]
    root = tmp_path_factory.mktemp("front-door")
    for sub, keys in (
        ("html", maps["portfolio-front-html"]),
        ("tools", served),
        ("conf", maps["portfolio-front-nginx"]),
    ):
        (root / sub).mkdir()
        for key, value in keys.items():
            (root / sub / key).write_bytes(value)

    port = _free_port()
    conf = (root / "conf" / "default.conf").read_text()
    # The pod's roots, repointed at the fixture. Everything else in the block —
    # the rewrites, `gzip_static`, the headers, the type maps — is served
    # exactly as the ConfigMap carries it.
    conf = conf.replace("root /usr/share/nginx/html;", f"root {root}/html;")
    conf = conf.replace("root /usr/share/nginx/tools;", f"root {root}/tools;")
    conf = conf.replace("listen 8080;", f"listen {port};")
    (root / "conf" / "default.conf").write_text(conf)

    (root / "logs").mkdir()
    (root / "tmp").mkdir()
    (root / "nginx.conf").write_text(
        # `user root` only because pytest's tmp dir is not world-readable and
        # the worker would otherwise 403 on every file; irrelevant to the pod,
        # which runs unprivileged against a world-readable ConfigMap mount.
        f"""user root;
worker_processes 1;
error_log {root}/logs/error.log warn;
pid {root}/nginx.pid;
events {{ worker_connections 64; }}
http {{
  include {_mime_types()};
  default_type application/octet-stream;
  access_log off;
  client_body_temp_path {root}/tmp;
  proxy_temp_path {root}/tmp;
  fastcgi_temp_path {root}/tmp;
  uwsgi_temp_path {root}/tmp;
  scgi_temp_path {root}/tmp;
  include {root}/conf/*.conf;
}}
"""
    )

    check = subprocess.run([binary, "-t", "-c", str(root / "nginx.conf")], capture_output=True, text=True)
    assert check.returncode == 0, f"the front door's own nginx config is invalid:\n{check.stderr}"
    # `DEVNULL` rather than `capture_output`: nginx daemonises, and the master
    # it leaves behind inherits the pipe — so `run` waits on an EOF that never
    # comes and the test hangs rather than failing.
    subprocess.run(
        [binary, "-c", str(root / "nginx.conf")],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"{base}/healthz", timeout=1).read()
                break
            except (urllib.error.URLError, ConnectionError):
                time.sleep(0.1)
        else:
            pytest.fail(f"nginx never answered:\n{(root / 'logs' / 'error.log').read_text()}")
        yield base
    finally:
        subprocess.run(
            [binary, "-c", str(root / "nginx.conf"), "-s", "quit"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def _mime_types() -> str:
    for path in ("/etc/nginx/mime.types", "/usr/local/nginx/conf/mime.types"):
        if Path(path).exists():
            return path
    pytest.skip("no nginx mime.types on this host")


def _get(url: str, *, gzip_ok: bool):
    request = urllib.request.Request(
        url, headers={"Accept-Encoding": "gzip" if gzip_ok else "identity"}
    )
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as err:
        return err.code, err.headers, b""
    body = response.read()
    if response.headers.get("Content-Encoding") == "gzip":
        body = gzip.decompress(body)
    return response.status, response.headers, body


@functools.lru_cache(maxsize=1)
def _sample_paths() -> tuple[tuple[str, str, str], ...]:
    """(url path, expected content type, mirror key) for one file of each shape.

    A sample rather than the whole mirror: this suite runs on every push and
    1,200 requests would dominate it, while the shapes are what the routing
    distinguishes. `front-door-tools.test.mjs` checks every key's *encoding*;
    this checks that each *kind* of key is reachable.
    """
    tools = set(_mirror())
    picks: list[tuple[str, str, str]] = []
    for suffix, content_type in (
        ("__index.html.gz", "text/html"),
        ("__calc.mjs.gz", "text/javascript"),
        ("__LICENSE.gz", "text/plain"),
    ):
        key = next((k for k in sorted(tools) if k.endswith(suffix)), None)
        assert key, f"the mirror has no {suffix} to sample"
        slug, _, tail = key[: -len(".gz")].partition("__")
        picks.append((f"/tools/{slug}/{'' if tail == 'index.html' else tail}", content_type, key))
    return tuple(picks)


@functools.lru_cache(maxsize=1)
def _alias_sample() -> tuple[str, str] | None:
    """(url path, canonical mirror key) for one aliased file, or None if there are none.

    Ventures ship their own copies of the shared helpers, so the flattened
    mirror held `proposal.mjs` 104 times and `LICENSE` 161 times identically.
    `dedupeMirror` stores one copy of each and `00-mirror-alias.conf` maps the
    other names onto it, which is 18.5% of the mirror recovered from git, etcd
    and both replicas' tmpfs.

    That saving is only correct if the aliased URL still serves the same bytes,
    and nothing else in this suite would notice if the map went missing: every
    key `_sample_paths` picks is a *stored* one, which resolves to itself
    through the map's identity default whether the map is loaded or not. So the
    one route the alias mechanism actually adds is the one route that had no
    test. This supplies it.

    Returns None rather than failing when the mirror happens to hold no
    duplicates at all — that is a legitimate state (it is what a catalogue of
    entirely distinct files looks like), not a regression.
    """
    conf = _front_door_configmaps()["portfolio-front-nginx"].get(b"00-mirror-alias.conf")
    if conf is None:
        conf = _front_door_configmaps()["portfolio-front-nginx"].get("00-mirror-alias.conf")
    assert conf is not None, (
        "the nginx ConfigMap carries no 00-mirror-alias.conf. `front-door/default.conf` "
        "rewrites six asset locations to `$fd_stored`, which only this file defines, so "
        "without it nginx refuses to start with `unknown \"fd_stored\" variable`."
    )
    text = conf.decode() if isinstance(conf, bytes) else conf
    stored = set(_mirror())
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith('"'):
            continue
        parts = [p for p in line.rstrip(";").split('"') if p.strip()]
        if len(parts) != 2:
            continue
        alias, canonical = parts[0], parts[1]
        if f"{canonical}.gz" not in stored:
            continue
        slug, _, tail = alias.partition("__")
        # Only the two-segment shape, so the URL is `/tools/<slug>/<file>`; a
        # subdirectory alias would need the third segment split out and adds no
        # coverage of the map itself.
        if "__" in tail:
            continue
        return f"/tools/{slug}/{tail}", f"{canonical}.gz"
    return None


def test_an_aliased_file_serves_the_bytes_of_its_stored_copy(front_door: str) -> None:
    sample = _alias_sample()
    if sample is None:
        return
    url_path, canonical_key = sample
    status, _, body = _get(front_door + url_path, gzip_ok=True)
    assert status == 200, (
        f"{url_path} returned {status}. It is an aliased name with no stored bytes of its "
        "own, so it resolves only through the `map` in 00-mirror-alias.conf — a 404 here "
        "means the map is missing, misordered in conf.d, or names a key the mirror dropped."
    )
    assert body == gzip.decompress(_mirror()[canonical_key]), (
        f"{url_path} served something other than the copy it aliases ({canonical_key}). "
        "Deduplication is only sound while every aliased name serves byte-identical content."
    )


def test_every_shape_of_mirrored_path_is_served(front_door: str) -> None:
    for url_path, content_type, key in _sample_paths():
        status, headers, body = _get(front_door + url_path, gzip_ok=True)
        assert status == 200, f"{url_path} returned {status} — the mirror is not reachable"
        assert headers.get("Content-Type", "").startswith(content_type), (
            f"{url_path} was served as {headers.get('Content-Type')}. A `.mjs` module with the "
            "wrong type is refused by the browser and the calculator is an inert form that "
            "still returns 200."
        )
        assert body == gzip.decompress(_mirror()[key]), f"{url_path} did not serve the page it mirrors"


def test_a_client_that_cannot_accept_gzip_still_gets_the_page(front_door: str) -> None:
    # `gunzip on` is what makes a gz-only mirror safe for a client that did not
    # send `Accept-Encoding: gzip` — a scripted fetch, a feed reader, an old
    # proxy. Without it the response is gzip bytes with no encoding header:
    # a 200 that renders as garbage, which is worse than a 404.
    for url_path, _, key in _sample_paths():
        status, headers, body = _get(front_door + url_path, gzip_ok=False)
        assert status == 200, url_path
        assert headers.get("Content-Encoding") is None, (
            f"{url_path} was sent gzipped to a client that asked for identity"
        )
        assert body == gzip.decompress(_mirror()[key]), f"{url_path} did not inflate to the page it mirrors"


def test_a_gzip_client_gets_the_stored_bytes_rather_than_a_re_compression(front_door: str) -> None:
    # The point of storing compressed is that nginx sends the stored copy
    # instead of compressing per request. If `gzip_static` stopped matching,
    # `gunzip on` plus the `gzip` module would still produce a correct-looking
    # gzip response — the mirror would work and quietly cost CPU on every hit.
    url_path, _, _ = _sample_paths()[0]
    request = urllib.request.Request(front_door + url_path, headers={"Accept-Encoding": "gzip"})
    response = urllib.request.urlopen(request, timeout=10)
    assert response.headers.get("Content-Encoding") == "gzip", (
        "the stored .gz was not served; gzip_static is no longer matching these paths"
    )


def _tools_host_serves() -> bool:
    """`TOOLS_HOST_SERVES` from the mirror generator, which owns the premise.

    Read from the source rather than restated here so this suite cannot drift
    from the markup: the header and the meta tag disagreeing is precisely the
    failure being guarded against, and it fails silently in the direction that
    costs traffic, because a header beats the markup.
    """
    source = (ROOT.parent / "platform" / "marketing" / "front-door-tools.mjs").read_text()
    match = re.search(r"^export const TOOLS_HOST_SERVES = (true|false);", source, re.M)
    assert match, "TOOLS_HOST_SERVES is no longer declared where this test reads it"
    return match.group(1) == "true"


def test_the_security_headers_survive_every_mirrored_location(front_door: str) -> None:
    # `add_header` does not merge across levels: a location that sets any
    # header drops the server block's defaults instead of inheriting them, so
    # each block has to repeat them and each block can silently lose one.
    sealed = _tools_host_serves()
    for url_path, content_type, _ in _sample_paths():
        _, headers, _ = _get(front_door + url_path, gzip_ok=True)
        # A page is `noindex` only while the tools host serves and is therefore
        # the canonical. `.mjs` and `LICENSE` are source files rather than
        # search results, so they stay `noindex` either way — nobody searches
        # for a raw module, and one in an index is noise.
        is_page = content_type == "text/html"
        want = "noindex" if (sealed or not is_page) else None
        assert headers.get("X-Robots-Tag") == want, (
            f"{url_path} sends X-Robots-Tag={headers.get('X-Robots-Tag')!r}, expected {want!r}. "
            "A header disagreeing with the page's own robots meta wins silently: it would "
            "either drop the catalogue out of the index or expose it against the seal."
        )
        assert headers.get("X-Content-Type-Options") == "nosniff", url_path
        assert headers.get("X-Frame-Options") == "DENY", url_path
        assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin", url_path


def test_the_front_page_and_its_well_known_documents_are_served(front_door: str) -> None:
    # The mirror's rewrites sit above the catch-all, so a change to them can
    # shadow the apex's own paths. These are the ones whose failure is silent:
    # a crawler handed HTML where markdown or XML was promised reports nothing.
    for url_path, content_type in (
        ("/", "text/html"),
        ("/robots.txt", "text/plain"),
        ("/sitemap.xml", "application/xml"),
        ("/feed.xml", "application/atom+xml"),
        ("/llms.txt", "text/plain"),
        # The loudest of the set to get wrong and the quietest to notice. If
        # the catch-all shadows this one, a client asking for JSON gets ~50 KB
        # of HTML under a 200 and throws at `JSON.parse` — with no status code
        # to report and nothing in any log here saying the catalogue was
        # dropped. The `Content-Type` assertion below is what actually
        # distinguishes that case from success.
        ("/catalog.json", "application/json"),
    ):
        status, headers, body = _get(front_door + url_path, gzip_ok=True)
        assert status == 200, f"{url_path} returned {status}"
        assert headers.get("Content-Type", "").startswith(content_type), (
            f"{url_path} was served as {headers.get('Content-Type')}, not {content_type}"
        )
        assert body, f"{url_path} was empty"

    # And the bytes really parse. Serving the right content type over a
    # truncated or HTML body would satisfy every assertion above.
    _, _, catalog_body = _get(front_door + "/catalog.json", gzip_ok=True)
    catalog = json.loads(catalog_body)
    assert catalog["tools"], "/catalog.json served no tools"
    assert catalog["served_here"] == len(catalog["tools"])


def test_every_category_page_is_served_at_the_url_it_claims(front_door: str) -> None:
    # The category pages are the one part of the apex whose URL and whose
    # storage key are different strings: a ConfigMap key cannot contain `/`,
    # so `/c/trades/` is stored as `c__trades.html` and an nginx rewrite puts
    # the shape back. That is the same class of mapping the module docstring
    # above records going wrong twice on the tool mirror, both times silently,
    # so it gets the same treatment — ask nginx, do not read the config.
    #
    # Driven off the sitemap rather than a hard-coded list of seven, because
    # the sitemap is what actually asks crawlers to fetch these URLs. Anything
    # advertised there and not served is a 404 in Search Console.
    _, _, sitemap = _get(front_door + "/sitemap.xml", gzip_ok=True)
    paths = sorted(
        set(
            re.findall(
                r"<loc>https://marisstella\.dev(/c/[a-z0-9-]+/)</loc>",
                sitemap.decode("utf-8"),
            )
        )
    )
    assert paths, "the sitemap advertised no category pages"

    for url_path in paths:
        status, headers, body = _get(front_door + url_path, gzip_ok=True)
        assert status == 200, f"{url_path} is in the sitemap but returned {status}"
        assert headers.get("Content-Type", "").startswith("text/html"), (
            f"{url_path} was served as {headers.get('Content-Type')}"
        )
        # Not the front page. The catch-all answers every unmatched path with
        # `index.html`, so a broken rewrite here returns 200 and looks fine to
        # every check that only reads the status — while seven URLs quietly
        # become duplicates of the home page, which is worse for ranking than
        # not having them at all.
        canonical = f'<link rel="canonical" href="https://marisstella.dev{url_path}">'
        assert canonical.encode("utf-8") in body, (
            f"{url_path} did not serve its own page — the catch-all probably shadowed it"
        )
        # Trailing slash is what the sitemap advertises; without one is what a
        # person types. Both have to work, and the location's `/?$` is what
        # makes that true.
        status_bare, _, _ = _get(front_door + url_path.rstrip("/"), gzip_ok=True)
        assert status_bare == 200, f"{url_path.rstrip('/')} returned {status_bare}"


def test_an_unknown_category_is_a_404_rather_than_the_front_page(front_door: str) -> None:
    # Same reasoning as the `/tools/` case below, for the same reason: a 200
    # carrying the front door tells a crawler this domain has another page of
    # identical HTML. `try_files ... =404` rather than a fallthrough is what
    # makes this hold.
    for url_path in ("/c/no-such-category/", "/c/no-such-category"):
        status, _, _ = _get(front_door + url_path, gzip_ok=True)
        assert status == 404, f"{url_path} returned {status} rather than 404"


def test_a_path_the_mirror_does_not_hold_is_a_404_rather_than_the_front_page(front_door: str) -> None:
    # Under `/tools/` a 200 carrying the front door would tell a browser the
    # tool exists and tell a crawler this domain has 173 pages of identical
    # HTML. These blocks answer with nginx's own error page rather than the
    # front page's body; the catch-all below serves the body instead, but both
    # agree on the status, which is the part a crawler reads.
    for url_path in ("/tools/no-such-venture/", "/tools/no-such-venture/calc.mjs"):
        status, _, _ = _get(front_door + url_path, gzip_ok=True)
        assert status == 404, f"{url_path} returned {status} rather than 404"


class _KeepRedirect(urllib.request.HTTPRedirectHandler):
    """Stops urllib following a 3xx, so a redirect can be asserted on."""

    def redirect_request(self, *args, **kwargs):  # noqa: D102
        return None


def _no_redirect(url: str):
    """(status, Location) without following the redirect, which `_get` would."""
    opener = urllib.request.build_opener(_KeepRedirect)
    try:
        response = opener.open(url, timeout=10)
        return response.status, response.headers.get("Location")
    except urllib.error.HTTPError as err:
        err.read()
        return err.code, err.headers.get("Location")


def _get_with_error_body(url: str):
    """Like `_get`, but keeps the body of a non-2xx response.

    `_get` returns `b""` for an error because every caller before this one only
    cared about the status. The catch-all's whole point is the body it serves
    *with* a 404, so that case needs the bytes.
    """
    request = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
    try:
        response = urllib.request.urlopen(request, timeout=10)
        return response.status, response.headers, response.read()
    except urllib.error.HTTPError as err:
        return err.code, err.headers, err.read()


def test_an_unknown_path_serves_the_front_page_body_but_with_a_404(front_door: str) -> None:
    # The two halves of this are separate decisions and only one of them was
    # ever right.
    #
    # Serving the front page for a mistyped URL is deliberate — it is the one
    # page here with a search box, so it beats a bare error — and it stays.
    # Serving it with a `200` was a soft 404: this portfolio's only growth
    # channel is organic search and AI answers, and a 200 tells a crawler that
    # every typo, dead inbound link and `/wp-login.php` probe is a real page
    # duplicating the front page, spending the crawl budget for 638 real URLs
    # on an unbounded set of fake ones. It also left nothing downstream able to
    # tell a live URL from a dead one.
    front_page = _get_with_error_body(front_door + "/")[2]
    for url_path in ("/some-typo", "/pricing/", "/wp-login.php", "/a/b/c"):
        status, headers, body = _get_with_error_body(front_door + url_path)
        assert status == 404, f"{url_path} returned {status} rather than 404"
        assert body == front_page, f"{url_path} did not carry the front page's body"
        # A cache holding "not found" for five minutes outlives the typo that
        # produced it, so this one page opts out of the site-wide 300s.
        assert "no-store" in (headers.get("Cache-Control") or ""), url_path


def test_the_front_page_itself_is_still_a_200(front_door: str) -> None:
    # The exact-match block exists so the catch-all above can return 404
    # without taking the front page down with it. This is the test that would
    # have caught that.
    status, headers, _ = _get(front_door + "/", gzip_ok=True)
    assert status == 200
    assert "max-age=300" in (headers.get("Cache-Control") or "")


def test_the_truncatable_parents_redirect_to_the_front_page(front_door: str) -> None:
    # `/tools/` and `/c/` are what a reader gets by deleting the last segment
    # of `/tools/<slug>/` or `/c/<id>/` in the address bar — not typos. The
    # front page is the index of both, so a redirect is the honest answer; a
    # 404 would be correct and useless, and a 200 would put a second copy of
    # the front page at an address its own canonical tag does not name.
    # `/index.html` is here for that last reason alone.
    for url_path in ("/index.html", "/tools", "/tools/", "/c", "/c/"):
        status, location = _no_redirect(front_door + url_path)
        assert status == 301, f"{url_path} returned {status} rather than 301"
        assert (location or "").endswith("/"), f"{url_path} redirected to {location}"


def test_the_served_tree_is_the_size_the_ceilings_predict() -> None:
    # Not a serving property, but it is measured from the same built objects
    # and it is what the pod's tmpfs actually holds — the number
    # `MIRROR_BYTE_CEILING` and the Deployment's memory limit both reason
    # about, taken from the artifact rather than from the generator.
    stored = sum(len(v) for v in _mirror().values())
    source = sum(len(gzip.decompress(v)) for v in _mirror().values())
    assert stored < source, "the mirror is not actually compressed"
    # Only a floor, so this does not have to be edited when compression drifts
    # by a percent; the point is that a change which silently stopped
    # compressing would show up here rather than as an OOMKill months later.
    assert source / stored > 2.0, f"compression fell to {source / stored:.2f}x, which the ceilings do not assume"
    assert stored <= 8 * 1024 * 1024, "the served mirror is over MIRROR_BYTE_CEILING"


def test_it_did_not_skip_on_the_runner_that_is_supposed_to_run_it() -> None:
    # A skip is the honest answer on a host without nginx, and it is also how
    # this whole file could quietly buy nothing. On GitHub's hosted runner the
    # workflow installs nginx before pytest, so a skip there is a regression in
    # the workflow rather than a fact about the host. Self-hosted runners have
    # no apt and are exempt.
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted":
        pytest.skip("only meaningful on a GitHub-hosted runner")
    assert shutil.which("nginx") or Path("/usr/sbin/nginx").exists(), (
        "nginx is missing on a hosted runner, so every serving test in this file skipped. "
        "The `Install nginx` step in .github/workflows/hetzner-gitops-ci.yml is what provides it."
    )


# ---------------------------------------------------------------------------
# The embed offer's server half.
#
# `platform/pages/embed.mjs` shipped a complete embeddable-widget feature that
# only ever reached `tools.marisstella.dev`, a host that has never served a
# byte. Bringing it to the apex is only half a feature: `X-Frame-Options: DENY`
# is enforced before any page script runs, so correct HTML, a correct runtime
# and a green JS suite still add up to an iframe every browser refuses. These
# tests are the half that markup cannot assert -- and, more importantly, they
# pin how *narrow* the exception is.
# ---------------------------------------------------------------------------


def _entry_path() -> str:
    """A mirrored tool's entry page — the one path the snippet points at."""
    for url_path, content_type, _ in _sample_paths():
        if content_type == "text/html":
            return url_path
    raise AssertionError("the mirror sampled no HTML entry page")


def test_the_entry_page_is_framable_only_with_the_embed_parameter(front_door: str) -> None:
    entry = _entry_path()

    # The deliberate signal the copied snippet carries.
    _, headers, _ = _get(front_door + entry + "?pfEmbed=1", gzip_ok=True)
    assert headers.get("X-Frame-Options") is None, (
        "an embedded view still sends X-Frame-Options, so the iframe a stranger pasted "
        "onto their page renders blank -- the exact defect this map exists to remove"
    )
    assert headers.get("Content-Security-Policy") == "frame-ancestors *;", (
        "the embedded view sends no frame-ancestors CSP. Modern browsers read the CSP and "
        "older ones the header, so shipping one without the other frames on some and not others."
    )

    # Every other spelling is an ordinary visit and must be unchanged.
    for query in ("", "?pfEmbed=0", "?pfEmbed=2", "?pfEmbed=yes", "?pfEmbed=1x", "?other=1"):
        _, headers, _ = _get(front_door + entry + query, gzip_ok=True)
        assert headers.get("X-Frame-Options") == "DENY", (
            f"{entry}{query} is framable; only the literal `?pfEmbed=1` may be"
        )
        assert headers.get("Content-Security-Policy") is None, f"{entry}{query}"


def test_nothing_but_a_tool_entry_page_is_framable(front_door: str) -> None:
    # The blast radius of the map, stated as a test. A future edit that copied
    # the two `add_header` lines into another block -- or moved them to the
    # server level, where they would apply everywhere -- fails here rather than
    # making the front page and every source file embeddable.
    others = ["/", "/robots.txt", "/catalog.json", "/pf-embed.js", "/pf-embed.css"]
    others += [p for p, ctype, _ in _sample_paths() if ctype != "text/html"]
    for url_path in others:
        _, headers, _ = _get(front_door + url_path + "?pfEmbed=1", gzip_ok=True)
        assert headers.get("X-Frame-Options") == "DENY", (
            f"{url_path} became framable; only a tool's entry page may be"
        )


def test_the_embed_runtime_and_stylesheet_are_served_as_their_own_types(front_door: str) -> None:
    # Every mirrored entry page links these two absolutely. The catch-all
    # answers unknown paths with the front page's HTML, and a browser *refuses*
    # a stylesheet and an ES module served as text/html rather than merely
    # mistyping them: the offer box renders unstyled and the copy button does
    # nothing, with a 200 in the log and nothing in any error log.
    for url_path, content_type, must_contain in (
        ("/pf-embed.js", "text/javascript", "data-pf-embed-url"),
        ("/pf-embed.css", "text/css", ".pf-embed-offer"),
    ):
        status, headers, body = _get(front_door + url_path, gzip_ok=True)
        assert status == 200, f"{url_path} returned {status} — the embed offer is inert"
        assert headers.get("Content-Type", "").startswith(content_type), (
            f"{url_path} was served as {headers.get('Content-Type')}, not {content_type}"
        )
        assert must_contain in body.decode("utf8"), (
            f"{url_path} did not serve the generated file — the catch-all is shadowing it"
        )
        assert headers.get("X-Content-Type-Options") == "nosniff", url_path
