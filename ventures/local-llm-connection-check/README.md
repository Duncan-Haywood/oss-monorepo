# Local LLM Connection Check

A free browser tool that answers one question: **can a web page reach the AI
model running on your own computer, and if not, why not?** It probes
[Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai) and
[llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server` (or any
OpenAI-compatible address you type) exactly the way a web tool would, and
reports one of:

| Result | What it means | The fix it gives you |
|---|---|---|
| Working | The page can reach it and it has models | Which models to pick in a tool |
| Blocked (CORS) | Running, but refusing this page's origin | `OLLAMA_ORIGINS` for the macOS app, a Linux systemd service, Windows or `ollama serve`; LM Studio's CORS switch |
| Unreachable | Not running, wrong port, or the browser blocked local network access | The start command, and where to allow local network access |
| No models | Reachable, nothing downloaded or loaded | `ollama pull …`, `lms get …` |
| Mixed content | An https page cannot call plain http on another machine | Use localhost, serve over https, or forward the port with ssh |

Then it sends a short test prompt to the model you pick and shows **tokens
per second**, so you know whether your machine is fast enough before you rely
on it.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/local-llm-connection-check/
· **Guide:** [Fix the Ollama CORS error](https://duncan-haywood.github.io/monorepo-projects/local-llm-connection-check/fix-ollama-cors-error.html)

## Why this exists

The free tools in this portfolio that use AI (Proposal Maker, Review Reply
Desk, Sales Call Notes Desk, ICP Lens, ATS Resume Checker) can run on a model
on your own computer instead of an API key: no key, no per-call bill, and your
text never leaves your machine. The obstacle is the first connection. Ollama
refuses web pages from other sites until you set `OLLAMA_ORIGINS`, and the
browser reports that refusal exactly like a server that is not running
(`TypeError: Failed to fetch`), so people chase the wrong problem.

This tool tells the two apart with a second request in `no-cors` mode, which
may reach the server but not read its reply: if it completes, something is
listening and refusing the page; if it fails too, nothing is listening (or the
browser blocked local network access).

## How it works

- `probe.mjs`: the diagnosis (`probe`, `probeAll`), the fix steps per server,
  state and operating system (`fixFor`), the test prompt timer (`testPrompt`)
  and a copyable report. `fetch` and the clock are injected, so every branch
  is tested without a network.
- `byok.mjs`: a vendored copy of the portfolio's shared model client
  ([`platform/llm/`](../../platform/llm/README.md)), used for the test prompt
  so it exercises the same code path as the tools that will use your model.
- `usage.mjs`: the anonymous local counter.

Run the tests: `node --test` in this directory.

## Privacy

Everything runs client-side in your browser. The only requests the page makes
are to the addresses it probes and the model you test, which are on your own
computer unless you enter another. Nothing reaches us. Usage counting is
local, opt-out, and records only that a probe ran, a test prompt ran or a fix
was copied; Do Not Track and Global Privacy Control turn it off.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security or IT advice, and a result is an observation
about what the page could reach at that moment, not a guarantee about your
setup. **You are responsible for reviewing and verifying its output before
relying on it**, including every command before you run it. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## License

MIT. Free and open source; [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.
