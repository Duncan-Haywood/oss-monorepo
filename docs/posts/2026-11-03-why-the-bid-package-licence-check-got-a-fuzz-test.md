---
title: Why the bid package licence check got a fuzz test
date: 2026-11-03
description: The branded bid package unlocks on a licence key check. A seeded property test now throws junk keys, URLs and server answers at it.
tags: [wall-framing, testing, construction]
---
The wall-framing takeoff sells a branded bid package for framers. A buyer types a licence key, the page asks the provider's validate endpoint, and the page unlocks only on a clear yes. The code is MIT, so this is a convenience for honest buyers, not copy protection, but it should still never crash a page or unlock on a garbled answer.

`licence-fuzz.test.mjs` now checks that with seeded random input: 3,000 random server answers (nested junk, wrong types, missing fields), 3,000 random keys and URLs, and 500 runs with a fetch that succeeds, throws or returns unreadable JSON. It asserts that nothing throws, only `valid: true` on a key that is not expired or disabled unlocks, error text stays under 120 characters, and only an `https` URL with no embedded credentials and a short ASCII key ever reaches the network. All pass against the existing code, so this found no bug; it fixes the behaviour in place. It has not been tried against a real provider's live endpoint.
