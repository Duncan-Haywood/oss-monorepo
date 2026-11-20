---
kind: milestone
subjects: [editorconfig-explainer]
tagged: auto
---
# editorconfig-explainer launch (agent note)

- New venture 2026-11-20 (explore run, PR #17856). Engine `ventures/editorconfig-explainer/editorconfig.mjs`, matcher is a backtracking walk over a parsed glob tree (needed for exact `{n..m}`).
- Re-verify after engine changes: `git clone --depth 1 https://github.com/editorconfig/editorconfig-core-test <dir>` then `node eval/core-tests.mjs <dir>` (198/198 expected). spec.editorconfig.org 403s through the proxy; the spec source is `github.com/editorconfig/specification` `index.rst`.
- Differential oracles install fine here: `python3 -m venv v && v/bin/pip install editorconfig==0.17.1`; `npm i editorconfig@4.0.1`. `eval/differential.mjs --trees 1500` takes ~60 s per seed with both cores; every disagreement is classified (inline comment, escaped wildcard, negated bracket crossing `/`, reversed range). A new unlabelled group means a new cause: look at it with `--examples`.
- Real-project sample: `eval/wild-sample.mjs` needs `gh` search (works) and blobless `git clone` (works); the git trees API is outside session scope (403), so do not switch it back.
- Open: report the three core-py differences upstream (needs a person's GitHub account, owner's call); a GitHub Action wrapper for `cli/check.mjs --strict`.
