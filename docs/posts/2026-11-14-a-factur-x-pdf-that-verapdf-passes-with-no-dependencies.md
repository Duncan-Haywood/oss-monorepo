---
title: "A Factur-X PDF that veraPDF passes, written with no dependencies"
seo_title: "Free Factur-X / ZUGFeRD PDF/A-3 invoice creator, checked with veraPDF"
date: 2026-11-14
tags: [einvoice-preflight, e-invoicing, factur-x, zugferd, pdf-a]
description: "The free e-invoice creator now writes Factur-X / ZUGFeRD PDFs, a printed page with the CII XML inside, as PDF/A-3b. veraPDF passes all 8 test files."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/create.html) had a creator that wrote UBL or CII XML. That covers Peppol and XRechnung. It left out the format many small firms in France and Germany actually send. **Factur-X** (called ZUGFeRD 2 in Germany) is a normal-looking PDF invoice with the structured XML attached inside it. A person reads the page and the buyer's software reads the XML. France's e-invoicing reform names it as one of its three formats.

From today the creator writes one. Pick "Factur-X / ZUGFeRD PDF" on the page, or run `node generate-cli.mjs draft.json -f facturx -o invoice.pdf`. The API's `/v1/generate` does the same with `"format":"facturx"`. Nothing is uploaded: the browser builds the PDF itself.

## The hard part is PDF/A-3, not the XML

A Factur-X file has to be PDF/A-3, the archival kind of PDF. Our own example PDFs, made for testing the reader, were not PDF/A. veraPDF, the reference PDF/A checker, failed them on four rules:

- **6.6.2.1-1:** no XMP metadata.
- **6.1.3-1:** no file ID in the trailer.
- **6.2.4.3-4:** colour used with no output intent.
- **6.2.11.4.1-1:** a font that is not embedded.

The new writer fixes all four, with no library:

- **Embedded fonts.** It embeds only the glyphs a given invoice uses. The fonts are Type0 / CIDFontType2 with a ToUnicode map, so text still copies out of the PDF. The source is Liberation Sans 2, cut down to Latin, Greek and Cyrillic and renamed "Preflight Sans". Its licence, the SIL OFL, requires a new name on a modified copy.
- **Output intent.** An sRGB output intent carries a 488-byte ICC profile that the code builds itself. No colour-profile file of unknown origin ships in the repository.
- **XMP metadata.** The packet says PDF/A part 3, conformance B. It also declares the Factur-X extension schema, the four `fx:` properties a receiver reads to find the XML.
- **Associated file.** The XML is attached as an associated file (`/AF`, relationship `Alternative`, type `text/xml`), named `factur-x.xml`. For an XRechnung it is `xrechnung.xml`, with the level set to `XRECHNUNG`.
- **No Info dictionary.** None is written, so nothing can disagree with the XMP.

## What was checked

veraPDF 1.30.4 passes all 8 test PDFs as PDF/A-3b:

- plain EN 16931 and XRechnung invoices;
- a credit note;
- an 80-line invoice that runs to 6 pages;
- Polish, Greek and Cyrillic names;
- Japanese text in a note (it prints as `?` on the page, and the XML keeps it);
- reverse-charge and exempt lines;
- a prepayment with a long note.

We also downloaded the PDF from the web page in headless Chromium, and veraPDF passes that file too. The XML inside each PDF is byte-for-byte the CII the creator writes. The official EN 16931 rules find nothing in it.

One more result answers a question the repair feature had left open. The repair can fix the XML inside a Factur-X PDF by appending an update to the file. Does the PDF stay PDF/A afterwards? We ran that on the real test PDFs from the ZUGFeRD corpus and the Mustang project:

- veraPDF passes 177 of the originals.
- We pushed the tax total up by 7.00 and asked the repair to fix it. It fixed 155; the other 22 it declined, saying why.
- After the update, veraPDF still passes **all 155 repaired files**. They include PDF/A-3a, 3b and 3u files and one PDF/A-4f.

So the repair does not cost a file its PDF/A status.

## What it is not

It does not sign, send or archive invoices, and it is not tax advice. We have not tried Mustang's validator, Acrobat or a real receiver on these files. The page is drawn from the same data as the XML, so the two cannot disagree. Still, run the file through your receiver's own validator before you rely on it.

Source and every measurement: [`ventures/einvoice-preflight`](../../ventures/einvoice-preflight/README.md), "Create an e-invoice".
