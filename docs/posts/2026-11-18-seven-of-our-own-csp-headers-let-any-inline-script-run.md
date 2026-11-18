---
title: "Seven of our own 23 CSP headers let any inline script run: a CSP checker, and what it found at home"
seo_title: "Free CSP checker: test what a Content-Security-Policy blocks"
date: 2026-11-18
tags: [ventures, csp-policy-check, security, product]
description: "A free CSP checker built on the CSP Level 3 rules, and what it found in the 23 policies this repository's own servers send."
---

A Content-Security-Policy is the browser's last line against script
injection: even if an attacker gets `<script>` into your page, a good policy
stops it running. It is also a header most people write once, by copying,
and never read again. The questions that come back are always the same: *why
is this script blocked?* and *would this policy actually stop anything?*

The new [CSP Policy Check](https://marisstella.app/csp-policy-check/) answers
both. Paste a policy (a bare header value, a `Content-Security-Policy:` line,
a `curl -sI` dump, or a `<meta>` tag) and it shows:

- the findings a strict-CSP review looks for, each with its fix;
- which directive governs each kind of resource after the fallback chain
  (`script-src-elem` → `script-src` → `default-src`, `worker-src` →
  `child-src` → `script-src`, and the three that never fall back:
  `base-uri`, `form-action`, `frame-ancestors`);
- a tester: would `https://cdn.example.com/lib.js` load, with or without the
  element's nonce, inserted by the parser or by another script? Would this
  inline script, this `onclick`, this `eval()` run? For inline code it prints
  the `sha256-` value to add.

It runs in the browser, and the same code is a Node CLI that exits 1 on a
high finding or a blocked test, for CI.

## Where the rules come from

The matching is the W3C [CSP Level 3](https://www.w3.org/TR/CSP3/) draft's
algorithms, written out function by function: parsing (§2.2.1), the source
expression grammar, scheme, host, port and path matching (§6.7.2), the
inline checks (§6.7.3) and the fallback lists (§6.8). The tests pin the
spec's own examples. The CSP spec's hash example says the script
`alert('Hello, world.');` is allowed by
`'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='`, and the tool
computes exactly that. The other pinned rules: `*.example.com` does not match
`example.com`; an `http://` source accepts the `https://` upgrade but not the
reverse; a path ending in `/` is a prefix while one without is a single file;
and paths stop counting after a redirect.

The advice side follows Weichselbaum, Spagnuolo, Lekies and Janc, "CSP Is
Dead, Long Live CSP!" (ACM CCS 2016). That paper found host allowlists
bypassable in most of the policies it studied and argued for a nonce plus
`'strict-dynamic'`, with `object-src 'none'` and `base-uri 'none'`. That
policy is the tool's "strict example", and it draws no finding above info.

Some of what it checks is easy to get wrong by eye:

- **`self` without quotes** is a host named `self`, not your origin.
- **`'unsafe-inline'` next to a nonce does nothing** in any CSP2+ browser,
  and **`'strict-dynamic'` with no nonce blocks every script**, your own
  included.
- **A duplicate directive is dropped**, not merged; the first one wins.
- **`frame-ancestors` in a `<meta>` tag is ignored** (§3.3).
- **A misspelt directive** (`scirpt-src`) is silently ignored by browsers;
  the tool names the nearest real one.

## What it found at home

This repository's self-hosted servers (status pages, help desks, form
inboxes, the tennis robot's remote) set their own CSP headers in code. A grep
for `content-security-policy` in venture source outside tests finds 23. Run
through the checker:

| Finding | Policies |
|---|---|
| high: `script-src 'unsafe-inline'` with no nonce or hash | 7 of 23 |
| medium: no `base-uri` where scripts can run | 6 |
| low: no `base-uri`, but no script can run at all | 14 |
| info: inline styles allowed | 23 |
| no high or medium finding | 15 |

Every policy, file and line is in [the survey table](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/csp-policy-check/eval/repo-csp-survey-2026-11-18.md), and `eval/survey-repo-csps.mjs` re-runs it.

The 15 clean ones share a shape worth copying: `default-src 'none'` and
`style-src 'unsafe-inline'`, with no script at all, which no injected
`<script>` can get past. The seven high ones are pages that do run script and
allow it inline wholesale: `cancel-flow` (two pages), `trade-bid-studio`,
`feedback-board`, `error-keeper`, `webhook-relay` and the
`open-tennis-robots` remote. They escape their output, so this is not a known
hole. But the policy is the layer meant to catch the escaping bug nobody has
found yet, and for those pages it would not. The fix for each is the one in
the [inline-script guide](https://marisstella.app/csp-policy-check/refused-to-execute-inline-script.html):
a per-response nonce on the page's own `<script>` tags. It is listed as the
next step for the tool, not done in this change.

The survey also changed the tool. The first version marked every missing
`base-uri` medium. But on a page whose script list is only `'none'`, an
injected `<base>` can only repoint links and relative images, so 14 of those
20 findings were overstated. They are low now, and a test pins the
difference.

## What it does not do

It reads the policy text. It cannot tell whether a nonce is really fresh per
response, whether an allowed CDN serves JSONP, or whether your own code
passes strings to `eval`. Browsers also differ from the draft at the edges,
and the README lists what is not modelled (Subresource Integrity on external
scripts, Trusted Types, `sandbox` flags). A clean result means the policy
avoids these weaknesses. It does not mean the site has no injection bug.

Source, CLI and tests: [`ventures/csp-policy-check`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/csp-policy-check).
MIT licensed, free, no account.
