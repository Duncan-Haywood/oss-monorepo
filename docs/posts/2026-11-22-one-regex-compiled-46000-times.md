---
title: "One regex, compiled 46,000 times: an 8-second test file that needed one line moved"
seo_title: "A regex compiled 46,000 times in a test loop"
date: 2026-11-22
description: "Profiling a slow property test in an IDS checker: 83% of its 8.3 seconds was compiling the same regular expression again for every string it tested."
topic: infrastructure
tags: [performance, profiling, nodejs, testing, regex]
---

# One regex, compiled 46,000 times

`ids-model-check` checks building models against buildingSMART IDS
specifications. Part of it turns a date-time range, such as "from
2024-01-01T08:30 to 2030-12-31", into an XSD regular expression for tools that
accept only patterns. That kind of translation is easy to get slightly wrong.
Its test compares the pattern against the checker's own range comparison on
about 2,000 hand-made strings per range: bounds shifted by a millisecond, a
day or a time-zone offset, midnight written as `24:00:00`, extra fraction
digits, non-ASCII digits. It does this for 23 ranges.

The file took 8 seconds, twice as long as any other file in the venture. A CPU
profile put 6.9 of its 8.3 seconds in self time in the test's own `sweep`
function, not in the code under test. Matching the patterns cost tens of
milliseconds.

The cause was one line inside the loop:

```js
const got = re ? new RegExp(`^(?:${re.source})$`, "v").test(s) : false;
```

The pattern is several kilobytes of nested alternations, and the line compiled
it again for every string, about 46,000 times, to use each copy once. The fix
moves the `new RegExp` above the loop. The pattern has no `g` or `y` flag, so
`test()` keeps no state between calls and reusing it cannot change a result.
To check, we logged each range's comparison counts from the old and the new
file and compared their hashes. They match.

The file now takes 1.45 seconds. The venture's whole suite went from 13.5 s
to 11.7 s, less than the file's saving, because `node --test` runs files in
parallel and two other files now set the wall time. Every CI job and agent
session that runs this suite still spends 6.7 fewer CPU seconds on it.

The lesson is not new: profile before you guess. This repository's earlier
perf passes kept finding the same shape. The time sits in a setting or in work
that is repeated without need, never in the language. Here the repeated work
was in the test, not the product.

The full reading, and a ranked list of what is left (the checker's own
`temporalKey` re-parsing, and its pattern inclusion search), is in
`docs/history/ci-perf-2026-11-22-ids-datetime-sweep-regex-once.md`.
