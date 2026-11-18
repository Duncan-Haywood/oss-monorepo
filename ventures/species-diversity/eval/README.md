# Evaluation

| File | What it does |
| --- | --- |
| `build-example.py` | Builds `data/portal-rodents.csv` from the Portal Project's CC0 census files (`data/SOURCE.md`). |
| `reference.py` | Independent reference values (scipy hypergeometric pmfs, mpmath Lerch transcendent, scikit-bio) written to `reference.json`; `../reference.test.mjs` compares the engine with them. |
| `coverage.mjs` | Simulates samples from known assemblages and counts how often the 95% intervals hold the truth; output in `coverage-output.txt`. |

Regenerate:

```sh
python3 -I eval/reference.py > eval/reference.json      # needs numpy, scipy, mpmath, scikit-bio
node eval/coverage.mjs 1000 > eval/coverage-output.txt  # about 45 s
```
