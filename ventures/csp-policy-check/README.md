# CSP Policy Check

You added a Content-Security-Policy and now a script is "refused", or you have
a policy and want to know whether it would stop an injected `<script>`. Paste
the policy (bare, a header line, a `curl -sI` dump or a `<meta>` tag) and this
tool tells you:

- **what is weak about it**, in plain words, with the fix for each finding;
- **which directive governs each kind of resource**, after the CSP3 fallback
  chain (`script-src-elem` → `script-src` → `default-src`, `worker-src` →
  `child-src` → `script-src` → `default-src`, and so on);
- **whether a given load would be allowed**: a script, style, image, font,
  fetch, frame, worker, media, object, manifest, form target or `<base>` URL,
  with the element's nonce and whether another script inserted it
  (`'strict-dynamic'`); an inline script, event handler, `<style>` or
  `style=` attribute, with the sha256 hash to add; and `eval()`.

Live: <https://marisstella.app/csp-policy-check/> · Guide:
[fixing "Refused to execute inline script"](refused-to-execute-inline-script.html)

## Use it

In a browser: open `index.html` (any static server; it is plain ES modules).

From a terminal or CI (Node.js 20+, no dependencies):

```
curl -sI https://your-site.example | node cli.mjs
node cli.mjs --url https://your-site.example --test script https://cdn.example.com/lib.js
node cli.mjs "script-src 'nonce-abc…' 'strict-dynamic'" --test script https://cdn.example.com/lib.js --nonce abc…
node cli.mjs "script-src 'self'" --inline script "alert('Hello, world.');"   # prints the hash
node cli.mjs "<policy>" --eval --json
```

Exit codes: 0 clean, 1 a high-severity finding or a blocked test, 2 bad
arguments or a failed fetch. `--url` makes one GET to the URL you give; run it
only against sites you own or are authorised to test.

## What it checks

| Severity | Finding |
|---|---|
| high | no `script-src`/`default-src`; `'unsafe-inline'` with no nonce or hash (scripts or `script-src-attr`); `*`, `https:`/`http:` or `data:`/`blob:` in the script list without `'strict-dynamic'`; `'strict-dynamic'` with no nonce or hash (blocks every script); a keyword written without quotes (`self` is a host named "self") |
| medium | `'unsafe-eval'`; script host over `http://`; missing `object-src` (with no `default-src`); missing `base-uri` (it has no fallback); a nonce under 16 bytes; duplicate directives (the first wins); unknown or misspelt directives (with the nearest real name); invalid source expressions; `frame-ancestors`, `report-uri` or `sandbox` in a `<meta>` policy |
| low | host allowlist with no nonce (the CCS 2016 bypass result); wide `*.domain` script hosts; `object-src` not `'none'`; deprecated directives; `'none'` mixed with sources |
| info | report-only mode; several comma-separated policies; no `frame-ancestors`, no `form-action`; inline styles allowed; `report-uri`/`report-to` coverage; `'unsafe-inline'` kept as a CSP1 fallback next to a nonce |

## Spec sources

- W3C, [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/)
  (Working Draft): parsing (§2.2.1), source-expression grammar (§2.3.1),
  `<meta>` delivery limits (§3.3), script pre-request and inline checks
  (§6.6, §6.7.3), URL matching: scheme-part, host-part, port-part, path-part
  and `'self'` (§6.7.2), effective directive and fallback lists (§6.8).
- L. Weichselbaum, M. Spagnuolo, S. Lekies, A. Janc, "CSP Is Dead, Long Live
  CSP! On the Insecurity of Whitelists and the Future of Content Security
  Policy", ACM CCS 2016: the nonce + `'strict-dynamic'` + `object-src 'none'`
  + `base-uri 'none'` strict policy the findings steer towards.
- Who would sign it off: an application-security engineer reviewing a site's
  headers. The worked example pinned in `csp.test.mjs` is the spec's own
  hash example: `alert('Hello, world.');` is allowed by
  `'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='`, plus the spec's
  matching rules (`*.example.com` does not match `example.com`, `http://`
  sources accept the `https://` upgrade, a trailing `/` makes a path a
  prefix, paths are ignored after a redirect).

## What it does not model

Browsers follow the draft closely but not everywhere, and some checks need
more than the policy text:

- Subresource Integrity hashes on external scripts (CSP3 lets a hash source
  allow an external script whose `integrity` matches); not modelled, so such a
  script is judged by URL and nonce only.
- `trusted-types`, `require-trusted-types-for`, `sandbox` flags and `webrtc`
  are recognised as valid names but not evaluated.
- Navigation (`javascript:` URLs), `'report-sample'`, `'unsafe-allow-redirects'`
  and speculation rules are recognised and not evaluated.
- IP-address hosts are matched as plain strings.
- It cannot see whether a nonce is random per response, or whether an allowed
  host serves JSONP or user uploads; the findings say where that matters.

## Privacy

Everything runs in your browser. The policy, URLs and code you type are never
uploaded, and there are no accounts, tracking cookies or analytics vendor. The
page keeps an anonymous local count of which buttons were used
(`policy_checked`, `url_tested`, `inline_tested`, `eval_tested`) and the day,
in `localStorage` key `csp-policy-check-usage`; the checkbox in the footer
turns it off and deletes it, and Do Not Track / Global Privacy Control are
honoured. The CLI stores nothing.

## Survey of this repository's own policies

`node ventures/csp-policy-check/eval/survey-repo-csps.mjs` runs the checker over
the CSP headers the repository's own servers send. 2026-11-18: 23 policies, 7
with `script-src 'unsafe-inline'` and no nonce, 15 with no high or medium finding
([eval/repo-csp-survey-2026-11-18.md](eval/repo-csp-survey-2026-11-18.md)).

## Tests

```
node --test '*.test.mjs'
```

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not security, legal or professional advice, and it does not
replace a qualified professional or a penetration test. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

## License

MIT, see [LICENSE](LICENSE). Support is optional:
[github.com/sponsors/Duncan-Haywood](https://github.com/sponsors/Duncan-Haywood).
