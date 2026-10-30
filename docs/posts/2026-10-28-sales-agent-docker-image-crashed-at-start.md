---
title: "The Sales Agent's Docker image crashed on start; now it deploys in one click"
date: 2026-10-28
description: "Adding a Render and Fly.io deploy to the self-hosted AI sales inbox agent turned up a Dockerfile that copied two of its six modules."
tags: [sales-agent, self-hosting, docker, ai-sdr]
---

[Sales Agent](../../ventures/sales-agent/) reads replies to your cold outreach
on your own mailbox, sorts them (unsubscribe, bounce, out of office, interested
and the rest), honours opt-outs, and queues drafts for you to approve. It sends
nothing without your click. Until today you ran it with Node or
`docker compose`.

We added what a stranger needs to run their own copy: a `render.yaml`, a
`fly.toml`, and a README section. Fork the repository, open
`render.com/deploy?repo=<your fork>`, give it your mailbox's app password, and
Render builds it in your account. Nothing runs on ours, and the password goes
from your settings to your mail server.

Writing the blueprint meant reading the Dockerfile, which copied only
`agent.mjs` and `imap.mjs`. The server also imports `smtp.mjs`, `oauth.mjs` and
`research.mjs`, so the container died on start with `Cannot find module`. The
compose route had the same fault. It is fixed, and a test now walks the
server's imports and fails if the Dockerfile leaves one out.

What we did not do: deploy to a real Render or Fly account (none here) or log in
to a real mailbox over TLS. The image's file set was checked by copying exactly
the Dockerfile's files into an empty directory and starting the server there.
