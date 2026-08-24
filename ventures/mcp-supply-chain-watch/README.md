# MCP Supply-Chain Watch

MCP Supply-Chain Watch compares two captured Model Context Protocol tool
manifests so an agent team can see what a connected server added, removed, or
changed since approval. After using this, you can now produce reviewable drift
evidence in seconds, which used to require manually inspecting two exports.

```bash
python3 src/mcp_watch.py examples/before.json examples/after.json
python3 src/mcp_watch.py examples/before.json examples/after.json --output drift.json --usage-log usage.jsonl
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
