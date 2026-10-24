# Do the file sizes and line counts of a real, templated code repository follow Benford's law?

An explore-track project (free choice). Benford's law says leading digits of many naturally occurring quantities follow P(d) = log10(1 + 1/d), so a 1 leads about 30% of the time. Software file sizes are a commonly cited example, and this checks it on one repository, this one. **Descriptive, one commit, one unusually templated repository; not a test of Benford's law and not evidence about any other codebase.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/benford-repo/

**Result.** At commit `7a3a915`, over 35,648 non-empty tracked files, the first digits of byte sizes are nonconforming (Nigrini MAD 0.0183, chi-square 1,646 on 8 df) and so are line counts (MAD 0.0278). The cause is repetition, not shape: 1,297 files are exactly 1,071 bytes, 993 are 47 bytes, 685 are 147 bytes, and 1,822 files have 4 lines, so digits 1 and 4 are inflated. Counting each distinct size once (12,429 sizes) gives MAD 0.0068, "acceptable" on Nigrini's bands, though chi-square still rejects exact fit (90.8) because n is large. By extension, `.json` (MAD 0.064 distinct) and `.html` (0.050) stay far from Benford even deduplicated: JSON has a spike at 4 (27%), HTML at 1 (47%). Distinct Python line counts are acceptable (MAD 0.0103, n = 476); distinct Markdown byte sizes are not (0.0285). Full table in `results.txt`, machine-readable in `results.json`.

```bash
cd research/benford-repo
python3 -m unittest discover -s tests -v   # 5 tests
python3 benford.py                         # needs git; seconds; rewrites results.*
```

`results.txt` is a snapshot of the working tree at the commit named on its first line; rerunning later gives different numbers.

## Method

`benford.py` lists files with `git ls-files`, skips symlinks, and records each file's byte size and (for files without NUL bytes) newline count. Zeros are dropped. Per group it reports the first-digit counts, chi-square against Benford with a 5% critical value of 15.507 (8 df), and Nigrini's mean absolute deviation with his first-digit bands (≤0.006 close, ≤0.012 acceptable, ≤0.015 marginal, otherwise nonconforming; Nigrini, *Benford's Law*, Wiley, 2012). The distinct rows count each value once. Chi-square is reported but reads poorly at this n, which is why MAD is the headline.

## Limitations

The repository is machine-generated and heavily templated (per-venture boilerplate, licence copies, stubs), the opposite of a typical hand-grown project, so the headline failure says little about codebases in general. The "distinct" rows remove repetition crudely: near-identical files with different sizes still count. Line counts of a few hundred distinct values (n = 980) are too few for stable bands. One commit; no comparison corpus; no attempt to model why `.json` spikes at 4.

## Next steps

Run the same script on a few unrelated public repositories (the repository root is currently derived from the script location, so it needs a small `--root` option first) to see whether the pattern is this repository's templating or general; separate generated from hand-written files by path.

## Owner steps

None.

## Outside dependencies

Python 3 standard library and git. MIT.
