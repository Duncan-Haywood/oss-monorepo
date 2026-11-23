import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFiles, readHba, pastedResolver, viewRow, matchConnection, inetAton, numericAddress, formatAddress, hasRisk, summaryLine, TYPES } from "./scan.mjs";
import { main } from "./check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const one = (text, opts) => scanFiles([{ name: "pg_hba.conf", text }], opts);
const types = (r) => r.findings.map((f) => f.type);
const rowsOf = (text) => readHba({ resolver: pastedResolver([{ name: "pg_hba.conf", text }]), main: "pg_hba.conf" }).rows;

test("Ubuntu's packaged pg_hba.conf for 16 reports nothing", () => {
  const text = readFileSync(path.join(here, "fixtures/ubuntu-24.04-pg16/pg_hba.conf"), "utf8");
  const r = one(text);
  assert.deepEqual(r.findings, []);
  assert.equal(r.rules.length, 7);
  assert.equal(r.probes[0].rule.method, "peer");
  assert.equal(r.probes[2].rule, null);
});

test("tokens: quotes, doubled quotes, commas with blanks, comments", () => {
  const [row] = rowsOf('host "my db",app, other "a""b",x 10.0.0.0/8 scram-sha-256 # note\n');
  assert.deepEqual(row.databases.map((d) => d.s), ["my db", "app", "other"]);
  assert.deepEqual(row.users.map((d) => d.s), ['a"b', "x"]);
  // a blank before the comma ends the field
  const [bad] = rowsOf("host app ,other all 10.0.0.0/8 md5\n");
  assert.equal(bad.loaded, false);
  assert.match(bad.error, /invalid IP mask|end-of-line|invalid/);
});

test("backslash continues a line and keeps the first line's number", () => {
  const rows = rowsOf("# c\nhost all all \\\n  10.0.0.0/8 scram-sha-256\nlocal all all peer\n");
  assert.deepEqual(rows.map((r) => r.line), [2, 4]);
  assert.equal(rows[0].loaded, true);
});

test("one bad line and the whole file is refused", () => {
  const r = one("local all all peer\nhost all all 10.0.0.0/8 scram\n");
  assert.equal(r.loads, false);
  const f = r.findings.find((x) => x.type === "parse-error");
  assert.equal(f.line, 2);
  assert.match(f.detail, /invalid authentication method "scram"/);
  assert.match(f.detail, /refuses the whole file/);
});

test("errors PostgreSQL gives for common mistakes", () => {
  const cases = {
    "host all all 10.1 md5": 'invalid IP mask "md5": Name or service not known',
    "host all all db.example.com/24 md5": 'specifying both host name and CIDR mask is invalid: "db.example.com/24"',
    "host all all 10.0.0.0/33 md5": 'invalid CIDR mask in address "10.0.0.0/33"',
    "host all all 10.0.0.0/8 peer": "peer authentication is only supported on local sockets",
    "host all all 10.0.0.0/8 cert": "cert authentication is only supported on hostssl connections",
    "local all all gss": "gssapi authentication is not supported on local sockets",
    "host all all 10.0.0.0/8 md5 map=x": 'authentication option "map" is only valid for authentication methods ident, peer, gssapi, sspi, and cert',
    "host all all 10.0.0.0/8 md5 clientcert=verify-full": 'clientcert can only be configured for "hostssl" rows',
    "host all all 10.0.0.0 255.0.0.0,ffff:: md5": "multiple values specified for netmask",
    "host all all ::1 255.255.255.255 md5": "IP address and mask do not match",
    "local,host all all trust": "multiple values specified for connection type",
    "hosts all all 10.0.0.0/8 md5": 'invalid connection type "hosts"',
    "host all all 10.0.0.0/8 sspi": 'invalid authentication method "sspi": not supported by this build',
    "host all all 10.0.0.0/8 ldap": 'authentication method "ldap" requires argument "ldapbasedn", "ldapprefix", or "ldapsuffix" to be set',
  };
  for (const [line, msg] of Object.entries(cases)) {
    const [row] = rowsOf(line + "\n");
    assert.equal(row.error, msg, line);
  }
});

test("ident on a local line becomes peer; hostssl with ssl off still loads but never matches", () => {
  const [row] = rowsOf("local all all ident\n");
  assert.equal(row.method, "peer");
  const r = one("hostssl all all 10.0.0.0/8 scram-sha-256\n", { build: { ssl: false } });
  assert.equal(r.loads, true);
  assert.deepEqual(types(r), ["hostssl-without-ssl"]);
});

test("IPv4 the inet_aton way, IPv6 printed the way the view prints it", () => {
  assert.deepEqual(inetAton("010.0.0.1"), [8, 0, 0, 1]);
  assert.deepEqual(inetAton("10.1"), [10, 0, 0, 1]);
  assert.deepEqual(inetAton("0x7f.1"), [127, 0, 0, 1]);
  assert.deepEqual(inetAton("167772161"), [10, 0, 0, 1]);
  assert.equal(inetAton("256.1.1.1"), null);
  assert.equal(inetAton("10.0.0.256"), null);
  for (const [i, o] of [["0:0:0:0:0:0:0:1", "::1"], ["2001:DB8:0:0:1:0:0:1", "2001:db8::1:0:0:1"], ["::ffff:10.1.2.3", "::ffff:10.1.2.3"], ["1:0:2:0:3:0:4:0", "1:0:2:0:3:0:4:0"], ["fe80::", "fe80::"]]) assert.equal(formatAddress(numericAddress(i)), o, i);
  const r = one("host all all 010.0.0.1/32 scram-sha-256\n");
  assert.ok(types(r).includes("ipv4-shorthand"));
  assert.match(r.findings.find((f) => f.type === "ipv4-shorthand").detail, /8\.0\.0\.1/);
});

test("a mistyped IP address is read as a host name", () => {
  const r = one("host all all 10.0.0.300 scram-sha-256\n");
  const f = r.findings.find((x) => x.type === "address-is-hostname");
  assert.equal(f.severity, "medium");
  assert.equal(r.rules[0].address.kind, "hostname");
});

test("trust: over the network high, on loopback and the socket medium", () => {
  const r = one("local all all trust\nhost all all 127.0.0.1/32 trust\nhost all all all trust\n");
  const by = Object.fromEntries(r.findings.filter((f) => f.type.startsWith("trust")).map((f) => [f.type, f]));
  assert.equal(by["trust-local"].severity, "medium");
  assert.equal(by["trust-loopback"].severity, "medium");
  assert.equal(by["trust-remote"].severity, "high");
  assert.match(by["trust-remote"].detail, /postgres superuser/);
  assert.equal(r.probes[2].rule.line, 3);
});

test("cleartext passwords without TLS; the same on hostssl is only low", () => {
  const r = one("host all all 10.0.0.0/8 password\nhost all all 10.0.0.0/8 ldap ldapserver=l ldapprefix=uid= ldapsuffix=\",dc=x\"\nhostssl all all 10.0.0.0/8 password\n");
  const f = r.findings.filter((x) => x.type === "cleartext-password-no-tls");
  assert.deepEqual(f.map((x) => x.line), [1, 2]);
  assert.ok(r.findings.some((x) => x.type === "password-method" && x.line === 3 && x.severity === "low"));
});

test("ident over TCP, md5, no TLS required, any address, a secret in the file", () => {
  const r = one("host all all 10.0.0.0/8 ident\nhost all all 0.0.0.0/0 md5\nhost all all 10.0.0.0/8 ldap ldapserver=l ldapbasedn=dc=x ldapbinddn=cn=svc ldapbindpasswd=hunter2\n");
  const t = types(r);
  for (const x of ["ident-over-tcp", "md5-method", "no-tls-required", "any-address", "secret-in-file"]) assert.ok(t.includes(x), x);
});

test("a hostnossl reject line is not reported as missing TLS", () => {
  const r = one("hostnossl all all 0.0.0.0/0 reject\nhostssl all all 0.0.0.0/0 scram-sha-256\n");
  assert.deepEqual(types(r), ["any-address"]);
  assert.equal(r.probes[2].rule.method, "reject");
  assert.equal(r.probes[3].rule.method, "scram-sha-256");
});

test("a reject line below a broader rule never fires", () => {
  const r = one("host all all 0.0.0.0/0 scram-sha-256\nhost all postgres 0.0.0.0/0 reject\n");
  const f = r.findings.find((x) => x.type === "shadowed-rule");
  assert.equal(f.line, 2);
  assert.equal(f.severity, "medium");
  assert.match(f.detail, /line 1/);
});

test("shadowing respects types, addresses, replication and groups", () => {
  const notShadowed = [
    "hostssl all all 0.0.0.0/0 md5\nhost all all 10.0.0.0/8 reject",
    "host all all 10.0.0.0/8 md5\nhost all all 10.0.0.0/7 reject",
    "host all all all md5\nhost replication all all reject",
    "host all alice all md5\nhost all +staff all reject",
    "host all all 0.0.0.0/0 md5\nhost all all ::/0 reject",
    "host all /^a all md5\nhost all /^ab all reject",
    "host sameuser all all md5\nhost appdb all all reject",
  ];
  for (const t of notShadowed) assert.ok(!types(one(t + "\n")).includes("shadowed-rule"), t);
  const shadowed = [
    "host all all all md5\nhostssl all all 10.0.0.0/8 reject",
    "host all all 10.0.0.0/8 md5\nhost all all 10.1.0.0/16 reject",
    "hostnossl all all 0.0.0.0/0 md5\nhostgssenc all all 10.0.0.0/8 reject",
    "host all /^a all md5\nhost all alice all reject",
    "host all all 10.0.0.0 255.0.0.0 md5\nhost all all 10.2.3.4/32 reject",
    "local all all peer\nlocal appdb bob reject",
    "host appdb,staff all all md5\nhost staff all 10.0.0.0/8 reject",
  ];
  for (const t of shadowed) assert.ok(types(one(t + "\n")).includes("shadowed-rule"), t);
});

test("unanchored regexes and quoted keywords", () => {
  const r = one('host all /admin 10.0.0.0/8 scram-sha-256\nhost "all" all 10.0.0.0/8 scram-sha-256\nhost all all "samehost" scram-sha-256\nhost all /^ops$ 10.0.0.0/8 scram-sha-256\n');
  const f = r.findings.filter((x) => x.type === "unanchored-regex");
  assert.deepEqual(f.map((x) => x.line), [1]);
  assert.deepEqual(r.findings.filter((x) => x.type === "quoted-keyword").map((x) => x.line), [2, 3]);
  assert.equal(r.rules[2].address.kind, "hostname");
});

test("host bits set", () => {
  const r = one("host all all 192.168.1.5/24 scram-sha-256\n");
  assert.ok(types(r).includes("host-bits-set"));
});

test("includes: relative to the including file, include_dir order and skipped names, include_if_exists, @file", () => {
  const files = [
    { name: "pg_hba.conf", text: "include_dir conf.d\ninclude_if_exists local.conf\nhost all @users.txt 10.0.0.0/8 scram-sha-256\n" },
    { name: "conf.d/20-b.conf", text: "host b all 10.0.0.0/8 scram-sha-256\n" },
    { name: "conf.d/10-a.conf", text: "host a all 10.0.0.0/8 scram-sha-256\ninclude ../more.conf\n" },
    { name: "conf.d/30-c.conf.bak", text: "host c all 10.0.0.0/8 trust\n" },
    { name: "more.conf", text: "local all postgres peer\n" },
    { name: "users.txt", text: "alice, bob\n# comment\ncarol\n" },
  ];
  const r = scanFiles(files);
  assert.equal(r.loads, true);
  assert.deepEqual(r.rules.map((x) => `${x.file}:${x.line}`), ["conf.d/10-a.conf:1", "more.conf:1", "conf.d/20-b.conf:1", "pg_hba.conf:3"]);
  assert.deepEqual(r.rules[3].users.map((u) => u.s), ["alice", "bob", "carol"]);
  assert.ok(types(r).includes("include-dir-file-ignored"));
  assert.ok(r.notes.some((n) => /include_if_exists local\.conf/.test(n)));
  const missing = scanFiles([{ name: "pg_hba.conf", text: "include nope.conf\nlocal all all peer\n" }]);
  assert.equal(missing.loads, false);
  assert.deepEqual(types(missing), ["include-missing"]);
});

test("an absolute include finds a pasted file by its trailing path", () => {
  const r = scanFiles([
    { name: "pg_hba.conf", text: "include /etc/postgresql/16/main/hba.d/app.conf\n" },
    { name: "hba.d/app.conf", text: "local all all peer\n" },
  ]);
  assert.equal(r.loads, true);
  assert.equal(r.rules.length, 1);
});

test("an include loop stops at PostgreSQL's nesting depth", () => {
  const r = scanFiles([{ name: "pg_hba.conf", text: "include pg_hba.conf\n" }]);
  assert.equal(r.loads, false);
  assert.ok(r.rows.some((x) => /maximum nesting depth exceeded/.test(x.error)));
});

test("an empty file is refused", () => {
  const r = one("# nothing here\n");
  assert.deepEqual(types(r), ["no-entries"]);
});

test("matching: first line wins, all does not cover physical replication, +group needs membership", () => {
  const r = one("host all +staff 10.0.0.0/8 scram-sha-256\nhost all all 10.0.0.0/8 reject\nhost replication all 10.0.0.0/8 md5\n");
  const roles = { alice: { memberOf: ["staff"] }, bob: {}, staff: {} };
  assert.equal(matchConnection(r.rules, { type: "host", address: "10.1.1.1", user: "alice", database: "x" }, roles).rule.line, 1);
  assert.equal(matchConnection(r.rules, { type: "host", address: "10.1.1.1", user: "bob", database: "x" }, roles).rule.line, 2);
  assert.equal(matchConnection(r.rules, { type: "host", address: "10.1.1.1", user: "bob", database: "x", replication: "physical" }, roles).rule.line, 3);
  const unknown = matchConnection(r.rules, { type: "host", address: "10.1.1.1", user: "carol", database: "x" });
  assert.equal(unknown.rule.line, 2);
  assert.equal(unknown.unknown[0].line, 1);
  assert.equal(matchConnection(r.rules, { type: "host", address: "192.168.0.1", user: "bob", database: "x" }).rule, null);
  // a role is a member of itself: samerole matches a database named after the user, +bob matches bob
  const self = one("local samerole all scram-sha-256\nlocal all +bob peer\n");
  assert.equal(matchConnection(self.rules, { type: "local", user: "postgres", database: "postgres" }).rule.line, 1);
  assert.equal(matchConnection(self.rules, { type: "local", user: "bob", database: "x" }).rule.line, 2);
});

test("the view row for a parsed line matches pg_hba_file_rules' format", () => {
  const [row] = rowsOf("hostssl app,\"x y\" all 10.1.2.3/8 cert map=m clientname=DN\n");
  assert.deepEqual(viewRow(row), { file_name: "pg_hba.conf", line_number: 1, type: "hostssl", database: ["app", "x y"], user_name: ["all"], address: "10.1.2.3", netmask: "255.0.0.0", auth_method: "cert", options: ["map=m", "clientcert=verify-full"], error: null });
});

test("every TYPES entry is reachable and severities summarise", () => {
  assert.equal(new Set(TYPES).size, TYPES.length);
  assert.equal(summaryLine([]), "none of the listed patterns found");
  assert.equal(summaryLine([{ severity: "high" }, { severity: "low" }, { severity: "high" }]), "2 high, 1 low");
  assert.equal(hasRisk([{ severity: "low" }]), false);
});

test("CLI: text, json, a connection, --fail-on-risk", () => {
  const out = [];
  const code = main([path.join(here, "fixtures/ubuntu-24.04-pg16/pg_hba.conf"), "--user", "app", "--addr", "127.0.0.1", "--fail-on-risk"], (s) => out.push(s));
  assert.equal(code, 0);
  assert.match(out.join("\n"), /Your connection: .*pg_hba\.conf:125 scram-sha-256/);
  const j = [];
  main([path.join(here, "fixtures/ubuntu-24.04-pg16"), "--format", "json"], (s) => j.push(s));
  assert.equal(JSON.parse(j.join("\n")).rules.length, 7);
});
