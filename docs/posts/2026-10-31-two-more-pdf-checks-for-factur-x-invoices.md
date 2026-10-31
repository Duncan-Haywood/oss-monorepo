---
title: "Two more PDF checks for Factur-X invoices"
date: 2026-10-31
tags: [einvoice-preflight, factur-x, pdf]
description: "E-invoice Preflight now flags an embedded invoice with no MIME type and a PDF catalog that does not list the attachment."
---

A Factur-X or ZUGFeRD invoice is a PDF carrying an XML file, and receivers can reject it for how the PDF is built even when the XML is fine. The [e-invoice preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/) checker already looked at the PDF/A-3 marker, the attachment's name, its relationship and the profile named in the metadata. Two more checks landed today.

**PDF-005** fires when the embedded file's stream has no `/Subtype`, the MIME type that PDF/A-3 requires (`/text#2Fxml` for XML). **PDF-006** fires when the document catalog has no `/AF` array naming the attachment. Both are notes, not blockers, and both run in the browser on any PDF you drop on the page.

**Limits.** Tested on hand-built PDFs only, not on a real Mustang, Ghostscript or Acrobat export, and veraPDF is still unrun. PDF-006 reads the catalog only when it is in plain text; a catalog packed in a compressed object stream draws no finding.

Separately, the Nigeria mandate page had no list of the other country pages, which broke 16 link tests. It has one now, and the other country pages link back to it.
