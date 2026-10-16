# Git Bus Factor Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/git-bus-factor-check/>

A free tool that reads your repository's own commit history and reports, per
folder, who actually owns it, whether they are still around, and who to pair
with. It computes a recency-weighted **bus factor** (truck factor): the fewest
people whose changes add up to half of a folder.

| Status | Meaning |
| --- | --- |
| `orphaned` | the largest contributor (at least 50% of the folder) has made no commit anywhere in the last 90 days |
| `single-owner` | one active person holds at least 80% of the folder |
| `shared` | more than one person carries it |

**How ownership is weighted.** Lines added plus deleted per file per commit,
capped at 500 so one dump cannot own a folder, halved every 180 days. Bots,
lock files, `node_modules`, `vendor`, `dist` and minified files are ignored.
Folders default to two path levels; folders with fewer than three commits are
not reported.

**What it is not:** a measure of who understands the code, and not a tool for
ranking people. Squashed commits, pair programming, reviewers who rarely
commit, and people who commit under two emails all change the real answer.
It must not be used on its own for decisions about hiring, firing, pay or
performance. No warranty.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser. Run the one `git
log` command it shows, paste the output, and read the table. Nothing is
uploaded and the page makes no network requests. The guide
[`what-is-bus-factor.html`](what-is-bus-factor.html) explains the method.

## Quickstart (CLI)

```
python3 busfactor.py                         # repo in the current directory
python3 busfactor.py path/to/repo --depth 3  # folders three levels deep
python3 busfactor.py --format json
python3 busfactor.py --fail-on-orphaned      # exit 2 if a folder lost its owner
git log --no-merges --format='@@|%an|%ae|%at' --numstat | python3 busfactor.py --log -
```

Options: `--since` (default `2.years`), `--half-life` (days, default 180),
`--inactive-days` (default 90), `--min-commits` (default 3), `--now` (unix
time, default newest commit). Stdlib only; the only process it starts is
`git log` on the repository you point it at.

## Tests

```
python3 -m unittest test_busfactor
node --test classify.test.mjs page.test.mjs
```

`classify.mjs` is the browser port; `classify.test.mjs` runs both
implementations over `fixture.txt` and a synthetic history and requires
identical JSON.

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
