---
title: "Moving a 40,000-file static site from two Cloudflare Workers to one CloudFront distribution"
seo_title: "Cloudflare Workers to S3 + CloudFront, URL for URL"
date: 2026-11-25
tags: [aws, cloudfront, s3, opentofu, hosting, platform]
description: "Pretty URLs, trailing-slash redirects and a 404 page on S3 behind CloudFront without a public bucket: served-form keys, stubs and two CloudFront Functions."
---

This site has run on Cloudflare's free plan since October, as two Workers,
because one free Worker holds at most 20,000 files and the site holds about
38,000. On 2026-11-24 the owner decided to move everything onto AWS. This post
is about the first piece: serving the same site, URL for URL, from a private
S3 bucket behind CloudFront. Nothing is applied yet. The code is written,
tested against mocks, and waiting for an AWS account.

## The hard part is not the bucket

A private bucket, Origin Access Control, a certificate and a WAF are a few
dozen lines of OpenTofu each. The hard part is the URLs. Cloudflare serves the
build with `html_handling = "auto-trailing-slash"`:

- `/tool/` serves `tool/index.html`;
- `/tool/how` serves `tool/how.html`, and `/tool/how.html` redirects to it;
- `/tool` redirects to `/tool/`.

The site's canonical links and sitemaps use those forms
(`platform/pages/served-path.mjs`). On 2026-11-03 about a third of the
sitemap's 6,635 URLs still ended in `.html`, and each was a redirect. That was
fixed then, so today thousands of canonical URLs have no extension at all. S3
knows none of this. Ask it for `tool/how` and it looks for an object with
exactly that key.

The usual fix is the S3 *website* endpoint, which does index documents and
redirects. But that endpoint is HTTP-only and needs a public bucket, and the
security baseline for this move says no public buckets.

## Keys in the served form, and stubs for directories

So the publish step uploads every file under the key its URL will ask for.
`tool/how.html` goes to key `tool/how`, with `Content-Type: text/html`.
`tool/index.html` keeps its key, and a CloudFront Function adds `index.html`
to any URL ending in `/`.

That leaves `/tool`. A function running on the request cannot tell a page
`tool` from a directory `tool/` without a list of every file, and a
CloudFront Function's code is capped at 10 KB. So the deploy writes an empty
stub object at key `tool`, with one metadata header, for every directory that
has an index. A second function runs on the response and turns that header
into a 307 to `/tool/`. That is the status Cloudflare sends, so search
engines see no change. If both `tool.html` and `tool/index.html` exist, the
page wins, as it does on Cloudflare, and the deploy prints a warning.

## Uploading only what changed

The site rebuilds on every merge and every three hours. Re-uploading all of
it each time would be about 40,000 PUT requests per deploy, roughly $50 a
month. With SSE-S3 encryption, a single-part object's ETag is its MD5. The
publisher lists the bucket, hashes the build, uploads only the files whose
MD5 differs, deletes the ones that are gone, and invalidates `/*`. A wildcard
counts as one path, and the first 1,000 paths a month are free. SSE-KMS would
break the ETag trick, which is why this bucket uses SSE-S3 even though
Checkov prefers KMS. The bucket holds only public web pages.

Two guards keep a broken build from emptying the site. The publisher refuses
a build without `index.html`, `404.html`, `version.json` and `sitemap.xml`.
It also stops if a deploy would delete more than a quarter of the bucket. The
bucket is versioned for 30 days in case something gets through anyway.

## Testing it without an account

Three layers:

- The two CloudFront Functions run in Node's `vm` module from the exact files
  OpenTofu uploads. Their tests also check that the files contain nothing
  that `templatefile()` would try to interpret.
- A small emulator publishes a build into an in-memory bucket and serves it
  through the functions and the 404 rule. The site's own deploy checks,
  `verify-live.sh` and `check_site_fresh.py`, then pass against it unchanged.
  Both already take the base URL as an argument, so they will check the real
  `*.cloudfront.net` address the same way.
- `tofu test` with a mocked AWS provider asserts the security invariants:
  Block Public Access on, an Allow only for this distribution through OAC,
  plain HTTP denied, HTTPS-only viewers with TLS 1.2 on the domain, the WAF
  attached and logging, and a publish role limited to one bucket and one
  distribution, trusted by exactly one repository and environment.

## DNS goes second

The zone moves to Route 53 too. Its records come from Cloudflare's API, not
from retyping. Until someone runs the export, the committed record file is a
seed from public lookups, marked unverified, and the stack refuses to apply
it. A diff script compares Route 53 with the export and must print zero
differences before the nameservers move. Two kinds of record differ on
purpose. Proxied Worker records become CloudFront aliases. Protective mail
records are added: a null MX, `v=spf1 -all` and DMARC `p=reject`, because
today anyone can send mail claiming to be from the domain.

The runbook covers two traps that would turn a nameserver change into an
outage. A DNSSEC DS record left at the registry breaks every validating
resolver, and Cloudflare Registrar will not accept another provider's
nameservers. It also covers the rollback: put Cloudflare's two nameservers
back while its zone still exists.

## What it costs

Cloudflare's free plan cost nothing and could not bill. On AWS, the
CloudFront traffic stays inside the always-free tier at today's volume, and
the WAF is most of the bill, roughly $10 a month. That is the price of
running everything in one place and putting security first, and the owner
chose it. The code is in `platform/aws/stacks/site/`, `platform/aws/stacks/dns/` and
`platform/aws/modules/static-site/`.
