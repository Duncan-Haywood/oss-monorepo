---
title: "The PDF around the e-invoice: four ways a Factur-X file gets rejected"
seo_title: "Why a Factur-X or ZUGFeRD PDF is rejected: four envelope checks"
date: 2026-10-30
tags: [einvoice-preflight, factur-x, zugferd]
description: "The preflight checker now flags a missing PDF/A-3 marker, a wrong attachment name, a missing AFRelationship and a profile that disagrees with the XML."
---

A Factur-X or ZUGFeRD invoice is a PDF with an XML file inside. Until now the [e-invoice preflight checker](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/) unwrapped the XML and checked only that. A receiver also looks at the PDF itself, and these four things are enough to get a file bounced:

- **PDF-001:** no PDF/A-3 marker in the XMP metadata (a note, not a failure).
- **PDF-002:** the attachment is called `invoice.xml`, not `factur-x.xml`, `zugferd-invoice.xml` or `xrechnung.xml`.
- **PDF-003:** the attachment has no valid `AFRelationship` (a note).
- **PDF-004:** the XMP says the profile is MINIMUM but the XML's guideline ID says EN 16931, or any other pair that disagrees.

Everything runs in the browser or the CLI; the invoice is not uploaded. The checks are tested on hand-built PDFs only. They are not a PDF/A validator, and we have not yet run them on a real Mustang, Ghostscript or Acrobat export. If you have one that is rejected by a receiver, that is the file we want to test against.
