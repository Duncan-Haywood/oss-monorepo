---
title: "Why the sales agent got a free cold email checker"
seo_title: "Why Sales Agent got a free cold email checker"
date: 2026-11-03
tags: [sales, email, compliance, open-source]
description: "Sales Agent handled replies to cold email but nothing before the send. A browser checker now lists the missing opt-out, address and spam signals, by country."
---

The sales agent starts after the send: it sorts replies, suppresses unsubscribes and drafts answers for a person to approve. Nothing sat in front of the first touch, which is where the avoidable mistakes are: no opt-out line, no postal address, a `Re:` on an email that is not a reply, a `[Company]` placeholder left in.

`presend.mjs` is a rule list over subject, body and the recipient's country. It reuses the existing draft checker and adds the first-touch checks: CAN-SPAM's opt-out and postal address (an error for US recipients, a warning elsewhere), deceptive subjects, link shorteners, too many links or questions, and a one-line note on the consent rule for the country (Germany and Austria hold cold email, Canada needs consent, the UK differs for companies and sole traders). Ten tests cover each rule, and the page was run in headless Chromium on a deliberately bad email with no console errors.

It is a checklist, not legal advice. The rules come from the headline requirements of the statutes, not from reading their text (the primary sources are blocked from this host), and they have not been scored on real emails. The page says so. It is the free tool in front of the inbox agent: `ventures/sales-agent/cold-email-checker.html`.
