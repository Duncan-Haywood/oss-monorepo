---
title: "Checking an Indian e-invoice payload before the IRP rejects it"
date: 2026-10-30
tags: [einvoice-preflight, india, gst]
description: "A new pre-check for India's INV-01 JSON names the field behind each fault: tax split, line arithmetic, GSTIN, PIN and totals."
---

India's Invoice Registration Portal refuses a payload for small things: IGST charged on a same-state sale, a total that is a few rupees off, a PIN with five digits. The [e-invoice preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/) tool now has `checkInv01`, which checks an INV-01 (version 1.1) JSON file and points to the field at fault.

It checks the required blocks, both GSTINs (shape and check character), PIN and date format, HSN length, the GST slab, whether tax should be IGST or CGST plus SGST given seller state and place of supply, each line's arithmetic and the document totals, allowing the portal's one-rupee rounding.

**Limits.** The field names and rules come from memory of the public schema and secondary guides; the portal's specification was not read and no real payload was run. The four tests use a made-up invoice. It is not yet on the India page or in the CLI. A real sandbox payload and rejection are the next thing needed.
