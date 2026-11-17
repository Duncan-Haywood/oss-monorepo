---
title: "Paste a URL into a subdomain takeover checker and it says you're safe"
seo_title: "Subdomain takeover checker read a pasted URL as no CNAME"
date: 2026-11-12
tags: [redteam, security, subdomain-takeover, dns, testing]
description: "The resolver answers NXDOMAIN for https://blog.example.com/, so the checker reported no CNAME and no risk. The fix and the tests that now guard it."
---

People paste URLs, not hostnames. Copy a link from a browser's address bar
into a form that asks for "a hostname" and you get
`https://blog.example.com/`, scheme, slash and all.

[Subdomain Takeover Checker](../../ventures/subdomain-takeover-check/README.md)
sent whatever it got to Cloudflare's DNS-over-HTTPS resolver. Asked for the
CNAME of the name `https://www.github.com/`, the resolver gives the correct
answer for a name that doesn't exist (checked today with `curl`):

```
{"Status":3, ... "Question":[{"name":"https://www.github.com/","type":5}] ...}
```

Status 3 is NXDOMAIN. The checker treats NXDOMAIN as a real answer meaning
"this name has no CNAME", because for a real hostname that's what it means. So
the pasted URL was filed as `no-cname`, and the page and CLI said:

> No subdomain-takeover risk found (1 hostname(s) checked).

The CLI also exited 0. If `blog.example.com` was a CNAME pointing at a deleted
Heroku app, which is exactly what this tool exists to find, the person who
pasted its URL was told it was fine. That's the worst wrong answer a security
checker can give: a confident all-clear.

## How it was found

Today's red-team run planted 10 faults in the checker's `analyze.mjs` and 8 in
the [UCR fee calculator](../../ventures/ucr-fee-calculator/README.md). The
tests caught all 8 UCR faults and 8 of the 10 in `analyze.mjs`. One of the two
that got through was a dead branch. The other changed the "unconfirmed risk"
verdict to `clean: true`. The tests checked that verdict's exit code and text
but never its `clean` flag, and the page uses that flag to decide whether the
verdict box turns green. A new test now checks it.

The pasted-URL bug came from the other half of the run: reading the code as an
attacker, or as a hurried user. `lookup.mjs` passes the name straight into
the query string. Nothing between the input box and that call removed a
scheme, a path or a trailing dot. A sibling tool,
[email-auth-check](../../ventures/email-auth-check/README.md), already
removes `https://` and the path from what's typed. This one didn't.

## The fix

`analyze.mjs` now has a pure `parseHostname()`, shared by the CLI and the
page. It reads the input through the browser's own `URL` parser, so
`https://Blog.Example.com:443/path?q=1#x` and `blog.example.com.` both become
`blog.example.com`, and `bücher.example` becomes its punycode form
`xn--bcher-kva.example`, which is what DNS actually stores. Every label is
then checked against the hostname rules (letters, digits, hyphens not at
either end, underscores for names like `_dmarc`, at most 63 characters a
label and 253 overall).

Anything that fails is never sent to DNS. The CLI records it as a failed
lookup, so the exit code is 1. The page shows "That is not a hostname" and
stops. Either way, a typo can no longer come back clean.

Two new tests in `check.test.mjs` guard it: one checks that a pasted URL and a
trailing-dot name both reach the resolver as `blog.example.com` and both get
confirmed, and one checks that four non-hostnames (`not a hostname`,
`exa mple.com`, `http://`, `-bad.example.com`) produce four errors and a
non-clean verdict without a single DNS query. Before the fix, both tests
failed.

## Numbers

| | Seeded | Caught by the existing tests | Caught after today's tests |
|---|---|---|---|
| subdomain-takeover-check `analyze.mjs` | 10 | 8 | 9 (1 unreachable) |
| ucr-fee-calculator `calc.mjs` | 8 | 8 | 8 |

Of the 17 faults that could change a result, 16 were caught before (94%) and
all 17 after. The run also found and fixed one real defect.
