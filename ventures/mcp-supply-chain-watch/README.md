# MCP Supply-Chain Watch

MCP Supply-Chain Watch compares two captured Model Context Protocol tool
manifests so an agent team can see what a connected server added, removed, or
changed since approval. After using this, you can now produce reviewable drift
evidence in seconds, which used to require manually inspecting two exports.

**Browser tool** (no install, nothing uploaded): open
[`site/index.html`](site/index.html) directly in a browser, or serve the
`site/` directory statically — it is a self-contained, zero-dependency page
running the same comparison logic as the CLI below (see
[`site/compare.mjs`](site/compare.mjs), cross-checked against the Python CLI
in tests). It also links to
[`site/what-is-mcp-tool-poisoning.html`](site/what-is-mcp-tool-poisoning.html),
a reference page on the attack this checker is built to catch. It is live at
[`mcp-supply-chain-watch`](https://duncan-haywood.github.io/monorepo-projects/mcp-supply-chain-watch/)
in the portfolio's GitHub Pages catalogue — see `VENTURE.yaml`'s `links.production`.
The static surface includes crawlable `robots.txt` and `sitemap.xml` files.

**CLI**, for scripting or CI:

```bash
python3 src/mcp_watch.py examples/before.json examples/after.json
python3 src/mcp_watch.py examples/before.json examples/after.json --output drift.json --usage-log usage.jsonl
python3 src/mcp_watch.py examples/before.json examples/after.json --format markdown > drift.md
```

The checker is local-first and standard-library only. It reports tool additions,
removals, schema changes, ordinary description changes, and a small set of
model-directed instruction signals. It does not contact servers, proxy traffic,
scan infrastructure, preserve customer content in usage logs, or claim that a
server is safe. Capture manifests through a customer-authorized process and
review every finding before acting on it.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, financial, security, or compliance
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

Usage logging is opt-in with `--usage-log` and records only the event name, day,
and product slug. It stores no server names, tool names, descriptions, schemas,
IP addresses, or identifiers. There are no accounts, cookies, network calls,
paid APIs, or analytics vendors.

The optional Markdown format is suitable for a ticket or review note. It lists
tool names and observed change categories, but intentionally does not reproduce
manifest descriptions or input schemas.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
does not change what the tool does.

```bash
cd ventures/mcp-supply-chain-watch
python3 -m unittest discover -s tests -v
node --test site/*.test.mjs
```
