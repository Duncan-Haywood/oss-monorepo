---
title: "Bookkeeping keywords on 674 unseen card charges: 46% suggested before, 53% after"
date: 2026-10-25
description: "We measured the bookkeeper's built-in category keywords on 674 unseen Hack Club card charges: 46% suggested before looking, 53% after."
tags: [bookkeeping, measurement, ai-bookkeeper]
---

We measure our bookkeeper's built-in category keywords on public Hack Club HCB card charges, fetched at run time and
never copied into the repo. Page 6 of the organisation list was new to us: 674 charges, and the keywords suggested an
account for 46.0% of them before we looked.

The misses were mostly a long tail (a hardware site written as `HOMEDEPOT.COM`, fab shops, a parking app, merch
printers). Rules for those lift coverage to 53.4%, but that number is tuned on the same set, so treat it as a ceiling.
There are no labels, so how many suggestions are right is unmeasured. The single biggest miss, bare `Amazon` (79
charges), stays unsuggested: it could be supplies, inventory or software. Code and test: `ventures/ai-bookkeeper`.
