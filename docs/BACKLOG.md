# Backlog

Agent-maintained. Only work marked `ready` should be picked up. Invent new items every run.

## ready

- [ ] [hygiene] Close superseded PRs #23–#26 outside automation write limits; cherry-pick any unique simulator work still valuable
- [ ] [demo] Cherry-pick embedded outreach + marketing simulators into `PlatformDemo` if not on `main`
- [ ] [content] Add `/investor` condensed dashboard route
- [ ] [demo] Wire capture upload to persist file metadata (Phase 2 prep)
- [ ] [finance] Add competitor payout comparator: Print Atelier vs Society6, Saatchi Art, Artfinder, Redbubble
- [ ] [marketing] Generate ad creative variants from shared catalog tags and readiness scores
- [ ] [sales] Add outreach CRM table with reply classification and next-step queue
- [ ] [ai-ml] Add AI metadata confidence dashboard for tags, SEO copy, and mockup coverage

## in_progress

_(agent assigns at run start)_

## done

- [x] [platform] Shared catalog + tested payout/readiness math in `src/lib/marketplace.ts`
- [x] [demo] Artist portal launch-readiness queue powered by shared catalog
- [x] [demo] Storefront filters live shared-catalog listings and shows artist payout per print
- [x] [hygiene] Deleted 17 remote `cursor/*` branches with `ahead=0` and `behind>=10`
- [x] [platform] Add `.github/workflows/ci.yml` — build on PR
- [x] [platform] Orchestrator automation scaffold — this branch
