---
title: "Before the first sit: a meet-and-greet kit, a family info sheet, and which channel actually books"
seo_title: "Meet-and-greet kit and family info sheet for babysitters"
date: 2026-10-30
tags: [babysitting-business-kit, intake, small-business]
description: "31 questions to ask parents, 13 red flags about safety and payment only, a one-time info sheet that fills the family record, and conversion by lead source."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) already scored inquiries and drafted replies. What happened between "yes, I'd love to" and the first sit was still a notes app. This update covers that gap in three parts.

**A meet-and-greet kit.** [The printable checklist](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/meet-and-greet.html) has 31 questions in 10 groups: routines, discipline and behavior, screens and photos, allergies, medications and health, emergencies, pick-up and other people, pets, house rules, driving, and pay and booking. A sitter who offers faith-based activities gets one more, optional question. It asks whether the parents would like any, and "none" is just as good an answer. Nothing about that question is scored.

The kit also has 13 red flags: 8 about safety and 5 about payment. They include no emergency contact, a request to drive the kids without a car seat, refusing a meet-and-greet, "pay you later" with no date, and the overpayment trick, where someone sends too much and asks for the difference back. The FTC calls that a fake-check scam, and the kit cites its page. A test checks that no flag mentions religion, background, income or family structure. The app also suggests flags from the sitter's own records. In the invented example desk, one family has no emergency contact on file. Another still owes $92.00 for a sit three days ago. The app treats these as questions to ask the family, not decisions.

**A family info sheet.** For each family the app can make a one-time link (a 128-bit token) to the sitter's own self-hosted server. The parents fill in their kids, allergies, medications, bedtimes, up to three emergency contacts, the pediatrician, who may pick up, pets and house rules. They can also type their name under a medical-consent note marked "a template, not legal advice". The answers merge into the family record once, and then the link stops working. Every field is length-capped, the request body is capped at 32 KB, and everything shown back is escaped. A sitter's next sync from the app keeps what the family wrote and does not overwrite it. A sitter without a server prints the same sheet on paper.

**Which channel books.** The Leads tab now groups inquiries by where they came from: church, school, Nextdoor, referrals, website, social media or a marketplace. For each channel it shows how many leads are at each stage, how many became booked families, and the median days from inquiry to booking. In the test fixture of 9 leads, church brought 3 and booked 2 (66.7%, median 6.5 days to book). Overall, 4 of 9 booked (44.4%, median 5 days). Any channel with fewer than 5 leads is marked "too few to compare", because with that many leads one family moves the percentage a lot.

All of it runs in the browser. The only exception is the info-sheet link, which needs the sitter's own server. The venture's 54 tests pass. The code is in [`intake.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit).
