# Email Authentication Checker

Your outbound mail is landing in spam, or you're not sure whether someone
could send email that looks like it came from your domain -- and the usual
answer is a paid dashboard behind a signup wall, or a bare pass/fail badge
that doesn't say *why*. This is a free, zero-dependency CLI (plus a browser
page) that looks up your domain's **SPF**, **DKIM**, **DMARC**, and **BIMI**
DNS records over public DNS-over-HTTPS and reports what each one actually
says and why it matters:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/email-auth-check/

- **SPF** -- parses the record and **recursively follows every
  `include:`/`redirect=` mechanism**, summing the total against RFC 7208's
  10-DNS-lookup limit across the *whole* chain, not just the top-level
  record. Going over 10 is a permanent error (PermError) that fails SPF for
  **every** message from the domain -- the single most common real-world SPF
  bug, usually caused by stacking one `include:` per marketing/support tool
  over time until the total quietly crosses 10. Also flags `+all` (anyone can
  send as your domain), multiple SPF records (only one is allowed), and
  malformed syntax.
- **DKIM** -- checks nine common selector names (`google`, `selector1`,
  `selector2`, `k1`, `s1`, `s2`, `default`, `dkim`, `mail`) at
  `<selector>._domainkey.<domain>` and flags a key with an empty `p=` tag,
  which RFC 6376 defines as an explicitly **revoked** key.
- **DMARC** -- reads the policy (`p=none`/`quarantine`/`reject`), `pct=`,
  `rua=`/`ruf=` reporting addresses, and `adkim=`/`aspf=` alignment mode.
  Flags `p=none` (monitor-only) as the most common gap that leaves a domain
  spoofable while every other record looks configured, and flags a missing
  DMARC record entirely as the more serious problem it is.
- **BIMI** (bonus) -- checks whether a BIMI record is published and whether
  DMARC enforcement is actually strong enough (`p=quarantine`/`reject` with
  `pct=100`) for Google and Yahoo to honor it.

**This is evidence, not a verdict.** Every finding names the exact record or
tag it read and what that means -- never "your domain is secure", always
"here is what your DNS says." A clean report means these specific checks
found nothing; it is not a determination that your email is secure or that
mail will reach the inbox (reputation, content, and list hygiene matter too,
and none of that lives in DNS).

After using this, you can now name the exact DNS record, tag, and value
behind a spoofing gap or an SPF permerror -- instead of guessing from
documentation or waiting for a delivery failure to find it first, which used
to mean digging through `dig txt` output by hand or paying for a dashboard.

## Two parts, sharing the same classification logic

### `analyze.mjs` -- pure, dependency-free, and what's actually tested

All SPF/DKIM/DMARC/BIMI parsing and classification lives here and takes
already-fetched DNS TXT answers as plain data -- no network call, no I/O.
This is the file `analyze.test.mjs` exercises directly against fixture DNS
responses (including a multi-level recursive SPF chain summing to 11
lookups), with no live network involved or possible.

### `lookup.mjs` -- the only file that talks to the network

Uses the platform's own global `fetch` (a Node 18+ builtin, so this stays
zero-dependency) to query
[Cloudflare's public DNS-over-HTTPS JSON API](https://developers.cloudflare.com/1.1.1.1/encrypted-dns/dns-over-https/make-api-requests/dns-json/)
directly -- no key needed, CORS-enabled, so the identical module runs
unmodified from the CLI (your machine) and from the browser page (your
browser). No server of ours sits in between either way.

### CLI

```
node cli.mjs example.com
node cli.mjs example.com --json
```

Exit code `0` when the domain has no danger-severity finding and every
lookup completed; `1` otherwise -- usable directly as a CI gate against your
own domain's mail configuration:

```yaml
# in your own CI, not this portfolio's -- your domain, your gate
- run: node cli.mjs yourdomain.com
```

### Browser

Open `index.html`, type a domain, click Check. Runs the identical lookups
directly from your browser to Cloudflare's resolver -- nothing about the
domain you check is sent to this site.

## What this is, and isn't

**Evidence, not a determination.** Reads SPF, DKIM, DMARC, and BIMI DNS
records over public DNS-over-HTTPS and reports what they say. It is not
email deliverability, security, or DNS configuration advice, and it does not
replace a qualified professional.

**Scope of the SPF lookup count**, stated plainly: it counts `include:` and
`redirect=` recursively (each fetching and walking a further SPF record) plus
one lookup for each `a`/`mx`/`ptr`/`exists` mechanism found, but it does not
further resolve what an `a`/`mx`/`ptr` mechanism itself points at for the
10-lookup count. It does separately resolve the A/AAAA (or MX) target of each
`a`/`mx`/`exists` term (up to 20 queries) to count **void lookups**, the
RFC 7208 limit of 2 empty answers; macro targets are skipped. A
domain whose `mx` mechanism resolves to several mail servers may cost
slightly more than this tool shows -- a real but secondary contributor next
to the dominant real-world cause of this bug, stacking one `include:` per
tool.

**DKIM selector coverage is a known list, not a guarantee.** If none of the
nine common selectors resolve, that is not proof DKIM isn't configured --
many providers use a custom or rotating selector this tool cannot guess.
Check a sent message's own `DKIM-Signature` header, or your provider's
dashboard, for the exact selector name.

## Privacy

Everything runs client-side (the browser page) or on your own machine (the
CLI). Nothing is uploaded: both talk directly to Cloudflare's public DNS
resolver, never through this site, and no server of ours is involved. The
only thing stored is an anonymous local count (`localStorage`, browser only)
of which features were used and the day -- no domains checked, no DNS
records, no account, no tracking cookies, no analytics vendor, honouring Do
Not Track and Global Privacy Control automatically. Turn it off with the
checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not email deliverability, security, or DNS configuration
advice, and it does not replace a qualified professional. You are
responsible for reviewing and verifying its output before relying on it, and
for meeting any obligation it helps you prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency -- it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source --
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Usage

Anonymous, aggregate, opt-out local counters only (`usage.mjs`) -- the event
name and the day, in your own browser's `localStorage`. Never the domain
checked, never the DNS records read, never anything that could identify who
ran the check. See [`portfolio/usage/README.md`](../../portfolio/usage/README.md)
for the fleet-wide rules this follows.

## Tests

```
cd ventures/email-auth-check && node --test
```

Assertions across the classification logic against fixture DNS responses,
including a recursive multi-level SPF chain (`analyze.test.mjs`), the DNS-
over-HTTPS network layer with an injected fake transport so no test hits a
real network (`lookup.test.mjs`), the CLI's orchestration and argument
parsing (`cli.test.mjs`), the usage counter (`usage.test.mjs`), and the
page's structure and disclaimers (`page.test.mjs`).
