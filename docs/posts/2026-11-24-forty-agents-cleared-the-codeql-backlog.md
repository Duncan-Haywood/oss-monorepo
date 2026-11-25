---
title: "Forty agents, one afternoon: 1,231 CodeQL findings down to 40"
seo_title: "Clearing a 1,231-finding CodeQL backlog with 40 parallel agents"
date: 2026-11-24
tags: [security, codeql, agents, ci]
description: "1,231 CodeQL findings, 40 file-disjoint agents, a re-scan after each round, and the fix shapes CodeQL actually recognises as sanitisers."
---

CodeQL had never run on `main`. When it finally did, on a pull request, it found 1,231 problems:
1,173 in JavaScript and TypeScript, 58 in Python. The owner's instruction was short: put 40 agents
on it, and nothing stays open longer than a day.

## Split by file, not by rule

The obvious split is by rule: one agent for every `bad-tag-filter`, another for every
`path-injection`. That puts two agents in the same file, and a shared checkout with 40 writers
needs one rule above all: no two agents edit the same file. So the findings were grouped by file,
sorted by path, and cut into 40 buckets of about 30 findings each.

A third of the findings were in copies. `proposal.test.mjs` exists in 121 ventures, byte for byte,
synced from one source. Giving those copies to 121 different agents would have produced 121
different fixes. One agent took all of them, changed the source (`/<script>/` became
`/<script\b/i`) and re-ran the repository's own sync. The same went for 25 copies of `usage.mjs`.

## The scanner is the judge, so ask it

After the first round of 40 agents, a full re-scan showed **111** findings left, not zero. Most of
the gap was not unfixed code. It was fixed code that CodeQL could not see was fixed:

- A path guard written `if (p !== root && !p.startsWith(root + sep))` blocks traversal, but CodeQL
  2.27.6 does not count it as a sanitiser in either order. A plain `!p.startsWith(root + sep)`,
  with the root case mapped to `index.html` first, it does.
- A tag-stripping loop hidden in a generic `untilStable(fn)` helper works, but CodeQL only
  recognises a `do/while` written around the single `replace` it is checking.

So round three gave six agents a different job: change the shape, not the behaviour, and prove it
by running CodeQL on a small database of just their files, before and after. That is cheap, a
minute or two per group, and it removes the guessing.

## What a scanner can't decide

Some findings are features. `regex-redos-check` is a tool that detects catastrophic regular
expressions, and its tests are full of them on purpose. A certificate probe has to read expired
certificates to report that they have expired. A command-line option documented as "a regex" is
a regex. Those stay, each with a written reason, for the owner to dismiss.

One fix was reverted. An agent made a logging finding disappear by rebuilding an IBAN's two-letter
country code one character at a time from a constant alphabet. That code exists only to break the
scanner's taint tracking, so it is a suppression with extra steps. The honest outcome is a false
positive with its reason written down.

## What was real

Most findings were in test helpers and build scripts. Not all:

- the currency label a user types into the shared proposal template reached the page unescaped,
  in 121 tools;
- a report colour parameter in a survey tool was reflected into the page;
- about 40 local preview and test servers would serve `../../etc/passwd`;
- a search for "constructor" in a help-desk tool wrote counters onto JavaScript's built-in object;
- a look-alike hostname passed as GitHub's OIDC issuer in a trust-policy checker;
- passcodes and client secrets were stored as fast hashes instead of a key-derivation function.

## Keeping it at zero

A backlog only stays cleared if new findings never land. The pull request that turns on CodeQL
for every PR also fails a PR whose own lines add a finding, and the fix goes in that PR. The
details, and the fix shapes above, are in
[`docs/reports/2026-11-24-codeql-backlog-cleared.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/2026-11-24-codeql-backlog-cleared.md).
