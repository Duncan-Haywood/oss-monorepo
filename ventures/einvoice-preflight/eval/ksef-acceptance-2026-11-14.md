# KSeF acceptance checks beyond the XSD (PL-018..PL-022), 2026-11-14

What KSeF checks on a file it receives, beyond the FA(3) XSD, as the Ministry of Finance
lists it in "Weryfikacja faktury" (CIRFMF/ksef-docs, `faktury/weryfikacja-faktury.md`,
dated 09.04.2026, read at commit ce3670e), and what `fa3.mjs` now does with each:

| KSeF check (document) | Rule here | Notes |
|---|---|---|
| XML 1.0, UTF-8 without BOM, prolog may not name another encoding, no processing instructions | PL-018 | Also refuses a file that is not valid UTF-8 (Windows-1250 bytes) and a UTF-16 file (decoded anyway so the rest is read). Needs the bytes: `report.mjs` now passes them, not the decoded text, because `TextDecoder` drops a BOM. |
| No "discouraged" Unicode characters (the listed ranges) | PL-019 | Plus characters XML 1.0 does not allow at all (U+0001, U+FFFE, lone surrogates), which this repo's lenient parser accepted silently and KSeF's parser refuses. Counted, first code point and line named, the text never echoed. Double-encoded Polish text (the usual source) gets an encoding fix rather than "delete them". |
| 1,000,000 bytes without attachments, 3,000,000 with | PL-020 | An attachment (`Zalacznik`) also gets a non-blocking note: batch session only, after enabling attachments in e-Urząd Skarbowy. |
| P_1 not later than the day KSeF receives the file | PL-021 | Compared with today's date in Europe/Warsaw. |
| NIP check digit for Podmiot1, 2, 3 and PodmiotUpowazniony; the NIP inside Podmiot3's IDWew (production only) | PL-002 | Podmiot1/2 were already checked; Podmiot3 and PodmiotUpowazniony are new, and the message says KSeF's test environment does not check them. |
| Duplicate: seller NIP + RodzajFaktury + P_2, kept 10 years (error 440) | PL-022 | Among the files checked together in one batch; KSeF's own store is not visible offline. |
| Encryption, session metadata, quantity limits, permissions | none | Not visible in a file. |

**A difference between the document and the Ministry's own code.** The page says KSeF checks "the
NIP check digit in the internal identifier". The Ministry's C# client (`KSeF.Client`,
`IdentifierValidators.IsValidInternalId`) instead checks the id's last digit: weights 1,3,1,3...
over the 14 digits before it, sum mod 10, which is how its test utilities generate ids. `fa3.mjs`
runs both and says which failed. `5260250274-12345`, the filler this repo's template eval used,
fails the Ministry's digit, so the eval now fills `5260250274-12341`.

## Measured against the Ministry's own validator

`node eval/ksef-acceptance.mjs <ksef-client-csharp checkout>` (commit d628369, 2026-11-09). The C#
is not run (installing .NET in this session was not allowed); its ranges and weights are read from
the source text by pattern, and the eight file-level cases of its unit tests
(`ValidationHelperTests.cs`) are replayed with their own expected verdicts.

```
1. discouraged code points: 4 range clauses read from XmlUnicodeValidator.cs; 1112064 of 1112064 scalar values agree (96 flagged by both)
2. internal id (weights 1,3 mod 10 read from IdentifierValidators.cs): 2000 of 2000 Ministry-generated ids pass; 90000 of 90000 single-digit changes to the five-digit tail refused
   refuse  DisallowedUnicodeCharacter (U+007F before </Naglowek>): PL-019 U+007F
   refuse  MojibakeWithHiddenControlCharacters (their template): PL-019 U+009B
   refuse  XmlWithBom (string U+FEFF): PL-018
   refuse  RawBytesWithBom (EF BB BF): PL-018
   accept  RawBytesWithoutBom: no PL-018/019
   refuse  PrologDeclaresNonUtf8Encoding (ISO-8859-2): PL-018
   accept  PrologDeclaresUtf8Encoding: no PL-018/019
   refuse  ContainsProcessingInstruction (<?custom-instruction data?>): PL-018
3. ValidationHelperTests.cs file cases: 8 of 8 agree
4. boundary probes in a text node: 31 of 31 agree

all agree
```

## The Ministry's templates, read as bytes

`node eval/ksef-official-templates.mjs <clones> <schemy/FA>` on ksef-client-csharp d628369,
ksef-client-java 14dbb86 and ksef-pdf-generator d766b7b:

```
Templates/invoice-template-fa-3-with-attachment.xml  xmllint=valid  findings=PL-020
Templates/invoice-template-fa-3-with-custom-Subject2.xml  xmllint=valid  findings=none
Templates/invoice-template-fa-3-with-custom-Subject3.xml  xmllint=valid  findings=none
Templates/invoice-template-fa-3.xml  xmllint=valid  findings=none
Templates/invoice-template-fa-3-with-custom-Subject2.xml  xmllint=valid  findings=none
Templates/invoice-template-fa-3-with-custom-Subject3.xml  xmllint=valid  findings=none
Templates/invoice-template-fa-3-with-disallowed-unicode-characters.xml  xmllint=valid  findings=PL-019
Templates/invoice-template-fa-3-with-multiple-Subject3.xml  xmllint=invalid  findings=PL-013,PL-013
Templates/invoice-template-fa-3.xml  xmllint=valid  findings=none
sample/invoice-template-fa-3-with-custom-subject_2.xml  xmllint=valid  findings=none
sample/invoice-template-fa-3-with-custom-subject_3.xml  xmllint=invalid  findings=PL-013
sample/invoice-template_v3.xml  xmllint=valid  findings=none
sample/invoice_template_v3_self_invoicing.xml  xmllint=valid  findings=none
assets/invoice.xml  xmllint=valid  findings=none

14 distinct filled templates, schema verdict agrees with xmllint on 14, no findings at all on 10
```

The new checks raise nothing on the 10 clean templates. The attachment template draws only the
PL-020 note (non-blocking). The template the Ministry ships as a negative case,
`invoice-template-fa-3-with-disallowed-unicode-characters.xml` ("Broda and Sons iloĹ\x9bÄ\x87",
UTF-8 "ość" read as ISO-8859-2 and saved again; Windows-1250 would have given "›" and "‡" instead), draws PL-019 naming U+009B first, the code point
the Ministry's own test asserts. The three PL-013 files are the element-order faults already
recorded (README).

Not done: a real file refused by KSeF's test or production environment with these codes; the
duplicate check against KSeF's own store; the 10,000-invoices-per-session and batch ZIP limits.
