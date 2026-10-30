import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the Dockerfile copies every file the server imports or serves", () => {
  const server = read("./server.mjs");
  const imports = [...server.matchAll(/from "\.\/([\w.-]+)"/g)].map((m) => m[1]);
  const served = [...new Set([...server.matchAll(/"(\w[\w.-]+\.(?:html|mjs))"/g)].map((m) => m[1]))];
  const copied = read("./Dockerfile").match(/^COPY (.+) \.\/$/m)[1].split(/\s+/);
  for (const f of [...imports, ...served]) assert.ok(copied.includes(f), `${f} is needed but not copied into the image`);
});

test("render.yaml generates the secrets, keeps state on a disk and ships with automation off", () => {
  const t = read("./render.yaml");
  assert.match(t, /key: ADMIN_KEY\s+generateValue: true/);
  assert.match(t, /key: CAL_TOKEN\s+generateValue: true/);
  assert.match(t, /disk:/);
  assert.match(t, /key: AUTO_REPLY\s+value: "0"/);
  assert.match(t, /key: AUTO_FOLLOW_UP\s+value: "0"/);
  assert.doesNotMatch(t, /duncan/i);
});

test("fly.toml keeps the desk on a volume and one machine awake for the digest", () => {
  const t = read("./fly.toml");
  assert.match(t, /\[mounts\]\s+source = "state"\s+destination = "\/data"/);
  assert.match(t, /STATE = "\/data\/desk\.json"/);
  assert.match(t, /auto_stop_machines = "off"/);
  assert.match(t, /min_machines_running = 1/);
  assert.match(t, /path = "\/healthz"/);
  assert.match(t, /fly secrets set ADMIN_KEY=\$\(openssl rand -hex 16\) CAL_TOKEN=/);
  assert.match(t, /AUTO_REPLY = "0"/);
  assert.doesNotMatch(t, /duncan/i);
});

test("docker-compose requires both secrets, keeps a volume and passes every optional variable through", () => {
  const t = read("./docker-compose.yml");
  assert.match(t, /ADMIN_KEY: \$\{ADMIN_KEY:\?set ADMIN_KEY\}/);
  assert.match(t, /CAL_TOKEN: \$\{CAL_TOKEN:\?set CAL_TOKEN\}/);
  assert.match(t, /volumes: \["state:\/data"\]/);
  for (const k of ["NOTIFY_WEBHOOK_URL", "RESEND_API_KEY", "FROM_EMAIL", "NOTIFY_EMAIL", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"]) assert.match(t, new RegExp(`${k}: \\$\\{${k}:-\\}`), k);
  assert.match(t, /AUTO_REPLY: \$\{AUTO_REPLY:-0\}/);
});

test("every variable the server reads is documented in self-host.html", () => {
  const code = ["./server.mjs", "./backup.mjs", "./automations-server.mjs", "./content.mjs", "./byok.mjs", "./network-server.mjs"].map(read).join("\n");
  const used = new Set([...code.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
  const guide = read("./self-host.html");
  for (const k of used) if (!/^(RENDER_GIT_COMMIT|FLY_IMAGE_REF|APP_COMMIT)$/.test(k)) assert.ok(guide.includes(`<code>${k}</code>`), `${k} is read by the server but missing from the guide`);
});

test("the guide and admin page carry the clauses, and the guide is listed for search and LLMs", () => {
  for (const f of ["./self-host.html", "./admin.html"]) {
    const t = read(f);
    assert.match(t, /No warranty/, f);
    assert.match(t, /not legal, tax, or financial advice/i, f);
    assert.match(t, /github\.com\/sponsors\/Duncan-Haywood/, f);
  }
  const guide = read("./self-host.html");
  assert.match(guide, /check current pricing/i);
  assert.match(guide, /render\.com\/pricing/);
  assert.match(guide, /fly\.io\/docs\/about\/pricing/);
  for (const m of guide.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
  assert.match(read("./admin.html"), /<meta name="robots" content="noindex">/);
  assert.match(read("./sitemap.xml"), /self-host\.html/);
  assert.doesNotMatch(read("./sitemap.xml"), /admin\.html/);
  assert.match(read("./llms.txt"), /self-host\.html/);
});
