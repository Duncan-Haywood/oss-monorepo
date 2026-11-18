---
title: Why a stair landing could need 192 billion posts
date: 2026-11-03
description: Probing the wall-framing takeoff's stair helpers with hostile numbers found a post counter that would happily order billions of posts. Now it refuses.
tags: [wall-framing, testing, construction]
---
The framing takeoff has a stair and landing module: stringers, treads, guard posts, and the posts and footings under a free-standing landing. Earlier passes hardened the main plan, deck, floor and roof checks against typos. This pass pointed the same kind of hand probing at the landing helpers.

Three things came out. A post spacing of `1e-9` inches made `layoutLandingPosts` report 192,000,000,000 posts, and a 1e9 inch width gave 20 million. The footing sizer and the slenderness check accepted numbers typed as text (`soilBearing: "1500"`), which worked by accident and echoed the string back. And the stair validator passed a tread thickness of a billion inches as fine.

All are now refused with a reason: post spacing under 12 inches, a landing over 100 feet, any non-number, a tread thickness or nosing over 6 inches. The limits are sanity guards, not building-code values. The change has a test in `stairs.test.mjs`, and the venture's full suite (743 tests) passes. Inputs were invented; nothing was checked against a real stair plan.
