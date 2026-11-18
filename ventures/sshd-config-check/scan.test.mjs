import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFiles, argvSplit, patternList, addrList, readConfig, resolve, hasRisk, summaryLine } from "./scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const types = (r) => r.findings.map((f) => f.type);
const one = (text, extra = [], opts) => scanFiles([{ name: "sshd_config", text }, ...extra], opts);
const find = (r, type) => r.findings.find((f) => f.type === type);

test("first value wins, and the ignored later line is reported with the winner", () => {
  const r = one("PasswordAuthentication yes\nPasswordAuthentication no\n");
  const f = find(r, "setting-ignored");
  assert.equal(f.line, 2);
  assert.match(f.detail, /sshd_config:1 already set PasswordAuthentication yes/);
  assert.equal(r.login.passwords, true);
});

test("an identical repeat is not reported", () => {
  assert.ok(!types(one("PermitRootLogin no\nPermitRootLogin no\n")).includes("setting-ignored"));
});

test("keywords are case-insensitive and = separates", () => {
  const r = one("passwordauthentication=no\nPASSWORDAUTHENTICATION yes\n");
  assert.equal(r.login.passwords, false);
  assert.ok(types(r).includes("setting-ignored"));
});

test("an Include at the top makes a drop-in beat the main file (the cloud-init trap)", () => {
  const r = scanFiles([
    { name: "sshd_config", text: "Include /etc/ssh/sshd_config.d/*.conf\nPasswordAuthentication no\n" },
    { name: "sshd_config.d/50-cloud-init.conf", text: "PasswordAuthentication yes\n" },
  ]);
  assert.deepEqual(r.order.map((o) => o.name), ["sshd_config", "sshd_config.d/50-cloud-init.conf"]);
  const f = find(r, "setting-ignored");
  assert.equal(f.file, "sshd_config");
  assert.match(f.detail, /50-cloud-init\.conf:1/);
  assert.equal(r.login.passwordAt, "sshd_config.d/50-cloud-init.conf:1");
});

test("drop-ins are read in byte order, so 10- beats 50-", () => {
  const r = scanFiles([
    { name: "sshd_config", text: "Include sshd_config.d/*.conf\n" },
    { name: "sshd_config.d/50-cloud-init.conf", text: "PasswordAuthentication yes\n" },
    { name: "sshd_config.d/10-hardening.conf", text: "PasswordAuthentication no\n" },
    { name: "sshd_config.d/Z.conf", text: "X11Forwarding yes\n" },
  ]);
  assert.deepEqual(r.order.map((o) => o.name), ["sshd_config", "sshd_config.d/10-hardening.conf", "sshd_config.d/50-cloud-init.conf", "sshd_config.d/Z.conf"]);
  assert.equal(r.login.passwords, false);
});

test("a drop-in without .conf is never read and says so", () => {
  const r = scanFiles([
    { name: "sshd_config", text: "Include /etc/ssh/sshd_config.d/*.conf\n" },
    { name: "sshd_config.d/hardening", text: "PermitRootLogin no\n" },
  ]);
  const f = find(r, "dropin-not-read");
  assert.equal(f.severity, "medium");
  assert.match(f.detail, /\.conf/);
});

test("relative Include resolves against /etc/ssh; a missing file is a note", () => {
  const r = one("Include extra.conf\n", [{ name: "/etc/ssh/extra.conf", text: "PermitRootLogin yes\n" }]);
  assert.ok(types(r).includes("permit-root-login-yes"));
  const r2 = one("Include missing.conf\n");
  assert.match(r2.notes.join(" "), /missing\.conf matched none/);
});

test("with no sshd_config, drop-ins are read as the stock Include would", () => {
  const r = scanFiles([{ name: "sshd_config.d/50-cloud-init.conf", text: "PasswordAuthentication yes\n" }]);
  assert.equal(r.login.passwordAt, "sshd_config.d/50-cloud-init.conf:1");
  assert.match(r.notes[0], /stock Ubuntu\/Debian line/);
});

test("defaults: passwords and keyboard-interactive are on when unset", () => {
  const r = one("UsePAM yes\n");
  assert.ok(types(r).includes("password-auth-on"));
  assert.ok(types(r).includes("kbd-interactive-pam"));
  assert.match(find(r, "password-auth-on").detail, /default: yes/);
  assert.equal(r.login.root, "prohibit-password");
});

test("PasswordAuthentication no still leaves PAM passwords via keyboard-interactive", () => {
  const r = one("PasswordAuthentication no\nUsePAM yes\n");
  assert.ok(!types(r).includes("password-auth-on"));
  assert.match(find(r, "kbd-interactive-pam").detail, /even though PasswordAuthentication is no/);
  assert.ok(!types(one("PasswordAuthentication no\nUsePAM yes\nChallengeResponseAuthentication no\n")).includes("kbd-interactive-pam"), "the old alias counts");
});

test("PermitRootLogin yes is high with passwords on, low with them off", () => {
  assert.equal(find(one("PermitRootLogin yes\n"), "permit-root-login-yes").severity, "high");
  assert.equal(find(one("PermitRootLogin yes\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n"), "permit-root-login-yes").severity, "low");
});

test("bad values and unknown keywords stop sshd", () => {
  const r = one("PermitRootLogin maybe\nPasswordAuthenticaton no\nX11Forwarding\n");
  const errs = r.findings.filter((f) => f.severity === "error");
  assert.equal(errs.length, 3);
  assert.match(errs.map((e) => e.detail).join(" "), /unsupported option/);
  assert.match(errs.map((e) => e.detail).join(" "), /Bad configuration option: PasswordAuthenticaton/);
  assert.match(errs.map((e) => e.detail).join(" "), /no argument after keyword/);
  assert.ok(hasRisk(r.findings));
});

test("a global-only keyword inside Match stops sshd", () => {
  const r = one("Match User bob\n  Port 2222\n");
  assert.equal(find(r, "global-only-in-match").severity, "error");
  assert.ok(!types(one("Match User bob\n  X11Forwarding no\nMatch all\nPort 2222\n")).includes("global-only-in-match"), "Match all returns to global");
});

test("flush-left lines after an indented Match body are flagged", () => {
  const r = one("Match User deploy\n    ForceCommand /usr/local/bin/deploy\n\nPasswordAuthentication no\n");
  const f = find(r, "looks-global-but-in-match");
  assert.equal(f.line, 4);
  assert.equal(f.severity, "medium");
  // ...and because it sits in the Match, the global value is the default yes.
  assert.equal(r.login.passwords, true);
});

test("a Match block that turns passwords back on is reported in its scope", () => {
  const r = one("PasswordAuthentication no\nKbdInteractiveAuthentication no\nMatch Address 10.0.0.0/8\n  PasswordAuthentication yes\n");
  const f = r.findings.find((x) => x.type === "password-auth-on");
  assert.equal(f.scope, "Match Address 10.0.0.0/8");
  assert.equal(f.line, 4);
  assert.equal(r.perMatch[0].passwords, true);
});

test("connection evaluation: Match values replace global, first matching block wins", () => {
  const text = "PasswordAuthentication no\nMatch User deploy\n  PasswordAuthentication yes\nMatch Address 10.0.0.0/8\n  PasswordAuthentication no\n  PermitRootLogin yes\n";
  const a = one(text, [], { connection: { user: "deploy", addr: "10.1.2.3" } });
  assert.equal(a.connection.passwords, true);
  assert.equal(a.connection.root, "yes");
  assert.equal(a.connection.applied.length, 2);
  const b = one(text, [], { connection: { user: "alice", addr: "192.0.2.1" } });
  assert.equal(b.connection.passwords, false);
  assert.equal(b.connection.applied.length, 0);
});

test("Match pattern lists: negation wins, users are case-sensitive, hosts are not", () => {
  assert.equal(patternList("bob", "*,!bob"), -1);
  assert.equal(patternList("Bob", "bob"), 0);
  assert.equal(patternList("Web1.Example.com", "web*.example.com", true), 1);
  assert.equal(addrList("10.9.8.7", "10.0.0.0/8"), 1);
  assert.equal(addrList("10.9.8.7", "10.0.0.0/8,!10.9.0.0/16"), -1);
  assert.equal(addrList("192.168.1.5", "192.168.1.*"), 1);
  const r = one("Match Group admins,!interns\n  PermitRootLogin yes\n", [], { connection: { user: "x", groups: ["admins", "interns"] } });
  assert.equal(r.connection.applied.length, 0);
});

test("Include inside a Match keeps the drop-in's lines in that block", () => {
  const r = scanFiles([
    { name: "sshd_config", text: "Match User ci\n  Include /etc/ssh/ci.conf\nMatch all\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n" },
    { name: "/etc/ssh/ci.conf", text: "PasswordAuthentication yes\n" },
  ]);
  assert.equal(r.login.passwords, false);
  assert.equal(r.perMatch[0].passwords, true);
});

test("a Match in an included file does not leak into the including file", () => {
  const r = scanFiles([
    { name: "sshd_config", text: "Include sshd_config.d/*.conf\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n" },
    { name: "sshd_config.d/10-sftp.conf", text: "Match Group sftp\n  ForceCommand internal-sftp\n" },
  ]);
  assert.equal(r.login.passwords, false);
  assert.ok(!types(r).includes("looks-global-but-in-match"));
});

test("weak algorithms, appended or listed", () => {
  const r = one("Ciphers +aes128-cbc\nMACs hmac-sha2-256,hmac-md5\nKexAlgorithms -diffie-hellman-group1-sha1\nHostKeyAlgorithms +ssh-rsa\n");
  const w = r.findings.filter((f) => f.type === "weak-algorithm").map((f) => f.keyword).sort();
  assert.deepEqual(w, ["ciphers", "hostkeyalgorithms", "macs"]);
});

test("PermitUserEnvironment: only lowercase yes is the keyword", () => {
  assert.equal(find(one("PermitUserEnvironment yes\n"), "permit-user-environment").severity, "high");
  assert.match(find(one("PermitUserEnvironment Yes\n"), "permit-user-environment").detail, /pattern list/);
  assert.equal(find(one("PermitUserEnvironment LANG,LC_*\n"), "permit-user-environment").severity, "low");
});

test("other risky settings", () => {
  const t = types(one("StrictModes no\nIgnoreRhosts no\nHostbasedAuthentication yes\nGatewayPorts yes\nPermitTunnel yes\nMaxAuthTries 50\nLoginGraceTime 0\nPermitEmptyPasswords yes\nX11Forwarding yes\nProtocol 2\nUsePrivilegeSeparation sandbox\n"));
  for (const x of ["strict-modes-off", "rhosts-honoured", "hostbased-auth-on", "gateway-ports-on", "tunnel-devices-on", "max-auth-tries-high", "login-grace-unlimited", "permit-empty-passwords", "x11-forwarding-on", "ignored-option"]) assert.ok(t.includes(x), x);
});

test("tokeniser: quotes, comments, escapes", () => {
  assert.deepEqual(argvSplit('a "b c" d # tail'), ["a", "b c", "d"]);
  assert.deepEqual(argvSplit("x\\ y z"), ["x y", "z"]);
  assert.throws(() => argvSplit('"open'));
  const r = one('Banner "/etc/issue net" # comment\n');
  assert.equal(r.effective.find((e) => e.keyword === "Banner").value, "/etc/issue net");
});

test("Subsystem: first definition per name wins", () => {
  const read = readConfig([{ name: "sshd_config", text: "Subsystem sftp /usr/lib/openssh/sftp-server\nSubsystem sftp internal-sftp\n" }]);
  const res = resolve(read);
  assert.equal(res.global.get("subsystem:sftp").value, "sftp /usr/lib/openssh/sftp-server");
  assert.equal(res.shadowed.length, 1);
});

test("list keywords accumulate instead of shadowing", () => {
  const r = one("Port 22\nPort 2222\nAllowUsers alice\nAllowUsers bob\n");
  assert.ok(!types(r).includes("setting-ignored"));
  assert.deepEqual(r.login.allowUsers, ["alice", "bob"]);
});

test("Ubuntu 24.04's stock sshd_config: passwords on by default, X11 forwarding", () => {
  const text = readFileSync(path.join(here, "fixtures/ubuntu-24.04-stock/sshd_config"), "utf8");
  const r = one(text);
  assert.deepEqual(types(r).sort(), ["password-auth-on", "x11-forwarding-on"]);
  assert.match(find(r, "password-auth-on").detail, /not set anywhere/);
  assert.ok(!r.findings.some((f) => f.severity === "error"));
});

test("summary wording", () => {
  assert.match(summaryLine([]), /not proof/);
  assert.equal(summaryLine([{ severity: "error" }, { severity: "low" }]), "2 findings: 1 line that stops sshd starting, 1 low.");
});

test("CLI reads a folder as /etc/ssh, follows Include, exits 2 on risk", () => {
  const out = execFileSync(process.execPath, [path.join(here, "check.mjs"), path.join(here, "fixtures/ubuntu-24.04-cloud-init"), "--format", "json"], { encoding: "utf8" });
  const r = JSON.parse(out);
  assert.deepEqual(r.order.map((o) => o.name), ["sshd_config", "sshd_config.d/50-cloud-init.conf"]);
  assert.equal(r.login.passwordAt, "sshd_config.d/50-cloud-init.conf:1");
  let code = 0;
  try { execFileSync(process.execPath, [path.join(here, "check.mjs"), path.join(here, "fixtures/ubuntu-24.04-cloud-init"), "--fail-on-risk"], { stdio: "pipe" }); } catch (e) { code = e.status; }
  assert.equal(code, 2);
});

test("CLI --root reads a copied /etc tree and evaluates a connection", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sshdcc-"));
  mkdirSync(path.join(root, "etc/ssh/sshd_config.d"), { recursive: true });
  writeFileSync(path.join(root, "etc/ssh/sshd_config"), "Include /etc/ssh/sshd_config.d/*.conf\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nMatch User deploy\n  PasswordAuthentication yes\n");
  writeFileSync(path.join(root, "etc/ssh/sshd_config.d/10-a.conf"), "PermitRootLogin no\n");
  const r = JSON.parse(execFileSync(process.execPath, [path.join(here, "check.mjs"), "--root", root, "--user", "deploy", "--format", "json"], { encoding: "utf8" }));
  assert.equal(r.login.root, "no");
  assert.equal(r.connection.passwords, true);
});

test("Object.prototype names are unknown keywords and not algorithms", () => {
  const r = one("constructor yes\nCiphers +toString\n");
  assert.match(r.findings[0].detail, /Bad configuration option: constructor/);
  assert.ok(!types(r).includes("weak-algorithm"));
});
