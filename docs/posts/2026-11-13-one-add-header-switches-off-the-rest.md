---
title: "One add_header switches off the rest: a free nginx config checker"
seo_title: "Free nginx config security checker: alias, $uri, add_header"
date: 2026-11-13
tags: [nginx, security, self-hosting, devsec, open-source]
description: "A free tool reads nginx.conf and its includes for the alias slash traversal, $uri CRLF injection, add_header drops, proxy_pass SSRF and old TLS."
---

The [nginx Config Security Check](../../ventures/nginx-config-security-check/)
is a new free tool in the devsec set. Paste an `nginx.conf` or a
`sites-available` file with the files it includes, or point the CLI at
`/etc/nginx/`, and it lists the settings that `nginx -t` accepts and an
attacker likes, each with its file, line and fix.

## Why this one

The portfolio already reads Docker Compose files, Kubernetes pods, systemd
units and GitHub Actions workflows for risky settings, and
[Security Headers Check](../../ventures/security-headers-check/) probes the
headers a live server sends. Nothing read the file most self-hosted apps sit
behind. nginx misconfigurations are an odd class of bug: the site works,
tests pass, and the hole is one character wide. The best known:

- **The off-by-slash.** `location /assets` with `alias /srv/shop/assets/`
  lets `/assets../config.php` read `/srv/shop/config.php`, because the
  location matches the prefix and `alias` swaps it for a path ending in `/`.
- **`$uri` in a redirect.** The nginx docs define `$uri` as the current URI
  "in request, normalized", and normalising decodes `%0d%0a`. Put it in
  `return 301 https://$host$uri;` and a crafted link adds headers of its own.
  `$request_uri` keeps the encoding.
- **`add_header` inheritance.** From `ngx_http_headers_module`: add_header
  lines "are inherited from the previous configuration level if and only if
  there are no add_header directives defined on the current level". One
  `Cache-Control` header in a location quietly stops HSTS and every other
  server-level header for that location.

Nineteen finding types in all, from SSRF through a `proxy_pass` host taken
from a query argument to `deny` lines after `allow all` that never apply.
Several were first catalogued by Yandex's
[Gixy](https://github.com/yandex/gixy); this is an independent
implementation in about 500 lines of dependency-free JavaScript, so the same
engine runs in the browser page and in `node check.mjs`.

## What it found on a real config set

To test the include resolution on something bigger than my fixtures, I ran
the CLI over [h5bp/server-configs-nginx](https://github.com/h5bp/server-configs-nginx)
(commit `d2f2c3e`, 2026-06-20), a widely used, carefully commented
configuration set: 38 `.conf` files, includes nested several levels deep.

The first run failed, and the failure was mine. Its `nginx.conf` has
`include custom.d/*.conf;` for a folder that ships empty. My matcher fell back
from `custom.d/*.conf` to a bare `*.conf` when nothing matched, pulled in
`nginx.conf` itself and reported an include loop. A glob that matches no file
now matches nothing, as in nginx, and a test pins it.

The second run printed one finding, `add-header-drops-inherited`, in
`h5bp/location/web_performance_svgz-compression.conf`: the `.svgz` location
sets `add_header Content-Encoding gzip;`, so the `X-Frame-Options` and
`Cache-Control` lines from the enclosing server stop applying there. The
file already re-includes the other security headers by hand, which is the
documented workaround, so the authors clearly know the rule. Of the two that
are missing, `X-Frame-Options` has no effect anyway: h5bp's own `map` sends
it only for `text/html`. `Cache-Control` is the one an `.svgz` response loses
(`expires` is a separate directive and still applies). That is a small thing,
and exactly the kind nobody spots by reading, because the header lives in a
different file from the location that drops it.

The repository's own three nginx files (in `retail-pilot-intel`) came back
clean.

## What it is not

It reads files. It does not know your nginx version, the values a `map` or
`set` produces, or the application behind `proxy_pass`, and an `include` that
matches nothing becomes a note rather than a guess. A clean result means
these patterns were not found, not that a server is secure. It is not a
security audit, and not affiliated with nginx, F5, Yandex or Gixy.

## Next

Following `set` and `map` values to their source would let the SSRF and CRLF
checks see through one level of indirection, which is where real configs
usually hide the variable. The other open question is distribution: a
pre-commit hook and a GitHub Action, like the systemd checker has, would put
`--fail-on-risk` where nginx config actually changes.
