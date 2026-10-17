# CAA Record Checker

A free tool for anyone who manages a domain's DNS or has hit a confusing "CAA record prevents
issuance" certificate error: resolves the CAA record set that actually governs certificate issuance
for a hostname, following RFC 8659's tree-walk up to the first ancestor domain that publishes one
(not just the exact name you typed), validates each record's syntax (including the RFC 8657
CA-account-authorization parameters), flags a critical unrecognized property tag that can silently
block every certificate authority, and names whether each of 8 well-known CAs — or any other CA
domain you enter — is authorized to issue non-wildcard and wildcard certificates.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/caa-record-check/

**This tool never contacts the hostname you check.** It only queries Cloudflare's public
DNS-over-HTTPS resolver, reading CAA and CNAME records the domain owner already published for
anyone to see. That is a narrower, safer request surface than most tools in this catalogue's
checker family, which typically also send one live HTTP request to the target.

## Why a raw CAA lookup isn't enough

Dozens of free "CAA record lookup" tools already exist, and they do one thing well: show the raw
record text at the exact name you query. That is necessary and not sufficient, because RFC 8659
applies rules a raw dump doesn't surface:

1. **The tree-walk.** If the exact name has no CAA records, a real CA checks its parent domain, then
   that domain's parent, and so on. A tool that queries only the exact name reports "no CAA record,
   any CA may issue" for a subdomain whose parent actually restricts issuance — the single most
   common source of "why does my subdomain suddenly fail to renew" confusion on Let's Encrypt's own
   community support forum.
2. **The `issuewild` fallback.** Wildcard certificates are governed by `issuewild` when it's present
   at all; if it's entirely absent, `issue` covers both wildcard and non-wildcard. Get this backwards
   and you'll misreport which CAs can issue a wildcard cert.
3. **The critical-flag trap.** A record can mark any tag — including a custom or misspelled one —
   critical. A compliant CA that doesn't implement that exact tag must then refuse to issue at all,
   regardless of any `issue` records also present. See `how-caa-blocks-certificate-issuance.html`
   for the full walkthrough.
4. **The RFC 8657 account-binding parameters.** An `issue` value can carry extra
   `key=value` parameters after the issuer domain (`accounturi`, `validationmethods`) restricting
   issuance to a specific CA account or validation method. A parser that assumes "exactly one token"
   breaks on this shape — a real bug report against a DNS-management tool records exactly that
   failure ("CAA value does not contain 3 fields").

See [`vs-a-plain-dns-lookup.html`](vs-a-plain-dns-lookup.html) for a side-by-side comparison.

## Two ways to run it, sharing the same modules (`lookup.mjs` + `parse.mjs` + `analyze.mjs`)

### Browser — no CORS wall, because every request goes only to the public resolver

Open `index.html`, paste a hostname (and optionally a CA domain to check), click **Check this
hostname**. Unlike tools that also need to reach the target site itself, everything here talks only
to Cloudflare's public DoH endpoint, which answers CORS-enabled — so the browser page always
completes, with no CLI-only fallback needed for that reason.

### CLI

```
node check.mjs <hostname> [<hostname> ...] [--ca <ca-domain>] [--json] [--timeout <ms>]
```

Exit code `0` when every hostname is clean (and, with `--ca`, that CA is authorized); `1` when a
hostname has a malformed record, a critical unrecognized tag, or the named CA is blocked; `2` on a
usage error or a lookup that could not complete. Wire it into deploy verification or a recurring
DNS-zone-audit job:

```yaml
# in your own CI, not this portfolio's -- your zone, your pipeline
- run: node check.mjs example.com --ca letsencrypt.org
```

## Two wire formats decoded, not one

DNS-over-HTTPS resolvers hand back CAA record data two different ways. Cloudflare's own DoH JSON
changelog (2026-07-28) says CAA used to come back in RFC 3597's generic-hex "unknown record type"
encoding and was only switched to the friendlier presentation format (`0 issue "letsencrypt.org"`)
that day — so a resolver that hasn't shipped the same fix, or a cached older answer, can still
return generic hex. `parse.mjs` decodes both, rather than assuming the friendlier one and silently
mis-reporting on the other.

## Known CA shortlist, deliberately not exhaustive

`analyze.mjs`'s `KNOWN_CAS` covers Let's Encrypt, Google Trust Services, DigiCert, Sectigo, Amazon
Trust Services, GlobalSign, SSL.com, and ZeroSSL — sourced from each CA's own CAA documentation at
screening time. A CA can add or change its issuer domain; treat this as a helpful shortlist, not an
authoritative registry, and cross-check an unexpected result against the CA's own current
documentation. The `--ca` flag (CLI) and the "check one specific CA" field (browser) work for any
CA domain, not just the ones in the shortlist.

## What this is, and isn't

**Evidence, not a determination.** This reports what your published CAA records authorize, computed
the way RFC 8659 says a CA must compute it — it is not a guarantee that a specific CA will actually
issue a certificate. The CA applies its own domain-validation, rate-limit, and account checks on top
of CAA authorization.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to Cloudflare's
public DNS resolver — **never to the hostname you're checking**, and nothing about it is sent
anywhere by this tool. The only thing stored is an anonymous local count (`localStorage`, browser
only) of which features were used and the day — no hostnames, no CA names entered, no account, no
tracking cookies, no analytics vendor, honouring Do Not Track and Global Privacy Control
automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security or compliance advice, and it does not replace a qualified review. You are responsible for
reviewing and verifying its output before relying on it. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be slow,
broken, moved, or taken offline without notice. The CLI has no such dependency — it's a script you
run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes what
the tool does.

## Tests

```
cd ventures/caa-record-check && node --test
```

Assertions across the wire-format parser and RFC 8657 parameter parsing (`parse.test.mjs`), the DNS
layer with an injected fake resolver covering the tree-walk and CNAME hop (`lookup.test.mjs`), the
CAA-set analysis and per-CA verdicts (`analyze.test.mjs`), the CLI's orchestration and argument
parsing (`check.test.mjs`), the usage counter (`usage.test.mjs`), and the pages' structure and
disclaimers (`page.test.mjs`).
