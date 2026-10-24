# WebAssembly on the Pages site: where it helps

**Date:** 2026-10-21. **Asked by:** the owner ("I want to look into wasl more
for the ghp see if there are any benefits anywhere", read as WebAssembly on
the GitHub Pages site). **Method:** measured in a cloud session (4 cores, no
GPU, headless Chromium). Every number below comes from a run in that session,
or from the committed file named next to it. Where something was not
measured, this report says so.

## Short answer

| Where | WASM helps? | What was done |
|---|---|---|
| Site assistant's on-device model | **Yes.** Without WebGPU the model did not run at all; llama.cpp in WASM runs the same Qwen2.5 model on the CPU | Shipped: CPU fallback in `platform/pages/assistant/worker.js` |
| Model form-filling quality | Running it for the first time showed the model was **doing harm**: 337 wrong values on 52 sentences | Shipped: three general checks in `fill.mjs`; 337 → 0 on the same replies |
| Research reproductions in the browser (Pyodide) | **Yes, and cheaply.** 723 of 824 research projects with Python import only what Pyodide ships | Measured, not built. Proposed below |
| shift-roster-builder optimality proof | **No.** The bottleneck is the bound, not the node rate | Nothing; reasons below |
| einvoice-preflight official rules in the page | **No.** Already solved in plain JS (fontoxpath) | Nothing |
| Speech recognition (Whisper) | Already WASM. WebGPU might be faster where present | Not measured |

## 1. The assistant's model now runs without WebGPU

Before this change the "A model on this device" engine (`/ask/`, any page's
assistant panel) needed WebGPU. Without it, the panel said "this will not run
here". That covers browsers without WebGPU and machines whose only adapter is
a software one. `platform/pages/assistant/HANDOFF.md` item 1 records that the
model had **never been observed answering**: a cloud session's software
WebGPU did not finish a reply in 15 minutes.

The worker now falls back to [wllama](https://github.com/ngxson/wllama)
3.8.1 (MIT, llama.cpp compiled to WebAssembly, 8.8 MB `.wasm` from
jsDelivr). It loads the same model as a GGUF from Qwen's own Hugging Face
repository (q4_0: 430 MB for 0.5B, 1.1 GB for 1.5B). It uses the fallback
when there is no adapter or the adapter reports itself as a fallback
(software) one. wllama takes the same OpenAI-shaped request as WebLLM and
turns the form's JSON schema into a llama.cpp grammar, so the panel code
did not change shape.

Measured in headless Chromium with no GPU (`model-bench/`):

| Setting | Model load (local file) | 100-word answer | Form fill, per sentence |
|---|---|---|---|
| 1 thread (what GitHub Pages gets) | 9.6 s | 37.7 s, first token 7.2 s | 11–107 s (4 sentences) |
| 2 threads (cross-origin isolated) | 7.3 s | 11.8 s for 51 chunks, first token 3.9 s | 6–54 s (same 4) |
| 4 threads (cross-origin isolated) | 8.1 s | 10.7 s for 91 chunks, first token 2.1 s | median 8.9 s, p90 14.6 s, max 32.4 s (52 sentences) |

The worker itself was run end to end with the real `worker.js`, CDN URLs
pointed at local copies, on one thread: load 9.0 s with progress events, a
two-field fill returned `{"price":40, "shippingCharged":6}` in 16.6 s, and a
streamed reply arrived token by token.

**Threads need headers Pages cannot send.** wllama uses threads only when
the page is cross-origin isolated (COOP and COEP headers). GitHub Pages does
not let a site set headers, so the live site runs on one thread. A service
worker can add the headers (the `coi-serviceworker` trick). But
`require-corp` would block every cross-origin image, embed and script on the
page that does not send CORP. Measured on the same four sentences: 190.9 s on one thread, 98.9 s on
two (1.9x), 52.2 s on four (3.7x). That is worth a later, scoped experiment on `/ask/` only, not a
site-wide change.

**Storage quota.** wllama stores the file before loading it. In a headless
profile with a 930 MB quota, the 1.1 GB model's load never returned: no
error, just a hang. The worker now compares `navigator.storage.estimate()`
with the file size first and says plainly when the model will not fit.
Ordinary desktop browsers allow far more, but a nearly full disk would hit
the same hang.

## 2. Running the model showed it was harming the fill, and how it was fixed

`HANDOFF.md` item 3 asked for the model engines to be scored on the eval
set. With a CPU path, that can be done in a cloud session for the first
time. `model-bench/run.mjs` sends every sentence in
`platform/pages/assistant/evals.json` through the panel's own fill prompt
and schema. `model-bench/score.mjs` scores the replies the way
`assistant.mjs` scores the rules.

Qwen2.5 0.5B (the default model, on WebGPU too), 52 sentences, 28 of them
from blind rounds:

| Reading | Fully right | Wrong values written | Missed |
|---|---|---|---|
| Rules alone | 52 | 0 | 0 |
| Model alone | 13 | 337 | 6 |
| Panel before this change (model replaces rules when it finds as many) | 13 | 337 | 6 |
| Panel after this change | 52 | 0 | 0 |

The model fills almost every field it is shown. Fields nobody mentioned get
0 ("item price 55, shipping 8" came back with all 12 eBay fields). It puts
one number in several fields ("dumpster 500, permit 300" set both roof
sections' area to 500), puts numbers in the wrong field ("cost of goods
eight bucks" became the price), and ticks checkboxes nobody named. The
panel preferred the model whenever it found at least as many values as the
rules. It always did, so turning the model on made every fill worse.

Three general checks, in `fill.mjs`, each tested in
`platform/pages/assistant.test.mjs`:

1. **A number must be one the person said** (`validateFills(…, said)`).
   Accepted readings include 5 percent as 0.05, "twelve fifty" as 12.5 or
   1250, and 8/12 as 8 or 12; 0 only with "zero", "free", "no" or "none".
   337 → 51 wrong writes.
2. **The rules' values stand, and each number fills one field**
   (`mergeFills`). The model may only add fields the rules did not fill. It
   cannot reuse a number the rules placed, and a number it puts in more
   fields than it was said is dropped from all of them. 51 → 12.
3. **A choice or checkbox must be named** (`validateFills`). A select needs a
   word of the chosen option. A checkbox needs a word of its label that no
   other field's label has ("price" does not tick "Low-Price FBA"). 12 → 0.

**What this does and does not show.** The checks were written after reading
these replies, so 0 wrong writes on this set is not an estimate for new
sentences. The 1.5B run below is a fairer test, since the checks were not
written from its replies. The set also cannot show the model **helping**:
the rules already pass all 52 sentences, because every rule miss found
there was fixed. Whether a model adds anything needs sentences the rules
get wrong, written blind (`HANDOFF.md` item 2's protocol).

Qwen2.5 1.5B, same 52 sentences, 4 threads:

| Reading | Fully right | Wrong values written | Missed |
|---|---|---|---|
| Model alone (= panel before this change) | 37 | 87 | 4 |
| Panel after this change | 52 | 0 | 0 |

The checks were not written from these replies, and they still remove every
wrong value. The larger model is better on its own (37 against 13 fully
right) but still writes 87 wrong values. Speed with 4 threads: load 12 s,
fill median 11.1 s, p90 39.4 s, max 85.6 s; a reply's first token 7.4 s. One
thread was not measured for 1.5B; if it scales like 0.5B, expect about
3.7x those times.

## 3. Research reproductions could run on their own pages (Pyodide)

Pyodide is CPython compiled to WebAssembly, with numpy, scipy, pandas,
matplotlib, scikit-learn, networkx and sympy prebuilt. A static scan of
imports under `research/` found 824 projects with Python. **723** import
only the standard library, Pyodide's packages or other modules in this
repository. The most common blockers among the other 101 are scikit-fem
(33 projects, pure Python, so it can probably be installed with `micropip`;
not tried) and MuJoCo (24).

`research/simdesign-topopt` (Sigmund's 99-line SIMP in numpy and scipy) was
timed: 60 iterations on a 60 × 20 MBB beam.

| | Solve | Start-up | Download |
|---|---|---|---|
| CPython 3.13, numpy 2.2.5, scipy 1.14.1 | 0.75 s (3 runs) | — | — |
| Pyodide 0.28.3 (Node) | 1.10 s (2 runs) | 1.6 s boot, 2.7–3.4 s numpy+scipy, ~1.5 s package import | about 29 MB (runtime 8.6, stdlib 2.4, numpy 3.1, scipy 13.3, OpenBLAS 1.9; less compressed on the wire) |

So the browser does have scipy. That corrects the topology-optimisation
candidate in
[`portfolio/opinions/2026-10-20-rust-where-it-is-essential.md`](../../portfolio/opinions/2026-10-20-rust-where-it-is-essential.md),
which reasons that "the browser has no scipy". A 2D solve runs at about
1.5x CPython. The case for a Rust core there rests on 3D at interactive
speed, not on 2D being impossible in the page.

**Proposed, not built:** a "Run it here" box on research pages whose
project is Pyodide-ready. It would fetch the project's own `src/` and one
experiment, run it in a worker, and show the output beside the committed
`results.txt`, so a reader can check a result without installing anything.
It costs about 29 MB once, cached by the browser, and nothing on the server.
Start with one project and measure who uses it before rolling it out.

## 4. Where WASM is not the answer

**shift-roster-builder's optimality proof** (flagship 3) was the opinion
piece's first Rust/WASM candidate. Its own README already measured the
answer: 3.36M nodes in 150 s (20x the default budget) still do not prove
the 32-shift sample week. The remaining $55.81 gap sits in the hours-balance
bound ("whole shifts and availability, which a bound on hours alone cannot
see"). A constant-factor speed-up from compiling the same search to WASM
cannot close a gap that 20x more search does not close. The bound has to
get stronger first. One untried route: HiGHS has an MIT-licensed WASM build
(`highs` 1.15.4 on npm, 4 MB). It could solve a MIP model of the week. The
quadratic balance term would need a piecewise-linear form, exact at the
quarter-hour grid that shift lengths sit on. Not attempted here.

**einvoice-preflight's official rules** were blocked from the Pages copy by
Saxon-JS's licence. That is already solved without WASM: `plain/` compiles
the Schematron to JSON and runs it with fontoxpath (MIT) in the page,
matching the Saxon route on 40 official examples and 353 edited copies
(`ventures/einvoice-preflight/README.md`). The flagship's `next` line in
`portfolio/flagships.yaml` still offers "that decision, or the plain-JS
port" as open.

**Speech recognition** already runs Whisper tiny.en on the WASM backend of
onnxruntime-web. Switching to its WebGPU backend where an adapter exists
might be faster; not measured.

## Reproduce

```
npm i --prefix /tmp/wl @wllama/wllama@3.8.1
curl -L -o /tmp/q05.gguf https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf
PLAYWRIGHT=/opt/node-tools/node_modules/playwright-core/index.mjs \
  node platform/pages/assistant/model-bench/run.mjs --wllama /tmp/wl/node_modules/@wllama/wllama/esm \
    --model /tmp/q05.gguf --out q05.json --isolated --threads 4
node platform/pages/assistant/model-bench/score.mjs q05.json --list
```

The per-sentence replies from this session are committed beside the
harness: `platform/pages/assistant/model-bench/results/`.
