# ADR 0001: Architecture for autonomous photo-based nutrition tracking

- Status: accepted for the MVP (2026-11-24)
- Context documents: [`../platform-research.md`](../platform-research.md), [`../acceptance.md`](../acceptance.md)

## Decision

**Architecture A, with E's trigger as a one-time setup:** a minimal native iOS agent, a small self-hosted backend that owns the records, and a cloud vision model.

```
Camera app ──(photo saved)──► Photos library
                                   │  PHPersistentChangeToken: exact "what's new"
  Wakes: Camera-closed automation ─┤  BGAppRefresh / BGProcessing, app foreground
                                   ▼
                    iOS agent (Swift, ~1k lines, no diary UI)
                    1. Vision classifier on device ── not food ──► stays on the phone
                    2. likely food: downscale 1024 px, strip EXIF/GPS, dHash
                                   │ HTTPS + device token
                                   ▼
                    Backend (Node, zero deps, SQLite) ◄── canonical records
                    3. dedupe (asset id, sha256, dHash burst)
                    4. vision model (OpenAI-compatible, JSON schema)
                    5. policy: logged / provisional / ignored, meal grouping, labels
                    6. versioned meals + HealthKit change feed
                       ▲                         │
     ChatGPT / Claude  │ MCP (/mcp, OAuth 2.1)   │ device pulls feed on each wake
     Custom GPT        │ REST (/api/tools/*)     ▼
                       │                 7. HealthKit samples with
                       └──────────────────  SyncIdentifier = pna:<meal>:<nutrient>
                                            SyncVersion    = meal version
```

## Why this, and not the alternatives

Scores are for this owner (one person, iPhone, ChatGPT Plus), 1 = worst and 5 = best.

| Criterion | A: native + cloud AI + MCP | B: native + on-device AI | C: photo sync service + cloud | D: existing apps | E: camera/shortcut capture |
|---|---|---|---|---|---|
| Recurring user actions | 5: take the photo | 5 | 4: depends on the sync service's own background behaviour | 2: open the app, confirm | 3: use a special shortcut instead of the Camera |
| Background reliability | 3: no photo wake exists, but the Camera-closed automation plus the token gets close | 3 | 2: third-party sync is bound by the same iOS limits, and HealthKit still needs an app | 3 | 5: runs in the foreground |
| Detection latency | 4: seconds after leaving the Camera; else the next wake | 4 | 2: minutes to hours | n/a | 5 |
| HealthKit sync reliability | 4: sync IDs, retries, deferral when locked | 4 | 3: still needs the same device app | 4 | 4 |
| ChatGPT compatibility | 5: MCP + OpenAPI | 5 | 4 | 1: closed apps have no write API for ChatGPT | 5 |
| Estimation accuracy | 4: frontier vision model | 1: no capable on-device vision LLM for third parties | 4 | 3–4 | 4 |
| Development complexity | 3 | 2 | 2: an extra service with its own auth and storage | 5 | 4 |
| Operating cost | 4: about $1–3/month of model calls plus a small VM | 5 | 3 | 2: subscriptions | 4 |
| Privacy | 4: non-food never leaves the phone; food images are downscaled, stripped and short-lived | 5 | 1: the whole library goes to a third party | 2 | 4 |
| Battery | 4: short bursts on wake | 3 | 4 | 4 | 5 |
| Maintenance | 3: two components you own | 2 | 2 | 5 | 4 |

- **B** fails on accuracy: no third-party on-device model estimates portions from images credibly today.
- **C** sends the entire library to someone else's servers. That is the opposite of brief §11, and it still needs a device app for HealthKit, because HealthKit has no server API.
- **D** cannot be driven by ChatGPT. No consumer nutrition app found exposes an MCP or OpenAPI surface with write access to its records, and each adds manual confirmation.
- **E** is kept as setup, not as the capture path. The Shortcuts automation that powers A's wake is exactly E's mechanism, attached to the ordinary Camera app.

## Key sub-decisions

1. **Source of truth: the backend database.** ChatGPT can only reach a server. HealthKit has no meal structure, item lists, versions or provenance, and apps can only edit their own samples there. HealthKit is a projection, rebuilt from the meal's current version. If the two disagree, the server wins and the device re-applies.
2. **Corrections ride HealthKit's own sync versioning.** One sample per nutrient per meal, `SyncIdentifier = pna:<meal-id>:<nutrient>` and `SyncVersion = meal version`. A newer version replaces the old sample inside HealthKit; deletes go by sync identifier. Retries are safe: the device skips samples it finds already at that version (partial-write recovery).
3. **Server-side analysis, not device-side.** The API key stays on the server; the prompt and model can be changed without an app update; reanalysis and the audit trail live with the records. The phone sends only likely-food images.
4. **Stateless MCP over Streamable HTTP, plus REST/OpenAPI.** One tool registry; ChatGPT developer mode, Claude connectors, and Custom GPT Actions all reach it. OAuth 2.1 with PKCE and dynamic registration for connectors, and a static bearer for Actions and scripts.
5. **Conservative logging policy.** Auto-log only when the model's confidence ≥ 0.6 *and* the likelihood the photographer is eating it ≥ 0.6. Otherwise the meal is `provisional`: out of totals and Health, and listed by `get_pending_reviews`. Menus, groceries, recipes and other people's plates are ignored, and their images are dropped at once. Every threshold is a setting.
6. **Idempotency at every layer.** The asset id is unique; sha256 catches edited copies and re-exports; a dHash within 10 minutes catches bursts; the meal id is derived from the first photo's id; and every write of a meal is a new version row.
7. **Zero dependencies, one process, SQLite.** The backend is plain Node 22 (`node:sqlite`, `node:http`), so it runs on any $5 VM, a home server, Fly.io or Render, with one file to back up.

## Consequences

- A correction made in ChatGPT reaches Apple Health on the phone's next wake, not instantly. That wake is the next Camera use, background refresh or app open. Silent push (APNs) would shorten this but needs an Apple Developer key and Push setup; see the plan, P2.
- The owner runs a small server. That is the price of having ChatGPT read and write the records.
- The Camera-closed automation is a dependency on Shortcuts behaviour Apple could change. The token-based scan keeps correctness without it; only latency suffers.

## Revisit when

- **The iOS 26.1+ background upload extension's limits are measured.** If it can classify on device within its window, it removes the Shortcuts setup entirely (true zero setup after install).
- **OpenAI confirms which plans get MCP write tools**, and whether they work in the iOS app.
- **Apple ships an on-device model that accepts images from apps**, which would make stage 2 on device worth evaluating (B).
