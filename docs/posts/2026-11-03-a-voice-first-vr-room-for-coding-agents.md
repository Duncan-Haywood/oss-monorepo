---
title: "A voice-first VR room for the coding agents working on this repo"
seo_title: "WebXR task board for Claude Code agents, driven by voice"
date: 2026-11-03
tags: [webxr, vr, voice, claude-code, agents, open-source]
description: "Agent Workroom now has a WebXR mode: pull requests on the wall, agents at desks with CI on their monitors, push-to-talk commands, and confirmed @claude comments."
---

This repository gets dozens of pull requests a day from coding agents. Agent Workroom started as a small CSS 3D office that shows them: one desk per agent, every task as a sticky note. The owner asked for the next step: "a meta vr app to interact with claude code agents and work with this repo ... mainly voice controlled but also like normal vr controls."

So it now has a headset mode, [`vr.html`](https://duncan-haywood.github.io/oss-monorepo/agent-workroom/vr.html). It is the same board and the same local storage, drawn with plain WebGL and entered through WebXR, so Meta Quest Browser opens it with nothing to install.

**What you see.** The task board is in front of you. The agents' desks are on a ring behind you and to the sides, so none of them blocks the board. Each monitor shows that agent's current pull request, its progress and whether its CI is red. To your left is a panel that shows what it heard and what it did.

**Mostly voice.** Hold the grip, speak, and let go. "Go to Claude's desk." "Start 3." "Check CI." "Ask Claude on 12 to add a regression test." Commands are matched on the whole line, so "go through the onboarding copy" still becomes a task instead of a trip across the room.

The catch is speech recognition. Chrome has it built in. Quest Browser, as far as Meta's own forum threads say, does not. Where it is missing, the page runs Whisper tiny on the device: a 41 MB download, once, and the audio never leaves the headset. In a headless browser here it transcribed an 11-second test clip word for word in 8.6 seconds, single-threaded. A three-second command should take a second or two. How fast it runs on a real Quest is the open question.

**Normal controls too.** The trigger selects what the ray points at. The left stick walks and the right stick snap-turns. The panel has buttons for anyone who would rather point than talk.

**Talking to the agents.** A web page can't reach an agent running in someone's terminal, but many agents already listen on GitHub. "Ask Claude on 12 to …" drafts a comment on pull request 12 that starts `@claude`, which the Claude Code GitHub action picks up where it is installed (`@copilot` and `@codex` work the same way). Nothing is posted until you say "confirm". The token you paste stays in the tab's memory and is never saved.

**What isn't checked yet.** Every test so far ran in a desktop browser, with a fake WebXR device standing in for the headset. Rendering, controller mapping and speech speed on an actual Quest are untested. Trying it on one is the next step.

The code is MIT in [`ventures/agent-workroom`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/agent-workroom).
