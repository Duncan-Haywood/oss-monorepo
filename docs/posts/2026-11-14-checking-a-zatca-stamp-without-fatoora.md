---
title: "Checking a ZATCA stamp without Fatoora"
seo_title: "ZATCA invoice hash, QR code and signature check offline (KSA-STAMP)"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "ZATCA's rules check a Saudi e-invoice has a QR code and signature, not that they match it. We now recompute the hash and signature; 45 of 45 samples pass."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has run ZATCA's published validation rules on Saudi e-invoices for a few weeks: the BR-KSA set, version 3.4.6. Those rules have a blind spot. They check that an invoice *carries* a QR code and a cryptographic stamp (BR-KSA-27, -28, -29, -30, -60). They never check that the stamp belongs to the invoice.

Fatoora does check. If you built your own signer, the error you meet first is usually some form of "the hash does not match". Until today our checker passed such a file. Now it recomputes the stamp, in the browser, with nothing uploaded.

## What a ZATCA stamp is

A phase 2 invoice is UBL XML with three parts that depend on each other:

1. **The invoice hash.** Take the document out of the XML, minus the `ext:UBLExtensions` block, the `cac:Signature` element and the QR code's `AdditionalDocumentReference`. Canonicalize what remains with C14N 1.1, hash it with SHA-256, and write it in base64. The hash goes into the signature's `DigestValue` and into QR tag 6.
2. **The signature.** ECDSA on the secp256k1 curve, made with the key behind the taxpayer's CSID certificate.
3. **The QR code.** Base64 of tag-length-value fields: seller name, VAT number, timestamp, total, VAT, hash, signature, public key and, on a simplified (B2C) invoice, the signature on the certificate.

Each invoice also carries the hash of the one before it (PIH) and a counter (ICV), so a device's invoices form a chain.

## What we found on ZATCA's own samples

ZATCA's SDK ships 45 signed sample invoices for rules 3.4.6 and 2.3.8, and [phive-rules](https://github.com/phax/phive-rules) carries them as test files. We wrote the check in plain JavaScript: a C14N 1.1 writer, SHA-256, a small DER reader and secp256k1 verification over BigInt. It has to run on the page, and the browser's WebCrypto has no secp256k1. Then we ran it on all 45:

- **The hash matched on the first try, 45 of 45.** Removing the three subtrees and canonicalizing reproduces ZATCA's `DigestValue` exactly. Whitespace next to a removed element stays in, so pretty-printing a signed file breaks its hash. A test pins that.
- **ZATCA signs the hash bytes, not the XML-DSig SignedInfo.** The `SignatureValue` verifies over the 32 raw hash bytes on every sample. Over the hash's base64 text it fails. Standard XML-DSig would sign SignedInfo, so a generic signing library gets this wrong.
- **QR tag 4 is the amount payable, in ZATCA's own files.** The data dictionary says tag 4 is the total with VAT. On the five samples where that differs from the amount payable (three prepayment invoices and one with payable rounding), ZATCA's SDK wrote the amount payable. We accept either.
- **The ProfileID doesn't say whether an invoice is simplified.** Every sample says `reporting:1.0`. The `name` on InvoiceTypeCode does: `01…` for standard, `02…` for simplified. Only simplified invoices need QR tag 9.
- **The SignedProperties digest is not quite canonical XML.** The SDK declares namespaces where they are used, but writes empty elements self-closed and encodes the digest as base64 of its hex string. We accept that form and the standard ones.

The result: **45 of 45 with no stamp finding**, at about 3 ms a file. As a second opinion, we recomputed every hash and verified every signature with Node's built-in crypto, and it agreed on all 45.

## A bug in our own examples

The first run of the new check had something to say about our own made-up Saudi examples. Their QR code declared 13 bytes for the seller name "Acme Widgets", which is 12. That shifted every field after it. The old checks saw a QR code and passed it, and Fatoora would have rejected it. The examples are fixed.

## What it checks now

Twenty rule IDs, KSA-STAMP-01 to -20. The hash against the `DigestValue` and QR tag 6. The signature against the certificate's key. QR tags 1 to 5 against the seller name, VAT number, issue date and time and totals. Tags 7 to 9 against the signature, public key and certificate. The two XAdES digests. A certificate that had expired by the signing time is a warning. If you drop several invoices from one device together, it also follows the chain: each PIH against the hash of the invoice with the previous counter.

What it does not do: verify the certificate chain up to ZATCA's CA (it holds no CA keys and makes no network call), sign anything, or tell you Fatoora accepted the invoice. A clean result means the stamp is consistent with the file, nothing more. The details and every measurement are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight#zatca-stamp-hash-signature-and-qr-against-the-file-2026-11-14). The [Saudi Arabia page](https://marisstella.app/einvoice-preflight/saudi-arabia-zatca-e-invoice-mandate.html) says what the tool covers for ZATCA.

*Offline observations, not tax or legal advice, and not an acceptance by ZATCA.*
