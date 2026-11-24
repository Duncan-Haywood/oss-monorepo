---
title: "A certificate chain checker that agrees with OpenSSL, except where browsers don't"
seo_title: "Certificate chain checker vs OpenSSL"
date: 2026-11-24
tags: [tls, x509, developer-tools, parity]
description: "An in-browser X.509 chain checker matched OpenSSL 3.0 on 37 generated certificates, 30 chains and 120 Ubuntu roots, and differs where browsers do."
---

"It works in Chrome, but `curl` says *unable to get local issuer
certificate*" is one of the most common TLS questions on the web. The cause
is nearly always the same: the server sends its own certificate without the
intermediate that issued it. Browsers hide that by fetching or caching the
missing certificate; `curl`, Python, Java, Go and API clients do not.

The new [Certificate Chain Check](https://marisstella.app/cert-chain-check/)
reads a pasted `fullchain.pem`, a CA bundle or `openssl s_client -showcerts`
output in the browser, builds the chain, verifies every signature with Web
Crypto and says what clients will refuse. It also prints the chain in the
right order. Source and tests:
[`ventures/cert-chain-check/`](../../ventures/cert-chain-check/README.md).

## How it was checked

The engine is a DER and X.509 reader written from RFC 5280, with no
dependencies. To find out whether it reads certificates correctly, it was
compared with OpenSSL 3.0.13 three ways:

- **37 certificates generated with `openssl ca`**: RSA 1024 to 3072,
  RSA-PSS, P-256, P-384, P-521, secp256k1 and Ed25519 keys, SHA-1 to SHA-512,
  exact dates, and good and broken extension sets. Fifteen fields of each
  (names, serial, dates, fingerprint, key, signature algorithm, the main
  extensions) equal what `openssl x509` prints.
- **30 chains** run through `openssl verify -purpose sslserver`. Every error
  OpenSSL reports (eight distinct codes) is matched by a finding naming the
  same fault, and no chain fault is reported where OpenSSL passes.
- **All 120 roots in Ubuntu's CA bundle**, real certificates from real CAs:
  the same subject, serial, fingerprint and expiry as OpenSSL, and all 120
  self-signatures verify with Web Crypto.

All of it is recorded in the repository (`tests/fixtures/openssl.json`) and
re-checked by `node --test`.

## Where it must disagree

Matching OpenSSL everywhere would be wrong, because the checker's job is to
predict what *browsers and TLS clients* do, and OpenSSL's defaults differ in
four places the tests pin down:

1. **The common name.** For a certificate with no subjectAltName,
   `openssl x509 -checkhost` falls back to the subject CN and says the name
   matches. Chrome has ignored the CN since version 58, and Firefox, Safari
   and Go do too. Such a certificate passes an OpenSSL test and fails in every
   browser.
2. **Partial wildcards.** OpenSSL accepts `w*.example.test` for
   `www.example.test`. Browsers accept a `*` only as the whole left-most label.
3. **Weak crypto in `verify`.** At its default settings `openssl verify`
   passed a SHA-1-signed leaf, a 1024-bit RSA key and a secp256k1 key.
   Browsers refuse all three, so the checker reports them.
4. **Order.** `openssl verify` treats the first certificate in the file as
   the server's, so a file with the intermediate first fails with
   "unsuitable certificate purpose". That is the right outcome for a server
   that reads its chain file the same way, but for the wrong reason. The
   checker reports it as wrong order and prints the fixed file.

One case was a surprise while building the fixtures. A certificate signed by
a *different* key under the same issuer name (a re-keyed or cross-signed
intermediate) is not a "certificate signature failure" to OpenSSL when the
authority key identifier is present: it reports "unable to get local issuer
certificate", the same message as a missing intermediate. That is accurate,
since the right intermediate *is* missing, but it sends people looking for a
file they think they already have. The checker names the near miss instead:
the right name, a different key, and the URL to fetch the right one from.

## A rule with dates

Public TLS certificates are getting shorter-lived. Under CA/Browser Forum
[ballot SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/)
the maximum validity fell from 398 days to 200 on 15 March 2026, and falls to
100 days on 15 March 2027 and 47 days on 15 March 2029. The checker applies
the limit by the certificate's issue date and counts the period the way the
Baseline Requirements do, both ends included.

## What it cannot see

It reads certificates, not servers: not which roots a client trusts, not
revocation, not which certificate a server sends for each name. No live
public chain was checked while building it; the real certificates in the
tests are the roots. What would come next if people use it: reading PKCS#7
and PKCS#12 bundles, and checking a certificate against its private key
locally without the key ever leaving the user's machine.
