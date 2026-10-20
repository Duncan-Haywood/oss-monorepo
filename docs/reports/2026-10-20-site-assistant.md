# The site assistant: voice, chat and agent access to every tool

**Date:** 2026-10-20. **Asked by:** the owner ("I want to add an ai assistant
to the ghp. I also want voice interfaces and llm interfaces to be considered a
primary use case for the browser … easily auditable quality limitations and
transparency on how things work"). **Shipped in:** PR #8705. **Method:** built
and run in a cloud session. Every number below was measured in that session,
or comes from the committed files named next to it. Where something could not
be measured, this report says so.

## What shipped

| Piece | File | Served as |
|---|---|---|
| Rule-based reader: sentence → form values, no model | `platform/pages/assistant/fill.mjs` | `/pf-fill.js` |
| Panel, engines, voice, WebMCP tools | `platform/pages/assistant/client.js` | `/pf-assistant.js` |
| On-device LLM (WebLLM) and speech recognition (Whisper) | `platform/pages/assistant/worker.js` | `/pf-ai-worker.js` (Web Worker) |
| Build glue: launcher, Ask page, eval scoring | `platform/pages/assistant.mjs` | `/ask/`, plus about 3 KB in `/pf-site.js` |
| Eval set and blind rounds | `platform/pages/assistant/evals.json` | linked from `/ask/` |
| Tests | `platform/pages/assistant.test.mjs` | — |

Visitors get:

- an "Ask" link in the header of every page;
- a "Speak or type" button on every calculator with two or more number inputs. That covers `type="number"` (709 pages) and `inputmode="decimal|numeric"` text inputs (219 more);
- a voice-only mode that listens, fills, speaks and listens again;
- in browsers with WebMCP, three tools per page for an AI agent: `search_site_tools`, `read_page_results` and `fill_form`.

The owner's direction is recorded in `prompts/goals.md` ("Direction: voice,
chat and agents as primary ways in"). The rules for products are in
`PRODUCT_PLAYBOOK.md` §4 ("Every way in").

## Cost to a page, and what is opt-in

| Loads | When | Size |
|---|---|---|
| Launcher (inside `pf-site.js`) | every page | about 3 KB |
| Panel + reader + search ranking | first click on Ask or the button | about 75 KB |
| Browser's built-in model (Chrome Prompt API) | when chosen in Settings | nothing from this site |
| Qwen2.5 0.5B or 1.5B (WebLLM, q4f16, f32 fallback) | after a click that names the size | 290 MB or 880 MB (summed from the Hugging Face file listings) |
| Whisper tiny.en, 4-bit | first microphone press, after a confirm that names the size | 96 MB (encoder 9.0 MB + decoder 86.7 MB) |
| Own key or local server (`platform/llm/byok.mjs`) | when set up | nothing |

A browser test of the built eBay calculator confirmed two things. On a bare
visit, `pf-assistant.js` is never fetched. With the panel open and a form
filled, no request leaves the site.

Cloud speech recognition is never used. The panel uses the browser's
on-device recognizer (`processLocally`) when it has one, otherwise Whisper
running in the worker. This keeps the site's promise that nothing typed is
uploaded.

## How well the rule reader works

All 52 sentences in `evals.json` pass, but that is the regression suite, not
an estimate, because every miss found was fixed. The estimate comes from
**blind rounds**. Each round's sentences were written before the rules were
run on them, scored once, and recorded with the commit that reproduces the
score. Both rounds were re-run from their commits before being recorded.

| Round | Forms | Sentences | Fully right | Wrong value written | Commit |
|---|---|---|---|---|---|
| 1 | eBay fees, roofing bid, Amazon FBA | 12 | 6 | 1 | `0a350c26` |
| 2 | those three + house cleaning and mileage (never seen by the rules) | 16 | 10 | 4 | `1eec78c2` |

Round 2's wrong writes show what a rule-based reader gets wrong:

- "one-time clean" read "one" as a quantity;
- "twelve fifty" was summed to 62;
- "67 cents" became 67;
- "listing it at 19" went to the "Promoted listings" field.

All four are fixed now, but the fixes are unmeasured until a round 3.

## What running it found that reading it did not

Each of these was found by running the code, in a browser or the worker, and
is fixed on `main`:

- On the live eBay page, folding "sold" into "price" made "Items already sold" tie with "Item price". The folding now applies only to what people say, never to labels.
- The roofing calculator renders two section rows on load, so the rows tied. Repeated rows now resolve to the first free row.
- `display:flex` overrode `[hidden]`, so Escape removed the panel from the DOM but not from the screen.
- Transformers.js 4.2's onnxruntime-web refuses the 8-bit Whisper files ("Missing required scale"); fp16 fails too. The 4-bit files load, and their transcript of an 11-second clip matched fp32's (151 MB) word for word, in about 4 s on CPU.
- WebLLM's q4f16 builds need the `shader-f16` GPU feature. On a GPU without it, the worker now loads the q4f32 build (the same download size).
- Headless Chromium's renderer crashes on `SpeechRecognition.available()`. The settings screen no longer probes it; the microphone press does.
- 219 calculators take numbers in `inputmode="decimal"` text inputs. Neither the button nor the reader saw them until the house-cleaning blind round.

## Not verified

- **On-device LLM answers.** The 266 MB Qwen2.5 0.5B download and the load from cache worked. Generation on this container's software WebGPU adapter did not finish within 15 minutes, so no answer or form fill from the on-device model has been observed.
- **Model engines' accuracy.** Only the rule reader is scored.
- **Real users.** Usage is counted locally (`assistant_opened`, `assistant_filled`, `assistant_voice`, `assistant_voice_mode` in `portfolio-hub-usage`) and is not yet read anywhere.

The next steps are in `platform/pages/assistant/HANDOFF.md`.
