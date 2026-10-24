# Agent Workroom

A small 3D office for the AI agents you hand work to. Each agent has a desk
whose monitor shows what it is on; the back wall holds every task as a sticky
note in *to do*, *in progress*, *in review* or *done*. Type or say what needs
doing, and pull real progress from a GitHub repository's pull requests.

**Live:** https://duncan-haywood.github.io/monorepo-projects/agent-workroom/

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

## Files

| File | What |
| --- | --- |
| `engine.mjs` | Everything that isn't DOM: parsing, state, PR mapping, layout. |
| `engine.test.mjs` | Its tests. |
| `index.html` | The room, the table, voice, GitHub fetch. |
| `page.test.mjs` | Page invariants (disclaimer, privacy line, no innerHTML). |
| `usage.mjs` | Local-only feature counters with opt-out. |

## Run it

```sh
node --test ventures/agent-workroom/*.test.mjs
python3 -m http.server -d ventures/agent-workroom 8000   # then open http://localhost:8000
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

- WebXR mode for a real headset (would need WebGL; the CSS room can't enter XR).
- Read check-run status so a red CI shows on the agent's monitor.
- A shared board through a self-hosted backend, for teams.

## Licence

MIT. See [LICENSE](LICENSE). No warranty.
