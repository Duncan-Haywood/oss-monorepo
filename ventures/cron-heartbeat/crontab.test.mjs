import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeCrontab, slugify, wrapCommand, splitLine } from "./crontab.mjs";
import { validateConfig } from "./monitor.mjs";

const NOW = new Date("2026-10-08T10:07:00Z");
const TAB = `# backups
MAILTO=ops@example.com
0 3 * * * /usr/local/bin/backup.sh --full > /var/log/backup.log 2>&1
*/15 * * * * cd /srv/app && ./sync-invoices.sh
@daily /opt/report.py
61 * * * * broken
`;

test("analyzes a crontab: skips comments and env lines, flags bad lines", () => {
  const r = analyzeCrontab(TAB, NOW, "https://hb.example.org/");
  assert.equal(r.entries.length, 4);
  assert.deepEqual(r.entries.map((e) => e.slug ?? null), ["backup", "sync-invoices", "report", null]);
  assert.match(r.entries[3].error, /outside 0-59/);
  assert.equal(r.entries[0].pingUrl, "https://hb.example.org/ping/backup");
  assert.equal(r.entries[0].nextRuns.length, 5);
});

test("generated config is accepted by the server's own validator", () => {
  const r = analyzeCrontab(TAB, NOW);
  const cfg = validateConfig(JSON.parse(r.configJson));
  assert.deepEqual(Object.keys(cfg), ["backup", "sync-invoices", "report"]);
  assert.equal(cfg.backup.graceSeconds, 3600);
});

test("wrapped command reports success and failure and keeps the original command first", () => {
  const w = wrapCommand("./job.sh", "https://x/ping/job");
  assert.match(w, /^\.\/job\.sh && curl .* https:\/\/x\/ping\/job \|\| curl .* https:\/\/x\/ping\/job\/fail$/);
});

test("slugs are unique and valid", () => {
  const taken = new Set();
  assert.equal(slugify("/bin/Backup.SH x", taken), "backup");
  assert.equal(slugify("/bin/backup.sh y", taken), "backup-2");
  assert.equal(slugify("sudo -n 9lives.sh", taken), "9lives");
});

test("warns when output is discarded and when both day fields are set", () => {
  const r = analyzeCrontab("0 1 13 * fri ./x.sh >/dev/null 2>&1", NOW);
  const w = r.entries[0].warnings.join(" ");
  assert.match(w, /silent/);
  assert.match(w, /either match|on either/);
});

test("macro lines split correctly", () => {
  assert.deepEqual(splitLine("@hourly echo hi"), { schedule: "@hourly", command: "echo hi" });
});
