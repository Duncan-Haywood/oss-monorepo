---
title: "A child-safety review of the Babysitting Business Kit: the allergy note that hid a peanut allergy"
date: 2026-10-30
tags: [babysitting-business-kit, safety, privacy]
description: "A harm review of a babysitting app found an allergy parser that dropped 'EpiPen for peanut allergy', small parts for unaged kids and an alarm code on a card."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) plans activities around each child's age and allergies, logs medicine against the parents' written authorization, and prints an emergency card. Software like that can hurt a child if it is quietly wrong, so we read all of it looking for harm. Here is what we found and fixed.

**The worst bug was in the allergy reader.** A parent typing "EpiPen for peanut allergy" is describing the most serious kind of allergy there is. The parser treated any note that *started* with "EpiPen", "inhaler" or "Notes:" as not being an allergy and threw it away whole. A test plan for that child scheduled a peanut-butter pinecone bird feeder and gave no warning. Now only "none", "n/a" and an age are skipped. Everything else is checked for allergens, and an EpiPen mention with no named allergen tells the sitter to check with the parents. There is a test for each phrasing.

**Small parts are now kept from children whose age the app doesn't know.** The under-3 filter needed a birth date. A child entered without one was offered checkers and puzzles. Now an unknown age is treated as under 3 for small parts, and so is a family with no children entered.

**Some activity text needed rewording:**
- The toddler sensory bin said to hide "small toys". It now says toys too big to fit through a toilet-paper tube.
- A snack game said to build a cracker stack "that still fits in your mouth".
- Balloons are now for school-age children (6 and up), and the adult blows them up.
- The baby wind-down no longer mentions a blanket and says "on their back, in the crib, with nothing else in it".
- Raw carrot and celery come with an under-4 note.
- Salt dough is marked as not for eating.
- Hide and seek rules out anything that latches.
- Water play ends with emptying the tub.

**Medicine records now tell parents the whole truth.** The sit report email used to list every dose under "from your written instructions", even a dose logged with a warning that it was outside the authorized time. It now says "Medicine given" and repeats any warning, so a parent sees it. A dose the parents gave just before leaving can now be logged, so an as-needed medicine isn't repeated too soon. The form reminds the sitter to ask, and gives Poison Help (1-800-222-1222) for a wrong or extra dose.

**The alarm code stays off paper.** The house checklist asked for "the alarm code or a hint", and that note printed on the emergency card the sitter keeps in their bag. If the bag were lost, the family's address, children's names and alarm code would all be on one card. The checklist now says not to write the code down, and that note never prints. The emergency card also now says to use the child's EpiPen as the parents' plan says, then call 911.

The review also checked what was already right. 911 comes first everywhere, the Poison Help number is correct, and nothing suggests a drug or a dose. Red flags are about safety and payment only. Faith content appears only when the sitter offers it and the parents ask, and children's names and photos never appear in public posts without the parents' written agreement. The kit is free and open source, and it is not medical, legal or tax advice.
