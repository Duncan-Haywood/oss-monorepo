---
title: "Quality fix: the email checker now reads DKIM keys instead of only checking one is there"
seo_title: "Quality fix: email checker parses DKIM key size and type"
date: 2026-11-16
tags: [quality-audit, email, dns]
description: "A 512-bit or truncated DKIM key used to count as valid. The checker now parses key type and size, ignores a redirect= beside all, and tests every limit's edge."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It took the [email authentication checker](../../ventures/email-auth-check/README.md),
whose [2026-11-15 audit](../../portfolio/quality/audits/2026-11-15-email-auth-check.json)
left eight defects open after two earlier fixes landed. All eight are fixed in one PR.

## What was wrong

- **Any non-empty `p=` counted as a valid DKIM key.** A 512-bit key, a truncated key,
  `k=dsa`, `v=DKIM2` and `p=not*base64!` were all reported as "valid public key".
  RFC 8301 s3.2 says verifiers must not accept signatures from RSA keys under 1024 bits,
  so a domain with one of these keys was told its DKIM worked when every signature fails.
- **`redirect=` was counted even when the record also has `all`.** RFC 7208 s6.1 says
  the redirect is then ignored. Counting it could push a record past 10 lookups and
  produce a false PermError.
- **No test sat on any limit's edge.** The only lookup-chain test used 11 lookups, so
  changing `> 10` to `>= 10`, or moving the near-limit notice from 8 to 7, left every
  test green.
- Smaller ones: `pct=50abc` was read as 50, `adkim=x` and `sp=bogus` were accepted
  without a word, `ptr` was never flagged, a record ending in `redirect=` showed no
  `all` verdict at all, and the scope note said `mx` hosts cost extra lookups. They
  don't: RFC 7208 s4.6.4 keeps those address queries out of the 10.

## What changed

The checker now decodes `p=` and reads the RSA modulus length from the DER bytes. It
accepts both the SubjectPublicKeyInfo form the RFC specifies and the bare PKCS#1 form
some publishers use, and it checks that an ed25519 key is 32 bytes. Run live against
hubspot.com, it reported the `google` selector's key as 1024 bits. `openssl pkey` on the
same base64 also says `Public-Key: (1024 bit)`. That key passes the floor and now gets a
note to rotate to 2048. The same run shows hubspot.com's `-all`, read through its
`redirect=` to `_hspf.hubspot.com`; before the fix the report showed no `all` verdict for
that domain.

A new test file, `rfc-boundaries.test.mjs`, tests each threshold on its edge: 10 and 11
lookups, 7 and 8, pct 99 and 100, 512 and 1024 bits. Six seeded mutants, one per
threshold or branch, now each fail a test. The page text no longer says that a record
over the limit fails "for every message, for every receiver". Lookups are counted as
the record is evaluated, so a message that matches an early term still passes.

## What is still not at the bar

The checker still doesn't check the separate cap of 10 MX hosts per `mx` term, and it
still guesses DKIM selectors from a fixed list of nine. The audit scores stay as they
were. A later round re-audits the subject in a new file.
