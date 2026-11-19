---
title: "16 of our servers let a caller choose its own rate-limit bucket"
seo_title: "X-Forwarded-For rate limit bypass: take the last entry, not the first"
date: 2026-11-19
tags: [redteam, security, rate-limiting, nodejs]
description: "Our support agent keyed its rate limits on the client-written end of X-Forwarded-For, and so did 15 more servers. All fixed, with a CI guard."
---

The [support agent](https://marisstella.app/support-agent/) is a self-hosted chat widget that
answers customers from your help articles and hands off to a person when it can't. Its question
endpoint can call the deployer's own model key, so it carries a limit of 20 questions per minute
per address. This red-team run seeded ten faults in its server, then read the server as an attacker.

## The bug: the wrong end of the header

Behind a reverse proxy (Fly, Render, Caddy, nginx), every request reaches the app from the proxy's
address. So the app reads the client's address from `X-Forwarded-For` instead. The server did it
like this:

```js
const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || ...
```

The trap is that the header is a list, and **the client writes the first part of it**. A proxy
doesn't replace the header. It appends the address it actually saw:

```
X-Forwarded-For: 10.0.0.7, 203.0.113.7
                 ^ the caller typed this   ^ the proxy added this
```

Taking element `[0]` reads the part the caller typed. A script that sends a different made-up first
entry with each request gets a fresh bucket every time, so the limit never applies. We confirmed it
with a test: 21 questions, each with a different forged first entry, all came back 200. The fixed
server refuses the 21st with a 429. The fix is to take the last entry, the one your own proxy
appended:

```js
String(req.headers["x-forwarded-for"] || "").split(",").pop().trim()
```

This assumes exactly one proxy you trust sits in front of the app, which is how these servers are
deployed. With two proxies, take the entry that the outer one appended (the second from the right).

## It wasn't one server

The support agent shares a skeleton with our other small self-hosted servers. Searching the tree for
the same line turned up 15 more copies. They were in the waitlist, form inbox, feedback board,
survey, booking, link, flag, visit, help center and support desk servers, the e-invoice checker,
the proposal maker, and three servers in the babysitting kit. Five of them read the header without
even checking whether a proxy was configured, so a direct caller could pick its own bucket too.
Three other servers already took the right-hand entry, so the codebase disagreed with itself.

All 16 now take the right-hand entry, and all 14 affected products' test suites pass. Fixing 16
copies by hand doesn't stop a 17th, so the run also added `platform/ci/test_xff_rightmost.py`. It
scans every tracked source file for a line that reads `X-Forwarded-For` and then takes element 0 of
a comma split, and it fails if it finds one. It runs on every venture pull request (it's picked up
automatically as a suite no workflow names). We checked that it fails when the old line is put back.

## A smaller one: "starts with" is not "same site"

The support agent can import articles from a Help Keeper site by reading its `llms.txt`. It kept only
links that `startsWith` the site's address, so for `https://help.example` it also kept
`https://help.example.evil.test/a/x.md`. That would put a stranger's Markdown into the answers. It
now requires the address followed by `/`.

## What the seeded faults showed

Of the ten faults seeded in `server.mjs`, the existing tests caught 4. The six that got through were
all real gaps:

- an off-by-one in the limiter (19 allowed instead of 20)
- three status codes nobody checked (the CORS preflight, the CSV download, and a 404)
- the port the server listens on, which no test ever started the server to see

New tests catch all six, so the catch rate went from 4 of 10 to 10 of 10.

One gap is left open on purpose. The five servers with no proxy check still trust the header when
nothing sits in front of them. Making them honour `TRUST_PROXY` changes how each one is deployed,
so a later run will do it.
