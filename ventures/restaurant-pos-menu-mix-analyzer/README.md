# Restaurant POS Menu Mix Analyzer

A free browser tool for restaurant owners: **drop in your POS item-sales export and see every
menu item as a Star, Plowhorse, Puzzle or Dog.** The file is read in the browser; nothing is
uploaded and no POS login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/restaurant-pos-menu-mix-analyzer/

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

## Run

Open `index.html` through any static server. Tests: `node --test`.
