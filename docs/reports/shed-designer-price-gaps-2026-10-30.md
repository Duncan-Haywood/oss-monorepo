# Shed Designer: prices a person should check in a browser (2026-10-30, updated by r4 lane 4)

The owner asked that every line be priced at both Home Depot and Lowe's. Lowe's hides prices until a store is chosen and returns 403 to automated reads, so every Lowe's price in `lowes.mjs` comes from a search engine's copy of the page. Round 4 lane 4 made a second search pass on 2026-10-30 (`docs/reports/shed-designer-round4-lane4.md`). For each line still open, check it in a browser with a store selected, and record the store, the date and the item number in the note.

## Filled on the second pass

| Line (key) | Store | Now |
|---|---|---|
| `pitchConnector`, Simpson VPA2 | Lowe's | $5.53, item 3699591 (a different item from the one first found; a copy about 1,871 days old, so check it) |
| `adhesive`, 28 oz subfloor | Lowe's | Liquid Nails LNP-902, product 3365546, $7.76 (the higher of $5.98-$7.76; newest copy about 247 days old) |
| `underlayment` | Lowe's | Now linked to the product page, not the reviews page. Copies showed $69.98-$90.00; $74.98 is kept |
| `gableVent` | Lowe's | Master Flow DA1212 aluminum louver, $15.11, like for like with Home Depot's steel vent (it replaces a plastic vent priced from very old copies) |
| `zFlashing` | Home Depot | Amerimax 5651100120 is a 5/8 in. Z; the "2.5 in." in Home Depot's title is most likely its overall width |
| New lines | both | Sloped rafter hangers, cane bolt, HZ5 plank, 5/4 trim, LP 440 board and batten, trim paint: see the lane 4 report |

## Still no price

| Line (key) | Store | Lead |
|---|---|---|
| `siding10`, T1-11 4x10 | Lowe's | No 48 x 120 in. T1-11 listing on either pass; Lowe's shows 48x96, 48x99 (product 3099135) and 48x108 (product 3721344). |
| `concreteBlock`, solid block under skids | Lowe's | "Block 4x8x16 Solid Block Cap" (product 1001017) is solid but showed no price. "Standard Concrete Block" 4x8x16 (item 149060, product 1000559579) is $2.98, but no copy says solid or cored. |
| `lumber:PT 2x6:10`, ground contact | Lowe's | Severe Weather product 1000731932 is ground contact but showed no price. The $8.68-$13.58 prices seen are for the above-ground board (product 4564618): do not use them. |
| `lumber:PT 4x6:16` | Lowe's | The only price, $35.98 (product 50113124), is on a "no longer sold" listing. Product 4222531 showed none. |
| `rafterHanger` (LSU26 / LSSU28 / LSSU210) | Lowe's | No priced Lowe's listing found for the sloped hangers. |
| `trim54LP`, LP 540 5/4 x 4 x 16 | Home Depot, Lowe's | Home Depot model 41161 showed no price. Lowe's showed $24.98 for a 540 board (model 25891) whose size the copy did not give. The tool uses Stine Home + Yard's $24.99. |
| `bbBoard`, `bbBatten` (LP 440) | Lowe's | Lowe's lists the 4" board as no longer sold. |

## Found, but too weak to use

| Line (key) | Store | What was seen | Why not used |
|---|---|---|---|
| `lumber:2x8:14` | Lowe's | $12.94 on a category page; $9.56, item 5174, out of stock, about 596 days old | Both are below Lowe's own 2x8x12 ($14.96), and the category price is tied to no listing. |
| `lumber:PT 4x6:10` | Lowe's | $38.38, hem fir (product 50017336) | Out of stock, a copy about 794 days old. |
| `screws`, #8 x 1-5/8 in. | Lowe's | $10.98, Deck Plus item 1148793 | A 147-count box (the list counts 1 lb boxes), and a copy about 1,660 days old. |
| `shims`, 8 in. 12-pack | Lowe's | $1.58-$1.78, Nelson 7-7/8 in. 12-pack (product 1269881) | Copies about 1,793 days old, and one copy of the same shim says no longer sold. |

## Also worth a person's look

- **Gravel by the ton** is priced from a cost guide, not from either store. Both stores sell bagged gravel; bulk stone comes from a local yard.
- **Old Lowe's copies** still back several Lowe's advantages (the hurricane tie, the connector nails, the VPA2). The store comparison table shows each copy's age.
- **Kits:** the 17 kit prices in `value.mjs` were rechecked. Twelve showed no change. The other notes now record conflicting copies: the Handy Home 8x10 ($2,049), the Best Barns Salt Box ($2,124.74), the Heartland Midtown installed ($3,135 deals range) and the Tuff Shed Tahoe ($3,179 on category copies). In each case the listed price is kept.
