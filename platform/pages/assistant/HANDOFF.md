# Site assistant: what is left, and how to do it

For the next agent picking this up. What exists and why is in
`docs/reports/2026-10-20-site-assistant.md`; the rules products follow are in
`PRODUCT_PLAYBOOK.md` §4 ("Every way in"). Each item below is self-contained.
Do them in order unless the brief says otherwise.

Fast checks for any change here (a few seconds):

```
node --test platform/pages/assistant.test.mjs platform/pages/site-nav.test.mjs platform/pages/check.test.mjs
```

Before merging a change that reaches the built site, also run
`node platform/pages/build.mjs && node platform/pages/check.mjs`. The full
Pages suite (`node --test platform/pages/*.test.mjs`, about 25 minutes, run it
in the background) or CI is the gate.

## 1. Check the on-device model on a real GPU (needs a person or a GPU runner)

Never observed: the model answering. The download and the load from cache work.

1. On a desktop with Chrome or Edge and a real GPU, open `/ask/` on the live site.
2. Settings → "A model on this device" → Qwen2.5 0.5B → "Download and turn on".
3. Back in the chat, type "price 40, shipping 6" on the eBay fee calculator, then ask "what does final value fee mean?".
4. Record in the report the load time, the first-token time, whether the fill was right, and whether the reply's "How:" line names the model. If the worker reports an error, the message comes from `worker.js`. The likely suspects are the `response_format` JSON schema (WebLLM's grammar mode) and the q4f32 fallback.

A cloud session cannot do this: its WebGPU is a software adapter, and generation did not finish in 15 minutes. It can now run the same model on the CPU path (wllama, WebAssembly), which the worker uses when there is no hardware adapter: measured 2026-10-21 in `docs/reports/2026-10-21-wasm-on-the-site.md`. Still never observed: the WebLLM (WebGPU) path answering.

## 2. Blind round 3 for the rule reader

Round 2's four wrong writes were fixed after it was scored, so the fixes are unmeasured. Protocol (also in `evals.json` "about"):

1. Pick two calculators the eval set does not have yet. Copy their fields as the assistant reads them: label text without the input, `type` (`inputmode=decimal` counts as number), `min`, `max`, `step`, and the options. `readFields` in `client.js` is the reference.
2. Write 16 or more sentences a person would say, half of them on the new forms. Also write the expected values. **Do not run the reader yet.**
3. Add them to `cases` with `"round": 3`. Run `node -e "import('./platform/pages/assistant.mjs').then(m=>console.log(JSON.stringify(m.scoreEvals().all)))"`, and count fully-right cases and wrong writes for round 3 only (`assistant.test.mjs` shows the scoring).
4. Commit that state. Add `{round: 3, date, commit, cases, passed, wrong_writes, forms}` to `blind_rounds`, with the commit you just made.
5. Only now fix the misses. Every fix should be a general rule, never a special case for one sentence. Then all cases must pass again.

## 3. Score the model engines

Done for Qwen2.5 0.5B and 1.5B on the CPU path (`model-bench/`, results in `model-bench/results/`, report `docs/reports/2026-10-21-wasm-on-the-site.md`). The 0.5B model wrote 337 wrong values on the 52 sentences until `validateFills(…, said)` and `mergeFills` were added. What is left: a model score on sentences the rules get wrong (they pass all 52 now), and the rows below for the other engines.

Run every sentence in `evals.json` through each engine's fill prompt: `FILL_SYSTEM` + `fieldList` + `fieldSchema` in `client.js`, through `validateFills`. Score the same way as the rules, and add a table to the Ask page's quality section in `assistant.mjs`.

- **Own key**: `platform/llm/byok.mjs` works from Node. Paid API calls need the owner's key and approval; do not spend a key that is not yours.
- **Local server** (Ollama, LM Studio): free if one is running.
- **WebLLM / built-in model**: needs item 1's machine.

## 4. Natural voice output (optional)

Voices today are the device's own `speechSynthesis`. Kokoro-82M (`kokoro-js`, ONNX, about 80–300 MB depending on the quantization) can run in `worker.js` beside Whisper.

Keep it opt-in, name the size measured from the Hugging Face file listing in the button, and fall back to `speechSynthesis`. Test it in the worker as Whisper was tested: generate audio, and check its length and that it is not silence.

## 5. Read the usage counters

The panel counts `assistant_opened`, `assistant_filled`, `assistant_typed`, `assistant_voice` and `assistant_voice_mode` in the local `portfolio-hub-usage` store (event names only; DNT, GPC and the site opt-out silence them). Add them to whatever reads site usage under `portfolio/usage/`.

When the first-party counter (`platform/counter/`) is on, decide with the owner whether an assistant event should be sent as well. It is not sent today, and the privacy copy says so.

## Traps already hit

- `pkill -f <pattern>` matches its own shell command line in these sessions, and kills the command that ran it. Use the PID from `pgrep`.
- Headless Chromium crashes on `SpeechRecognition.available()`. Do not call it in browser checks.
- `main` moves fast: the PR needed four merges of `main`. Merge `main` right before the final CI run, not before the long local suite.
- The changelog page quotes commit subjects. A test that looks for a bare word (for example `pf-chrome`) in page HTML will see it there.
