# Certificate Chain Check

**Live:** https://marisstella.app/cert-chain-check/ · guide:
[certificate chain errors explained](https://marisstella.app/cert-chain-check/certificate-chain-errors-explained.html)

Paste a `fullchain.pem`, a CA bundle, the output of
`openssl s_client -showcerts`, or open `.pem`/`.crt`/`.cer`/`.der` files. The
tool puts the certificates in chain order, verifies every signature, and
tells you what TLS clients will refuse:

- **a missing intermediate**, the case where a site works in Chrome (which
  fetches or caches intermediates) while `curl`, Python, Java, Go and API
  clients fail with *unable to get local issuer certificate*;
- **the wrong intermediate**: one with the right name but another key (a
  re-keyed, renewed or cross-signed CA), found by comparing the authority and
  subject key identifiers;
- **order, strays, duplicates and an included root**, with the corrected
  chain printed (server certificate first, then intermediates, no root);
- **broken links**: a signature that does not verify, an issuer that is not a
  CA, lacks `keyCertSign` or exceeds its `pathlen`;
- **the name**: whether a hostname or IP is covered, by browser rules (a `*`
  covers one whole left-most label, the subject CN is ignored, partial
  wildcards match nothing), and certificates with no subjectAltName;
- **dates**: expired, not yet valid, expiring within `--warn-days`, an
  intermediate that expires before the server certificate (the date the chain
  really stops working), and validity longer than the CA/Browser Forum allows
  for the issue date (398 days; 200 from 2026-03-15, 100 from 2027-03-15, 47
  from 2029-03-15, [ballot SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/));
- **use and crypto**: no `serverAuth`, a keyUsage without
  `digitalSignature`, RSA under 2048 bits, SHA-1/MD5 signatures, unusual
  curves, DSA, v1 certificates, negative serials, duplicate extensions,
  Certificate Transparency precertificates, missing SCTs and OCSP
  Must-Staple.

A pasted private key is skipped without being read, and flagged.

It is a static read of the certificates you give it, **not a security audit**.
It does not see which roots each client trusts, revocation, which certificate
the server sends for each name (SNI), or protocols and cipher suites.

## Use it

In the browser: open the page, paste, click Check. Nothing is uploaded; the
page makes no network calls. Signatures are checked with the browser's Web
Crypto API.

As a CLI (Node 18+, no dependencies; copy `check.mjs`, `scan.mjs` and
`x509.mjs`):

```sh
node check.mjs fullchain.pem --host www.example.com
openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null \
  | node check.mjs - --host example.com            # what the live server sends
node check.mjs cert.pem chain.pem --fix > fullchain.pem
node check.mjs fullchain.pem --at 2027-03-01        # as of a date
node check.mjs fullchain.pem --format json
node check.mjs fullchain.pem --warn-days 21 --fail-on-risk   # exit 2 on an error, high or medium finding
```

`--fail-on-risk` makes it a CI gate before certificates go to a load
balancer, a Kubernetes secret or an appliance.

## How it reads certificates

- **DER and X.509** (`x509.mjs`): a DER reader per ITU-T X.690 (definite
  lengths only, as DER requires) and the certificate profile of
  [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280): version, serial, both
  signature algorithm fields, names (printed in RFC 4514 order and escaping),
  UTCTime/GeneralizedTime, the public key (RSA modulus size, EC curve, Ed25519,
  DSA), and the extensions basicConstraints, keyUsage, extendedKeyUsage,
  subjectAltName (DNS, IP v4/v6, email, URI, directory names), subject and
  authority key identifiers, Authority Information Access, CRL distribution
  points, certificate policies, embedded SCT lists, the precertificate poison
  and the TLS Feature (Must-Staple) extension. Written from the RFCs; no code
  copied.
- **Chain building** (`scan.mjs`): the server certificate is the first one
  that issues none of the others; each issuer is a certificate whose subject
  equals the child's issuer (byte-for-byte, or RFC 5280 7.1-style
  case-and-space-insensitive) and whose subject key identifier matches the
  child's authority key identifier when both are present. Among several
  candidates, the one whose key verifies the signature wins.
- **Signatures**: Web Crypto, in the browser and in Node: RSASSA-PKCS1-v1_5
  with SHA-1/256/384/512, RSA-PSS (parameters read from the certificate),
  ECDSA on P-256/P-384/P-521 (the DER signature converted to the raw form Web
  Crypto takes), and Ed25519. Anything else is reported as
  `signature-unchecked`, never as passing.
- **Hostnames**: [RFC 6125 6.4.3](https://www.rfc-editor.org/rfc/rfc6125#section-6.4.3)
  as browsers apply it; IPv6 addresses compared in canonical form.

## How it was checked

Against **OpenSSL 3.0.13** (Ubuntu 24.04), three ways:

1. **Generated chains** (`tools/gen-fixtures.mjs`, `parity.test.mjs`): 37
   certificates made with `openssl ca` (RSA 1024 to 3072, RSA-PSS, P-256,
   P-384, P-521, secp256k1, Ed25519; SHA-1 to SHA-512; exact start and end
   dates; CA and leaf extension sets, including broken ones). For every
   certificate, subject, issuer (RFC 2253), serial, both dates, SHA-256
   fingerprint, key algorithm and size, curve, signature algorithm,
   subjectAltName, basicConstraints, keyUsage, extendedKeyUsage and both key
   identifiers equal what `openssl x509` prints. For the 30 chains, every
   error `openssl verify -purpose sslserver -attime` reports (codes 7, 9, 10,
   20, 25, 26, 32, 79) is matched by a finding naming the same fault, and no
   chain fault is reported where `openssl verify` passes. 25 host and IP
   checks agree with `openssl x509 -checkhost`/`-checkip` except the two
   cases browsers decide differently and the test names: a certificate with
   no subjectAltName (OpenSSL falls back to the CN) and a partial wildcard
   `w*.example.test` (OpenSSL accepts it).
2. **Real roots** (`roots.test.mjs`): all 120 certificates in Ubuntu's
   `/etc/ssl/certs/ca-certificates.crt` read with the same subject, serial,
   fingerprint and expiry as `openssl x509`, and all 120 self-signatures
   verify with Web Crypto. The test skips on a machine without a bundle or
   `openssl`.
3. **Behaviour** (`scan.test.mjs`): private keys never echoed, `s_client`
   output, DER and bare base64 input, junk and truncated input, wildcard and
   IPv6 edge cases, the SC-081v3 date boundaries, and the `--fix` output
   re-checked clean.

Where the checker and OpenSSL's `verify` differ on purpose: OpenSSL at its
default settings accepts SHA-1 signatures, 1024-bit RSA and secp256k1 keys in
`verify`; browsers do not, so the checker reports them. A wrong-order file
fails `openssl verify` because OpenSSL takes the first certificate as the
server's.

No public server's live chain was checked when this was built; the real
certificates tested are the roots above.

## Files

- `x509.mjs`: DER, X.509 and PEM reading.
- `scan.mjs`: chain building, signatures, hostnames and findings (`TYPES`).
- `check.mjs`: the CLI.
- `index.html`, `certificate-chain-errors-explained.html`: the pages.
- `usage.mjs`: local-only feature counters with an opt-out.
- `fixtures/`, `tools/gen-fixtures.mjs`: the parity data and its generator.

## Licence

MIT. Not affiliated with the OpenSSL project, the CA/Browser Forum or any
certificate authority.
