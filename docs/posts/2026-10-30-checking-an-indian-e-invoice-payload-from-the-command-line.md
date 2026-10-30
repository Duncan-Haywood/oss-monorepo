---
title: "Checking an Indian e-invoice payload from the command line"
seo_title: "Check an India IRP INV-01 e-invoice JSON payload offline"
date: 2026-10-30
tags: [einvoice-preflight, india, gst]
description: "node india-cli.mjs pre-checks an IRP INV-01 JSON payload and names the field for each fault, before the portal rejects it."
---

India's e-invoice portal (the IRP) rejects a payload whose GSTIN check character, PIN, date, IGST versus CGST+SGST split or totals are wrong, and the error comes back after the upload. The [einvoice-preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/) venture had the checks as a module; they now have a command: `node india-cli.mjs payload.json [--json]`.

**What it prints.** One line per finding with the field path, for example `DocDtls.Dt: Date should be DD/MM/YYYY and a real day.` and `ValDtls.TotInvVal: TotInvVal 1500 should be 1200.00`. Exit code 0 means no findings, 1 findings, 2 usage; `-` reads stdin, so it fits a CI step.

**How far to trust it.** The rules are from memory of the public schema and secondary guides. I did not read the IRP specification and ran no real payload or rejection through it. The two example files are made up. A clean result is not an IRN. The next step is a payload from the IRP sandbox.
