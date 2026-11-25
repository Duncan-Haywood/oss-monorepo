---
title: "Fifteen secret names, one minter: one-hour Cloudflare tokens for CI"
seo_title: "One-hour Cloudflare API tokens for GitHub Actions"
date: 2026-11-24
tags: [security, cloudflare, ci, github-actions]
description: "Our deploys read Cloudflare keys under fifteen secret names. Now each job mints a token with only its permissions, valid for an hour, and deletes it at the end."
---

Every site in this portfolio is served by Cloudflare, and every deploy job needs an API key to publish. Over two months the keys piled up the way keys do when each new workflow is set up by hand. A count today found **fifteen secret names across two repositories**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLAREAPITOKEN`, `CLOUDFLARERESTRICTEDAPIKEY`, `CF_API_TOKEN`, `CF_TOKEN`, `CLOUDFLARE_TOKEN`, `CF_API_KEY`, `CLOUDFLARE_API_KEY` and more, with workflows reading them through chains like `secrets.A || secrets.B || secrets.C` so that whichever one happened to be saved would work.

The grant-writing app's deploy went further: it accepted Cloudflare's Global API Key with a login email. That key reaches the whole account, cannot be scoped, and never expires. We checked the latest production run's log before calling it a live problem. It was not being used that day: the secret named `CLOUDFLARE_API_KEY` held a scoped token, and the run authenticated as one. The code path was still there, waiting for someone to save the key.

## What we built

A small GitHub Action, [`platform/ci/cloudflare_mint`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/platform/ci/cloudflare_mint), with no dependencies. One secret, the *minter*, can only create API tokens. Each job that talks to Cloudflare runs the action first, with a profile name:

- `site-deploy` gets *Workers Scripts Write* and *Account Settings Read* on one account.
- `usage-analytics` gets read-only analytics on one zone.
- `email-routing` gets the Email Routing rules on one zone, for 15 minutes.

The action asks Cloudflare for a token with exactly that profile's permissions and an `expires_on` 15 to 75 minutes out. It masks the value in the log before anything else can print it, and hands the token to the job's later steps. A `post:` step deletes the token when the job ends, whether it passed or failed. It also sweeps up any expired token that a killed job left behind. Each token is named after the repository, profile and run, so Cloudflare's audit log shows which workflow run made each call.

Permission names are looked up live, not hard-coded as ids. A typo in a profile stops the job before a token exists, and the error suggests the closest real names. A test makes sure no profile can include a token-creating permission, so a job token can never mint another.

## What it does not fix

The minter is still a long-lived secret, and Cloudflare lets it create tokens with any permission its owner holds. If it leaks, that is as bad as a leaked admin token, so we have not removed the risk. We have moved it and shrunk it:

- The minter is now one secret. Only one step reads it, in a GitHub environment limited to `main`.
- `npm ci`, wrangler and every build script used to run beside the broad key. Now they only ever see a narrow token that dies within the hour.
- Rotation is one edit, and job tokens never need it.

AWS and Google Cloud let a GitHub Actions job trade its OIDC identity for short-lived credentials, with no stored secret at all. We found no such exchange in Cloudflare's API as its current SDK describes it. Until there is one, a minter is the smallest secret we can keep.

## How it was checked

The action has 15 tests, with every Cloudflare call mocked. They check the request body, the account-owned and user-owned paths, error messages that never contain a credential, masking order, the post step surviving a dead network, and the sweep touching only its own expired tokens. The endpoint shapes come from Cloudflare's own SDK, generated from their API schema. The permission names are checked against the live API the first time the owner runs `node mint.mjs check`.

The workflow changes are a separate pull request that waits for the owner's approval, as every CI change here does. After that come the one-time steps: create the minter, then delete the fifteen old secrets.
