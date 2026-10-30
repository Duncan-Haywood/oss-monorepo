# Shed Designer, round 4, lane 4: finishes and price data (2026-10-30)

This lane works from the `price-gaps`, `round3-lap-siding`, `round2-lane2`, `round2-lane5` and `round3-lane1` reports. Every price below was read on 2026-10-30 from a search engine's copy of a store page, because Home Depot and Lowe's refuse automated reads. Each line in the tool links its page and says how old the copy was where the result showed it.

## Merged

| PR | What | Effect on the default 8x12 |
|---|---|---|
| #11852 | **Sloped rafter hangers.** A rafter hung from a ridge beam arrives at the roof slope. Simpson rates face-mount hangers (LUS) at table load only to 1/4:12 (face-mount hanger guide; T-C-SLOPEJST beyond). The list now names LSU26Z ($6.56) for 2x4/2x6 rafters, LSSU28 ($11.47) for 2x8 and LSSU210 ($10.71) for 2x10. The Lowe's LUS26 offer is removed, since no Lowe's sloped-hanger price showed. **Cane bolt** for each pair of doors: Everbilt 30027 at Home Depot ($17.27), National Hardware N166-007 at Lowe's ($17.98). | +$67.06 ($3,102.61 to $3,169.67): a correction, stated in the README and the post |
| #11866 | **Climate setting** (`climate: mild / freezing`): freezing switches fiber cement to HardiePlank HZ5 (Home Depot $17.98, model 6000265; Lowe's $14.98, a copy about 707 days old). **5/4 wall trim** (`wallTrim: '5/4'`): HardieTrim 5/4 x 3-1/2 x 12 with fiber cement (Home Depot $23.48, model 216764; Lowe's HZ5 $21.25), LP 540 5/4 x 4 x 16 otherwise ($24.99 at Stine Home + Yard, since neither big box showed a usable price). A design swap offers 5/4 trim on lap-sided sheds. | none (defaults are mild and 1x4) |
| #11877 | **Trim paint.** The siding already had two coats; the primed trim had none. Two coats on the trim's face area (fascia 5-1/2", rake, corners and casings 3-1/2") at 350 sq ft a gallon, in quarts until a gallon is cheaper: Behr Premium Plus exterior semi-gloss, $25.98 a quart, $48.98 a gallon. There is no primer line, because every listed product comes primed and the paint is a paint-and-primer. | +$48.98 ($3,169.67 to $3,218.65): a missing cost |
| #11886 | **Board and batten** priced interior finger-joint pine and furring strips. It now uses LP SmartSide 440 4/4 x 6 x 16 boards ($27.00) and 4/4 x 4 x 16 battens ($19.98), $128.12 cheaper on the 8x12 board-and-batten design. **Lowe's gable vent:** the Master Flow DA1212 aluminum louver ($15.11) replaces a plastic vent priced from copies up to 1,790 days old. | none |
| this PR | **Price gaps and kits.** A second search pass filled the Lowe's VPA2 ($5.53, an old copy) and subfloor adhesive ($7.76) lines. It moved the underlayment to its product page and settled the Home Depot Z-flashing size (a 5/8 in. Z; 2.5 in. is its width). The 17 kits were rechecked: 12 unchanged, conflicts noted on 4, no prices changed. **HOA door finish** (from lane 7): a site-built door is skinned with the siding, so the packet now names the siding's finish for it, a bought door's factory finish, and "same as the siding/trim" by name. It used to say "stained wood" or "Same as the siding paint". `llms.txt` names the new finishes. | none |

## Decisions and deviations

- **Two default increases, both corrections.** The sloped hangers (+$67.06) and the trim paint (+$48.98) take the default 8x12 from $3,102.61 to $3,218.65. Neither is an upgrade: the hanger the list priced wasn't rated for the slope, and the trim had no paint at all. The README, the worked-example page and each post say so. A ridge board with rafter ties avoids the hangers, and the design search can pick that.
- **No primer line.** Every listed siding and trim product is factory primed, and the paint is a paint-and-primer. Behr asks for a separate primer only on tannin-bleeding woods, which the tool doesn't use. The owner asked for "primer and two coats"; the factory primer is the primer.
- **LP 540 is priced at a regional chain** (Stine Home + Yard), because neither big box showed a usable price. The note says so.
- **Climate defaults to mild (HZ10).** The tool does not know the owner's climate. Pick "freezing" for HZ5: +$270.86 on the 10x10 fiber cement shed.

## Open, and the next step

1. **Panel-and-batten.** A smooth, no-groove LP 38 panel with battens at the studs is the cheap way to get the look: the panel braces the wall, so no OSB is needed. That needs a new siding type wired through bracing (`checks.mjs`), stud spacing (`model.mjs`, `simplify.mjs`), the panel layout and the HOA look. The only no-groove panel price found is $67.19 from a lumber dealer (Schillings); neither big box showed one.
2. **The 3D view paints a site-built "stained" door brown**, while the HOA packet now says, and draws, that it takes the siding finish. `paletteOf` in `looks.mjs` should follow the packet, which is lane 7's area.
3. **The price-gap list** (`shed-designer-price-gaps-2026-10-30.md`) still has 7 lines with no price and 4 too weak to use, all at Lowe's except LP 540. They need a person with a browser and a store selected.
4. **Trim paint when the siding is "unfinished"** is left off, the same as the siding paint. If someone leaves the siding bare but wants the trim painted, that needs its own setting.

## Verification

Each PR merged on local verification while CI jobs sat queued, as CLAUDE.md allows. Each time, `main` was merged in first, and then:
- `node --test *.test.mjs` ran in the venture (the last run on #11886 passed 432 of 432);
- `node platform/pages/typecheck.mjs shed-designer` reported 0 diagnostics;
- for #11866, which changed the UI, the browser tests ran too: `PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js node --test browser.test.mjs picker.browser.test.mjs` passed 42, 0 failed, 2 skipped because axe isn't installed.

#11852's first commit failed the post front-matter check (a description over 160 characters). That was fixed before the merge. The same run's `research_live_links` failure is about `research/marine-path`, not this lane.
