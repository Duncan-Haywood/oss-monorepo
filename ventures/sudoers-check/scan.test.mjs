import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFiles, hasRisk, summaryLine, TYPES, policyEntries } from "./scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const scan = (text, name = "/etc/sudoers.d/app") => scanFiles([{ name, text }]);
const types = (r) => r.findings.map((f) => f.type);
const one = (r, type) => r.findings.find((f) => f.type === type);

function fixture(dir) {
  const root = path.join(here, "fixtures", dir);
  const files = [];
  (function walk(p) {
    for (const n of readdirSync(p).sort()) {
      const full = path.join(p, n);
      if (statSync(full).isDirectory()) walk(full);
      else files.push({ name: "/etc/" + path.relative(root, full), text: readFileSync(full, "utf8") });
    }
  })(root);
  return files;
}

test("the stock Ubuntu 24.04 sudoers (sudo 1.9.15p5) has no findings", () => {
  const r = scanFiles(fixture("ubuntu"));
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.rootPaths.map((p) => p.who), ["root", "%admin", "%sudo"]);
  assert.ok(r.rootPaths.every((p) => p.password));
});

test("the risky fixture trips every rule-level type it was written for", () => {
  const r = scanFiles(fixture("risky"));
  const got = new Set(types(r));
  for (const t of ["env-keep-dangerous", "authenticate-off", "shell-escape-command", "negated-command-bypass", "runs-any-command",
    "writable-command-path", "setenv-tag", "nopasswd-all", "credential-cache-unbounded", "reads-any-file",
    "secure-path-missing", "includedir-file-ignored"]) assert.ok(got.has(t), t);
  // apt-get update with pinned arguments and whoami are fine.
  assert.ok(!r.findings.some((f) => /grace|ivan may/.test(f.detail)));
});

test("the sudoers(5) EXAMPLES section: what it reports and what it leaves alone", () => {
  const r = scanFiles(fixture("sudo-manual-example"));
  const at = (line) => r.findings.filter((f) => f.line === line).map((f) => `${f.severity} ${f.type}`).sort();
  assert.deepEqual(at(73), ["high nopasswd-all"]); // FULLTIMERS ALL = NOPASSWD: ALL
  assert.deepEqual(at(81), ["high directory-or-glob-command", "low writable-command-path"]); // operator: /usr/oper/bin/, digest-pinned script
  assert.match(r.findings.find((f) => f.line === 86).detail, /reset another account's password/); // pete: passwd [A-Za-z]*
  assert.match(r.findings.find((f) => f.line === 99).detail, /switches to any account/); // john: su [!-]*
  assert.deepEqual(at(97), ["medium nopasswd-all"]); // fred: (DB) NOPASSWD: ALL, not root
  for (const line of [84, 88, 107, 109, 111]) assert.deepEqual(at(line), [], `line ${line}`); // joe su operator, %opers (:ADMINGRP), matt KILL, WEBADMIN, CD-ROM
  assert.equal(r.rootPaths.filter((p) => p.how === "any command (ALL)").length, 9);
});

test("NOPASSWD ALL is high; for a non-root runas it is medium", () => {
  assert.equal(one(scan("ubuntu ALL=(ALL) NOPASSWD:ALL\n"), "nopasswd-all").severity, "high");
  assert.equal(one(scan("ci ALL=(deploy) NOPASSWD: ALL\n"), "nopasswd-all").severity, "medium");
  assert.equal(one(scan("ci ALL=(:docker) NOPASSWD: ALL\n"), "nopasswd-all"), undefined);
});

test("Defaults !authenticate makes ALL passwordless, and PASSWD: wins back", () => {
  const r = scan("Defaults:ci !authenticate\nci ALL=(ALL) ALL\n");
  assert.ok(types(r).includes("authenticate-off"));
  assert.ok(types(r).includes("nopasswd-all"));
  assert.ok(!types(scan("Defaults:ci !authenticate\nci ALL=(ALL) PASSWD: ALL\n")).includes("nopasswd-all"));
  assert.ok(!types(scan("Defaults:ci !authenticate\nbob ALL=(ALL) ALL\n")).includes("nopasswd-all"));
});

test("ALL users with ALL commands is high, low under targetpw", () => {
  assert.equal(one(scan("ALL ALL=(ALL) ALL\n"), "all-users-full-root").severity, "high");
  const r = scan("Defaults targetpw\nALL ALL=(ALL) ALL\n");
  assert.equal(one(r, "all-users-full-root").severity, "low");
  assert.match(one(r, "all-users-full-root").detail, /targetpw/);
});

test("ALL minus commands is flagged, directly and through an alias", () => {
  assert.ok(types(scan("carol ALL=(ALL) ALL, !/usr/bin/su\n")).includes("negated-command-bypass"));
  assert.ok(types(scan("Cmnd_Alias SU = /bin/su\ncarol ALL = !SU, ALL\n")).includes("negated-command-bypass"));
  assert.ok(!types(scan("carol ALL=(ALL) /bin/ls, !/bin/su\n")).includes("negated-command-bypass"));
});

test("editors are root even with pinned arguments and NOEXEC", () => {
  const r = scan("dave ALL=(root) NOEXEC: /usr/bin/vim /etc/hosts\n");
  const f = one(r, "shell-escape-command");
  assert.equal(f.severity, "high");
  assert.match(f.detail, /NOEXEC blocks the shell, not the file writes/);
  assert.match(f.remediation, /sudoedit/);
});

test("pagers and interactive clients: high, medium with NOEXEC, lower for a non-root runas", () => {
  assert.equal(one(scan("a ALL=(root) /usr/bin/less /var/log/syslog\n"), "shell-escape-command").severity, "high");
  assert.equal(one(scan("a ALL=(root) NOEXEC: /usr/bin/less /var/log/syslog\n"), "shell-escape-command").severity, "medium");
  assert.equal(one(scan("a ALL=(postgres) /usr/bin/psql\n"), "shell-escape-command").severity, "medium");
  assert.equal(one(scan("a ALL=(root) /usr/bin/journalctl -u nginx\n"), "shell-escape-command").severity, "high");
});

test("shells, interpreters and exec-capable tools: open arguments only", () => {
  for (const cmd of ["/bin/bash", "/usr/bin/python3", "/usr/bin/find", "/usr/bin/docker", "/usr/bin/systemctl", "/usr/bin/env", "/usr/bin/awk", "/usr/bin/tar *"]) {
    assert.ok(types(scan(`a ALL=(root) ${cmd}\n`)).includes("runs-any-command"), cmd);
  }
  for (const cmd of ["/usr/bin/systemctl restart nginx", "/usr/bin/docker ps", "/usr/bin/python3 /usr/local/sbin/rotate.py", "/bin/bash \"\""]) {
    assert.ok(!types(scan(`a ALL=(root) ${cmd}\n`)).includes("runs-any-command"), cmd);
  }
  assert.ok(!types(scan("a ALL=(root) /usr/bin/systemctl ^restart (nginx|php-fpm)$\n")).includes("runs-any-command"));
  assert.ok(types(scan("a ALL=(root) /usr/bin/systemctl ^restart .*$\n")).includes("runs-any-command"));
});

test("file writers and readers with open arguments", () => {
  assert.equal(one(scan("a ALL=(root) /usr/bin/tee\n"), "writes-any-file").severity, "high");
  assert.equal(one(scan("a ALL=(root) /bin/chown -R www-data /var/www/*\n"), "writes-any-file").severity, "high");
  assert.equal(one(scan("a ALL=(root) /bin/cat /var/log/messages*\n"), "reads-any-file").severity, "medium");
  assert.ok(!types(scan("a ALL=(root) /usr/bin/tee /var/log/app.log\n")).length);
});

test("wildcard arguments on other commands", () => {
  const f = one(scan("a ALL=(root) /usr/local/bin/deploy --env *\n"), "wildcard-arguments");
  assert.equal(f.severity, "medium");
  assert.match(f.detail, /one string/);
  assert.ok(!types(scan("a ALL=(root) sudoedit /etc/nginx/sites-available/*\n")).length);
});

test("commands and scripts in user-writable directories", () => {
  assert.equal(one(scan("deploy ALL=(root) /home/deploy/release.sh\n"), "writable-command-path").severity, "high");
  assert.ok(types(scan("deploy ALL=(root) /bin/bash /tmp/fix.sh\n")).includes("writable-command-path"));
  assert.ok(types(scan("deploy ALL=(root) /usr/bin/python3 /srv/app/manage.py migrate\n")).includes("writable-command-path"));
  assert.ok(!types(scan("deploy ALL=(root) /usr/local/sbin/release\n")).length);
  // ../ is resolved before the directory test, as the kernel would.
  assert.ok(types(scan("deploy ALL=(root) /usr/local/../../tmp/x\n")).includes("writable-command-path"));
});

test("directories and path wildcards as commands", () => {
  assert.ok(types(scan("a ALL=(root) /usr/bin/\n")).includes("directory-or-glob-command"));
  assert.ok(types(scan("a ALL=(root) /usr/sbin/*ctl\n")).includes("directory-or-glob-command"));
});

test("SETENV tag and Defaults setenv", () => {
  assert.equal(one(scan("h ALL=(root) SETENV: /usr/local/bin/backup\n"), "setenv-tag").severity, "high");
  assert.equal(scan("h ALL=(root) SETENV: /usr/local/bin/backup, NOSETENV: /usr/local/bin/restore\n").findings.filter((f) => f.type === "setenv-tag").length, 1);
  assert.ok(types(scan("Defaults setenv\n")).includes("defaults-setenv"));
});

test("environment Defaults", () => {
  assert.ok(types(scan("Defaults !env_reset\n")).includes("env-reset-off"));
  const keep = scan('Defaults env_keep += "LD_PRELOAD LANG"\n');
  assert.equal(keep.findings.length, 1);
  assert.equal(keep.findings[0].severity, "high");
  assert.ok(types(scan('Defaults env_keep += "LD_*"\n')).includes("env-keep-dangerous"));
  assert.ok(types(scan("Defaults env_keep = PERL5OPT\n")).includes("env-keep-dangerous"));
  assert.ok(!types(scan('Defaults env_keep -= "LD_PRELOAD"\n')).length);
  assert.ok(!types(scan('Defaults:%sudo env_keep += "http_proxy https_proxy GIT_AUTHOR_* GIT_COMMITTER_*"\n')).length);
  assert.equal(one(scan('Defaults:%sudo env_keep += "EDITOR"\n'), "env-keep-dangerous").severity, "low");
  // PATH only matters without secure_path.
  assert.equal(one(scan('Defaults env_keep += "PATH"\n'), "env-keep-dangerous").severity, "medium");
  assert.ok(!types(scan('Defaults secure_path="/usr/bin:/bin"\nDefaults env_keep += "PATH"\n')).length);
});

test("credential cache and terminal Defaults", () => {
  assert.equal(one(scan("Defaults timestamp_timeout=-1\n"), "credential-cache-unbounded").severity, "medium");
  assert.equal(one(scan("Defaults timestamp_timeout=480\n"), "credential-cache-unbounded").severity, "low");
  assert.ok(!types(scan("Defaults timestamp_timeout=15\n")).length);
  assert.ok(types(scan("Defaults !tty_tickets\n")).includes("credential-cache-shared"));
  assert.ok(types(scan("Defaults timestamp_type=global\n")).includes("credential-cache-shared"));
  assert.ok(types(scan("Defaults !use_pty\n")).includes("use-pty-off"));
  assert.ok(types(scan("Defaults visiblepw\n")).includes("visiblepw-on"));
  assert.ok(!types(scan("Defaults !visiblepw\n")).length);
  assert.ok(types(scan("Defaults pwfeedback\n")).includes("pwfeedback-on"));
});

test("secure_path is checked only when the main file is present", () => {
  assert.ok(types(scanFiles([{ name: "/etc/sudoers", text: "root ALL=(ALL) ALL\n" }])).includes("secure-path-missing"));
  assert.ok(!types(scan("root ALL=(ALL) ALL\n")).includes("secure-path-missing"));
});

test("a NOPASSWD rule above the group rule does not take effect", () => {
  const r = scanFiles([{ name: "/etc/sudoers", text: 'Defaults secure_path="/usr/bin:/bin"\nalice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx\n%sudo ALL=(ALL:ALL) ALL\n' }]);
  const f = one(r, "nopasswd-overridden");
  assert.equal(f.line, 2);
  assert.match(f.detail, /if alice is in %sudo/);
  // In a drop-in read after the group rule, it works.
  const ok = scanFiles([
    { name: "/etc/sudoers", text: 'Defaults secure_path="/usr/bin:/bin"\n%sudo ALL=(ALL:ALL) ALL\n@includedir /etc/sudoers.d\n' },
    { name: "/etc/sudoers.d/alice", text: "alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx\n" },
  ]);
  assert.ok(!types(ok).includes("nopasswd-overridden"));
  // The same user named twice: unconditional.
  const same = scan("bob ALL=(ALL) NOPASSWD: /usr/bin/id\nbob ALL=(ALL) ALL\n");
  assert.doesNotMatch(one(same, "nopasswd-overridden").detail, / if /);
});

test("includedir order, skipped names and a main file absent", () => {
  const r = scanFiles([
    { name: "/etc/sudoers", text: 'Defaults secure_path="/usr/bin:/bin"\n@includedir /etc/sudoers.d\n' },
    { name: "/etc/sudoers.d/10-a", text: "a ALL=(ALL) NOPASSWD: ALL\n" },
    { name: "/etc/sudoers.d/app.conf", text: "b ALL=(ALL) NOPASSWD: ALL\n" },
    { name: "/etc/sudoers.d/20-b~", text: "c ALL=(ALL) NOPASSWD: ALL\n" },
  ]);
  assert.deepEqual(r.findings.filter((f) => f.type === "includedir-file-ignored").map((f) => f.file), ["/etc/sudoers.d/app.conf", "/etc/sudoers.d/20-b~"]);
  assert.deepEqual(r.findings.filter((f) => f.type === "nopasswd-all").map((f) => f.file), ["/etc/sudoers.d/10-a"]);
  const alone = scanFiles([{ name: "/etc/sudoers.d/deploy.conf", text: "d ALL=(ALL) NOPASSWD: ALL\n" }]);
  assert.deepEqual(types(alone), ["includedir-file-ignored"]);
});

test("@includedir sorts lexically, not numerically", () => {
  const { entries } = policyEntries([
    { name: "/etc/sudoers", text: "@includedir /etc/sudoers.d\n" },
    { name: "/etc/sudoers.d/1_whoops", text: "a ALL = /bin/one\n" },
    { name: "/etc/sudoers.d/10_second", text: "a ALL = /bin/ten\n" },
  ]);
  assert.deepEqual(entries.map((e) => e.command), ["/bin/ten", "/bin/one"]);
});

test("@include of a missing file and an undefined alias leave notes", () => {
  const r = scanFiles([{ name: "/etc/sudoers", text: 'Defaults secure_path="/bin"\n@include /etc/sudoers.local\na ALL = NOSUCH\n' }]);
  assert.ok(r.notes.some((n) => n.includes("/etc/sudoers.local was not pasted")));
  assert.ok(r.notes.some((n) => n.includes("NOSUCH")));
});

test("commented-out rules are ignored, #include is not", () => {
  const r = scanFiles([
    { name: "/etc/sudoers", text: '# %wheel ALL=(ALL) NOPASSWD: ALL\n## Defaults !env_reset\nDefaults secure_path="/bin"\n#includedir /etc/sudoers.d\n' },
    { name: "/etc/sudoers.d/ci", text: "ci ALL=(ALL) NOPASSWD: ALL\n" },
  ]);
  assert.deepEqual(types(r), ["nopasswd-all"]);
});

test("rootPaths lists who can become root and how", () => {
  const r = scan("root ALL=(ALL) ALL\ndave ALL=(root) NOPASSWD: /usr/bin/vim\nfrank ALL=(postgres) /usr/bin/psql\n");
  assert.deepEqual(r.rootPaths.map((p) => [p.who, p.password]), [["root", true], ["dave", false]]);
  assert.match(r.rootPaths[1].how, /vim/);
});

test("every finding has a known type, a severity, a line and a fix", () => {
  const r = scanFiles(fixture("risky"));
  for (const f of r.findings) {
    assert.ok(TYPES.includes(f.type), f.type);
    assert.ok(["high", "medium", "low"].includes(f.severity));
    assert.ok(f.line >= 1);
    assert.ok(f.remediation.length > 10);
  }
  assert.equal(new Set(TYPES).size, TYPES.length);
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(hasRisk([{ severity: "low" }]), false);
  assert.equal(hasRisk([{ severity: "medium" }]), true);
  assert.match(summaryLine([]), /not proof/);
  assert.equal(summaryLine([{ severity: "high" }, { severity: "low" }]), "2 findings: 1 high, 1 low.");
});

test("CLI: text, json and --fail-on-risk", () => {
  const cli = path.join(here, "check.mjs");
  const risky = path.join(here, "fixtures", "risky");
  let code = 0;
  let out = "";
  try { out = execFileSync("node", [cli, risky, "--fail-on-risk"], { encoding: "utf8" }); } catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 2);
  assert.match(out, /who can become root:/);
  const json = JSON.parse(execFileSync("node", [cli, risky, "--format", "json"], { encoding: "utf8" }));
  assert.ok(json.findings.length > 10);
  assert.ok(Array.isArray(json.rootPaths));
  assert.equal(execFileSync("node", [cli, path.join(here, "fixtures", "ubuntu"), "--fail-on-risk"], { encoding: "utf8" }).trim().split("\n").pop(),
    "No risky patterns found in what was pasted (not proof the policy is safe). (2 files read)");
});

// Only the original sudo's visudo (it prints "Sudoers policy plugin version").
// A CI runner's visudo with different messages rejected wildcard arguments,
// a negative timestamp_timeout and !authenticate, which sudo 1.9.15 accepts;
// the fixtures target sudo 1.9.15.
function originalVisudo() {
  try {
    const v = execFileSync("visudo", ["-V"], { encoding: "utf8", stdio: "pipe" });
    return /Sudoers policy plugin version|visudo version 1\./.test(v) ? false : "visudo here is not the original sudo's";
  } catch { return "visudo not installed"; }
}

test("fixtures are accepted by the original sudo's visudo where it is installed", { skip: originalVisudo() }, () => {
  for (const f of ["risky/sudoers", "risky/sudoers.d/90-cloud-init-users", "ubuntu/sudoers", "sudo-manual-example/sudoers"]) {
    execFileSync("visudo", ["-c", "-q", "-f", path.join(here, "fixtures", f)], { stdio: "pipe" });
  }
});

test("a Defaults binding made of commas does not backtrack exponentially (ReDoS)", () => {
  // `Defaults:` followed by commas and no space used to split 2^n ways: 32 commas took over 20 s.
  const t0 = performance.now();
  scan(`Defaults:${",".repeat(40)}\nDefaults:alice,bob env_reset\n`);
  assert.ok(performance.now() - t0 < 1000, "scan took over a second");
});

test("Defaults:ALIAS !authenticate expands the User_Alias, so its members' rules are passwordless", () => {
  // Real defect (red team 2026-11-15): the binding was compared as the literal word ADMINS, so
  // `ADMINS ALL=(ALL) ALL` was reported as asking for a password and nopasswd-all never fired.
  const r = scan("User_Alias ADMINS = alice, bob\nDefaults:ADMINS !authenticate\nADMINS ALL=(ALL) ALL\n");
  assert.ok(types(r).includes("nopasswd-all"));
  assert.deepEqual(r.rootPaths.map((p) => [p.who, p.password]), [["alice, bob", false]]);
  // A negated member is excluded from the binding.
  const ex = scan("User_Alias ADMINS = alice, bob\nDefaults:ADMINS,!bob !authenticate\nbob ALL=(ALL) ALL\nalice ALL=(ALL) ALL\n");
  assert.deepEqual(ex.rootPaths.map((p) => [p.who, p.password]), [["bob", true], ["alice", false]]);
});

test("a global Defaults !authenticate makes every rule passwordless, and a plain authenticate does not", () => {
  assert.deepEqual(scan("Defaults !authenticate\ndave ALL=(ALL) ALL\n").rootPaths.map((p) => [p.who, p.password]), [["dave", false]]);
  assert.deepEqual(scan("Defaults authenticate\ndave ALL=(ALL) ALL\n").rootPaths.map((p) => [p.who, p.password]), [["dave", true]]);
});

test("an @include names one file: another pasted file is not taken for it", () => {
  const r = scanFiles([
    { name: "/etc/sudoers", text: "@include /etc/sudoers.local\n" },
    { name: "/etc/other", text: "bob ALL=(ALL) NOPASSWD: ALL\n" },
  ]);
  assert.ok(r.notes.some((n) => n.includes("/etc/sudoers.local was not pasted")));
  assert.ok(r.notes.some((n) => n.includes("/etc/other is not included from /etc/sudoers")));
});

test("env_keep wildcards match by their own prefix only", () => {
  assert.ok(!types(scan('Defaults env_keep += "HOME_*"\n')).includes("env-keep-dangerous"));
  assert.ok(types(scan('Defaults env_keep += "LD_*"\n')).includes("env-keep-dangerous"));
});

test("negated-command-bypass names the subtracted commands", () => {
  assert.match(one(scan("carol ALL=(ALL) ALL, !/usr/bin/su -\n"), "negated-command-bypass").detail, /ALL with !\/usr\/bin\/su - for carol/);
});

test("runas lists: the last matching item decides whether root is reachable (sudoers(5))", () => {
  // Quality census 2026-11-15-8ced: "(!root, ALL)" was read as excluding root; real sudo grants root.
  assert.equal(one(scan("nobody ALL = (!root, ALL) NOPASSWD: ALL\n"), "nopasswd-all").severity, "high");
  assert.equal(one(scan("nobody ALL = (ALL, !root) NOPASSWD: ALL\n"), "nopasswd-all").severity, "medium");
  assert.equal(one(scan("nobody ALL = (ALL, !#0) NOPASSWD: ALL\n"), "nopasswd-all").severity, "medium");
});

// Quality re-audit 2026-11-21: each expectation below is what real sudo 1.9.15p5 did with the
// same file bind-mounted over /etc/sudoers (runuser -u daemon -- sudo -n ...), recorded in
// portfolio/quality/audits/2026-11-21-sudoers-check.json.
const daemonRoot = (pre) => scanFiles([{ name: "/etc/sudoers", text: `root ALL=(ALL:ALL) ALL\n${pre}\ndaemon ALL=(ALL) ALL\n` }]);
const daemonPath = (r) => r.rootPaths.find((p) => p.who === "daemon" && p.how === "any command (ALL)");

test("Defaults>root !authenticate makes a runas-root rule passwordless; a non-root binding does not", () => {
  assert.equal(daemonPath(daemonRoot("Defaults>root !authenticate")).password, false);
  assert.equal(daemonPath(daemonRoot("Runas_Alias R = root\nDefaults>R !authenticate")).password, false);
  assert.equal(daemonPath(daemonRoot("Defaults>!root,ALL !authenticate")).password, false);
  assert.equal(daemonPath(daemonRoot("Defaults>ALL,!root !authenticate")).password, true);
  assert.equal(daemonPath(daemonRoot("Defaults>daemon !authenticate")).password, true);
  // root never needs a password, so its own stock rule is not reported.
  assert.ok(!daemonRoot("Defaults>root !authenticate").findings.some((f) => f.type === "nopasswd-all" && f.line === 1));
});

test("scoped authenticate Defaults apply in sudo's order: file order, then command Defaults", () => {
  assert.equal(daemonPath(daemonRoot("Defaults:daemon !authenticate\nDefaults>root authenticate")).password, true);
  assert.equal(daemonPath(daemonRoot("Defaults>root authenticate\nDefaults:daemon !authenticate")).password, false);
  assert.equal(daemonPath(daemonRoot("Defaults:daemon authenticate\nDefaults !authenticate")).password, false);
  assert.equal(daemonPath(daemonRoot("Defaults>root authenticate\nDefaults !authenticate")).password, false);
  // A per-user authenticate after a global !authenticate wins (sudo asks daemon for a password).
  assert.equal(daemonPath(daemonRoot("Defaults !authenticate\nDefaults:daemon authenticate")).password, true);
  const r = scanFiles([{ name: "/etc/sudoers", text: "Defaults!/usr/bin/vim authenticate\nDefaults>root !authenticate\ndaemon ALL=(ALL) /usr/bin/vim\n" }]);
  assert.ok(r.rootPaths.some((p) => p.how.startsWith("/usr/bin/vim") && p.password === true));
});

test("Defaults!cmnd !authenticate inside an ALL rule makes that command passwordless root", () => {
  const r = daemonRoot("Cmnd_Alias ED = /usr/bin/vim, /usr/bin/id\nDefaults!ED !authenticate");
  assert.equal(daemonPath(r).password, true);
  assert.ok(r.rootPaths.some((p) => p.who === "daemon" && p.how.startsWith("/usr/bin/vim") && p.password === false));
  assert.ok(!r.rootPaths.some((p) => p.how.startsWith("/usr/bin/id")), "a harmless command is not a root path");
  assert.equal(one(r, "authenticate-off").severity, "medium");
  // An explicit PASSWD: tag wins over the Defaults (sudo asks for a password).
  const pw = scanFiles([{ name: "/etc/sudoers", text: "Defaults!/usr/bin/vim !authenticate\ndaemon ALL=(ALL) PASSWD: ALL\n" }]);
  assert.ok(!pw.rootPaths.some((p) => p.password === false));
});

test("a checked-out tree maps @includedir /etc/sudoers.d to its own sudoers.d", () => {
  const files = fixture("risky").map((f) => ({ ...f, name: f.name.replace(/^\/etc\//, "repo/fixtures/risky/") }));
  const r = scanFiles(files);
  const ivan = r.findings.find((f) => f.file.endsWith("ivan.conf"));
  assert.equal(ivan?.type, "includedir-file-ignored");
  assert.equal(r.findings.filter((f) => f.file.endsWith("ivan.conf")).length, 1, "ivan.conf's rules are not read");
  assert.ok(!r.notes.some((n) => /not included from/.test(n)), r.notes.join("\n"));
  // The same tree under /etc gives the same findings, file names aside.
  const strip = (x) => x.findings.map((f) => `${path.basename(f.file)}:${f.line}:${f.type}`).sort();
  assert.deepEqual(strip(r), strip(scanFiles(fixture("risky"))));
});

test("a later ALL rule that runs as another user does not override NOPASSWD as root", () => {
  // Real sudo 1.9.15p5: daemon runs sudo -n -u root /usr/bin/id with no password here.
  const r = scanFiles([{ name: "/etc/sudoers", text: "daemon ALL=(root) NOPASSWD: /usr/bin/id\ndaemon ALL=(nobody) ALL\n" }]);
  assert.ok(!types(r).includes("nopasswd-overridden"), JSON.stringify(r.findings));
  // ...while a later ALL rule as root does (sudo asks for a password).
  const o = scanFiles([{ name: "/etc/sudoers", text: "daemon ALL=(root) NOPASSWD: /usr/bin/id\ndaemon ALL=(ALL) ALL\n" }]);
  assert.ok(types(o).includes("nopasswd-overridden"));
});
