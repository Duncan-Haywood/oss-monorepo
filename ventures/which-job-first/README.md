# Which Job First

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/which-job-first/>

**Turn a list of possible jobs into a work order without scoring anything.** Paste the jobs you could take, answer a run of this-or-that questions, and get them back in order. The tool runs entirely in the browser; the list never leaves your device.

After using this, you can now turn an overwhelming list of possible jobs into an order you can act on, which used to mean staring at a whiteboard or scoring every job out of ten and getting twelve near-identical numbers back.

## Use it

Open `index.html` in a browser. Put one job per line, select **Start ranking**, and answer each head-to-head question with the job you would rather take first — by clicking, or with `1`/`2` or the arrow keys. **Undo last answer** walks back a misclick. When the run finishes you get the ranked work order, which you can copy as text or export as CSV.

An unfinished run is saved in this browser, so closing the tab does not lose your progress.

**Copy share link** puts your job *list* — not your answers and not your ranking — after the `#` in a URL. A browser never sends that part to a server, so pasting the link into a text or an email is the only way it travels. It exists so a partner or a foreman can rank the same jobs independently and compare, which is the conversation two people who disagree about what to take on actually need.

## How the ranking is built

`rank.mjs` is a bottom-up merge sort written as an explicit state machine, so it can stop between any two comparisons and be resumed — including from local storage in a different tab. That shape is what makes a human comparator possible at all: a comparator passed to `Array.prototype.sort` would have to block on a click, and there is nothing to block on in a browser.

Merge sort rather than an Elo or Bradley-Terry score because the number of questions is the entire user cost. Merge sort asks about *n*·log2(*n*) questions and then stops with a complete order; a scoring model needs several times as many random pairings before its ordering settles and never announces that it is done.

What it assumes in exchange is transitivity — if you prefer A to B and B to C it never asks about A and C. That is the honest limitation of the method, and the page says so rather than burying it.

## Privacy and usage

Everything runs in your browser. The job list is never uploaded, and there are no accounts, cookies, or analytics vendors. The optional usage switch counts only local feature events (`ranking_started`, `ranking_completed`, `sample_loaded`, `copied`, `exported`) in this browser; it stores no job names, no list contents, and no identifiers. It is off by default, and counting stops automatically when the browser sends Do Not Track or Global Privacy Control.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, legal, or business advice, and it does not replace your own judgement. A ranking reflects only the answers you gave it. **You are responsible for reviewing it before acting on it**, and for the commitments you make. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Development

```sh
node --test ventures/which-job-first/*.test.mjs
```
