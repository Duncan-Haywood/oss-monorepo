---
title: "Which e-invoicing deadline applies to my business?"
date: 2026-11-08
tags: [e-invoicing, einvoice-preflight, compliance]
description: "A one-number selector for the six countries whose e-invoicing start date depends on business size."
---

Most of the e-invoicing mandate pages answer "what is the rule". A small business owner asks "when does it hit me". For Germany, Spain, the UAE, Poland, Oman and France the answer depends on size, and the cut-offs were scattered across six pages.

`which-e-invoice-mandate-applies.html` takes a country and one number (prior-year turnover, or a size class for France) and returns the start date, the days left, and a link to the country page with its sources. Examples: Germany above EUR 800,000 is 1 January 2027, at or under it 1 January 2028; Spain above EUR 8 million is 6 October 2027, otherwise 2028; the UAE at AED 50 million or more is 1 January 2027, otherwise 1 July 2027.

Every cut-off is copied from the repo's own country pages, and a test checks each date against `mandate-dates.json`. Poland's smallest wave is defined by monthly sales, so the page says it cannot place you in it from a yearly figure rather than guessing.

Limits: several cut-offs come from secondary guides that the country pages mark as such, a rule may use headcount or a related group instead, and no tax authority has confirmed any answer. It is not legal or tax advice.
