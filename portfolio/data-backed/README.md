# Data-backed products: business functions with public data

The owner's direction (2026-10-24, quoted in [`prompts/goals.md`](../../prompts/goals.md),
"Business functions with data to build and test against"): take a traditional
business function or job role that has public data, build an agentic, ML or
rules system for it, test it on that data, or train a small specialised model
and ship it.

## The method

1. **A job, not a formula.** Name the person and the task (a bookkeeper
   matching receipts, a support lead routing tickets, a buyer reading a vendor
   contract). The output must be something they would otherwise do by hand.
2. **Real labelled data.** Real work product labelled by people. Generated or
   "hybrid synthetic" sets are fine for training, not for an accuracy claim.
   Check the licence on the dataset card on the day you use it and write the
   revision and date in the fixture README.
3. **Split before looking.** Fix train/dev/test (use the dataset's own split
   where it has one). Score the system as it stands on all splits first: the
   "before" number is a result. Change things looking only at train and dev;
   score test once after. Say in the README how many times test was scored.
4. **Smallest model that works.** Rules first; a small model trained here
   (logistic regression, gradient boosting, a tiny transformer) when the rules
   stop; an LLM on the user's own key or a local model only where it clearly
   helps. A trained model ships as a weights file the page loads, with no
   per-user cost (`PRODUCT_PLAYBOOK.md`).
5. **Pin the numbers.** Commit the derived fixture (when the licence allows),
   the scoring script and a test that pins the table, so a regression on real
   data fails CI.
6. **Say what it doesn't show.** Hand-corrected text is not OCR; one country's
   receipts are not every country's; agent-written test sets are not evidence.

## Instances

| Job | Dataset (licence, checked) | Venture | Status |
|---|---|---|---|
| Bookkeeper: read receipt totals and tax | CORD-v2, 1,000 Indonesian receipts (CC BY 4.0, HF `naver-clova-ix/cord-v2`, 2026-10-24) | [`ai-bookkeeper`](../../ventures/ai-bookkeeper/README.md) | Landed 2026-10-24: held-out totals 4.2% to 93.7%, tax 0% to 90.2% |
| Support agent: answer or hand off | BANKING77, 13,083 real banking questions (CC BY 4.0, HF `PolyAI/banking77`) | [`support-agent`](../../ventures/support-agent/README.md) | Landed earlier: 74% of answerable test questions answered right with 40 past questions per topic |

## Candidates, checked 2026-10-24

Licence tags read from the Hugging Face or UCI API on 2026-10-24. Read the
card itself before building: a tag can be wrong.

| Job | Dataset | Licence | Real? | Where it goes |
|---|---|---|---|---|
| Buyer or lawyer reviewing a vendor contract (renewal, liability cap, termination, ...) | CUAD, 510 contracts, 41 clause types labelled by lawyers (HF `theatticusproject/cuad`) | CC BY 4.0 | Real | [`vendor-contract-clause-reader`](../../ventures/vendor-contract-clause-reader/README.md) is rules on hand-written text: score it on CUAD first |
| Contracts: clause type of a provision | LEDGAR in LexGLUE (HF `coastalcph/lex_glue`) | CC BY 4.0 | Real contract provisions (read the card for the source) | Same venture, a clause classifier |
| Legal ops tasks | LegalBench (HF `nguha/legalbench`) | CC BY 4.0 (per-task licences vary) | Mixed | Research or eval only |
| Demand planner, e-commerce | UCI Online Retail, 541,909 invoice lines, UK retailer 2010-11 (UCI id 352) | CC BY 4.0 (dataset page; the API field is empty) | Real | [`demand-forecast-backtester`](../../ventures/demand-forecast-backtester/README.md), `sales-seasonality-forecaster` |
| Intent routing, many languages | MASSIVE 1.1, over 1M utterances in 52 languages, 60 intents (HF `AmazonScience/massive`) | CC BY 4.0 | Real people, but voice-assistant commands, not support tickets | Multilingual intent baseline only |
| Support answers | Bitext customer support (HF `bitext/...-customer-support-llm-chatbot-training-dataset`) | CDLA-Sharing-1.0 | **Hybrid synthetic** (card says so) | Training only; no accuracy claims |
| Bank transaction categories | `mitulshah/transaction-categorization` | MIT tag, gated | Unknown, gated | Read the card before use; ai-bookkeeper needs real bank descriptions |
| Marketing uplift | Criteo uplift (HF `criteo/criteo-uplift`) | CC BY-NC-SA 4.0 | Real | **Non-commercial**: research only, never in an MIT product's fixtures |
| Financial news sentiment | Financial PhraseBank | CC BY-NC-SA 3.0 | Real | Non-commercial: skip |
| Receipt fields (OCR) | SROIE (HF `darentang/sroie`) | No licence tag | Real | Do not use until a licence is found |

Notes: non-commercial (NC) and untagged sets do not go into this MIT
repository's fixtures. Credentialed sets (MIMIC and similar) are out: their
terms forbid redistribution.
