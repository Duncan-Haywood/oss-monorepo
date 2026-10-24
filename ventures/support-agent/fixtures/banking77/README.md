# BANKING77 benchmark

`dev.csv`, `examples.csv` and `test.csv` are derived from **BANKING77** by PolyAI
([task-specific-datasets](https://github.com/PolyAI-LDN/task-specific-datasets), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)): Casanueva, Temcinas, Gerz, Henderson and Vulic,
"Efficient Intent Detection with Dual Sentence Encoders", 2020, [arXiv:2003.04807](https://arxiv.org/abs/2003.04807).
Changes: questions of 54 of the 77 intents kept, whitespace collapsed, each labelled with an article slug from
`kb.md` or `handoff` (`build.mjs` holds the mapping and rebuilds the files from the original CSVs).

`kb.md` is ours: 22 help articles for a made-up money app, written from the intent names before any question of
the dataset was read (apart from the four examples in its README), and not edited after. Its fees, limits and times
are invented and describe no real bank.

How honest the test number is: the confidence features, the built-in synonym list (`SYNONYMS` in `agent.mjs`) and
the number of neighbours were tuned by looking at errors on `dev.csv` only. `test.csv` was scored three times: once when the design was frozen, again after a later change made for another
reason (a one-word question no longer asks for clarification when one article clearly owns the word, which changed
the fitted models slightly), and once more after email addresses and long numbers were left out of the search, which
changed nothing. The first run gave 65, 787 and 1,007 answered right with 0, 39 and 58 wrong; the later
two gave 65, 786 and 1,007 right with 0, 39 and 66 wrong, which is what the README reports. Nothing was tuned on the test split.

| file | from | rows | used for |
|---|---|---|---|
| `dev.csv` | training split, first 40 per intent | 2,155 | fitting the confidence model and choosing the bar |
| `examples.csv` | training split, next 40 per intent | 2,100 | "past questions" a deployer has labelled |
| `test.csv` | test split, all 40 per intent | 2,160 | the reported numbers, scored once with everything fixed |

Covered intents (34, mapped to the 22 articles) and the 20 left uncovered, which should go to a person, are listed
in `build.mjs`. The other 23 intents (pending top-ups, reverted payments and the like) are left out because whether
an article "covers" them is a judgement call.

```sh
node fixtures/banking77/benchmark.mjs             # the table in the README
node fixtures/banking77/benchmark.mjs --defaults  # the fitted models built into agent.mjs
```
