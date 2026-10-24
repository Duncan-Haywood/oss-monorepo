# Dotenv Exposure Checker

A free tool for anyone shipping a web deployment: sends one plain GET request to each of five
well-known dotenv filenames (`.env`, `.env.local`, `.env.production`, `.env.production.local`,
`.env.development.local`) and names which ones are **publicly readable** — verified against the
real `KEY=VALUE` line shape of a dotenv file, not just an HTTP status.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dotenv-exposure-check/

**Variable values are never read, stored, or shown anywhere by this tool — only variable names.**
A dotenv file's whole purpose is holding secrets, so a checker for this exposure class has to be
careful not to become a second way to leak them. See
[`why-env-files-end-up-in-production.html`](why-env-files-end-up-in-production.html) for the
common causes and the fix for each.

**Only run this against a site you own or are authorised to test.** It never writes, submits, or
modifies anything on the target — every request is `GET`.

## Two ways to run it, sharing the same modules (`probe.mjs` + `analyze.mjs`)

### Browser — works when the target's CORS policy allows it

Open `index.html`, paste a site URL, click **Check this site**. Whether this can complete depends
on the target: most servers don't send permissive CORS headers on arbitrary static paths, so a
browser tab often cannot read a cross-origin response at all. Nothing is uploaded to us either
way: every request goes straight from your browser to the target.

### CLI — the one path guaranteed to complete

```
node check.mjs <site-url> [--json] [--timeout <ms>]
```

Not run from a browser tab, so it is never subject to CORS. Exit code `0` when none of the checked
paths is exposed; `1` when at least one is, or a request could not be completed at all. Wire it
into your own deploy pipeline so a regression turns the build red the day it ships:

```yaml
# in your own CI, not this portfolio's -- your site, your pipeline
- run: node check.mjs https://your-production-url.example/
```

## Why a signature check, not just an HTTP status

Many servers return their normal 200 page — a single-page app's fallback route, a themed 404 —
for literally any path, known or not. Reading only the status code would misreport every one of
those as an exposed dotenv file. Every path here is verified against the real line shape instead:
the response must not look like HTML, and most of its non-comment, non-blank lines must be
`KEY=VALUE` shaped.

## Why values are never read, stored, or shown

Every other checker in this portfolio's "read what's actually there, name the exact evidence"
family reads *structural* evidence — an HTTP status, a file's magic bytes, a JSON schema's field
names. A dotenv file is different: its content *is* the secret. So this tool draws a hard line
`analyze.mjs`'s own header comment pins: a response body is parsed only to (1) check whether its
overall shape looks like a real dotenv file, and (2) extract each line's `KEY` name. The `VALUE`
half of every line is discarded immediately and never appears in any return value, report, JSON
output, or rendered page — not even truncated, hashed, or partially shown. A variable name like
`STRIPE_SECRET_KEY` being present is already enough to know a real credential is likely exposed,
without this tool ever needing to display what that credential is.

## What this is, and isn't

**Evidence, not a determination.** Five GET requests, once each — not a full security assessment.
It does not check other common secret-exposure paths (a stray `.git` directory — see
[`git-exposure-check`](../git-exposure-check/) — a `config.json`, a backup archive), does not
crawl the rest of the site, and only checks the one base URL you give it. A clean report means none
of the five paths this run checked was confirmed exposed — not that the deployment has no exposure
anywhere.

See [`vs-checking-by-hand.html`](vs-checking-by-hand.html) for how this compares to the manual
check most developers reach for first.

## If this checker finds an exposure

Fix the deploy cause (see the guide page), then treat every value that file held as compromised
and rotate it immediately — there is no way to know for certain a credential was not already
fetched by an automated scanner before you found it. Re-run the check to confirm the fix.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to the site you
name — never through this site, and nothing about the URL, the response, or any variable name or
value is sent anywhere by this tool. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no site URLs, no variable
names or values, no account, no tracking cookies, no analytics vendor, honouring Do Not Track and
Global Privacy Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security advice, and it does not replace a qualified security review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to test any
site you point it at. To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be slow,
broken, moved, or taken offline without notice. The CLI has no such dependency — it's a script you
run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes what
the tool does.

## Tests

```
cd ventures/dotenv-exposure-check && node --test
```

Assertions across the network layer with a local fake HTTP server so no test hits the real
internet (`probe.test.mjs`), the classification logic including the value-redaction guarantee
(`analyze.test.mjs`), the CLI's orchestration and argument parsing (`check.test.mjs`), the usage
counter (`usage.test.mjs`), and the pages' structure and disclaimers (`page.test.mjs`).
