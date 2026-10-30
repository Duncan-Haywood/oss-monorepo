---
title: "After the sit: a report for the parents, an incident record, and a medicine log that checks the written OK"
date: 2026-10-30
tags: [babysitting-business-kit, email, small-business]
description: "End-of-sit reports as a message to copy or email, a separate incident record, and a medicine log that warns on 7 kinds of mismatch with the parents' form."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) already covered everything before a sit: leads, quotes, the schedule, the family info sheet. It had nothing for the moment parents walk back in and ask "how did it go?" This update adds that, in the Families tab.

**The report.** A sitter fills it in on their phone in about the time it takes the parents to take their coats off. It has arrival and departure (pre-filled from the booking), meals and snacks, nap or bedtime, diapers or potty, activities, a mood picked from seven words, and anything to tell the parents. It turns into a message like this, with empty sections left out:

> Hi Ana! Here's how it went with Leo and Mia (Tue Oct 27, 5pm to 9pm).
> Food: Mac and cheese
> Mood: Happy

The report is saved on the sit, one per date, so a six-week after-school series keeps six reports. Each family has its own history.

**Incidents get their own box.** A scraped knee is not the same kind of news as "ate all her peas". Ticking "Something happened" opens a red-bordered section with five fields: when it happened, what happened, first aid given, when the parents were told and how, and what to watch for. The section's first line says to call 911 first and the parents next, and to write this up after. The message then gains an "INCIDENT (in writing, as promised)" block. A printable incident report has the sit details, any medicine given and two signature lines.

**Medicine only against the parents' written OK.** A sitter enters the authorization the parents signed: child, medicine, dose, times (or "as needed", with a minimum gap and a most-per-sit), the parent's name, and signed and valid-until dates. A blank form prints for parents who have none. It is marked as a template, not legal or medical advice. Before a dose is logged, the app checks it against that form and warns about seven things:

1. no authorization on file for that medicine;
2. no parent's name or signing date;
3. a signing date after the sit;
4. no end date, or an expired one;
5. a dose that differs from the written one;
6. a time outside the authorized times (30 minutes either way by default, or another window the parents set);
7. a dose for that time already logged, or, for as-needed medicine, too soon or too many.

Each warning is a reason to stop and call the parents. The sitter can still log the dose, because the record has to match what happened, and the warnings stay on it. The form cites the American Academy of Pediatrics' [medication safety tips](https://www.healthychildren.org/English/safety-prevention/at-home/medication-safety/Pages/Medication-Safety-Tips.aspx), which advise writing instructions down and not giving extra doses without a doctor. The app never suggests a medicine, a dose or a time. It is a record, not medical advice.

**Email, if the sitter wants it.** On the optional self-hosted server, with the sitter's own Resend key, "Email to the parent" sends the report. The recipient is always the email on the family's record on the server, never an address from the request, and a test checks that. Until email is set up, the route answers 503 and the app offers "Copy message" instead.

The code is `sitreport.mjs` (pure functions) and `sitreport-ui.mjs` (the panel), with 12 tests. All the data stays in the sitter's browser unless they run their own server.
