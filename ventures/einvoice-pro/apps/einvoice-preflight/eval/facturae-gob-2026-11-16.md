# Facturae: the policy digest recomputed, and the government's own signed files (2026-11-16)

facturae.gob.es answered from this session (it did not on 2026-11-15), so two things
the signature check had only taken on trust were measured: the signature-policy
digest, and the check on signed files from a signer other than our own tests and
signxml.

Run: fetch the four files (URLs at the top of `eval/facturae-gob-check.mjs`) into a
fresh directory, then `node eval/facturae-gob-check.mjs <dir> --write <cases>` and
`python -I eval/facturae-gob-signxml.py <cases>` (signxml 5.3.0 in a venv). The files
are the Ministry's and are not committed. SHA-256 of the files measured:

| File | SHA-256 |
| --- | --- |
| Politica_Firma_formato_facturae_v3_1.pdf (policy31.pdf) | d752352f10640ef5292f066a7f63c70e695044cdafa5fdedd8183490a38303c7 |
| PoliticaFirmaFormatoFacturaev3_0.pdf (policy30.pdf) | 0da1757be0f421ad8c857e386ba9220c4afc6b2b6cde7832f4ab227f4041c356 |
| factura_ejemplo_31.xml (ejemplo31.xml) | f717710804035dd3d568bb7595473da569dcce79a3303249260a393ed23d7cf0 |
| factura2_ejemplo30.xml (ejemplo30.xml) | 6e2ca50ef10afdeb2ca0ef16bafd31162f62b3a155094fcec4949a2091f262ee |

## 1. The policy digest is of a 2008 revision the served file no longer equals

The v3.1 PDF served today is 45,735 bytes. Its SHA-1 is `f/LPQFpMc/ha+1dJ+Y5y11OPVnM=`,
not the `Ohixl6upD6av8N7pEvDABhEL6hM=` that every Facturae signer writes. The file is
three PDF revisions: a linearization stub, the 2008-01-29 document, and an
incremental update dated 2014-03-28 that rewrites the metadata (Title "Política de
firma , versión 3.0", Author "Minetur"; `pdfinfo` shows ModDate 2014-03-28). The
first 40,892 bytes, through the second `%%EOF\r\n`, hash to
`Ohixl6upD6av8N7pEvDABhEL6hM=`. So the pinned value is right, and it is the digest of
the document as published in 2008, not of today's download.

The v3.0 policy is the same: 85,743 bytes served (SHA-1 `n2iOk6rgsAbcLAYJIvQqnl0aLcI=`),
a 2014-03-28 update appended, and its first 80,176 bytes hash to
`HQvPemjDslVpcNmaJPpbHzhdZ50=`, the value the government's own v3.0 example writes.

| PDF | Revision ends (bytes) | SHA-1 per revision | Signers write |
| --- | --- | --- | --- |
| v3.1 | 601, 40,892, 45,735 | WKN8H81p..., **Ohixl6up...**, f/LPQFpM... | Ohixl6up... (revision 2) |
| v3.0 | 817, 80,176, 85,743 | JXm+Olbl..., **HQvPemjD...**, n2iOk6rg... | HQvPemjD... (revision 2) |

The policy's own sample QualifyingProperties (page 4 of v3.1, also in v3.0) prints a
third value, `xmfh8D/Ec/hHeE1IB4zPd61zHIY=`, which is neither.

What changed in `facturae-signature.mjs`:

- ES-SIG-11 knows the 2008 revision's SHA-256, SHA-384 and SHA-512 digests as well as
  SHA-1 (the policy's section 6 admits every XML-DSig hash algorithm), so a signer
  that hashes the policy with SHA-256 is checked instead of skipped. The fix still
  recommends the SHA-1 value, the one Facturae signers write. Whether FACe accepts a
  SHA-256 policy hash was not tried.
- A SigPolicyHash equal to the digest of today's whole PDF (any of the four
  algorithms), to the page-4 example, or to the other version's digest is named as
  such in the message.
- The v3.0 policy is known (both URL spellings: the government's example writes it
  with spaces): still a warning (ES-SIG-10, superseded), but its hash is now checked
  against the v3.0 digest.

## 2. Two signed files from the Ministry's own signer

`factura_ejemplo_31.xml` (Facturae 3.1, XAdES 1.3.2) and `factura2_ejemplo30.xml`
(Facturae 3.0, XAdES 1.2.2), both RSA-SHA1 with inclusive C14N and three references,
certificates from the MITyC DNIe test CA. Each run as published and with four
mutants. Ours against signxml 5.3.0 (certificate date check off in signxml only;
both certificates expired before 2010):

| File | Case | Ours (errors) | signxml | Agree |
| --- | --- | --- | --- | --- |
| ejemplo31 | as published | none (warning ES-SIG-12) | valid | yes |
| ejemplo31 | InvoiceTotal edited | ES-SIG-03 | InvalidDigest, whole document | yes |
| ejemplo31 | a space in FileHeader | ES-SIG-03 | InvalidDigest, whole document | yes |
| ejemplo31 | SignatureValue character flipped | ES-SIG-04 | InvalidSignature | yes |
| ejemplo31 | SigningTime edited | ES-SIG-03 | InvalidDigest, SignedProperties | yes |
| ejemplo30 | as published | none (warning ES-SIG-10) | valid | yes |
| ejemplo30 | InvoiceTotal edited | ES-SIG-03 | InvalidDigest, whole document | yes |
| ejemplo30 | a space in FileHeader | ES-SIG-03 | InvalidDigest, whole document | yes |
| ejemplo30 | SignatureValue character flipped | ES-SIG-04 | InvalidSignature | yes |
| ejemplo30 | SigningTime edited | ES-SIG-03 | InvalidDigest, SignedProperties | yes |

**10 of 10 agree.** The v3.1 file passes ES-SIG-11 with the pinned SHA-1; before
this change the v3.0 file's hash was not checked at all, now it passes against the
v3.0 digest.

One finding is the example's own fault, not ours: `factura_ejemplo_31.xml` was signed
2009-02-25T12:34:42+01:00 with a certificate valid to 2009-01-31, so ES-SIG-12 warns
that the signing time is outside the certificate's validity. That is true of the file
as published.

Not done: a real business's signed file and a FACe verdict on it; whether FACe
accepts a SHA-256 SigPolicyHash; the certificate chain (the MITyC test CA is not a
production one); ECDSA keys. Tests: `facturae-signature.test.mjs` (21 → 22, one new and one extended: the
2008 revision's four digests pass, today's whole-file digests and the page-4 example
are named, an unknown algorithm is skipped, v3.0 with its own digest is a warning
only and with v3.1's an ES-SIG-11 error).
