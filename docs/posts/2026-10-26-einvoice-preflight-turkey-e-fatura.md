---
title: "E-invoice Preflight adds Turkey, and says what it cannot check"
date: 2026-10-26
description: "Turkey's e-Fatura and e-Arşiv rules summarised from vendor guides, with a plain statement that a free EN 16931 checker has no UBL-TR rules."
tags: [einvoice-preflight, e-invoicing, turkey, compliance]
---

[E-invoice Preflight](../../ventures/einvoice-preflight/) now has a page for Turkey, its 36th country. Vendor guides report that e-Fatura is mandatory from TRY 3 million in gross sales (TRY 500,000 in listed sectors such as e-commerce, real estate, construction and motor vehicles), that businesses outside it issue e-Arşiv, and that the TRY 3,000 per-invoice threshold for e-Arşiv went on 1 January 2026.

The useful part is what the page declines to claim. Turkish e-Fatura is UBL-TR through GİB or a licensed integrator, not EN 16931 or Peppol, and the checker has no UBL-TR rules, so a clean result says nothing about GİB acceptance. It helps in one case: a Turkish supplier invoicing an EU buyer who wants a Peppol or EN 16931 file.

Sources are vendor and advisory pages only; the communiqués and GİB were not read, and a 2027 date for simplified-method taxpayers and a newer Communiqué 535 are single-source or unverified, both flagged on the page. Next: UBL-TR rules, if GİB publishes a schematron. Not tax advice.
