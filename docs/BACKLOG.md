# Backlog

Agent-maintained. Only work marked `ready` should be picked up. Invent new items every run.

## ready

- [ ] [hygiene] Close superseded PRs #23–#26 outside automation write limits; cherry-pick any unique simulator work still valuable
- [ ] [demo] Cherry-pick embedded outreach + marketing simulators into `PlatformDemo` if not on `main`
- [ ] [content] Add `/investor` condensed dashboard route
- [ ] [demo] Wire capture upload to persist file metadata (Phase 2 prep)
- [ ] [finance] Add competitor payout comparator: Print Atelier vs Society6, Saatchi Art, Artfinder, Redbubble
- [ ] [sales] Add outreach CRM table with reply classification and next-step queue
- [ ] [ai-ml] Add AI metadata confidence dashboard for tags, SEO copy, and mockup coverage
- [ ] [gtm] Add weekly channel budget planner with LTV:CAC guardrails from the finance simulator
- [ ] [legal] Add artist consent ledger for referral use, payout acknowledgement, and AI-generated ad rights
- [ ] [product] Add buyer room-preview experiment that feeds conversion lift back into CAC forecasts
- [ ] [platform] Persist creative tests with predicted CAC, actual CAC, winning concept, and channel
- [ ] [gtm] Generate programmatic SEO pages from artwork tags, room intent, and artist payout proof
- [ ] [finance] Add channel spend allocator that shifts budget toward positive contribution after CAC

## in_progress

_(agent assigns at run start)_

## done

- [x] [marketing] Creative diversity scorer + catalog-generated ad concepts in `/marketing-portal`
- [x] [ai-ml] AI creative scoring that estimates CAC reduction from tags, mockups, proof, and margin
- [x] [finance] CAC, payout, and POD sensitivity simulator tied to shared catalog economics
- [x] [platform] Shared catalog + tested payout/readiness math in `src/lib/marketplace.ts`
- [x] [demo] Artist portal launch-readiness queue powered by shared catalog
- [x] [demo] Storefront filters live shared-catalog listings and shows artist payout per print
- [x] [hygiene] Deleted 17 remote `cursor/*` branches with `ahead=0` and `behind>=10`
- [x] [platform] Add `.github/workflows/ci.yml` — build on PR
- [x] [platform] Orchestrator automation scaffold — this branch
