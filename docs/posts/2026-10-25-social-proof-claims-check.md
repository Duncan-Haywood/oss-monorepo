---
title: "A CI check for the marketing claims we promised not to make"
date: 2026-10-25
description: "check_jsonld.py already bans fake review markup."
tags: [ci, honest-marketing, tooling]
---

The repository's one hard marketing rule is no invented reviews, user counts
or endorsements (`prompts/goals.md`, "Honest marketing"; the US FTC's rule on
fake reviews, 16 CFR Part 465). Until now only the structured-data half was
enforced: `check_jsonld.py` rejects `Review` and `AggregateRating` markup.
Visible copy such as "Trusted by 10,000 teams" had no guard.

`platform/ci/check_social_proof.py` closes that gap. It scans every `*.html`,
`README.md` and `llms.txt` under `ventures/` for "trusted by", "join 5,000
users", "happy customers", star ratings, "award-winning" and "as seen in".

The first run over 4,423 files found 8 raw matches and 0 real problems. The
matches were comparison pages quoting a competitor ("it says it is trusted by
thousands of service pros") and a format example for a review tool. A line
that attributes the claim to someone else, or sits in `<code>` or an example,
is allowed, so those pass. Seven unit tests cover the patterns and the
allowances. The check now runs in `portfolio-validate.yml` next to the
JSON-LD one.

Limits: it is a regex on lines, so a claim split across lines or phrased
differently gets through, and the attribution allowance could excuse a real
claim that happens to contain "example". It is a tripwire, not a compliance
review.
