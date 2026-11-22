# Differential tests: this checker against the real tools

Three scripts compare the JavaScript modules with the Python code pre-commit
actually runs. None runs in CI (CI has no pre-commit install and the corpus
is not committed); `../check.test.mjs` and `../parsers.test.mjs` pin the
cases in CI instead. Re-run these after changing a rule or bumping the
pre-commit version in `../tables.mjs`.

`gen-tables.py` regenerates `../tables.mjs` from the installed packages.

Setup, once:

```
python3 -m venv /tmp/pcv && /tmp/pcv/bin/pip install pre-commit==4.7.0   # brings cfgv, identify, PyYAML
cd differential && ./fetch-corpus.sh /tmp/corpus                         # 69 public configs, see corpus.json
```

| Script | Compares | Result, 2026-11-22 |
| --- | --- | --- |
| `regex-fuzz.mjs <n> <seed>` | `pyregex.mjs` verdict and message vs CPython `re.compile` on generated patterns | Python 3.11.18, seeds 1-5 at 40,000 each: 199,999 of 200,000 same verdict; every pattern both rejected got the same message. The miss: `A[\N{EM DASH}-(?(x)]`, a `\N{name}` range end (the Unicode name table is not bundled, so the range order is not checked). |
| `yaml-diff.mjs <python> <files>` | `yaml11.mjs` vs PyYAML 6.0.4 `SafeLoader`, values and Python types | 69 real configs + 45 hand-written edge cases in `yaml-cases/` (block scalars, folding, anchors and merge order, YAML 1.1 types, `!!str`, multi-document and tab errors): 114 of 114 identical. Error messages are not compared, only that both fail. |
| `config-diff.mjs <python> <files>` | `check.mjs` vs `pre_commit.clientlib.load_config` (what `pre-commit validate-config` calls), log captured | accept/reject, the first error's full context chain and message, and the ordered list of warnings pre-commit logs. 69 real configs (all accepted by pre-commit) and 5,175 single-edit mutants from `mutate.mjs` (seed 7 x15, seeds 8 and 9 x30 per file; 2,760 accepted; 2,314 rejected, 223 of them as YAML errors; 101 crash pre-commit with a Python exception): 5,244 of 5,244 agree on all three. For YAML errors only the verdict is compared. |

What the mutants do not cover: `mutate.mjs` inserts one line from a list
written for this tool (the traps it was built to catch, plus valid values
that look like traps), so agreement there says the rules match pre-commit on
those edits, not on every possible file. Two-edit mutants, hand-written
configs from scratch and pre-commit versions other than 4.7.0 are untested.

## prek keys

`check.mjs` names hook keys `priority`, `env`, `shell`, `groups`,
`minimum_prek_version` and root keys `priorities`, `orphan`, `default_env`,
`minimum_prek_version` as prek's. Each was probed by writing it into a
config and running `prek validate-config` 0.5.11 (`pip install prek`):
prek parses these (and errors on a wrong type) and prints "Ignored
unexpected keys" for anything it does not know. Other prek keys may exist;
one not in the list is reported as an unknown key that pre-commit ignores,
which is still true.
