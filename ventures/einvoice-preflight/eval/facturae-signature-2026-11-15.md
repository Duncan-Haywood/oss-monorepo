# Facturae XAdES signature check against signxml (2026-11-15)

What was measured: whether `facturae-signature.mjs` (with `xmldsig.mjs` and
`c14n.mjs`) accepts and rejects the same signed Facturae files as signxml 5.3.0, a
second XAdES implementation (Python, lxml/libxml2 for C14N, `cryptography` for RSA).

## How

1. `eval/facturae-signxml.py fixtures/facturae/valid-322.xml <dir>` makes three
   fresh RSA keys (2048, 3072, 2048 bits) with self-made certificates, and signs the
   fixture with signxml's `XAdESSigner` under the Facturae v3.1 policy (role
   `emisor`) for 30 combinations: RSA-SHA1/SHA1, RSA-SHA256/SHA256,
   RSA-SHA384/SHA384, RSA-SHA512/SHA512, RSA-SHA256 with SHA-512 digests, each with
   C14N 1.0, C14N 1.1 and exclusive C14N, each with both key sizes. Each signed file
   gets five mutants: an amount edited (`1060.00` to `1060.01`), the SigningTime year
   changed, one SignatureValue character flipped, the certificate replaced with
   another key's, and a re-indent inside `FileHeader`. signxml's `XAdESVerifier`
   (certificate pinned, Facturae policy expected, three references expected) gives
   its verdict on all 180 files.
2. `node eval/facturae-signature-corpus.mjs <dir>` runs our check on each file and
   counts a file as rejected when it has any error-level finding.

## Result

**180 of 180 verdicts agree** (7.8 ms a file in Node, most of it BigInt SHA-512).

| Files | signxml | Ours |
| --- | --- | --- |
| 20 clean, inclusive C14N 1.0/1.1 | valid | no finding |
| 10 clean, exclusive C14N | InvalidDigest, reference 1 | ES-SIG-03 on the SignedProperties and KeyInfo references, with the exclusive-C14N hint |
| 30 amount edited | InvalidDigest, reference 0 | ES-SIG-03 on the invoice reference |
| 30 SigningTime edited | InvalidDigest, reference 1 | ES-SIG-03 on SignedProperties |
| 30 SignatureValue flipped | InvalidSignature | ES-SIG-04 |
| 30 certificate swapped | InvalidDigest | ES-SIG-03 (KeyInfo) + ES-SIG-04 + ES-SIG-08 |
| 30 re-indented | InvalidDigest, reference 0 | ES-SIG-03 on the invoice reference |

## The exclusive-C14N files: a signxml signer fault, found by the comparison

signxml's verifier rejects ten of its own signer's clean files: every one signed with
exclusive C14N. The SignedProperties and KeyInfo references carry no `Transforms`,
which per XML-DSig means the node set is canonicalized with inclusive C14N 1.0, but
the signer digested them with exclusive C14N. Recomputed with lxml on one file
(`s10-rsa_sha256-sha256-exclusive...-2048`):

| Reference | inclusive C14N (lxml) | exclusive C14N (lxml) | DigestValue written |
| --- | --- | --- | --- |
| SignedProperties | `flJVPXKw...` | `C7bVcb9j...` | `C7bVcb9j...` |
| KeyInfo | `ehrkrjvD...` | `GqfpELl6...` | `GqfpELl6...` |

Our recomputed inclusive digests (`flJVPXKw...`, `ehrkrjvD...`) equal lxml's byte for
byte, which also checks our C14N against libxml2's on these elements. The check
now says so in the finding: when a digest fails but matches under the other C14N
family, ES-SIG-03 names the undeclared transform. That is the fault a home-built
Facturae signer is most likely to have, and a platform's "firma no válida" does
not say which reference broke.

## Limits

- One invoice body (the 3.2.2 fixture) and one signer family. The unit tests add a
  second layout (the one Facturae signers such as Facturae-PHP write: SignedInfo
  Id, KeyInfo with line-wrapped base64, `ds:Object` holding QualifyingProperties)
  signed with node:crypto, in 21 tests.
- No real business's signed Facturae file and no FACe verdict. Facturae-PHP's own
  signer was not run here (this session does not run its bundled test certificate).
- The policy hash (SHA-1 `Ohixl6upD6av8N7pEvDABhEL6hM=`) was not recomputed from the
  policy PDF: facturae.gob.es did not answer from this session. It is the value
  written by FirmaXadesNet (ctt-gob-es), Odoo, OCA l10n-spain, Facturae-PHP and
  signxml's README.
- Not checked: certificate chain, revocation, XAdES-T timestamps.
