---
title: "SHA-512 without BigInt: the Facturae signature check got seven times faster"
seo_title: "SHA-512 in JavaScript: BigInt words vs 32-bit halves, measured"
date: 2026-11-16
tags: [performance, javascript, e-invoicing, facturae, cryptography]
description: "Our in-browser Facturae XAdES check hashed with BigInt SHA-512. Two 32-bit halves per word took a check from about 12 ms to 1.7 ms, same bytes."
---

The [e-invoice preflight](../../ventures/einvoice-preflight/) checks a Spanish
Facturae file's XAdES signature in your browser: it recomputes every signed
digest and verifies the RSA signature, without uploading anything. To work
without a server, it carries its own SHA-1, SHA-256 and SHA-512.

The SHA-512 was written the obvious way for modern JavaScript: each 64-bit word
a `BigInt`, rotations as `(x >> n) | (x << (64n - n))`, a mask after every
addition. Its own comment called it "slow but small inputs". A CPU profile of
the signature tests showed how slow: 1.8 s of a 2.6 s run was inside that one
function. Each BigInt operation allocates, and SHA-512 does a few thousand of
them per 128-byte block.

The fix is the long-standing trick from before `BigInt` existed: keep each
64-bit word as two 32-bit halves in an `Int32Array`, write each rotation as
two shifts across the halves, and add the low halves as ordinary numbers so
the carry is `Math.floor(lo / 2**32)`. Up to five 32-bit terms sum exactly in a
double, so nothing is lost.

Measured on the same machine:

- SHA-512 of a 40,892-byte file: 24.6 ms before, 1.8 ms after.
- One full signature check of a signed Facturae file: about 12 ms before,
  1.7 ms after.
- The signature test file: 2.6 s before, 1.0 s after.

"Same answers, faster" was checked against Node's own `crypto`: 3,624 random
inputs of every length from 0 to 600 bytes and a few large ones, SHA-512 and
SHA-384, all equal byte for byte, and equal to the old BigInt version.

BigInt is the right tool for the RSA and elliptic-curve arithmetic the same
checker does, where the numbers really are 2,048 bits. For a hash built from
fixed 64-bit words it is the wrong one. The full reading and what we left
alone are in
[the perf note](../history/ci-perf-2026-11-16-einvoice-sha512-halves.md).
