import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFiles, splitArgs, TYPES, hasRisk, summaryLine } from "./scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const conf = (text, more = [], opts = {}) => scanFiles([{ name: "redis.conf", text }, ...more], opts);
const types = (r) => r.findings.map((f) => f.type);

test("splitArgs follows sdssplitargs: quotes, escapes and the space-after-quote rule", () => {
  assert.deepEqual(splitArgs('requirepass "a b"'), ["requirepass", "a b"]);
  assert.deepEqual(splitArgs("x 'it\\'s'"), ["x", "it's"]);
  assert.deepEqual(splitArgs('x "\\x41\\n"'), ["x", "A\n"]);
  assert.deepEqual(splitArgs('x a"b c"d'), null);
  assert.deepEqual(splitArgs('x a"b c"'), ["x", "ab c"]);
  assert.equal(splitArgs('x "open'), null);
  assert.equal(splitArgs("x 'a'b"), null);
  assert.deepEqual(splitArgs("   "), []);
});

test("Ubuntu's stock redis.conf loads with no findings", () => {
  const r = conf(readFileSync(path.join(here, "fixtures/ubuntu-24.04-redis7/redis.conf"), "utf8"));
  assert.equal(r.startup.ok, true);
  assert.deepEqual(r.findings, []);
  assert.equal(r.values.bind, "127.0.0.1 -::1");
  assert.equal(r.exposure.remote.outcome, "refused");
});

test("a # after a value is not a comment", () => {
  const r = conf("requirepass foobared # change me\n");
  assert.equal(r.startup.ok, false);
  assert.equal(r.startup.message, "wrong number of arguments");
  assert.deepEqual(types(r), ["inline-comment"]);
  const b = conf("bind 127.0.0.1 # local only\n", [], { hostAddrs: ["127.0.0.1"] });
  assert.equal(b.startup.ok, false);
  assert.match(b.startup.message, /Failed listening/);
});

test("an error in an included file is reported at its own file and line", () => {
  const r = conf("port 6379\ninclude /etc/redis/conf.d/app.conf\n", [{ name: "conf.d/app.conf", text: "maxmemory 1gb\n\nmaxmemory-policy allkeys-lru-ish\n" }]);
  assert.equal(r.startup.ok, false);
  assert.equal(r.startup.file, "/etc/redis/conf.d/app.conf");
  assert.equal(r.startup.line, 3);
  assert.equal(r.startup.redisLine, 3);
  assert.match(r.findings[0].detail, /does not name the file/);
});

test("glob includes are concatenated in order; a missing final newline joins two lines", () => {
  const r = conf("include /etc/redis/conf.d/*.conf\n", [
    { name: "conf.d/10-mem.conf", text: "maxmemory 100mb" },
    { name: "conf.d/20-net.conf", text: "port 6380\n" },
  ]);
  assert.ok(types(r).includes("include-joined-lines"));
  assert.equal(r.startup.ok, false);
  // "maxmemory 100mbport 6380" is one line of three words.
  assert.equal(r.startup.message, "wrong number of arguments");
  assert.equal(r.startup.file, "/etc/redis/conf.d/10-mem.conf");
});

test("a wildcard include that matches nothing is skipped; a plain one stops Redis", () => {
  const g = conf("include /etc/redis/conf.d/*.conf\nport 6379\n");
  assert.equal(g.startup.ok, true);
  assert.ok(types(g).includes("include-glob-no-match"));
  const p = scanFiles([{ name: "redis.conf", text: "include /etc/redis/missing.conf\n" }]);
  assert.equal(p.startup.ok, true, "a file simply not pasted is unknown, not missing");
});

test("relative includes follow the working directory, which dir moves", () => {
  const r = conf("dir /var/lib/redis\ninclude extra.conf\n", [{ name: "/var/lib/redis/extra.conf", text: "port 7000\n" }]);
  assert.equal(r.values.port, "7000");
  const f = r.findings.find((x) => x.type === "include-relative-path");
  assert.match(f.detail, /moved there by an earlier dir line/);
});

test("the last line wins, and the earlier security line is flagged", () => {
  const r = conf("bind 127.0.0.1\nprotected-mode yes\ninclude /etc/redis/local.conf\n", [{ name: "local.conf", text: "bind 0.0.0.0\nprotected-mode no\n" }]);
  assert.equal(r.values.bind, "0.0.0.0");
  assert.equal(r.setBy.bind.file, "/etc/redis/local.conf");
  assert.equal(r.findings.filter((f) => f.type === "overridden-directive").length, 2);
  assert.equal(r.exposure.remote.outcome, "open");
  assert.ok(types(r).includes("open-without-password"));
});

test("protected mode turns remote clients away only while the default user has no password", () => {
  const def = conf("port 6379\n");
  assert.equal(def.values.bind, "* -::*");
  assert.equal(def.exposure.remote.outcome, "denied");
  assert.ok(types(def).includes("protected-mode-only"));
  const pw = conf("requirepass correct-horse-battery-staple-9f2c\n");
  assert.equal(pw.exposure.remote.outcome, "noauth");
  assert.ok(types(pw).includes("listens-on-all-interfaces"));
});

test("a user default line replaces requirepass", () => {
  const r = conf("bind 0.0.0.0\nprotected-mode no\nrequirepass correct-horse-battery-staple-9f2c\nuser default on nopass ~* &* +@all\n");
  assert.ok(types(r).includes("requirepass-replaced"));
  assert.ok(types(r).includes("default-user-nopass"));
  assert.equal(r.exposure.remote.outcome, "open");
  const off = conf("protected-mode no\nuser default off\n");
  assert.equal(off.exposure.remote.outcome, "noauth");
});

test("user line errors name the token Redis names (two places early)", () => {
  const r = conf("user app on ~* allkeys ~foo\n");
  assert.match(r.startup.message, /^Error in user declaration '~\*': Adding a pattern after the \* pattern/);
  const dup = conf("user a on\nuser a off\n");
  assert.match(dup.startup.message, /Error in user declaration 'a': Duplicate user found/);
  const unk = conf("user app on +nosuchcmd\n");
  assert.equal(unk.startup.ok, false);
  assert.equal(unk.startup.stage, "startup");
});

test("rename-command checks the live table and blocks clients, not users", () => {
  assert.equal(conf("rename-command get set\n").startup.message, "Target command name already exists");
  assert.equal(conf("rename-command nosuch x\n").startup.message, "No such command in rename-command");
  const r = conf('protected-mode no\nbind 0.0.0.0\nrename-command CONFIG ""\n');
  assert.equal(r.exposure.remote.configSetDir, "unknown");
  assert.ok(types(r).includes("rename-command-used"));
});

test("enable-* options open the dangerous paths", () => {
  const r = conf("protected-mode no\nbind 0.0.0.0\nenable-protected-configs yes\nenable-module-command yes\nenable-debug-command local\n");
  assert.equal(r.exposure.remote.configSetDir, "ok");
  assert.equal(r.exposure.remote.moduleLoad, "ok");
  assert.equal(r.exposure.remote.debug, "blocked");
  assert.equal(r.exposure.local.debug, "ok");
  for (const t of ["protected-configs-enabled", "module-command-enabled", "debug-command-enabled"]) assert.ok(types(r).includes(t), t);
  assert.match(r.findings.find((f) => f.type === "open-without-password").detail, /MODULE LOAD/);
});

test("typed values: units, percents, octal, enums and aliases read as Redis reads them", () => {
  const r = conf("maxmemory 2g\nmaxmemory-clients 10%\nunixsocketperm 0770\noom-score-adj relative\nslave-read-only no\nnotify-keyspace-events KEA\nhz 1000\nsave 900 1\nsave 60 100\n");
  assert.equal(r.values.maxmemory, "2000000000");
  assert.equal(r.values["maxmemory-clients"], "10%");
  assert.equal(r.values.unixsocketperm, "770");
  assert.equal(r.values["oom-score-adj"], "yes");
  assert.equal(r.values["replica-read-only"], "no");
  assert.equal(r.values["notify-keyspace-events"], "AKE");
  assert.equal(r.values.hz, "500");
  assert.equal(r.values.save, "900 1 60 100");
  assert.ok(types(r).includes("decimal-memory-unit"));
  assert.equal(conf("databases 0\n").startup.message, "argument must be between 1 and 2147483647 inclusive");
  assert.equal(conf("loglevel loud\n").startup.message, "argument(s) must be one of the following: debug, verbose, notice, warning");
  assert.equal(conf("appendonly maybe\n").startup.message, "argument must be 'yes' or 'no'");
  // Text from the file never reaches Object.prototype.
  assert.equal(conf("maxmemory 1constructor\n").startup.message, "argument must be a memory value");
  assert.equal(conf("client-output-buffer-limit constructor 1 1 1\n").startup.message, "Invalid client class specified in buffer limit configuration.");
  assert.equal(conf("notify-keyspace-events toString\n").startup.message, "Invalid event class character. Use 'Ag$lshzxeKEtmdn'.");
});

test("start-up failures after the file loads", () => {
  assert.equal(conf("port 0\n").startup.message, "Configured to not listen anywhere, exiting.");
  assert.equal(conf('bind ""\n').startup.message, "Configured to not listen anywhere, exiting.");
  assert.match(conf("tls-port 6380\n").startup.message, /Failed to configure TLS/);
  assert.match(conf("aclfile /etc/redis/users.acl\nuser app on\n").startup.message, /users defined in redis.conf and at the same setting an ACL file/);
  assert.match(conf("mymodule.opt 1\n").startup.message, /Module Configuration detected/);
  assert.match(conf("bind 10.9.9.9\n", [], { hostAddrs: ["127.0.0.1"] }).startup.message, /Failed listening on port 6379 \(TCP\)/);
  assert.equal(conf("bind 127.0.0.1 -10.9.9.9\n", [], { hostAddrs: ["127.0.0.1"] }).startup.ok, true);
});

test("passwords: weak ones flagged, never echoed", () => {
  const r = conf("requirepass s3cr3t\nmasterauth hunter2\nrequirepass s3cr3t-again\n");
  const out = JSON.stringify(r.findings);
  assert.ok(types(r).includes("weak-password"));
  assert.ok(types(r).includes("password-in-file"));
  assert.ok(!out.includes("s3cr3t"), "a password appears in the findings");
  assert.ok(!out.includes("hunter2"));
  const u = conf("user app on >hunter2-hunter2 ~* +@all\nuser app off\n");
  assert.ok(!JSON.stringify(u.findings).includes("hunter2"));
  assert.ok(!JSON.stringify(conf("requirepass foobared # change me\n").findings).includes("foobared"));
});

test("TLS beside plaintext, world-writable socket", () => {
  const r = conf("bind 0.0.0.0\nrequirepass correct-horse-battery-staple-9f2c\ntls-port 6380\ntls-cert-file /c\ntls-key-file /k\ntls-ca-cert-file /ca\nunixsocket /run/redis.sock\nunixsocketperm 777\n");
  assert.equal(r.startup.ok, true);
  assert.ok(types(r).includes("plaintext-port-beside-tls"));
  assert.ok(types(r).includes("unixsocket-world-writable"));
});

test("every finding has a known type, a severity and a fix", () => {
  const samples = ["port 6379\n", "protected-mode no\nbind 0.0.0.0\nenable-module-command yes\n", "requirepass x\n", "foo bar\n"];
  for (const s of samples) for (const f of conf(s).findings) {
    assert.ok(TYPES.includes(f.type), f.type);
    assert.ok(["error", "high", "medium", "low"].includes(f.severity));
    assert.ok(f.detail && f.remediation);
  }
  assert.equal(hasRisk(conf("foo bar\n").findings), true);
  assert.equal(summaryLine([]), "no findings");
});
