---
title: "Why FACe says \"firma no válida\": checking a Facturae signature before you send it"
seo_title: "Facturae XAdES signature validator: verify a signed invoice offline"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Our free checker now verifies the XAdES-EPES signature on a Spanish Facturae file in the browser, and agreed with signxml on all 180 signed and broken files."
---

A Facturae invoice for a Spanish public body has to be signed before it goes to FACe or a regional hub. The signature is XAdES-EPES under the Facturae signature policy. When something is wrong with it, the platform tends to say only "firma no válida" (invalid signature). That leaves you guessing whether the certificate, the signer or the file is at fault.

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) now checks the signature on your own machine, in the browser, with no upload and no dependency. This morning it learned to read Facturae's structure and totals. Now, when you drop in a signed file, it also:

- **recomputes every signed digest.** If the invoice was changed after signing, the checker says which part changed: the invoice itself, the signed properties or the certificate block. Editing an amount counts, and so does re-indenting the XML or letting an editor re-save it. This is the most common reason a signed file stops verifying.
- **verifies the signature value** with the certificate in the file. RSA with SHA-1, SHA-256, SHA-384 or SHA-512 is supported, with inclusive or exclusive canonicalization.
- **checks the XAdES-EPES parts the policy asks for:**
  - the signed properties are themselves signed;
  - `SigningCertificate` names this certificate by digest and by issuer and serial number;
  - the policy is Facturae v3.1, with the right hash;
  - the signing time falls inside the certificate's validity;
  - the signer role is one the policy names.

It does not check the certificate chain back to FNMT or another CA, or whether the certificate has been revoked. That needs the CAs' keys and a network call, and the result says so instead of passing it silently.

## How we checked it

We needed a second XAdES implementation to compare against, so we used [signxml](https://github.com/XML-Security/signxml), a Python library that canonicalizes with libxml2. A script makes fresh RSA keys and signs our sample Facturae invoice 30 ways:

- five pairs of signature and digest algorithms;
- three canonicalization methods;
- two key sizes.

It then breaks each signed file five ways: it edits an amount, edits the signing time, flips one character of the signature, swaps in another certificate, and re-indents a line. signxml's own verifier gives its verdict on all 180 files, and so does ours.

They agreed on all 180.

## A bug the comparison found

signxml's verifier rejected ten files that its own signer had just made: every file signed with exclusive canonicalization. The cause turned out to be one of the most common mistakes in hand-built signers.

An XML signature lists references, the parts of the file it covers. A reference can name the canonicalization to apply before hashing. If it names none, the standard says to use inclusive canonicalization. signxml's signer hashed two references (the signed properties and the certificate block) with exclusive canonicalization but wrote no transform saying so. A verifier that follows the standard computes a different digest, so the signature fails.

We recomputed both digests with libxml2. The written values were the exclusive ones, and our inclusive digests matched libxml2's byte for byte, so this also tested our canonicalization. The checker now says this in plain words: when a digest fails but would match under the other canonicalization, it tells you the signer used one and declared the other. If you wrote your own Facturae signer and FACe rejects it, that sentence may save you an afternoon.

## What is still open

We have not run the check on a real business's signed Facturae file, and we have no FACe verdict to compare it with. We could not reach facturae.gob.es from our build machine, so we did not hash the policy PDF ourselves. The policy hash we check is the one written by five independent implementations: the Spanish government's own FirmaXadesNet, Odoo, OCA's l10n-spain, Facturae-PHP and signxml. If you have a signed file that FACe rejected and are willing to share it with the amounts blanked, it would be the most useful next test.

The full rule list and measurements are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) and in `eval/facturae-signature-2026-11-15.md`.

*E-invoice preflight is a free, MIT-licensed tool. Its checks are offline observations, not an acceptance decision by FACe or any tax authority, and not legal or tax advice.*
