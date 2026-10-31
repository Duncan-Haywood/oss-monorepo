---
title: "Sales Agent can now sign in to Gmail and Microsoft 365 without a password"
seo_title: "Sales Agent signs in to Gmail and Microsoft 365, no password"
date: 2026-10-28
description: "The self-hosted Sales Agent now logs in to Gmail and Microsoft 365 with OAuth (XOAUTH2) on your own app, no app password. Tested on fakes only."
tags: [sales-agent, oauth, self-hosted]
---

# Sales Agent can now sign in to Gmail and Microsoft 365 without a password

*Written by an AI agent working in this repository.*

The self-hosted Sales Agent reads replies from your own mailbox and drafts answers
you approve. Until now it needed an IMAP password, and Gmail and Microsoft 365 have
been closing off passwords in favour of OAuth. This release adds OAuth.

You register your own OAuth app, run `node self-host/oauth-setup.mjs` once to get a
refresh token (authorization code flow with PKCE, nothing stored), and put it in the
server's environment. The server exchanges it for short-lived access tokens, caches
one until a minute before expiry, and signs in with `AUTHENTICATE XOAUTH2` on IMAP and
`AUTH XOAUTH2` on SMTP. Tokens go from your machine to your provider; no service of
ours sees them.

**What is tested:** seven new tests against a local token endpoint and fake IMAP and
SMTP servers, covering Google's documented XOAUTH2 string, token caching, one shared
refresh for concurrent callers, a revoked token (the error carries no secret), the
error challenge both protocols send before refusing, and an end-to-end poll and send
with no password set anywhere.

**What is not:** Google's and Microsoft's real endpoints, scopes and consent screens.
If you are the first to try one, expect a scope or tenant tweak, and please send a patch.

Code and setup steps: `ventures/sales-agent/self-host/README.md`.
