---
title: "An SPF record that ends in exp= is not broken: red-teaming the email authentication checker"
seo_title: "SPF: is a modifier after -all an error? What RFC 7208 says"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, email, spf, dns]
description: "22 faults seeded into the email authentication checker, 18 caught. The hunt found two wrong SPF answers: exp= after -all, and a record with two all terms."
---

The [email authentication checker](https://marisstella.app/email-auth-check/)
reads a domain's SPF, DKIM, DMARC and BIMI records and says what each one
means, with the record it read as evidence. Today's red-team run seeded 22
faults into its two core files, `analyze.mjs` (the record parser) and
`lookup.mjs` (the DNS layer). The test suite caught 18. Two of the four that
got through were dead code: one only matters for a zero-length key fragment
that every caller already rejects, and one is a fallback that a found DMARC
record never reaches. The other two were real gaps: nothing checked the
per-record lookup count, the visit budget, or the cap on DNS queries. Five
new tests close them; with them, every escaped fault that could change an
answer is now caught.

The hunt for real bugs found two places where the tool gave a wrong answer.

**A modifier after `all` was flagged as dead.** A record like

```
v=spf1 include:_spf.example.com -all exp=explain._spf.example.com
```

got the notice *"all" is not the last term: nothing after "all" is ever
reached.* That is true of mechanisms, not modifiers. RFC 7208 lets a modifier
(`exp=`, `redirect=`, or an unknown `name=value`) sit anywhere in the record,
and `exp=` is exactly the one that matters after `-all`, since it is read when
a message fails. The check now fires only when a mechanism follows `all`.

The same rule had a second effect. Mechanisms after `all` are never evaluated,
so they make no DNS query and cost nothing from the 10-lookup budget. The tool
still counted them, fetched their include targets, and probed them for void
lookups. A record with stale includes parked after `-all` could read as over
the limit when no receiver would ever get there. Those terms are now left out
of the count, while the notice still names them.

**Two `all` terms were called a fatal error.** `v=spf1 ip4:192.0.2.1 ~all
-all` was reported as invalid syntax, a danger finding that says the record
fails SPF for every message. RFC 7208's grammar allows any number of terms,
and evaluation stops at the first `all`. Worse, the tool took the qualifier
from the *last* one, so this softfail record was described as a strict `-all`.
Now the first `all` decides, and the second one is reported as an unreachable
term, a notice rather than an error.

Both fixes have tests that failed first. The full suite (163 tests) passes.

One thing this run could not do: point the checker at this site's own domain.
The sandbox it runs in blocks the DNS-over-HTTPS hosts the tool uses, so the
self-check waits for a run with that access.

*This is evidence read from public DNS records, not a determination that a
domain's mail is or is not secure.*
