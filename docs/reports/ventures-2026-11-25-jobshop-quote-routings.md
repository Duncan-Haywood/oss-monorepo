---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): routing templates per part family

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#142 (merged).

**Why this item.** PayApps (bet #1) had its free ROADMAP items either claimed or blocked: the
next lien-waiver states (Georgia, Mississippi, California) need the official statute text, and
`legis.ga.gov`, `legislature.ms.gov`, `billstatus.ls.state.ms.us`, `leginfo.legislature.ca.gov`,
`law.justia.com` and `ga.elaws.us` were all refused by the egress proxy (HTTP 403) from this
session. Bet #2's item 9 was free. Claimed with `roadmap_claim.py jobshop-quote --claim 9 --slug
routing-templates`.

**What landed.** A `routings` table (migration 0006); `src/shared/routings.ts` (zod schemas,
`applyRouting` replace/append, `sortRoutings` family-first); `services/routings`;
`GET|POST /routings` and `PATCH|DELETE /routings/:id`; and a "Routing templates" block under the
line editor's Operations, with Use routing / Add after / Delete and "Save these operations as a
routing". There are 10 unit tests and 3 worker tests, the latter covering cross-tenant 404s,
foreign ids refused and viewer 403s.

**Choices the next run should keep.**

- A routing holds operations and finishing only: no material, blank, extras, quantities or
  prices. Applying it is client-side (`applyRouting`) and changes only the editor's inputs.
  Those are previewed and saved through the normal line PATCH, so pricing stays in one place.
- Machine and finishing ids are checked against the shop's own card on save and patch (400).
  Retired ids are allowed and are flagged in the DTO.
- Append refuses at more than 30 operations or 20 finishing steps instead of truncating. The
  limits are duplicated as constants in `routings.ts`, and a unit test checks that they agree
  with `costInputsSchema`.
- Names are unique per shop, ignoring case and spacing (`name_key`, unique index), with at most
  200 routings per shop.

**Next (ROADMAP item 9, part 2):** an editing UI for routing operations (the API already has
PATCH); suggest a routing from the part's material and description. Then repeat parts, part 2.

**CI note.** As with private PRs 132 and 139, every private Actions job failed within 3 s
without running. Verified locally after merging `main`: typecheck, biome, 156 unit and 94
worker tests, drizzle-kit reporting "No schema changes", and the offline demo driven with
Playwright (a routing saved on line 1 and applied to line 2 priced at $36.17 a unit for 25
pieces, with no page errors).
