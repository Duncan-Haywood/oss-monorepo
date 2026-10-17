import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanText, scanFiles, hasRisk, summaryLine, SEVERITY, RISK_CLASSIFICATIONS,
  PRIVILEGED, DOCKER_SOCKET, HOST_NETWORK, DANGEROUS_CAPABILITY, EXPOSED_DATABASE_PORT,
  LITERAL_SECRET, SENSITIVE_HOST_MOUNT, SECURITY_OPT_UNCONFINED, HOST_NAMESPACE,
  RUNS_AS_ROOT, IMAGE_LATEST, NO_RESTART, NO_HEALTHCHECK,
} from "./classify.mjs";

const FX = `# privileged: true  <- commented out, must be ignored
services:
  web:
    image: nginx
    privileged: true
    network_mode: "host"
    pid: host
    ipc: host
    user: "0:0"
    cap_add: [ALL, NET_ADMIN]
    security_opt:
      - seccomp:unconfined
      - apparmor=unconfined
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc:/host-etc
      - /:/host
      - ./data:/data
      - appdata:/var/lib/app
      - type: bind
        source: /var/run/docker.sock
        target: /sock
    environment:
      - DB_PASSWORD=hunter2
      - API_TOKEN=\${API_TOKEN}
      - MODE=prod
      - SECRET_FILE=/run/secrets/x
    restart: always
    healthcheck:
      test: ["CMD", "true"]
  db:
    image: postgres:latest
    ports:
      - "5432:5432"
      - "127.0.0.1:6379:6379"
      - 0.0.0.0:3306:3306
      - "[::1]:27017:27017"
      - "8080:80"
      - "9200"
    environment:
      POSTGRES_PASSWORD: example
      POSTGRES_USER: app
      ALLOW_EMPTY_PASSWORD: yes
    deploy:
      restart_policy:
        condition: on-failure
  cache:
    image: ghcr.io/acme/cache:1.4.2
    user: app
    ports: ["6379:6379"]
    restart: unless-stopped
    healthcheck:
      disable: true
  pinned:
    image: redis@sha256:abc
    restart: always
    healthcheck:
      test: ["CMD", "true"]
volumes:
  appdata:
`;

const lines = (findings, type) => findings.filter((f) => f.type === type).map((f) => f.line);

test("every high-risk setting is found on the right line", () => {
  const f = scanText(FX, "docker-compose.yml");
  assert.deepEqual(lines(f, PRIVILEGED), [5]);
  assert.deepEqual(lines(f, HOST_NETWORK), [6]);
  assert.deepEqual(lines(f, HOST_NAMESPACE), [7, 8]);
  assert.deepEqual(lines(f, DANGEROUS_CAPABILITY), [10]);
  assert.deepEqual(lines(f, SECURITY_OPT_UNCONFINED), [12, 13]);
  assert.deepEqual(lines(f, DOCKER_SOCKET), [15, 21]);
  assert.deepEqual(lines(f, SENSITIVE_HOST_MOUNT), [16, 17]);
  assert.deepEqual(lines(f, LITERAL_SECRET), [24, 41]);
  assert.ok(!f.some((x) => x.line === 1), "a commented-out line is ignored");
});

test("database ports: all interfaces flagged, loopback and non-database ports are not", () => {
  const f = scanText(FX, "c.yml");
  assert.deepEqual(lines(f, EXPOSED_DATABASE_PORT), [34, 36, 39, 50]);
});

test("medium and low findings", () => {
  const f = scanText(FX, "c.yml");
  assert.deepEqual(lines(f, RUNS_AS_ROOT), [9]);
  assert.deepEqual(lines(f, IMAGE_LATEST), [4, 32]);
  assert.deepEqual(lines(f, NO_HEALTHCHECK), [31]);
  assert.deepEqual(lines(f, NO_RESTART), []);
});

test("a service with nothing set gets both low findings on its own line", () => {
  const f = scanText("services:\n  app:\n    image: x:1\n", "c.yml");
  assert.deepEqual(f.map((x) => [x.line, x.type, x.severity]), [
    [2, NO_RESTART, "low"], [2, NO_HEALTHCHECK, "low"],
  ]);
  assert.equal(hasRisk(f), false);
});

test("secret values are never echoed", () => {
  for (const x of scanText(FX, "c.yml")) {
    assert.ok(!(x.detail + x.remediation).includes("hunter2"));
  }
});

test("interpolated, _FILE and boolean values are not literal secrets", () => {
  const t = "services:\n  a:\n    image: x:1\n    environment:\n      - TOKEN=${T}\n      - DB_PASSWORD_FILE=/run/secrets/p\n      - ALLOW_EMPTY_PASSWORD=yes\n      - PASSWORD\n";
  assert.deepEqual(lines(scanText(t, "c.yml"), LITERAL_SECRET), []);
});

test("input with no services block, or empty, yields nothing", () => {
  assert.deepEqual(scanText("", "c.yml"), []);
  assert.deepEqual(scanText("version: '3'\nvolumes:\n  a:\n", "c.yml"), []);
});

test("every finding has the six fields and a fix", () => {
  for (const x of scanText(FX, "c.yml")) {
    assert.deepEqual(Object.keys(x).sort(), ["detail", "file", "line", "remediation", "severity", "type"]);
    assert.ok(RISK_CLASSIFICATIONS.has(x.type));
    assert.equal(x.severity, SEVERITY[x.type]);
    assert.ok(x.remediation.length > 10);
  }
});

test("scanFiles, hasRisk, summaryLine", () => {
  const findings = scanFiles([{ name: "a.yml", text: FX }]);
  assert.equal(findings[0].file, "a.yml");
  assert.ok(hasRisk(findings));
  assert.match(summaryLine(findings), /^\d+ findings across \d+ patterns\.$/);
  assert.equal(summaryLine([]), "No findings.");
});

test("parity: classify.mjs and check.py agree on the fixture, field for field", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "compose-parity-"));
  try {
    mkdirSync(path.join(dir, "deploy"), { recursive: true });
    writeFileSync(path.join(dir, "deploy", "docker-compose.yml"), FX);
    const py = JSON.parse(
      execFileSync("python3", [new URL("./check.py", import.meta.url).pathname, dir, "--format", "json"], { encoding: "utf8" }),
    );
    assert.ok(py.length >= 20);
    assert.deepEqual(scanText(FX, "deploy/docker-compose.yml"), py);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
