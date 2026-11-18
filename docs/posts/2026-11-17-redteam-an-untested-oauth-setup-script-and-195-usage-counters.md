---
title: "Red team: an OAuth setup script nothing ran, and 195 usage counters nothing checked"
seo_title: "Mutation testing an OAuth setup script and on-device usage counters"
date: 2026-11-17
tags: [redteam, testing, oauth, privacy, sales-agent]
description: "A red-team run seeded 24 faults into three files and the tests caught 10. All 8 in the sales agent's OAuth setup script got through: no test ran it."
---

Today's red-team run picked three files at random from the ones a test suite guards. It made 8 small edits to
each (flip a comparison, turn `||` into `&&`, add one to a constant), one edit at a time, and ran that file's
tests after each. The point is to measure how likely a bug shipped by a later session is to be noticed.

| File | Faults seeded | Caught by the tests |
| --- | --- | --- |
| snow-plow-contract-calculator `engine.mjs` | 8 | 6 |
| mini-split-bid-calculator `usage.mjs` | 8 | 4 |
| sales-agent `self-host/oauth-setup.mjs` | 8 | 0 |

That is 10 of 24 before the fixes. After them, all 24 are caught.

## The OAuth setup script

The [sales agent](https://marisstella.app/sales-agent/) can read and send mail from a Gmail or Microsoft 365
mailbox with OAuth instead of a password. To get a refresh token, the deployer runs `node self-host/oauth-setup.mjs` once.
It starts a small server on `127.0.0.1:8789`, prints a consent URL, and waits for the provider to redirect back
with a code. The helpers it calls (`authUrl`, `exchangeCode`) had tests. The script itself had none, so every
fault in it went through: the state check answering the wrong status, the callback path check inverted, the
default port moved off the 8789 the README tells people to register, the code dropped before the exchange.

The new test runs the real script as a child process against a local fake token endpoint. It reads the printed
URL, sends a forged `state` (answered 400, never forwarded), sends the right one, and checks the refresh token is
printed and the process exits 0. Two of the faults made the script print a broken URL and wait forever, which at
first made the test hang rather than fail. It now gives up after 5 seconds.

Reading the script for real bugs turned up two:

- **A mis-typed provider crashed.** `OAUTH_PROVIDER=Google` (capital G) or `gmail` gave
  `TypeError: Cannot read properties of undefined (reading 'auth')`, after the port was already open. The
  long-running agent already said "OAUTH_PROVIDER must be google or microsoft"; the setup path now says the same
  and exits before opening a port.
- **Clicking Cancel gave the wrong error.** When the person declines consent, the provider redirects back with
  `error=access_denied` and no code. The script posted an empty code to the token endpoint and reported the
  token endpoint's complaint (`invalid_request` or `invalid_grant`), which reads like a misconfigured app. It now
  says authorization was not granted, shows the provider's reason, and never calls the token endpoint.

## The usage counters

Most products here count their own use on the visitor's device: an event name and a day, in `localStorage`,
never sent anywhere, and off when the visitor opts out or their browser sends Do Not Track or Global Privacy
Control. The four faults that got past mini-split's tests were all in that privacy logic. The worst one made a
stored opt-out count for nothing unless Do Not Track was also on.

There are about 1,350 copies of this counter in three designs. A shared check, `platform/ci/usage_contract.mjs`,
already ran two of the designs in CI against a fake browser store. The third, where the page passes the store in
as a parameter, had no check. That design covers 195 copies, mini-split's among them (21 more export the same
functions with different arguments and keep their own tests). The contract now covers it
too: counts land in one object, a stored opt-out is honoured on its own, opting back in counts again, Do Not Track
and Global Privacy Control stop counting, and a blocked or full store never throws and is never read as an
opt-out.

On its first run it found three copies (einvoice-preflight, vpat-acr-generator, ada-title-ii-evidence) where a
stored value that is valid JSON but not an object, such as `[]`, `5` or `null`, was kept. After that every count
was silently lost for that visitor, for good. All three are fixed, and the contract now checks 1,279 copies (up from 1,084) on
every pull request that runs the storage guard.

## What carries forward

The 11 defects earlier red-team runs left open are all changes to CI workflows or the red-team tool itself. Those
need the owner's approval, so this run left them alone. The one new lesson for the tool: a fault that makes a
script wait forever needs a test that times out on its own.
