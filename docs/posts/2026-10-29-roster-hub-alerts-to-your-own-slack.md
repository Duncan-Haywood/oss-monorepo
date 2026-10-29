---
title: "Your self-hosted team schedule can now ping your own Slack, Discord or phone"
date: 2026-10-29
tags: [shift-roster-builder, self-hosted]
description: "The free shift-roster server can post to a webhook you own when staff send a call-out, trade or time-off ask, and when you publish a week."
---

The self-hosted roster hub already let staff see their shifts, trade, claim open shifts, ask for time off and report a call-out. The gap was that you had to open the admin page to find out. It can now post to a webhook you own.

Set `NOTIFY_WEBHOOK_URL` and your manager channel gets a line for each staff request. Set `TEAM_WEBHOOK_URL` and the team channel gets everyone's shifts when you publish. Slack, Discord, ntfy and plain JSON are supported through `NOTIFY_FORMAT`. It is off unless you set a URL.

Paid schedulers charge per user for push notifications. Here the message goes from your server to your channel, and nothing passes through a service we run. A message holds no wages and no admin key, staff-typed text is escaped so it cannot ping `@channel`, and a dead webhook never blocks a request.

It is tested against an injected fetch, not a live Slack, Discord or ntfy. Setup is in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#run-your-own-team-schedule-self-hosted).
