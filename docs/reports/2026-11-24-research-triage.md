---
kind: analysis
date: 2026-11-24
subjects: [build-data, buildbot-sheathing, sensing-selfcal, heavy-hydraulics, llm-coding-inference, marine-hull]
topics: [research-integrity]
---
# Research triage, 2026-11-24

**For:** the next research run, and anyone changing `research/PROGRAMMES.md`.
**Why:** the owner, 2026-11-24: "research work gets pivoted into products" and "we
don't invest dev effort in sunken ships. invest in things that have most promise and
most value" (`research/CLAUDE.md`, new top paragraph; `prompts/goals.md`, "Where effort
goes"; the ranked bets in `portfolio/monetization/bets.md`).

## What changed

- Every one of the 23 open programmes in `research/PROGRAMMES.md` now has a
  triage state and a one-line reason (two new columns, before "Target venue" so
  `venue_policy.py` and `portfolio/direction/report.py`, which read the venue as the last
  cell and the question and "Builds on" as cells 2 and 3, keep working).
- `research/_shared/pick_track.py` draws only `product-linked` and `finish-paper`
  programmes (`triage()`, `drawable()`). `FOCUS` is now the construction and
  manufacturing tracks (`house`, `buildbot`, `heavy`, `sensing`, `robofab`;
  `FOCUS_PROGRAMMES = {"build-data"}`), and programme draws put those first with
  probability `PROGRAMME_FOCUS_SHARE = 0.75`. A track draw lists the wound-down
  programmes it would have named and tells the run to open a product-linked one instead.
- Tests: `TriageTest` in `research/_shared/test_pick_track.py` (parsing, the filter, the
  real table fully triaged, the venue column still last); the focus-share test now uses
  the new constant.

**Counts:** 5 product-linked, 1 finish-paper,
17 wound-down. Simulated over 4,000 draws with no open-PR claims and
every host up, the drawable set splits 92% construction (`buildbot-sheathing` 23.9%,
`sensing-selfcal` 23.2%, `heavy-hydraulics` 22.7%, `build-data` 22.4%) and 8% the rest
(`marine-hull` 3.9%, `llm-coding-inference` 3.9%).

## How the calls were made

- **product-linked** needs a named bet in `bets.md`, a credible SMB product, or the
  open-hardware company track that the pending `research/CLAUDE.md` paragraph names
  (`buildbot-*`, `osrobot-*`, `marine-*`, `heavy-*`), *and* a sentence on what the result
  changes in it.
- **finish-paper** needs a draft in `paper/` and a short list of remaining steps, and a
  product or track it lends credibility to. Several wound-down programmes have mature
  drafts (`verified-dse`, `verifiable-training-mechanisms`, `cell-fidelity`,
  `sim2real-inference`); a draft alone was not enough, because the paper would lend
  credibility to no chosen product. That is the "sunk cost is a tiebreaker, never a
  reason" rule in `goals.md`.
- **wound-down** means no new effort. Directories, logs, drafts and pages stay public and
  unchanged; nothing was deleted. Reopening one is a one-line PR to its triage cell with
  the product case.

## The table

| Programme | Decision | Construction/manufacturing first? | Product, or why |
|---|---|---|---|
| `heavy-hydraulics` | `product-linked` | yes | Hardware-company track (`heavy-*`, open compact excavator): which circuit to build and its parts cost and payback. Manuscript and supplement exist; remaining: the energy-recovery rung (milestone 5) only if the paper needs it, then venue formatting. |
| `build-data` | `product-linked` | yes | Bet #1 contractor suite (and #6 takeoff): a permit-wait and build-time prior per city and permit type goes into the suite's job schedule and bid dates. Permit prediction sold alone is a 'not now' bet (14), so the result ships as a suite feature, not a product. |
| `sensing-selfcal` | `product-linked` | yes | Construction robotics: the camera on a site robot (`buildbot-sheathing`, stud finding) has to recalibrate without a target; the accept/reject test is the part a robot ships with. Draft and RA-L short version exist; finish them in preference to new OpenCV internals. |
| `buildbot-sheathing` | `product-linked` | yes | Construction robotics, the long-term hardware-company track (`buildbot-*`): the cost per clean sheet and the error source that decides it set whether a sheathing robot is worth building. The draft paper is the track's credibility; remaining paper steps: the dynamic hand-off (milestone 3), measured stud profiles, venue formatting. |
| `llm-coding-inference` | `product-linked` | no | Candidate research-derived product, LLM qualitative coding with valid prevalence intervals (`bets.md` 'not now', scored 20; buyers: research and UX agencies, market-research shops). The audit-size rule and rare-count fallback are the claims that product could make. Effort goes to closing the paper, which is the product's evidence, not to more coverage cells. |
| `marine-hull` | `finish-paper` | no | Hardware-company track (`marine-*`), no SMB customer. Paper draft (`paper/main.tex`) is far along; remaining: stop new seasonal-correction milestones, write section 2.7's ERA5-driven rules, check numbers, format for OCEANS. No new questions. |
| `sim2real-inference` | `wound-down` | no | No SMB product; already BLOCKED on real-robot trials (owner step). The paper draft stays public as is. |
| `verifiable-training-mechanisms` | `wound-down` | no | No product a customer here would buy (ML-training verification protocols); 92 milestones without a buyer. Draft stays public. |
| `lowcomm-training` | `wound-down` | no | No SMB product; low-communication LLM training is a lab question, not a bet. |
| `verified-dse` | `wound-down` | no | Open-source chip-flow search has no SMB customer in `bets.md`; the most mature draft (`paper/main.pdf`) stays public. Reopen only if the owner picks a chip product. |
| `aerolog-scaling` | `wound-down` | no | Cargo-UAV scaling has no SMB buyer and recent milestones drifted to Remote ID airspace layers; not in the hardware track's named prefixes. |
| `catholic-demography` | `wound-down` | no | Owner's personal request (2026-11-03), no product case. No new effort unless the owner asks again; flagged in the report as theirs to override. |
| `christian-belief-models` | `wound-down` | no | Owner's personal request (2026-11-03), no product case. No new effort unless the owner asks again; flagged in the report. |
| `theism-formal-evidence` | `wound-down` | no | Owner's personal request (2026-11-07), no product case. No new effort unless the owner asks again; flagged in the report. |
| `hanger-codesign` | `wound-down` | no | Laundry-robot hanger design has no SMB customer or bet. |
| `cell-fidelity` | `wound-down` | no | Battery electrode design search: no SMB product in `bets.md`; its tables stay public. |
| `codesign-cant` | `wound-down` | no | Quadrotor rotor cant: no SMB product, and not one of the hardware track's named prefixes. |
| `water-leaks` | `wound-down` | no | Water-utility leak detection: utilities are not the SMB buyers the bets name and no bet uses it. |
| `grid-linopf` | `wound-down` | no | Transmission OPF repair: utility and ISO buyers, no SMB product. |
| `society-lanes` | `wound-down` | no | Robot-fleet passing policies in corridors: no product or bet. |
| `capture-sync` | `wound-down` | no | Multicam audio sync is a 'not now' bet in `bets.md` (15). |
| `civ-seeding` | `wound-down` | no | Curiosity track; technology-rollout seeding has no SMB product. |
| `agent-defects` | `wound-down` | no | AI-code quality analytics is a 'not now' bet (16, slow buyers); what it finds about this repository's process belongs in platform work, not a research programme. |

## Judgment calls worth a second look

- **The owner's three religion and demography programmes** (`catholic-demography`,
  `christian-belief-models`, `theism-formal-evidence`) were owner requests
  (2026-11-03 and 11-07). By the 2026-11-24 rule they have no product case, so they are
  wound-down, but this is the owner's to override: one line in the table reopens any
  of them.
- **`llm-coding-inference`** is linked to a product that `bets.md` lists as "not now"
  (scored 20, academic and UX buyers rather than SMBs, "revisit as a research-derived
  product"). It stays drawable because it is the one programme whose result is the
  product's core claim, but at 3.9% of draws; its next runs should close the paper, not
  add coverage cells.
- **`build-data`**: permit-timeline prediction as a standalone product is "not now" (14)
  in `bets.md`; the link is to bet #1 (contractor suite) as a schedule and bid-date
  feature, which needs the result as a data file, not a separate product.
- **`marine-hull`** is finish-paper, not product-linked: marine is in the hardware
  track's named prefixes, but survey boats have no SMB buyer in `bets.md`, and the
  recent milestones (seasonal clamp widths) drift from the hull question.

## Gaps the triage exposes

No open programme serves bet #2 (AI RFQ-to-quote for CNC and fabrication shops), #3
(e-invoices), #4 (CMMC) or #5 (reseller books). The manufacturing bets are the obvious
place for a new `product-linked` programme with a real research question, for example:
how accurately can machining time and cost be predicted from a 2D drawing or STEP
file against shops' real quotes, and which features carry it (bet #2's core claim).
A track draw on `robofab` or a free-choice run is the natural place to write that
proposal; it needs real quote data with a licence, so probe sources first.
