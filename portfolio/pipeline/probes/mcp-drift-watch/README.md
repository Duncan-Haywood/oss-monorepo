# mcp-drift-watch

**Probe for [`mcp-supply-chain-watch`](../../candidates/mcp-supply-chain-watch.md).**
Built 2026-08-22. 68 tests. Not published, not a graduation, no score moved.

Pin what a connected MCP server declared, diff it on re-poll, classify what
moved, and hand the subscriber a record. That is the candidate's own
"Pin · Diff · Classify · Archive", built as the smallest working thing, and
used to answer the question its research left open.

---

> **Two further passes landed the same day, by sessions that could not see each
> other, and they took the two different next steps the first pass named.** This
> one collected the third corpus and measured the rule edits on it. The other
> ran a model over corpus 2 and is the [model-pass
> amendment](#amendment-2026-08-22-a-model-was-run-over-the-corpus) at the end
> of this file; it is the one that moved `ai_leverage` 6 → 7. They do not
> overlap, and each bears on the other: the model's figure is a single held-out
> measurement of exactly the kind this pass shows can halve on a second corpus.

## Second pass, 2026-08-22: a third corpus, and the fixes measured on it

The first pass below closed by naming three rule edits, declining to make them,
and saying why:

> dropping `secret_or_credential` alone takes precision from 0.40 to 1.00 with
> no true positive lost. That number would be in sample, and quoting it as
> accuracy is precisely the error this pass exists to correct. Anyone taking
> those fixes needs a **third** corpus.

That corpus is now here: the **remaining 103** of the 164 eligible packages,
collected with `--exclude-from` so it shares no package with corpus 2, yielding
**148 description changes across 21 servers**, all hand-labelled against the
same rubric ([`build_labels_c3.py`](build_labels_c3.py)). The edits are in
[`rule_variants.py`](rule_variants.py) and encode only the three mechanisms the
first pass had already named in prose. Three results, in order of how much they
change what this probe can claim.

### 1. Nothing about the shipped classifier replicated — including the rate

| | corpus 1 (tuning) | corpus 2 (held out) | corpus 3 (held out) |
|---|---:|---:|---:|
| share of changes flagged | 7.2% | 7.4% | **5.4%** |
| precision | — | 0.40 | **0.625** |
| recall | — | 0.24–0.29 | **0.10–0.11** |

Corpus 2's headline was that a stable *rate* had hidden an unstable set of
labels. Corpus 3 removes even that consolation: the rate moved two points, and
precision and recall moved in opposite directions again — precision up by half,
recall down by more than half. Three corpora, three different answers, and the
spread between them is far wider than the labelling uncertainty inside any one
of them. The customer-facing record now prints the **span across both held-out
corpora** (precision 0.40–0.62, recall 0.10–0.29) rather than either figure,
because quoting one of two disagreeing measurements is choosing which one
flatters the product.

### 2. The three fixes are ranked in exactly the reverse order out of sample

Each edit, applied alone, against both corpora:

| edit | corpus 2 (the one that suggested it) | corpus 3 (never seen) |
|---|---|---|
| drop `secret_or_credential` | precision 0.40 → **1.00** | precision 0.625 → 0.714 |
| widen routing to `prefer` *named tool* | recall 0.24 → **0.53** | **no change at all** |
| relax `important:` punctuation | no change | recall 0.10 → **0.14**, precision → 0.70 |
| all three | P **1.00**, R **0.53–0.64** | P 0.778, R 0.14–0.15 |

The first pass argued hardest for the routing edit — it carried five of that
corpus's ten clear misses — and it buys **nothing** here. Corpus 3 contains one
instance of its exact mechanism (`ponlo_ai_chat`: *"For updating or deleting
specific items, prefer the structured tools (`ponlo_calendar_delete_event`,
`ponlo_tasks_update`, etc.)"*) and the widened pattern still misses it, because
the preference points at a category noun with the tool names in a parenthesis
after it. Meanwhile the edit that pass treated as a punctuation footnote is the
only one that finds anything new.

So the edits *are* an improvement out of sample — precision 0.625 → 0.778 and
recall 0.102 → 0.143, with no true positive lost — and it is a fraction of what
they were worth on the corpus that suggested them. **The reusable point is that
ranking candidate fixes by how much they move the numbers on the corpus that
suggested them does not survive contact with a second one.** This repository
has done that ranking before.

**The edits are still not adopted into the shipped rules**, and the reason is
not the size of the gain. Adopting them changes
[`classify_drift.py`](../../../research/mcp-tool-drift/classify_drift.py), whose
committed corpus-1 labels and 7.2% figure are cited across `portfolio/`; the
same relabelling measures corpus 1 at 6.6%. Paying that to ship a classifier
that still misses 86% of what it defines as an alert is the wrong trade. What
would be worth it is a rule for the class below, measured on a fourth corpus.

### 3. Two of the five signal alternatives are dead patterns, not bad judgement

`imperative_priority` and `secret_or_credential` are each written as
`\b( … | important: | … | \.env\b | … )\b`. The trailing `\b` cannot hold after
a colon followed by a space, or the leading one before a dot — so:

- **`important:` has never fired on ordinary prose.** Corpus 2 recorded the
  `@adeu/mcp-server` miss as an em-dash edge case (*"the text uses an em dash
  where the pattern requires a colon"*). The colon form does not work either:
  corpus 3 contains two `IMPORTANT: …` blocks, both genuine directives to the
  model, both read as `cosmetic`/`schema-widening` by the shipped rules. That is
  the entire out-of-sample recall gain in the table above.
- **`\.env` has never fired at all**, in any corpus. It changes no number here —
  edit 1 removes the whole signal — but it is the second alternative in this
  classifier found dead on punctuation rather than on judgement, which says
  something about how the patterns were reviewed. Both are pinned by tests in
  [`test_rule_variants.py`](test_rule_variants.py).

### What corpus 3 says the real gap is

35 of the 44 missed positives are one mechanism the first pass never saw,
because corpus 2 had no instance of it: **a server naming another of its own
tools and saying when to reach for it, in a phrasing the verb list does not
cover** — *"use `check_email_security` for the broader overview"*, *"hosted users
should call `sap_escrow_build_close_transaction`"*, *"Call this before
`wpconvert_convert_folder`"*, *"you can call `wpconvert_download_result`"*. The
shipped pattern recognises `use x_y to|first|instead|before` and nothing else,
so `for`, `or`, `should call` and `can call` all pass.

Two other things worth carrying forward:

- **The corpus is a handful of editorial decisions, again.** Two of 21 packages
  (`intodns-mcp`, `@oobe-protocol-labs/sap-mcp-server`) rewrote every
  description in a single release and carry 34 of the 49 positives. Corpus 2 had
  the same shape with `@naumu/mcp`, so per-change denominators overstate how
  much independent evidence either corpus holds.
- **Both remaining false positives are one sentence template.** *"Hosted
  accountless SAP MCP rejects this tool before x402 payment"*, copied across two
  tools, matches `(?:this|use this) tool (?:first|before|instead)`. A rule keyed
  on a phrase rather than on a relation between two named tools will keep doing
  this.
- **One instruction-bearing change is in Chinese** (`@clize/clize`, a *should* →
  *must* strengthening of a human-confirmation gate). None of the five signal
  patterns can match any non-Latin text, and no coverage statement anywhere in
  this probe said so until now.

Reproduce (all offline except the collector):

```bash
python3 -m pytest portfolio/pipeline/probes/mcp-drift-watch/ -q
python3 build_labels_c3.py            # scores both rule sets on corpus 3
python3 rule_variants.py --corpus results-holdout-c3-2026-08-22.json
python3 collect_holdout.py --limit 200 \
    --exclude-from results-holdout-2026-08-22.json --out results-new.json
```

---

## The first pass, 2026-08-22: the headline result

`portfolio/research/mcp-tool-drift/` measured this candidate's base rates on
2026-08-19 and closed with a caveat nobody had re-opened:

> The corrected classifier was tuned on the corpus it is scored against, so
> 7.2% is in-sample and will not hold unchanged on fresh data.

It was re-opened here, on **136 description changes across 23 npm-published MCP
servers, none of them read while the rules were being written**. The result is
not the one either reading of that caveat predicts.

| | in sample (2026-08-19) | held out (2026-08-22) |
|---|---:|---:|
| share of changes flagged | 7.2% | **7.4%** |
| precision | 9 of 11 by the research's own reading | **0.40** (4 of 10) |
| recall | never measured | **0.24–0.29** |

**The rate reproduced almost exactly. The labels did not.** Flagging 7.4% where
the tuned corpus flagged 7.2% looks like a classifier that generalised, and it
is not one: out of sample it is wrong about six of every ten alerts it raises
and silent on about three of every four changes that meet its own definition.
The two errors run in opposite directions and very nearly cancel in the count,
which is exactly why the count looked stable.

This matters beyond one classifier. `alerting_share_pct` is the number
[`mcp-tool-drift`](../../../research/mcp-tool-drift/) Finding 4 converts into
alerts per server-month, and that finding survives — a customer really would
see roughly two alerts a month across twenty servers. What does not survive is
the assumption underneath the product: that the alerts they see are the changes
that matter.

Both readings of the borderline labels are published (`0.24` counting three
disputable calls as real misses, `0.29` counting them as clean), because a
figure whose direction depends on a hidden judgement is not a measurement.

## Where the error localises, and why it is not tuning noise

Precision splits cleanly by signal family:

| signal | flagged | correct | precision |
|---|---:|---:|---:|
| `tool_routing` | 3 | 3 | **1.00** |
| `imperative_priority` | 1 | 1 | **1.00** |
| `secret_or_credential` | 6 | 0 | **0.00** |

**Every false positive came from one signal, and that signal has now produced
zero true positives on two independent corpora.** In sample it fired twice and
the research pass had already read both as "ordinary documentation expansion
that newly introduces a credential word" — it was 2 of 11 alerts there, a
footnote. Out of sample it is 6 of 10, and the corpus shows two distinct ways it
fails:

- **Pricing documentation.** Five of the six are one publisher adding *"Works
  without an API key (free tier, limited daily use per IP)"* to five tool
  descriptions in a single release. The word "API key" is genuinely new; nothing
  credential-directed happened.
- **Word sense.** The sixth is `crawlio-browser` documenting
  *"interactive=true for 60-80% token reduction"*. "Token" here means units of
  text. The rule reads it as a secret.

The misses localise too, and the mechanism is small enough to name:

- **"Prefer `other_tool`" matches nothing.** `tool_routing` recognises
  `prefer this (?:tool|over)` but not a preference expressed *toward a named
  other tool*, which is how every instance in this corpus is written. That one
  gap carries 5 of the 10 clear misses.
- **`important:` requires the colon.** `@adeu/mcp-server` added an
  `IMPORTANT — login is user-level, not account-level:` block with an em dash.
  Missed on punctuation.
- **One package carries six misses in one version bump.** `@naumu/mcp` 0.1.0 →
  0.1.5 added *"**Prefer `naumu_ask`**"* to four low-level graph tools at once,
  re-pointed a fifth's routing target, and added a call-order directive to a
  sixth (that sixth is one of the three borderline calls). Per-change accuracy
  figures treat those as six independent observations; they are one editorial
  decision, which is a reason to read 0.24–0.29 as softer than its denominator
  suggests.

## What was deliberately **not** done

**The rules were not changed.** Two of the fixes above are obvious, cheap and
would move both numbers a long way — dropping `secret_or_credential` alone takes
precision from 0.40 to 1.00 with no true positive lost. That number would be in
sample, and quoting it as accuracy is precisely the error this pass exists to
correct. The classifier is imported from
[`portfolio/research/mcp-tool-drift/classify_drift.py`](../../../research/mcp-tool-drift/classify_drift.py)
rather than forked, and it is imported unmodified, so the figure printed at a
customer is a figure about the shipped rules.

Anyone taking those fixes needs a **third** corpus. The eligible population is
large — the collector found 164 held-out packages and this run took 60, which
the output records rather than silently truncating — so a third is a command
away, and the labels for this one are committed as data so the comparison is
against something fixed.

> **Answered the same day**, by the second pass at the top of this file. The
> remaining 103 packages were collected, hand-labelled and scored: out of sample
> the three fixes are worth precision 0.625 → 0.778 and recall 0.102 → 0.143,
> against 0.40 → 1.00 and 0.24 → 0.53 in sample. The rules are still not
> changed, for a different reason than this paragraph gives.

**No score moved in `candidates.yaml`.** Two arguments in this write-up point at
scores and neither is a measurement:

- `ai_leverage` is 6, lowered on 2026-08-19 on the finding that the
  classification is rule-separable rather than model work. A precision of 0.40
  and a recall of 0.25 is the strongest evidence yet that rules are *not*
  sufficient here, which argues the leverage is higher than 6 — but no model was
  run against this corpus, so that is an argument. Running one is the obvious
  next pass and it is now cheap: 136 changes with committed hand labels.

  **Both later passes acted on this, in opposite ways, and the model pass is the
  one that moved the score.** The corpus-3 pass strengthened the argument
  without settling it — recall of 0.10 is the weakest showing yet for the rule
  approach, and a second unmeasured argument is not evidence, so it recorded
  examined-and-not-revised a second time. The model pass measured it: a blind
  Claude Sonnet 5 read scores F1 0.61–0.71 against the rules' 0.30–0.33 on the
  same corpus, and `ai_leverage` moved **6 → 7**. What is still open is whether
  *that* figure replicates, since the corpus-3 pass showed the rules' own F1
  falling by half between two corpora drawn the same way, and the model has only
  been asked about one of them. There are now 284 changes with committed hand
  labels; the model has seen 136.
- `ethical_robustness` is 8. This probe ships the disclosure surface the
  candidate never had, and it does so from its first version rather than after a
  deduction. There was no measured deficit to restore, so the score is recorded
  as examined-and-not-revised, on the precedent
  [`shopify-a11y-evidence`](../../candidates/shopify-a11y-evidence.md) set.

**Nothing was published, and step 3 is still step 3.** The candidate's only
remaining commercial gate is taking the base rate to ten teams at $29/server/
month. That needs buyer contact an unattended agent cannot make, and no finding
here changes it.

## What is here

| File | What it is |
|---|---|
| `drift_watch.py` | Pin, diff, and the severity ordering. The product surface. |
| `subscriber_record.py` | The document a subscriber holds, with coverage and both error rates in it. |
| `collect_holdout.py` | Builds a held-out corpus. Records what it excluded and why; `--exclude-from` subtracts an earlier corpus. |
| `build_labels.py` | The hand labels as data, the rubric that produced them, and the scoring. |
| `build_labels_c3.py` | The same, for corpus 3, scoring both rule sets. Reuses the scorer rather than forking it. |
| `rule_variants.py` | The three edits corpus 2 argued for, applied by swapping the signal table into the shipped `classify()`. |
| `render_sample.py` | Renders one real record from live npm data. |
| `results-holdout-2026-08-22.json` | Corpus 2: 136 changes, 23 packages, with full before/after text. |
| `holdout-labels-2026-08-22.json` | Every label, every borderline call, and a note on each judgement. |
| `results-holdout-c3-2026-08-22.json` | Corpus 3: 148 changes, 21 packages, disjoint from corpus 2 by construction. |
| `holdout-labels-c3-2026-08-22.json` | The same for corpus 3, plus both rule sets' scores side by side. |
| `sample-record-2026-08-22.md` | A real record, chosen to be unflattering — see below. |
| `test_drift_watch.py`, `test_subscriber_record.py`, `test_rule_variants.py`, `test_build_labels_c3.py` | 68 tests. |

```bash
python3 -m pytest portfolio/pipeline/probes/mcp-drift-watch/ -q   # offline
python3 build_labels.py                                          # offline, re-scores
python3 collect_holdout.py --limit 60 --out results-new.json      # needs npm
python3 render_sample.py --out sample.md                          # needs npm
```

## The sample record is the one that fails

`sample-record-2026-08-22.md` is `@naumu/mcp` 0.1.0 → 0.1.5 — the package that
carries six of the misses. A subscriber watching it would have received a record
listing three new tools, two flagged descriptions, and six more marked
`cosmetic` that the hand labels say carried newly added model-directed text
(five clear, one borderline). That is what the
product does today, printed rather than described.

It is also what the accuracy section on that record is for. A customer reading
it is told, above the table, that six in ten rows are wrong and that the watch
finds about one in four; that the credential signal specifically should be
distrusted; that a quiet server is not a clean server; and that **the direction
of error that pays the operator is the over-reporting one**, because a
per-server subscription that never alerts looks identical to one that is blind.
Tool additions and removals are kept out of the accuracy claim entirely — those
are a set difference between two pins, exact, with no rule in between.

## Coverage, stated here as well as in the product

- **85% of the registry cannot be pinned from a published artifact.** Registry
  records point at remote endpoints and carry no tool declarations at all
  (`inputSchema` occurs zero times across 4,000 version records). Those are
  pinnable only by polling the endpoint a customer connected, on their own
  surface — which this environment cannot reach, and which is where the
  candidate's *durable* asset lives, since a remote endpoint's history is
  reconstructable by nobody who was not watching.
- **Static extraction only.** No MCP server is ever run. Asking an untrusted
  server for its tool list is the thing this product exists to be careful about.
  Minified and bundled packages defeat static reading.
- **The tuning/holdout split is a guarantee about labels, not about fetches.**
  `TUNED_ON` names the 19 packages whose pairs were read by hand; a test checks
  it still matches the research corpus. Up to 21 further packages were *fetched*
  by that pass and yielded no labelled pair, and today's registry ranking is not
  that day's, so `--min-rank` is best effort while `TUNED_ON` is exact.
- **All 164 eligible packages have now been taken**: 60 in corpus 2 and the
  remaining 103 in corpus 3, which excludes corpus 2 by name from its own
  output rather than by re-ranking. One package (`mcp-socialapi`) is excluded as
  tuned-on. The population is therefore exhausted at today's registry ranking; a
  fourth corpus needs the registry to grow, or a different registry.
- **No non-Latin text is matched by any signal.** Every pattern is English
  keywords. Corpus 3 contains 8 Chinese and 2 Korean description changes, one of
  which is instruction-bearing by hand and invisible to the rules by
  construction.

## What this does not establish

- **That 0.40–0.62 is the classifier's accuracy.** It is its accuracy on two
  corpora of npm-published servers, hand-labelled by one reader against a rubric
  written down before counting. The rubric is in `build_labels.py` and every
  borderline call is marked; disagree with any of them and re-run the scorer.
  Two measurements that disagree this much are better read as a caution about
  the third than as brackets around a true value.
- **That the three edits are the right fix.** They are measured out of sample
  and they help, and they leave 86% of the qualifying changes unfound. The class
  that carries 35 of 44 misses has no rule at all yet.
- **That a model would do better.** Measured now — see the model-pass amendment
  below. It does, on precision and recall both, and it does worse on the one
  thing this probe's whole methodology is built around: judging only the newly
  added text. **That measurement is on corpus 2 only**, and the corpus-3 pass
  above is a demonstration that a single held-out figure from this corpus family
  does not have to hold: the rules' own F1 fell by half between the two. The
  model's 0.61–0.71 has not been asked the same question.
- **That severity is separable at all.** A benign deprecation notice and an
  injected routing instruction are the same shape in text. This probe labels
  *whether* text addresses the model, never whether it is hostile, and the
  record says so.
- **Anything about the 85%.** Every number here is from the 15% of the registry
  that ships a package.

## Amendment, 2026-08-22: a model was run over the corpus

The write-up above named this the obvious next pass and put a number on why it
was cheap: 136 changes with committed hand labels. Run here, blind: four
independent Claude Sonnet 5 passes, one per disjoint 34-item slice of the
corpus, each given only a tool's old/new description text, a mechanical
newly-added-text hint, and the rubric from `build_labels.py`'s docstring — not
the rule classifier's bucket for that item, not the hand labels, not
`build_labels.py` itself. Scored against the same committed hand labels the
rules were scored against, by `score_model_pass.py`.

|  | rules (2026-08-22) | model, one blind pass |
|---|---:|---:|
| precision | 0.40 | **0.48–0.60** |
| recall | 0.24–0.29 | **0.86–0.88** |
| F1 | 0.30–0.33 | **0.61–0.71** |

**The model beats the rules on both axes, by a wide margin on recall.** It
caught 15 of 17 hand-labelled instruction-bearing changes (13 of 15 counting
borderline calls conservatively) against the rules' 4 of 17 (4 of 14
conservative). That is direct evidence against this candidate's `ai_leverage`
score of 6, which was lowered on 2026-08-19 on the finding that "the
classification is rule-separable rather than model work" — on this corpus it
demonstrably is not: a model gets roughly twice the rules' F1.

**It is not simply better, and the way it is worse is the reusable finding.**
Of the model's 10 false positives (counting borderline calls as positive), 4
are hand-noted as judging text that was not actually new — the exact
discipline `build_labels.py`'s rubric leads with ("applied to the *newly
added* text only … text already present in the old description is not new
evidence"):

- `@gency-ai/gency-mcp` `update_product_status`: flagged "Confirm with the
  user" as a new imperative; the old text already carried the identical
  instruction, just at greater length.
- `@naumu/mcp` `naumu_remove_edge` (0.1.5): flagged "Prefer `naumu_ask`" as a
  new priority claim; it is in both versions, unchanged — the case the
  hand-labels call out as "the span-must-be-new rule working" against the
  rules, and the model missed it in the direction the rules got right.
- `@naumu/mcp` `naumu_add_node` (0.1.5): flagged a new imperative in a version
  where the hand labels record the *opposite* edit — a directive being
  *removed*, not added.
- `@agenttrust/mcp-server` `agenttrust_inbox`: flagged a tool reference as new
  routing guidance; the same routing was already present in the prior
  description.

A rule-based diff can guarantee it only ever sees the new span; nothing here
stopped the model from re-reading the full before/after pair and losing track
of which words were actually added, and about a quarter of its false alarms
came from exactly that. The other 6 false positives and both false negatives
are genuine judgement calls, not this failure mode — see
`score_model_pass.py --disagree` for the full list with both readings side by
side, including one item (`@flydocs/cli` `install`/`sync`) where the "new"
text is itself truncated mid-sentence ("deprecated — use ") in a way that
makes the hand label's call defensible but not obviously the only reasonable
one.

**What was deliberately not done here either:** the disagreements were not
adjudicated in the model's favour, the hand labels were not revised, and this
was not repeated to average away the single-pass noise the labels
(`model-pass-2026-08-22.json`'s own `single_pass_caveat`) already flag. One
blind pass beating the rules by this much is itself the finding; turning it
into a shippable classifier is a different, larger piece of work this pass
does not claim to have done.

**Score moved:** `ai_leverage` 6 → 7 in `candidates.yaml`, reversing part of
the 2026-08-19 reduction — see that file's `measured` block for the exact
wording. Composite 6.75 → 6.875. No other score moves; `defensibility` (the
candidate's actual floor, at 3, mitigation refuted per the entry above) is
untouched and this still cannot graduate under README.md rule 2.

| File | What it is |
|---|---|
| `model-pass-2026-08-22.json` | The model's 136 blind labels plus its per-item reasoning, and the exact method in its own `method` field. |
| `score_model_pass.py` | Scores the model pass against the hand labels; `--disagree` lists every split with both sides' reasoning. |
