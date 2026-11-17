---
title: "The invisible character KSeF refuses"
seo_title: "KSeF rejected my FA(3) invoice: BOM, U+009B and other file checks"
date: 2026-11-14
tags: [einvoice-preflight, ventures, poland, ksef]
description: "An FA(3) invoice can pass the XSD and still be refused by KSeF for a BOM, a hidden character or a future date. We now check them, as the Ministry does."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has read Polish KSeF invoices (the FA(3) XML structure) since October. It runs the published XSD and the arithmetic. But a file that passes the schema can still be refused when it arrives, and until today the checker said nothing about why.

The Ministry of Finance publishes the list. Its KSeF documentation has a page called "Weryfikacja faktury" (invoice verification, dated 9 April 2026) that names what KSeF checks on every file it receives besides the schema. Most of it is about the file, not the invoice:

- UTF-8 **without a byte-order mark**, and no prolog naming any other encoding;
- **no processing instructions** (an `<?xml-stylesheet?>` line counts);
- none of a list of **"discouraged" Unicode characters**: U+007F to U+0084, U+0086 to U+009F, U+FDD0 to U+FDEF, and the two noncharacters at the end of each plane;
- at most **1,000,000 bytes**, or 3,000,000 with an attachment;
- an issue date (`P_1`) **no later than the day KSeF receives** the file;
- NIP check digits for the seller, buyer, every third party (`Podmiot3`) and the authorised party, and the internal id of a third party;
- **no duplicate**: the same seller NIP, invoice kind and invoice number is refused as error 440, and KSeF remembers for ten years.

## Where the hidden character comes from

The Ministry's C# client ships a sample invoice for this case: a seller named "Broda and Sons iloĹ\x9bÄ\x87". It is the Polish "ość", written as UTF-8, read back as ISO-8859-2 and saved again as UTF-8. In UTF-8, "ś" is the two bytes C5 9B. ISO-8859-2 reads C5 as "Ĺ" and passes 9B through as the control character U+009B. (Windows-1250 would have turned it into a visible "›".) Nothing shows on screen and the XSD accepts it, but KSeF refuses the file.

The checker now reports it as PL-019. It counts the characters, gives the first code point and its line, and never prints the text itself. When the characters sit right after "Ĺ" or "Ä", the usual mark of double encoding, the fix says to correct the export's encoding at the source. Deleting the hidden characters would get the file accepted with a garbled company name.

## Checked against the Ministry's own code

The Ministry's [MIT-licensed C# client](https://github.com/CIRFMF/ksef-client-csharp) has a pre-send validator. We could not run .NET in this session, so the comparison script reads its rules straight from the C# source, the character ranges and the check-digit weights, and replays its unit tests:

- **1,112,064 of 1,112,064** Unicode code points get the same verdict from both;
- **8 of 8** file-level cases in its `ValidationHelperTests.cs` agree: U+007F, the double-encoded sample (both name U+009B), a BOM as text and as bytes, no BOM, ISO-8859-2 and UTF-8 prologs, and a processing instruction;
- **31 of 31** probes at the edges of each range agree.

The comparison also turned up a gap between the Ministry's page and its code. The page says KSeF checks "the NIP check digit in the internal identifier". The C# client checks something else: the last of the id's five digits, a 1-3-1-3 weighted sum mod 10 over the fourteen digits before it. The checker now runs both and says which one failed. 2,000 ids made with the Ministry's algorithm pass, and all 90,000 single-digit changes to their tails are caught. The placeholder internal id our own test script had used for weeks, `5260250274-12345`, fails that digit.

The checker also found a bug in our own reader: it had been accepting characters that XML 1.0 forbids outright, such as U+0001 and U+FFFE. KSeF's parser refuses those too, so they now draw PL-019.

## What it still can't see

Whether KSeF already holds a number: the duplicate check (PL-022) only compares the files you drop in together. Your permissions, the session, and encryption aren't visible offline. None of the checks has yet been tried on a file KSeF actually refused. If you have such a file and its error code, with personal data removed, that is the next useful test. Everything runs in your browser and nothing is uploaded.

The measurement and the commands to rerun it are in the venture's `eval/ksef-acceptance-2026-11-14.md`. This is an offline check, not KSeF's acceptance, and not tax advice.
