# Agent Workroom

A small 3D office for the AI agents you hand work to. Each agent has a desk
whose monitor shows what it is on; the back wall holds every task as a sticky
note in *to do*, *in progress*, *in review* or *done*. Type or say what needs
doing, and pull real progress from a GitHub repository's pull requests.

**Live:** https://duncan-haywood.github.io/oss-monorepo/agent-workroom/

It started as a for-fun project (owner, 2026-10-24: "vr like workplace for
working with agents ... a browser etc ui for adding tasks. by voice or text").
It is a personal organiser, not a project-management system.

## What it does

- **The room.** Plain CSS 3D transforms, no WebGL and no libraries, so it
  runs on a phone. Drag or use the arrow keys to look, W/A/S/D (or the
  scroll wheel once the room has focus) to walk, R to recentre, / to type.
  Desks stand on an arc facing you (`deskLayout`), avatars bob while their
  agent has a task in progress, and every note and desk is clickable.
  Everything in the room is also in the plain table below it.
- **Typed or spoken commands** (`parseCommand`): anything that isn't a
  command is a new task. `fix the login redirect for Builder`,
  `add task: rotate deploy key @Scout #ops !`, `start 2`,
  `move login to review`, `mark task three done`, `assign 4 to Reviewer`,
  `add agent called Atlas`, `delete 5`. Spoken "for <name>" only assigns
  when <name> already has a desk, so "write docs for users" stays a title.
  A reference matching more than one task does nothing, so a misheard word
  never moves the wrong card. Voice uses the browser's
  `SpeechRecognition`; the button only appears where it exists. Replies can
  be read aloud.
- **Progress from GitHub** (`pullToTask`, `mergePulls`): the 40 most
  recently updated pull requests of a public repository, unauthenticated.
  Draft → in progress, open → in review, merged → done, closed unmerged →
  skipped. `claude/`, `codex/`, `copilot/` (and a few more) branch prefixes
  put the PR on that agent's desk. Re-pulling updates by id and keeps local
  numbering; optional refresh every five minutes.
- **Hand-off:** *Copy brief* copies a short prompt for an agent; *Draft
  issue* opens GitHub's prefilled new-issue form. Nothing is posted for you.
- **Data:** local storage only; JSON export and import (`loadState` drops
  malformed rows, non-https links and duplicate numbers rather than trusting
  the file).

## The headset room (`vr.html`)

Added 2026-11-03 at the owner's request ("a meta vr app to interact with
claude code agents and work with this repo ... mainly voice controlled but
also like normal vr controls"). Same board, same local storage, drawn with
raw WebGL and entered through WebXR's `immersive-vr`, so it runs in Meta
Quest Browser with no install and no libraries apart from the speech model.

- **Room:** the task board ahead (four columns, seven notes each, then
  "+N more"), agents' desks on a ring behind and to the sides, each
  monitor showing that agent's current task, progress and CI state, and a
  control panel to the left with what you said, the reply, the selected
  task and nine buttons.
- **Voice first, push to talk:** hold grip or A/X, speak, let go. Where the
  browser has `SpeechRecognition` it is used. Where it doesn't, which seems
  to include Quest Browser (Meta's forum threads say so; we have not
  checked on a device), Whisper tiny.en runs on the device through
  transformers.js 3.3.3 (8-bit, WebAssembly, ~41 MB downloaded once from
  Hugging Face). New commands (`parseCommand`): `go to the board`,
  `go to Claude's desk`, `recenter`, `refresh` / `check CI`, `select 3`,
  `help`, `ask Claude on 12 to add a regression test`, `confirm`,
  `cancel`. Each is matched on the whole line, so "go through the copy"
  is still a task.
- **Controllers:** the trigger (or a pinch with hand tracking) selects what
  the ray hits; left stick walks, right stick snap-turns 30°.
- **Talking to agents:** `ask` drafts a pull-request comment starting
  `@claude` (or `@copilot`, `@codex`, or a desk's name) and waits. Only
  `confirm` or the Send button posts it, with a GitHub token the person
  pastes on the page. The token lives in a variable: never stored, sent only
  to `api.github.com`. With a token, refresh also reads check runs for up
  to ten open pull requests (`checkSummary`), so a red CI shows on the
  monitor and the note.
- **Preview:** without a headset the same scene renders on the page: drag
  to look, W/A/S/D, click, hold Space to talk.

### Verified (2026-11-03), and not

- `node --test` on all four test files.
- Headless Chromium (SwiftShader WebGL) at 1280x900 and 390x800, against a
  mocked GitHub API: three pull requests become three tasks on Claude,
  Codex and Dependabot desks; check runs mark #2 failing; "go to Codex's
  desk" moves the camera; "ask claude on 4" refuses (a local task);
  "ask claude on 2 …" then "confirm" POSTs exactly
  `@claude look at the failing test` with the bearer token; the 2D page sees
  the same four tasks; no page errors; no horizontal scroll at 390 px.
- A fake WebXR device (stubbed `navigator.xr`, session, frames and one
  controller) runs the headset frame loop for 40 frames with no errors,
  and the right stick snap-turns.
- On-device speech: in headless Chromium, through the real CDN and model,
  Whisper transcribed the 11-second JFK sample clip word for word (8.6 s,
  single-threaded WebAssembly). The push-to-talk path (fake microphone
  playing that clip → `voice.mjs` → a new task) is in the run record.
- **Not verified on a real headset.** WebXR rendering, controller mapping
  and Whisper's speed on a Quest are unchecked. That is the next thing to
  try, and the first likely fix is a smaller texture budget or a faster
  speech model if a Quest 2 struggles.

## Files

| File | What |
| --- | --- |
| `engine.mjs` | Everything that isn't DOM: parsing, state, PR mapping, layout. |
| `engine.test.mjs` | Its tests. |
| `index.html` | The room, the table, voice, GitHub fetch. |
| `page.test.mjs` | Page invariants (disclaimer, privacy line, no innerHTML). |
| `usage.mjs` | Local-only feature counters with opt-out. |
| `vr.html` | The headset room: WebGL renderer, WebXR session, controllers, voice, GitHub. |
| `xr.mjs` | Its pure part: matrices, scene layout in metres, ray picking, audio resampling. |
| `voice.mjs` | Push to talk: the browser's recognition, or Whisper on the device. |
| `xr.test.mjs`, `vr.test.mjs` | Their tests and page invariants (disclosures, fetch targets, token never stored, one POST). |

## Run it

```sh
node --test ventures/agent-workroom/*.test.mjs
python3 -m http.server -d ventures/agent-workroom 8000   # then open http://localhost:8000 (and /vr.html)
```

## Verification (2026-10-24)

- `node --test` on both test files passes.
- Headless Chromium (Playwright) at 1280x900 and 390x800: example board
  loads, W and arrow keys move the camera, a typed command adds a task, a
  mocked GitHub response of three pull requests (draft, open, merged)
  produces three tasks on Claude, Codex and Dependabot desks with the right
  statuses, state survives a reload, no page errors, no horizontal scroll
  at 390 px. Voice was not tested end to end: headless Chromium has no
  microphone.

## Ideas, if it earns them

- Try it on a Quest and fix what breaks (see "Verified, and not").
- Wake-word or always-listening mode, if push to talk turns out tiring.
- Read a repository's own work queue files (this repo's `portfolio/requests/`) as tasks.
- A shared board through a self-hosted backend, for teams.

## Licence

MIT. See [LICENSE](LICENSE). No warranty.
