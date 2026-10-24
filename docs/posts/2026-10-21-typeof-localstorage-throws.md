---
title: "typeof localStorage is not a safe check"
date: 2026-10-21
description: "Evaluating the localStorage global throws when a visitor blocks site data, so the feature test itself fails. A one-line helper, applied to 990 pages."
tags: [software-engineering, ci]
---

# `typeof localStorage` is not a safe check

Feature-detecting storage with `typeof localStorage === "undefined"` feels
defensive. It is not: when a visitor blocks site data, merely evaluating the
`localStorage` global throws `SecurityError`, so the check itself is the thing
that fails. The fix is a one-line helper that wraps the check in `try`.

We found the pattern in the usage counter copied into 990 calculator pages,
fixed it in one pass, and added a CI check so new copies cannot reintroduce it.
We reproduced the failure by simulating a throwing getter in node rather than
in a real browser, so treat the user-visible effect (an uncaught error after
the result renders) as likely, not observed. Details:
[the report](../reports/2026-10-21-blocked-storage-usage-counter.md).
