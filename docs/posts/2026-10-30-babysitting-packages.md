---
title: "Selling babysitting ahead of time: packages, gift certificates and a parents' night out"
seo_title: "Babysitting packages, gift certificates and parents' night out"
date: 2026-10-30
description: "The Babysitting Business Kit now sells prepaid sit bundles and gift certificates, and plans group nights with a ratio check, without counting income twice."
tags: [babysitting-business-kit]
---

A babysitter paid by the hour only earns when a family happens to need a sit. Three things change that, and the [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has a Packages tab for each of them.

**Packages.** The sitter defines a bundle: four date nights, forty summer hours, three school-holiday days. The app suggests a price from the sitter's own rate card. With the kit's default rates ($20 an hour, $3 for each extra child), a four-hour evening with two children quotes at $92, so four of them list at $368, and with a 10% discount the suggested price is $331.20. They can type any other price. When a family uses the package, the sit is marked paid and the balance goes down. A package counted in sits covers the whole sit. A package counted in hours pays for the hours, and anything else on the rate card stays owed: in the tests, an 8-hour day drawn from a $360, 20-hour block is credited $144 against a $160 quote, so $16 is still owed.

**Gift certificates.** Each one gets a code like `GIFT-7KQ4-XM9C`. It is eight symbols drawn from 26 letters and digits, leaving out the ones people misread on paper (0/O, 1/I, 2/Z, 5/S, 8/B). That gives about 2.1 × 10^11 possible codes. Every symbol is equally likely, and a code that matches one already issued is drawn again. A certificate can be worth dollars or hours and can carry a use-by date. When a code is used on a sit, whatever is left stays on the code. Some states limit gift-certificate expiry dates and fees, so wherever a date is set the app says to check your state's rules. It doesn't cite a law we haven't read.

**Parents' night out.** A church or school group evening is priced per child, with an optional cap per family. The number of places is the adults present times the sitter's own children-per-adult limit. Sign-ups beyond that go on a waitlist. If the sitter lets one in anyway, the warning is specific, for example "9 children for 2 adults at your limit of 1 to 4. Add 1 helper." Allergies and children younger than the sitter's minimum age are listed. The announcement draft for a church bulletin or school newsletter uses only the sitter's own details and reminds them to ask the office first. With the sitter's self-hosted server, families can sign up through a private link, and their answers are kept when they next sync the app. Watching a group of children can fall under child-care licensing rules, so the tab says to check those too.

**Taxes.** The kit counts money when it is received. A package or gift certificate is income on the day it is sold. When it is used later, the sit is marked paid with a credit, and the tax summary leaves credits out, so the same dollars are never counted twice. A balance that expires was already counted when it was sold. Gift-certificate sales are grouped on their own rather than under one family, so they don't set off the household-employee warning, which applies when one family pays $3,000 or more.

The module is `packages.mjs`, with 14 tests covering pricing, redemption, the tax treatment, code collisions, the ratio check and the sign-up link. Like the rest of the kit it is free and MIT-licensed. It is not legal or tax advice.
