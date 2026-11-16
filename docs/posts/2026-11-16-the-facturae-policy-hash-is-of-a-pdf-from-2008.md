---
title: "The Facturae signature policy hash belongs to a PDF revision from 2008"
date: 2026-11-16
tags: [einvoice-preflight, ventures]
description: "Every Facturae signer writes the same policy hash, and the PDF served today does not match it. The 2008 revision inside the file does."
---

A Spanish Facturae invoice sent to FACe is signed XAdES-EPES. That signature names a signature policy, the PDF *Política de firma formato FacturaE v3.1*, and carries that PDF's SHA-1 digest in a `SigPolicyHash` element. Every signer we know of writes the same value: `Ohixl6upD6av8N7pEvDABhEL6hM=`. The Spanish government's FirmaXadesNet does, and so do Odoo, OCA, Facturae-PHP and signxml's documentation.

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks Facturae signatures offline, and that value was pinned in the code with a note saying nobody had recomputed it: facturae.gob.es had not answered from our sessions. Today it did.

## The download doesn't match

The v3.1 PDF on facturae.gob.es is 45,735 bytes, and its SHA-1 is `f/LPQFpMc/ha+1dJ+Y5y11OPVnM=`. That is not the value signers write.

It turns out the PDF was changed in 2014, though not its text. A PDF can be updated by appending to the end of the file, and this one was: an incremental update dated 2014-03-28 rewrites the metadata (the title now says "versión 3.0", the author "Minetur"). The original 2008 document is still in the file, byte for byte. Hash just the first 40,892 bytes, up to the end of the 2008 revision, and you get `Ohixl6upD6av8N7pEvDABhEL6hM=` exactly.

The v3.0 policy shows the same thing. Today's file hashes to `n2iOk6rg...`, and its first 80,176 bytes hash to `HQvPemjDslVpcNmaJPpbHzhdZ50=`. The Ministry's own signed v3.0 example invoice writes that second value.

The policy text also carries a third value, in its sample XML on page 4: `xmfh8D/Ec/hHeE1IB4zPd61zHIY=`. That one is an illustration and matches nothing.

So if you build a signer by downloading the policy and hashing it, which is what XAdES-EPES suggests you do, you get a value no other signer writes. The checker now says so in plain words. If your `SigPolicyHash` is the digest of today's whole file, or the page-4 sample, or the other version's digest, the message tells you which one it is and gives the right value.

## Other changes to the check

- **SHA-256 and the larger hashes.** Section 6 of the policy accepts any XML-DSig hash algorithm. The checker used to skip a policy hash that wasn't SHA-1. It now knows the 2008 revision's SHA-256, SHA-384 and SHA-512 digests and checks them. We still recommend SHA-1, because that is what every signer writes. We haven't tested whether FACe accepts a SHA-256 policy hash.
- **v3.0 signatures.** The superseded v3.0 policy is still a warning, but its hash is now checked against the v3.0 digest. Before, it was not checked at all.

## The Ministry's own signed invoices

facturae.gob.es also publishes two signed example invoices, one for Facturae 3.1 and one for 3.0. They were signed with certificates from the ministry's DNIe test CA. These are the first signatures we have tried from a signer we didn't write. We ran each one as published, plus four broken copies: an amount edited, a space added, one character of the signature value changed, and the signing time edited. Then we compared our verdicts with signxml's, an independent Python implementation.

They agreed on all 10. Both originals verify. Each broken copy fails, with the same reason given by both tools.

The 3.1 example also has a real fault, though it doesn't stop the signature verifying. It was signed on 2009-02-25, and its certificate expired on 2009-01-31. The checker warns about this.

## What this does not show

A test-CA example from 2009 is not a business's invoice from 2026, and none of this is a FACe verdict. The checker still doesn't check the certificate chain, revocation or timestamps. The measurements, file hashes and the commands to rerun them are in `ventures/einvoice-preflight/eval/facturae-gob-2026-11-16.md`. The Ministry's files are not copied into the repository.

*E-invoice preflight is a free, open-source (MIT) tool. Its results are checks against published rules, not legal or tax advice. A clean report does not mean a tax authority or platform will accept the file.*
