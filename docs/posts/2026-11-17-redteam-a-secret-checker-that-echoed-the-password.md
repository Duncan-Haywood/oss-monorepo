---
title: "A secret checker that echoed the end of the password"
seo_title: "Redacting URL credentials: why first-and-last-four leaks passwords"
date: 2026-11-17
tags: [redteam, security, terraform, secrets, testing]
description: "A red-team run found the Terraform plan secret checker's redaction kept the last characters of a database password when the host name was short, and that it missed password-only Redis URLs."
---

The [Terraform plan secret exposure check](https://marisstella.app/terraform-plan-secret-exposure-check/)
reads the JSON from `terraform show -json` and flags values that look like secrets which the provider
did not mark `sensitive`: AWS keys, private keys, JWTs and URLs with a `user:password@` part. Its report
is meant to be pasted into an issue or a CI log, so it never prints the full match. Today a red-team run
seeded faults into its engine and read the code looking for wrong answers.

## Seeded faults: 6 of 10 caught, now 10 of 10

Four of the ten seeded edits got through the tests. Each was a boundary nobody had written down: a JWT
whose signature is exactly ten characters, a URL scheme with a digit in it (`s3://`), a nine-character
value passed to the redaction, and a plan whose `after_sensitive` is `false` rather than `{}`. Each now
has a test, and each edit fails it.

## Two real defects

**The redaction leaked password characters.** Every match was shortened to its first and last four
characters. For an access key that is fine: `AKIA************MNOP`. For a URL the last four characters
are the end of the host, and when the host is short they reach back into the password:

| Value in the plan | Report before | Report now |
|---|---|---|
| `postgres://admin:hunter2@db` | `post*******************2@db` | `postgres://admin:********@db` |
| `x://u:pass@h` | `x://****ss@h` | `x://u:********@h` |

A short host such as `db` or `pg` is common inside a cluster. The report now keeps the scheme, user and
host, which is enough to find the value, and replaces the whole password with asterisks. Any other match
of 9 to 12 characters now keeps at most a quarter of its length at each end. Before, a 9-character match
showed 8 of its 9 characters.

**Password-only URLs were not flagged at all.** The pattern required a user name before the colon. Redis
connection strings that use a password and no user look like `redis://:password@host:6379/0`, and they
went through with no finding. The user part may now be empty.

## A smaller one next door

The same run seeded the
[security deposit calculator](https://marisstella.app/security-deposit-return-calculator/). Its seeded
faults came out 7 of 10 caught, two of the three that got through could not change any output, and the
third (interest under $1 dropped) now has a test. Reading its page turned up a display bug: a deduction
typed as `Replace <oven> knob` showed in the table as `Replace knob`, because the description was inserted
as HTML. Only the person typing could trigger it, so it was not a security hole, but the table was wrong.
Descriptions are now escaped. The fix was checked in a real browser.

Across both targets the tests caught 13 of 18 seeded faults that could change behaviour. They now catch
all 18.
