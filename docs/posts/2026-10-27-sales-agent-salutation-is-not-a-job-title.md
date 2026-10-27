---
title: "Sales Agent stops reading 'Mrs.' as a job title"
date: 2026-10-27
description: "Running Mautic's own contact-import fixtures through the sales-agent research reader found one fault: a salutation in the title column hid the real job title."
tags: [sales-agent, crm, testing]
---

The research agent in [sales-agent](../../ventures/sales-agent/) reads a CRM export and ranks contacts against your ideal customer profile. Its tests ran on a hand-built HubSpot-style file, so I fed it a different tool's files: the contact-import fixtures from the open-source Mautic marketing platform (read only, nothing copied).

One fault. Mautic puts the salutation in `title` (`Mrs.`, `Dr.`) and the job in `position`. The reader took the first non-empty column, so every contact in that file was titled "Mrs." and could never match an ICP title like "director". The reader now skips salutations when picking a title, with a test. The other Mautic files read clean.

Still not checked: a real HubSpot or Pipedrive export. The rows here are Mautic's made-up ones.
