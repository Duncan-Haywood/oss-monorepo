# Git Exposure Checker

Free CLI (+ browser report viewer): sends two real HTTP GET requests to a
site you choose — `.git/HEAD` and `.git/config` — and classifies the
response **bodies**, not just the status code, to tell a genuinely exposed
`.git` directory apart from a webserver that answers every path with 200 (a
"soft 404"). A real exposure lets anyone reconstruct the entire committed
source history — including files and secrets removed in a later commit —
using a free public tool such as `git-dumper` or GitTools.

Production: https://duncan-haywood.github.io/oss-monorepo/git-exposure-check/

## Why the body, not just the status code

A naive checker that treats any 200 response at `.git/HEAD` as "exposed" is
wrong on a common pattern: a webserver or CDN configured to answer every
unknown path with a 200-status custom error page. Under that setup a
status-only check flags every site behind it, whether or not `.git` is
really there.

This tool instead requires the response body to actually parse as real
git-internal content:

- `.git/HEAD` — either `ref: refs/heads/<branch>` (the ordinary case) or a
  bare 40-character hex commit SHA (a detached HEAD). Nothing else a
  webserver would plausibly serve at that path looks like this.
- `.git/config` — contains the `[core]` section every repository created
  with `git init` opens with.

Either one matching alone is already strong, narrow evidence; both matching
is the same finding at higher confidence, since a real exposed `.git`
directory normally serves every file inside it identically.

Deliberately out of scope: this never requests `.git/index`, `.git/logs/HEAD`,
or any packed object. If HEAD or config is exposed, the rest almost always is
too — naming that inference in the report is enough to make the point
without this tool doing the actual bulk read itself.

## Two parts, sharing the same classification logic (`analyze.mjs`)

### CLI — does the actual probing

```
node check.mjs https://example.com/ [--json] [--timeout <ms>]
```

Sends the requests directly from your machine to the site you name — nothing
goes through this portfolio. Pass the site root (a trailing slash matters)
unless you specifically want to check a subpath's own `.git` directory,
in which case pass that subpath with a trailing slash. Exit code `0` when
both probes completed and no exposure finding is present; `1` when a finding
is present or neither probe could complete — usable directly as a
deploy-verification CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node check.mjs <url> --json`, and
click Check. Nothing you paste is uploaded; the page reads it in memory in
your tab.

## What this is, and isn't

**Evidence, not a determination.** Two requests, testing one specific,
well-documented exposure class — not a penetration test, not a full security
assessment. It does not check other source-control or backup exposures (a
stray `.svn` directory, a real `.env` file, a database dump in the webroot),
does not crawl the rest of the site, and only checks the one base URL you
give it. A clean report means these two requests found nothing, not that the
site has no exposed secrets.

**Real requests, real risk to be honest about.** This CLI sends actual
network traffic to whatever URL you give it. Only run it against systems you
own or are authorised to test — the same rule that applies to any HTTP
client aimed at someone else's server.

## Privacy

The CLI's requests go straight from your machine to the target site — never
through this site, and nothing about the target or the results is sent
anywhere by this tool. The browser page only parses JSON you paste into it
locally. The only thing stored is an anonymous local count (`localStorage`,
browser only) of which features were used and the day — no target URLs, no
response bodies, no account, no tracking cookies, no analytics vendor,
honouring Do Not Track and Global Privacy Control automatically. Turn it off
with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review or penetration test. You are responsible for reviewing and
verifying its output before relying on it, and for having authorisation to
test any system you point the CLI at. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/git-exposure-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the network
layer against a real local HTTP server with no external network access
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and the page's
structure and disclaimers (`page.test.mjs`).
