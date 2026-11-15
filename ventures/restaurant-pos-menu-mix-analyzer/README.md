# Restaurant POS Menu Mix Analyzer

A free browser tool for restaurant owners: **drop in your POS item-sales export and see every
menu item as a Star, Plowhorse, Puzzle or Dog.** The file is read in the browser; nothing is
uploaded and no POS login is needed.

**Live tool:** https://marisstella.app/restaurant-pos-menu-mix-analyzer/

After using this, you can now **see, per item, its menu mix against the 70%-of-an-even-share
rule, its contribution margin per plate against the weighted average, the dollar effect of a
price rise on your Plowhorses, and which items to cut or re-promote**, which used to mean
building a pivot table from a Toast, Square or Clover report by hand.

For one dish at a time, typed in by hand, use
[`menu-engineering-calculator`](../menu-engineering-calculator/); this tool is the one that
ingests the export.

## Input

- Item sales CSV: an item name, a quantity sold and net sales column (`Item`/`Menu Item`,
  `Qty`/`Quantity Sold`/`Item Qty`, `Net Sales`/`Net Amount`); `Category`/`Menu Group` and a
  food cost column (per-unit, total, or percent) are used when present.
- Optional pasted `item,cost` list, and a default food cost percentage.

Costs come from the export column, else the list, else the default, which is a **placeholder**
and is flagged item by item. **Column names are matched by alias and unverified against real
Toast, Square or Clover exports.** Comma, semicolon and tab files, UTF-16, `$` signs and
thousands separators are read; refund rows net against the item, voided and modifier rows are
skipped, duplicate rows merge.

## Model

Popular = mix % at or above 70% of an even share. High margin = margin per plate at or above the
weighted average (total margin / total plates). Plowhorse price rise: the typed percentage on
price, the typed percentage fewer plates. Not modelled: shared ingredients, waste, labour,
combos, seasonality, menu position.

## Known gaps

- **Classes are pooled across the whole file** (`calc.mjs`, the popularity and margin bars in
  `analyze`). Kasavana and Smith class items within a competing category; run per category, 6 of
  the 14 sample items change class and Cheesecake, a dessert Star, leaves the "review for cutting"
  list. The page now says so; a per-category mode is the fix
  ([quality audit 2026-11-15](../../portfolio/quality/audits/2026-11-15-restaurant-pos-menu-mix-analyzer.json)).
- Toast's item-level `ItemSelectionDetails.csv` (`Net Price` column) is not read; only the
  `AllItemsReport.csv` summary is.

## Run

Open `index.html` through any static server. Tests: `node --test`.
