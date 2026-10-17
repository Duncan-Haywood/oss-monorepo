# Funeral Price List Checker

Paste the lines of a funeral home's **General Price List or quote** and see which charges you
cannot decline, which are usually needed, which are **your choice**, which are paid to someone
else, and which the **FTC Funeral Rule** (16 CFR 453) speaks to (a casket handling fee for a
casket bought elsewhere, "embalming required", "casket required for cremation"). Paste a second
home to compare the two line group by line group. It also builds the list of questions to put to
the home.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/funeral-price-list-checker/

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no network
calls. [`what-is-the-ftc-funeral-rule.html`](what-is-the-ftc-funeral-rule.html) explains the Rule
in plain words.

After using this, a family can see which parts of a funeral quote are theirs to decline and which
lines to question before agreeing, which used to mean reading an unfamiliar price list under
pressure, days after a death.

## CLI

```
node cli.mjs quote.txt
node cli.mjs --compare home-a.txt home-b.txt
node cli.mjs --example
```

Node 18+, no dependencies.

## Limits

It sorts text by keywords and can misread a line; the home's price list is authoritative. It does
not say what a fair price is and is not legal advice. State rules differ. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
