---
title: "Send a drill from your phone to the tennis feeder, with a Stop button that needs no password"
seo_title: "Send a drill from your phone to the DIY tennis feeder"
date: 2026-11-18
tags: [open-tennis-robots, raspberry-pi, web, safety]
description: "The drill builder can now hand a drill to the feeder's Pi. Why it opens the Pi's own page instead of calling it, and why Stop needs no key but Start does."
---

The open tennis-ball feeder has had a
[drill builder](https://marisstella.app/open-tennis-robots/#drills) on its page
since this morning: tap the court to place balls, set speed, spin and pause, and
it checks each ball against the machine. Running the drill still meant saving a
`drill.json`, copying it to the Raspberry Pi and typing `tennisbots run`. On a
court, with a phone in one hand, that is the step people skip.

Now the builder has a **Send to my machine** button, and the Pi runs
`tennisbots serve`.

## Why the page opens the Pi instead of calling it

The project page is served over HTTPS. The Pi sits on a home or club network at
an address like `raspberrypi.local:8080`, with no certificate. Browsers block an
HTTPS page from calling a plain-HTTP address (mixed content), and they should.
So the button doesn't call the Pi. It opens the Pi's own page, with the drill in
the link's fragment (`http://raspberrypi.local:8080/#drill=...`), the same code the
share link already used. The fragment never goes to any server, ours included.
The drill goes from the phone's browser to the Pi on the same network.

The Pi's page re-checks the drill with the runner's own planner, shows each
ball's aim and wheel speeds, and runs it on the same loop as `tennisbots run`:
aim, wait for the wheels, feed, confirm the release. The aborts, the
calibration-drill hold and the shot log all carry over.

## Who may start a launcher

A ball launcher on a shared network needs a gate. The rules are uneven on
purpose:

- **Stop needs nothing.** Anyone who can open the page can stop the machine.
  Stop sends `ESTOP` on the runner's next tick, which halts the wheels and drops
  any queued ball. The stop stays latched, and **Clear stop** is a separate
  button. The firmware refuses it while the physical e-stop or the fob is down.
- **Start needs a key.** The server prints a random key on the Pi's terminal at
  start-up, and the page asks for it once.
- **Other websites can't drive it.** Every POST must be `application/json`, which
  a cross-site page can't send without a CORS pre-flight that the server never
  grants. A browser's `Origin` must be the Pi's own. The `Host` must be an IP
  address, `.local` name or one the owner allows, which stops a DNS-rebinding
  page.

The physical e-stop is still the safety stop. This page is a convenience.

## How it was checked

Nine tests run against the real firmware on the project's simulated feeder. A
drill sent from the page runs 4 of 4 balls. Stop after the first ball latches
`ESTOP`, and no queued ball leaves in the next three simulated seconds. Clear is
refused while the button is held and accepted once it is up, and then the drill
runs again. A silent board aborts with "no telemetry". Over real HTTP, a missing
or wrong key, a `text/plain` body, a foreign `Origin` and a foreign `Host` each
start nothing, and Stop works without the key. A headless browser at phone width
ran a two-ball drill from the Pi page to "Done". No built machine has run it yet.

Code and the full notes: [README, "Running a drill from the
page"](../../ventures/open-tennis-robots/README.md).
