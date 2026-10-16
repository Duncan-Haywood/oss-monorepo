# Subdomain Takeover Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/subdomain-takeover-check/>

A free tool for anyone who manages a DNS zone: follows a hostname's real CNAME chain over public
DNS-over-HTTPS, matches the final target against 25 known takeover-prone hosting providers (S3,
Heroku, GitHub Pages, Azure, Fastly, Shopify, and more), and — for a match — sends one live GET
request checked against that specific provider's own "nothing is claimed at this name" fingerprint
page.

**A finding is only "confirmed" when both the DNS target AND the live response match** — a CNAME
pointing at a takeover-prone provider is not proof of anything on its own; most CNAMEs to Heroku or
S3 are perfectly legitimate and in active use. A DNS-only match is reported separately as
"unconfirmed", worth a manual look, never escalated to confirmed.

**This tool never attempts to claim, register, or configure anything at any provider.** Detection
and reporting only. **Only run this against a hostname you own or are authorised to test.**

## Two ways to run it, sharing the same modules (`lookup.mjs` + `probe.mjs` + `analyze.mjs`)

### Browser — the DNS lookup always works; the confirming HTTP request depends on CORS

Open `index.html`, paste a hostname, click **Check this hostname**. Cloudflare's DNS-over-HTTPS
resolver answers CORS-enabled, so the lookup always completes. Whether the confirming GET request
can complete depends on the target: most third-party providers don't send permissive CORS headers
on their catch-all "not found" page, so a browser tab often cannot read it — the finding is then
reported as unconfirmed rather than confirmed. Nothing is uploaded to us either way.

### CLI — the one path guaranteed to complete

```
node check.mjs <hostname> [<hostname> ...] [--json] [--timeout <ms>]
```

Not run from a browser tab, so it is never subject to CORS. Exit code `0` when no hostname is
confirmed or unconfirmed-risky; `1` when at least one is, or a lookup could not be completed at
all. Wire it into a recurring DNS-zone-audit job:

```yaml
# in your own CI, not this portfolio's -- your zone, your pipeline
- run: node check.mjs blog.example.com app.example.com staging.example.com
```

## Why a live fingerprint, not just a DNS match

A CNAME pointing at `herokuapp.com` or `s3.amazonaws.com` says nothing about whether the app or
bucket it names actually exists — plenty of real, active resources live at exactly those kinds of
hostnames. Reading only the DNS target would misreport every one of those as a takeover risk. Every
provider match here is checked against a live response instead: the specific "nothing is claimed at
this name" page text that provider serves when nobody owns the name — see `fingerprints.mjs` for
the full table and the reasoning behind each entry.

## Coverage, deliberately partial

25 providers, chosen for how frequently they appear in public subdomain-takeover research and
write-ups. This is not, and does not claim to be, the complete set of services with this failure
mode — new hosting providers appear, and existing ones change their "unclaimed" page wording or
ship mitigations over time. A hostname whose CNAME points somewhere this table doesn't recognise is
reported as `not-risky`, which means "not risky by what this tool currently knows", not "confirmed
safe". See `fingerprints.mjs`'s own header comment for how each entry's `vulnerable` field is
scored and why it never changes a `dangling-confirmed` verdict.

## What this is, and isn't

**Evidence, not a determination.** One DNS lookup and, for a provider match, one GET request per
hostname — not a full security assessment. It does not enumerate your DNS zone or guess at other
subdomains; it only checks the exact hostnames you give it. A clean report means none of the
hostnames this run checked matched a known provider with a confirming response — not that the
domain has no exposure anywhere.

See [`vs-checking-dig-by-hand.html`](vs-checking-dig-by-hand.html) for how this compares to the
manual `dig` lookup most developers reach for first.

## If this checker finds a confirmed finding

See [`why-cnames-end-up-dangling.html`](why-cnames-end-up-dangling.html) for the full walkthrough.
Short version: either reclaim the exact name on the provider (if you're still using it) or remove
the DNS record entirely (if you're not) — then re-run the check to confirm the fix.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to Cloudflare's
DNS resolver and the hostname you name — never through this site, and nothing about the hostname or
what was found is sent anywhere by this tool. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no hostnames, no response
bodies, no account, no tracking cookies, no analytics vendor, honouring Do Not Track and Global
Privacy Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security advice, and it does not replace a qualified security review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to test any
hostname you point it at. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be slow,
broken, moved, or taken offline without notice. The CLI has no such dependency — it's a script you
run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes what
the tool does.

## Tests

```
cd ventures/subdomain-takeover-check && node --test
```

Assertions across the provider table (`fingerprints.test.mjs`), the DNS layer with an injected fake
resolver (`lookup.test.mjs`), the HTTP layer with a local fake server so no test hits the real
internet (`probe.test.mjs`), the classification logic (`analyze.test.mjs`), the CLI's orchestration
and argument parsing (`check.test.mjs`), the usage counter (`usage.test.mjs`), and the pages'
structure and disclaimers (`page.test.mjs`).
