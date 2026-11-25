---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): restricted PDFs go into backup packets and the PDF SOV import

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#121.

**What landed.** Two roadmap items at once ("Backup packets, part 2" and "SOV import from a PDF,
part 2": PDFs encrypted with an empty user password). Bank statements, insurance certificates,
supplier invoices and LibreOffice or Acrobat "restrict editing" exports open in any viewer without
a password, but they are encrypted with an owner password. Before this PR the backup packet listed
them as "send separately" and the PDF schedule-of-values import and opening-balance fill refused
them. Now they go in page for page.

**Why a buyer cares.** The stored-materials invoice and the certificate of insurance are the backup
a GC asks for most often. They tend to arrive as restricted PDFs from a supplier's or insurer's
portal. A packet that leaves them out sends the sub back to emailing attachments one by one.

**Design choices to keep.**

- `src/shared/pdf/crypt.ts` holds the Standard security handler: revisions 2-4 (RC4 40-128 bit,
  AES-128 with crypt filters) and 5-6 (AES-256). MD5, RC4 and AES-CBC decryption are plain
  TypeScript, so the reader stays synchronous. SHA-2 and the revision 6 hash (Algorithm 2.B) go
  through Web Crypto. There is no new dependency, and it runs in the browser and the Worker.
- The reader decrypts each object as it reads it. Cross-reference streams, the encryption
  dictionary and metadata under `/EncryptMetadata false` are left alone, and `/Identity` crypt
  filters are dropped. The recovery scan now finds the trailer (with `/Encrypt` and `/ID`) before
  it reads any object, so a damaged encrypted file decrypts too.
- A file that needs a password to open is still refused ("needs a password to open"). PayApps never
  asks for a password or tries one. Certificate and plug-in handlers are named and refused.
- The permission flags are not enforced. pdf.js, poppler and qpdf don't enforce them for reading
  either, and the pages are the contractor's own backup, copied unchanged.

**Verification.** New `src/shared/pdf/crypt.test.ts`:
- the primitives match Node's MD5 and AES and the published RC4 test vectors;
- five pypdf-encrypted copies of the SOV example give text and imports identical to the original;
- a LibreOffice 24.2 restricted export (RC4-128) imports its 90 lines identically;
- the file with a user password is refused, a damaged xref plus encryption still decrypts, and a
  certificate handler is named.

In the packet tests, the decrypted copy re-reads as unencrypted, and `assemblePacket` includes the
restricted file and lists the locked one with the new advice. As a manual check, packets of all
five encrypted variants were rendered with poppler, and they matched packets of the unencrypted
files pixel for pixel.

Private Actions gave the CI job no runner (it finished in 3 s with no logs). So every step of
`payapps-ci.yml` that this change reaches was run locally after merging main: `biome ci` (one
existing warning in billing), `pnpm typecheck`, unit tests (432 passed), worker tests (250 passed
before the merge, and again after it), `pnpm build` and `scripts/provision.test.mjs`. There is no
schema change.

**Overlap.** PRs 119 (G702 summary tab) and 120 (QuickBooks item per line) merged while this ran.
The only conflict was in ROADMAP, where both entries were kept.

**Next, from the roadmap.** Backup packets part 3: HEIC and WebP photos, ordering by drag, and
LZW-compressed object streams. The fixtures script (`test/fixtures/pdf-sources/encrypt-fixtures.py`)
makes more encrypted cases when they are needed.
