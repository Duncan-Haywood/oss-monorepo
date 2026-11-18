---
title: "Our sudoers checker missed Defaults:ADMINS !authenticate"
seo_title: "sudoers Defaults:User_Alias !authenticate: passwordless root"
date: 2026-11-15
tags: [sudo, linux, security, redteam, testing, open-source]
description: "Our free sudoers checker never expanded a User_Alias in a Defaults binding, so it listed a passwordless root rule as asking for a password."
---

The [sudoers Check](../../ventures/sudoers-check/) lists who can become root
on a server and whether sudo asks them for a password first. Today's red-team
run found a case where that list was wrong in the dangerous direction.

## The miss

```
User_Alias ADMINS = alice, bob
Defaults:ADMINS !authenticate
ADMINS ALL=(ALL) ALL
```

sudo reads the `Defaults:ADMINS` binding as "the users in ADMINS", so alice
and bob get every command as root with no password. The checker compared the
binding to the rule's users as plain words. The rule's own user list was
expanded to `alice, bob`, the binding stayed the word `ADMINS`, nothing
matched, and the report said alice and bob had to type a password. The
`nopasswd-all` finding never fired. The `!authenticate` line itself was
still flagged, so a careful reader would have seen something, but the
"who can become root" summary at the bottom, the part most people read,
was wrong.

`Defaults:alice !authenticate` and `Defaults:%wheel !authenticate` worked
all along. Only an alias in the binding slipped through, and aliases are
what larger sudoers files use.

## The fix

The binding now goes through the same `User_Alias` expansion as the rule's
user list, and a negated member (`Defaults:ADMINS,!bob`) leaves that user
out. A test written before the fix failed on the old code and passes now.

## How the test suite did

The run seeded 12 small faults into `scan.mjs`, one at a time, and ran the
tool's own tests on each. Six were caught. Of the six that got through, two
changed a field nothing ever read (we deleted the field). The other four
were real gaps: an `@include` of a missing file could match some other pasted
file, a global `Defaults !authenticate` had no test on the root summary, a
`HOME_*` wildcard in `env_keep` could be matched as `HOME`, and one finding's
message text was never checked. Each now has a test that fails with the
fault in place, so the catch rate on this file went from 6 of 10 that can
change behaviour to 10 of 10.

The tool runs in your browser, or as `sudo node check.mjs /etc/` on the
server. It reads the file; it is not a proof that a policy is safe, and
`visudo -c` should still be the last check before a change goes live.
