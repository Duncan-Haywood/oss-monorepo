---
title: "The certificate that hid the takeover: why our subdomain checker could almost never say 'confirmed'"
seo_title: "Subdomain takeover check: an HTTP retry lets S3 and Heroku confirm"
date: 2026-11-13
tags: [security, subdomain-takeover, mutation-testing, redteam, javascript]
description: "Our subdomain takeover checker probed HTTPS only, so dangling S3, Heroku and GitHub Pages CNAMEs failed TLS and could never read as confirmed."
---

The [subdomain takeover checker](https://marisstella.app/subdomain-takeover-check/)
does two things for each hostname you give it. It follows the hostname's
CNAME chain over public DNS. If the chain reaches a provider that lets
strangers claim an unused name (an S3 bucket, a Heroku app, a GitHub Pages
site and 21 others), it then sends one GET request to the hostname and looks
for that provider's own "nothing is claimed here" page. A match is the
strongest result the tool gives: **dangling-confirmed**.

Today's red-team run found that the strongest result was close to
unreachable for the three providers people hit most.

## What went wrong

The probe asked for `https://<hostname>/` and nothing else. Picture a
typical dangling record:

- **S3 website hosting.** The CNAME points at
  `<bucket>.s3-website-<region>.amazonaws.com`. AWS documents that website
  endpoints [do not support HTTPS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html).
  The HTTPS request has nothing to connect to.
- **Heroku and GitHub Pages.** Once the app or site is gone, the provider's
  edge still answers, but with its own certificate (`*.herokuapp.com`,
  `*.github.io`), which does not cover `blog.yourcompany.com`. Node's
  `fetch` rejects the handshake before any body arrives.

Either way the probe came back with no status and no body. The tool reported
the safe fallback, **risky-unconfirmed**, a warning worth a manual look. That
is not a false "all clear", which is why nobody noticed. But a checker that
can only shrug at the exact cases it was built for is not doing its job.

## The fix

`fetchHostname` now retries once over plain `http://` when HTTPS got no
response at all (a TLS or connection failure, not a 404 or a 500). The
provider's unclaimed page over HTTP is the same evidence. If both fail, the
HTTPS error is the one reported, since it usually says more (a browser CORS
block, or the certificate mismatch). In the browser version the retry is
blocked as mixed content before it is sent, so the page behaves as before;
the [CLI](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/subdomain-takeover-check)
is the path that gains. A confirmed finding now names the URL that actually
answered, `http://` included, so you can open it yourself.

A test feeds the probe a fake network where HTTPS throws a certificate error
and HTTP returns `NoSuchBucket`. It fails on the old code and passes now.

## The seeded faults

Before hunting by hand, the run seeded 16 faults into `analyze.mjs` and
`check.mjs` with `redteam.py campaign`. Each one changes a constant or flips
a comparison, runs the tests, then restores the file.

| File | Seeded | Caught before | Equivalent | Caught after |
|---|---|---|---|---|
| `analyze.mjs` | 8 | 6 | 0 | 8 of 8 |
| `check.mjs` | 8 | 3 | 1 | 7 of 7 |

The escapes worth knowing about:

- **A probe sent where none should be.** Changing `||` to `&&` in the
  "is this worth probing?" test made the CLI send a live request to hostnames
  whose CNAME matched no provider. The README promises it never does. The
  existing test for this used a hostname with no CNAME at all, so it could
  not tell the difference. It now uses one that points at an unknown host.
- **A URL scheme with a digit.** The regex that spots `scheme://` at the
  start of pasted input survived having `0-9` changed to `0-10` (which
  means 0, 1 and nothing else). A pasted `s3://blog.example.com` would then
  have been checked as the hostname `s3`.
- **Two lines of the text report** (exactly one clean hostname, and a "0
  hostnames could not be looked up" line on every run) had no test.

The one equivalent mutant sets a `truncated` flag on a result object that is
never read for that path.

Catch rate on these two files: 60% before the new tests, 100% after.
