# nginx Config Security Check

A free tool that reads your own nginx configuration, with its `include` lines
resolved against the other files you give it, and lists the misconfigurations
that turn a web server into a way in: the `alias` off-by-slash path traversal,
`$uri` in a redirect or header (CRLF injection), `proxy_pass` to a host taken
from the request (SSRF), CORS that reflects any origin, `add_header` lines
silently dropped by a nested block, old TLS, and more. Each finding prints
`file:line`, the risk and the fix.

**Live tool:** https://marisstella.app/nginx-config-security-check/
· **Guide:** [`nginx-misconfigurations-explained.html`](nginx-misconfigurations-explained.html)

**Who it is for:** anyone who writes their own `nginx.conf` or
`sites-available` file for a self-hosted app, a reverse proxy in front of an
API or a static site, and teams that keep nginx config in a repository, a
Docker image or a configuration-management template and want a check before
they deploy.

| Type | Severity | What it flags |
| --- | --- | --- |
| `alias-path-traversal` | high | a prefix `location /img` (no trailing slash) with `alias /data/img/` (trailing slash): `/img../` reaches the directory above |
| `crlf-injection-uri` | high | `$uri` or `$document_uri` (the decoded path) in a `return` 3xx target, a redirecting `rewrite`, `add_header`, `proxy_set_header` or the path of `proxy_pass` |
| `ssrf-upstream-from-request` | high | `proxy_pass` (or `fastcgi_pass`, `uwsgi_pass`, `scgi_pass`, `grpc_pass`) whose host comes from a query argument, header or cookie |
| `cors-reflects-any-origin` | high / medium | `add_header Access-Control-Allow-Origin $http_origin` with no `if ($http_origin ...)` around it; high when `Access-Control-Allow-Credentials true` is also sent |
| `ssl-protocol-broken` | high | `SSLv2` or `SSLv3` in `ssl_protocols` |
| `add-header-drops-inherited` | medium | a block with its own `add_header`, which stops every `add_header` from the enclosing level (the dropped headers are listed); `add_header_inherit merge` or `off` (nginx 1.29.3+) is honoured |
| `deny-after-allow-all` | medium | a `deny` after `allow all` in the same block, which never applies |
| `autoindex-on` | medium | `autoindex on` (directory listing) |
| `open-redirect` | medium | a `return` redirect whose target or host is a query argument, header or cookie |
| `origin-regex-unanchored` | medium | an `if ($http_origin ~ ...)` or `$http_referer` regex with no `^`, no `$` or an unescaped `.` |
| `ssl-protocol-deprecated` | medium | `TLSv1` or `TLSv1.1` in `ssl_protocols` |
| `ssl-cipher-weak` | medium | RC4, DES/3DES, EXPORT, NULL, MD5 or anonymous suites enabled (not `!`-excluded) in `ssl_ciphers` |
| `ssrf-upstream-from-host` | medium | a `proxy_pass` host of `$host` or `$http_host` |
| `status-page-public` | medium | `stub_status` with no `allow`/`deny`, `auth_basic` or `auth_request` on its location or above, in a server not bound to localhost |
| `server-tokens-on` | low | `server_tokens on` (or `build`) set explicitly |
| `host-header-spoofing` | low | `proxy_set_header Host $http_host` (use `$host`) |
| `upstream-tls-unverified` | low | `proxy_pass https://` to a non-local host with `proxy_ssl_verify` off, nginx's default |
| `valid-referers-none` | low | `valid_referers none` |
| `unbounded-request-body` | low | `client_max_body_size 0` |

**How it reads a config.** The lexer follows nginx's own rules closely enough
for analysis: `#` comments, single and double quotes with backslash escapes,
`${var}` inside a word, a `{` ending an unquoted word. `include` lines are
resolved against the files you supply: a pattern matches a file whose path
ends with it (so `include /etc/nginx/conf.d/*.conf;` matches a file named
`conf.d/app.conf`), globs are expanded in name order, an include loop is an
error, and an include that matches nothing is reported as a note, not
guessed at. A file nobody includes is a root; its context is read from what
it holds (a whole `nginx.conf`, a file of `server` blocks, or a snippet of
`location` blocks). Settings that nginx inherits from the level above only
when the current level sets none (`add_header`, `allow`/`deny`,
`proxy_ssl_verify`) are followed through `http`, `server`, `location` and
`if` blocks. A directive reached twice through two includes is reported once.

**What it is not:** a security audit, a penetration test, or `nginx -t` (it
does not check that nginx will accept the file). It never runs nginx, does not
know the nginx version you run, does not read `map` or `geo` values, does not
follow variables set with `set` to their source, and cannot see the
application behind `proxy_pass`. A clean scan means only that these patterns
were not found, never that a server is safe.

## Credit

Several of these checks were catalogued by Yandex's
[Gixy](https://github.com/yandex/gixy) (MPL-2.0): the alias traversal, HTTP
splitting through `$uri`, `add_header` redefinition, SSRF through
`proxy_pass`, Host header spoofing, Origin and Referer regexes, and
`valid_referers none`. The ideas are borrowed with credit; no Gixy code is
used, and this tool is not affiliated with Gixy or Yandex. The rest come from
the [nginx module documentation](https://nginx.org/en/docs/), which is also
the source for the inheritance rules (`ngx_http_headers_module`: add_header
lines "are inherited from the previous configuration level if and only if
there are no add_header directives defined on the current level").

## Try it without installing anything

[`index.html`](index.html) runs the same engine in a browser page. Paste a
config and any included files (name each block like its path, e.g.
`conf.d/app.conf`) and get every finding. Nothing is uploaded, and the page
makes no network calls.

## Quickstart (CLI)

```sh
node check.mjs                       # scan *.conf, nginx.conf and sites-* files under the current directory
node check.mjs /etc/nginx/           # a whole config tree, includes resolved
node check.mjs site.conf --format json
node check.mjs /etc/nginx --fail-on-risk   # exit 2 on any high or medium finding
```

Node 18 or later, zero dependencies, two files (`check.mjs` and `scan.mjs`),
no network calls. A directory walk reads `*.conf`, `nginx.conf` and every file
in a `sites-enabled`, `sites-available`, `snippets` or `conf.d` directory, and
skips `.git`, `node_modules` and build folders.

Run the [`fixtures/etc-nginx/`](fixtures/etc-nginx/) tree to see every kind of
finding at once: `node check.mjs fixtures/etc-nginx` prints 15 findings
(4 high, 7 medium, 4 low) from `conf.d/app.conf`, `snippets/cors.conf` and
`nginx.conf`, and none from `conf.d/clean.conf`, the same site written safely.

## Tests

```sh
node --test scan.test.mjs page.test.mjs usage.test.mjs
```

## Privacy and usage counting

The page counts two anonymous events (`check_run`, `example_loaded`) in
`localStorage` only, never sent anywhere, honours Do Not Track and Global
Privacy Control, and has a button that deletes the counts and turns counting
off.

MIT licensed. No warranty: see the page footer.
