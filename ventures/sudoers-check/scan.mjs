// sudoers Check: a static read of sudoers files (the main file and its
// @include / @includedir files) for rules that hand out more than they look
// like they do. Behaviour follows sudoers(5) for sudo 1.9.15:
// https://www.sudo.ws/docs/man/1.9.15/sudoers.man/
//
// Zero dependencies, no network calls, no file system access: callers pass
// [{ name, text }] and get { findings, notes, rootPaths } back. The same
// module runs in the browser page and in the Node CLI.

export const TYPES = [
  "nopasswd-all",
  "all-users-full-root",
  "negated-command-bypass",
  "shell-escape-command",
  "runs-any-command",
  "writes-any-file",
  "reads-any-file",
  "writable-command-path",
  "directory-or-glob-command",
  "wildcard-arguments",
  "setenv-tag",
  "env-reset-off",
  "env-keep-dangerous",
  "authenticate-off",
  "defaults-setenv",
  "credential-cache-unbounded",
  "credential-cache-shared",
  "use-pty-off",
  "visiblepw-on",
  "pwfeedback-on",
  "secure-path-missing",
  "nopasswd-overridden",
  "includedir-file-ignored",
];

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const TAGS = new Set([
  "NOPASSWD", "PASSWD", "NOEXEC", "EXEC", "SETENV", "NOSETENV", "LOG_INPUT", "NOLOG_INPUT",
  "LOG_OUTPUT", "NOLOG_OUTPUT", "MAIL", "NOMAIL", "FOLLOW", "NOFOLLOW", "INTERCEPT", "NOINTERCEPT",
]);
const TAG_OPPOSITE = {
  NOPASSWD: "PASSWD", PASSWD: "NOPASSWD", NOEXEC: "EXEC", EXEC: "NOEXEC", SETENV: "NOSETENV", NOSETENV: "SETENV",
  INTERCEPT: "NOINTERCEPT", NOINTERCEPT: "INTERCEPT", LOG_INPUT: "NOLOG_INPUT", NOLOG_INPUT: "LOG_INPUT",
  LOG_OUTPUT: "NOLOG_OUTPUT", NOLOG_OUTPUT: "LOG_OUTPUT", MAIL: "NOMAIL", NOMAIL: "MAIL", FOLLOW: "NOFOLLOW", NOFOLLOW: "FOLLOW",
};
const OPTION_SPEC = /^(?:ROLE|TYPE|CWD|CHROOT|TIMEOUT|NOTBEFORE|NOTAFTER|APPARMOR_PROFILE|PRIVS|LIMITPRIVS)\s*=\s*(?:"(?:[^"\\]|\\.)*"|\S+)\s*/;
const DIGEST = /^(?:sha224|sha256|sha384|sha512)\s*:\s*[A-Za-z0-9+/=]+(?:\s*,\s*[A-Za-z0-9+/=]+)*\s+/;

// Programs, by what a user can do with them as the target user. Matched on
// the command's base name. A catalogue of the same idea, with the exact
// escapes, is GTFOBins (https://gtfobins.github.io/); this list is our own.
const EDITORS = new Set(["vi", "vim", "vim.basic", "vim.tiny", "view", "rvim", "rview", "nvim", "ex", "emacs", "nano", "pico", "ed", "joe", "jed", "mcedit", "micro", "kak", "hx"]);
const PAGERS = new Set(["less", "more", "most", "pg", "man", "journalctl"]);
const INTERACTIVE = new Set(["ftp", "lftp", "mysql", "mariadb", "psql", "sqlite3", "gdb", "irb", "screen", "tmux", "script", "mutt", "aria2c"]);
const SHELLS = new Set([
  "sh", "bash", "dash", "zsh", "ksh", "mksh", "fish", "csh", "tcsh", "ash", "busybox", "su", "sudo", "runuser", "doas",
  "pkexec", "env", "nice", "nohup", "timeout", "stdbuf", "taskset", "strace", "ltrace", "time", "xargs", "flock",
  "ionice", "chrt", "unshare", "nsenter", "chroot", "setsid", "setpriv", "capsh", "rlwrap", "watch", "sg", "expect",
  "start-stop-daemon", "systemd-run",
]);
const INTERPRETER_RE = /^(?:python[\d.]*|perl[\d.]*|ruby[\d.]*|node|nodejs|deno|bun|php[\d.]*|lua[\d.]*|luajit|tclsh[\d.]*|wish|awk|gawk|mawk|nawk|jjs|Rscript|pwsh|java|jrunscript|guile|racket|ghci|julia)$/;
const EXEC_WITH_ARGS = new Set([
  "find", "tar", "zip", "rsync", "scp", "ssh", "git", "make", "docker", "podman", "nerdctl", "ctr", "crontab",
  "systemctl", "service", "apt", "apt-get", "dpkg", "yum", "dnf", "zypper", "pacman", "rpm", "snap", "pip", "pip3",
  "npm", "npx", "yarn", "pnpm", "gem", "cpan", "composer", "tcpdump", "mount", "nmap", "iptables", "ip6tables",
  "ip", "dmesg", "ansible", "ansible-playbook", "vagrant", "terraform", "kubectl", "helm", "sed", "openvpn",
  "ssh-keygen", "busctl", "mail", "zip", "7z", "perf", "valgrind", "cmake", "go", "cargo", "dotnet",
]);
const FILE_WRITE = new Set([
  "cp", "mv", "dd", "tee", "install", "chmod", "chown", "chgrp", "ln", "truncate", "wget", "curl", "openssl",
  "unzip", "shred", "rm", "mkdir", "touch", "setfacl", "chattr", "passwd", "chpasswd", "usermod", "useradd",
  "visudo", "cpio", "base64", "gpasswd",
]);
const SWITCH_USER = new Set(["su", "runuser", "sudo", "doas", "sg"]);
const ACCOUNT_TOOLS = new Set(["passwd", "chpasswd", "usermod", "useradd", "gpasswd"]);
const FILE_READ = new Set([
  "cat", "head", "tail", "tac", "nl", "base32", "xxd", "od", "hexdump", "strings", "grep", "egrep", "fgrep",
  "rg", "diff", "cut", "sort", "uniq", "file", "jq", "yq", "fold", "fmt", "paste", "column", "comm", "join",
  "look", "rev", "ls", "du", "stat",
]);

// Directories ordinary accounts can usually write to. /var/www and /srv are
// often owned by the web server's user, the account an attacker of a web app
// reaches first.
const USER_WRITABLE_DIRS = ["/home/", "/tmp/", "/var/tmp/", "/dev/shm/", "/run/user/", "/var/www/", "/srv/"];

const DANGEROUS_ENV = [
  ["LD_PRELOAD", "loads any shared library into the command"],
  ["LD_LIBRARY_PATH", "swaps the libraries the command links against"],
  ["LD_AUDIT", "loads any shared library into the command"],
  ["PYTHONPATH", "makes a Python command import the user's modules"],
  ["PYTHONSTARTUP", "runs a file in an interactive Python"],
  ["PYTHONHOME", "swaps the Python standard library"],
  ["PERL5LIB", "makes a Perl command load the user's modules"],
  ["PERL5OPT", "adds options, including -M module loads, to any Perl"],
  ["PERLLIB", "makes a Perl command load the user's modules"],
  ["RUBYLIB", "makes a Ruby command load the user's code"],
  ["RUBYOPT", "adds options, including -r requires, to any Ruby"],
  ["NODE_OPTIONS", "adds --require of the user's file to any Node.js"],
  ["NODE_PATH", "makes a Node.js command load the user's modules"],
  ["BASH_ENV", "runs a file before any non-interactive bash script"],
  ["ENV", "runs a file when sh starts"],
  ["SHELLOPTS", "changes how bash scripts run (with PS4, runs code)"],
  ["PS4", "runs command substitutions in bash xtrace"],
  ["GCONV_PATH", "loads the user's iconv modules into glibc programs"],
  ["HOSTALIASES", "redirects host name lookups"],
  ["JAVA_TOOL_OPTIONS", "adds -javaagent loads to any Java program"],
  ["GIT_SSH_COMMAND", "runs any command when git fetches over ssh"],
  ["GIT_EXEC_PATH", "makes git run the user's helper programs"],
  ["EDITOR", "picks the program sudoedit and many tools start"],
  ["VISUAL", "picks the program sudoedit and many tools start"],
  ["SUDO_EDITOR", "picks the program sudoedit starts"],
  ["PAGER", "picks the program pagers start"],
  ["HOME", "makes programs read the user's own dotfiles"],
  ["PATH", "lets a command find the user's programs first"],
];

// ---------------------------------------------------------------- lexing

function normPath(p) {
  const abs = p.startsWith("/");
  const parts = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return (abs ? "/" : "") + parts.join("/");
}

function dirname(p) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : i === 0 ? "/" : p.slice(0, i);
}

function basename(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}

// Strip a comment: '#' starts one unless it is quoted, escaped, or
// followed by a digit (a user or group ID such as #0).
function stripComment(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') inQuote = !inQuote;
    else if (c === "#" && !inQuote && !/[0-9]/.test(line[i + 1] || "")) return line.slice(0, i);
  }
  return line;
}

// Logical lines: comments dropped, backslash-newline joined, include
// directives recognised before the '#' is read as a comment.
function logicalLines(text) {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let buf = "";
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (!buf) {
      start = i + 1;
      const inc = line.match(/^\s*[#@](include|includedir)\s+(.+?)\s*$/);
      if (inc) {
        out.push({ line: start, text: line.trim(), include: { dir: inc[1] === "includedir", path: inc[2].replace(/^"(.*)"$/, "$1") } });
        continue;
      }
      line = stripComment(line);
    } else {
      line = stripComment(line);
    }
    if (/(^|[^\\])(\\\\)*\\\s*$/.test(line)) {
      buf += line.replace(/\\\s*$/, " ");
      continue;
    }
    buf += line;
    if (buf.trim()) out.push({ line: start, text: buf.trim() });
    buf = "";
  }
  if (buf.trim()) out.push({ line: start, text: buf.trim() });
  return out;
}

// Split on a separator character at the top level: outside quotes and
// parentheses, and not escaped with a backslash.
function splitTop(s, sep) {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) { cur += c + s[i + 1]; i++; continue; }
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === "(") depth++;
    else if (!inQuote && c === ")") depth = Math.max(0, depth - 1);
    if (c === sep && !inQuote && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

function indexTop(s, ch) {
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') inQuote = !inQuote;
    else if (c === ch && !inQuote) return i;
  }
  return -1;
}

function unquote(v) {
  v = v.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\(.)/g, "$1");
  return v;
}

function unescapeArgs(s) {
  return s.replace(/\\([,:=\\])/g, "$1");
}

// ---------------------------------------------------------------- include order

function isMainName(name) {
  return basename(name) === "sudoers";
}

// Does a pasted file name refer to an include target? sudo 1.9.1+ reads a
// relative include path from the including file's directory.
function matchesPath(fileName, target, fromFile) {
  const n = normPath(fileName);
  const candidates = [normPath(target)];
  if (!target.startsWith("/") && fromFile) candidates.push(normPath(dirname(fromFile) + "/" + target));
  for (const t of candidates) {
    if (!t) continue;
    if (n === t) return true;
    const tail = t.replace(/^\//, "");
    if (n === tail || n.endsWith("/" + tail)) return true;
    // A file pasted under a relative name still matches an absolute include.
    if (tail.endsWith("/" + n.replace(/^\//, ""))) return true;
  }
  return false;
}

function inDir(fileName, dir, fromFile) {
  const d = dirname(normPath(fileName));
  return Boolean(d) && matchesPath(d, dir.replace(/\/+$/, ""), fromFile);
}

// sudoers(5): files in an @includedir directory whose names end in '~' or
// contain a '.' are skipped.
function skippedByIncludedir(name) {
  const b = basename(name);
  return b.endsWith("~") || b.includes(".");
}

// Order the files the way sudo reads them, starting from the main file.
function orderFiles(files, notes, findings) {
  const byName = files.map((f) => ({ ...f, name: f.name || "sudoers", lines: logicalLines(f.text) }));
  const main = byName.find((f) => isMainName(f.name));
  const ordered = [];
  const reached = new Set();
  const ignored = new Set();
  // A checked-out copy (a config-management repo, a CI workspace) keeps
  // /etc/sudoers as <dir>/sudoers, so an absolute /etc/... include is also
  // looked for under the main file's own directory.
  const mainDir = main ? dirname(normPath(main.name)) : "";
  const rebased = (p) => (mainDir && mainDir !== "/etc" && p.startsWith("/etc/") ? mainDir + p.slice(4) : null);
  const reaches = (test, p, from) => test(p, from) || (rebased(p) !== null && test(rebased(p), from));

  function visit(file, depth) {
    if (depth > 128) { notes.push(`${file.name}: includes nested more than 128 deep; stopped there, as sudo does.`); return; }
    if (reached.has(file.name) && depth > 0) return;
    reached.add(file.name);
    for (const ln of file.lines) {
      if (!ln.include) { ordered.push({ file: file.name, ...ln }); continue; }
      const { dir, path } = ln.include;
      if (dir) {
        const members = byName
          .filter((f) => f !== file && reaches((d, from) => inDir(f.name, d, from), path, file.name))
          .sort((a, b) => (basename(a.name) < basename(b.name) ? -1 : basename(a.name) > basename(b.name) ? 1 : 0));
        if (!members.length) notes.push(`${file.name}:${ln.line}: no pasted file is in ${path}; add the files there to check them in order.`);
        for (const m of members) {
          if (skippedByIncludedir(m.name)) {
            ignored.add(m.name);
            reached.add(m.name);
            findings.push(finding("includedir-file-ignored", "low", m.name, 1,
              `sudo never reads this file: @includedir ${path} (${file.name}:${ln.line}) skips files whose names contain a '.' or end in '~', so none of its rules apply.`,
              `Rename it without a dot, for example ${basename(m.name).replace(/\./g, "-").replace(/~$/, "")}, and check it with visudo -cf before it goes live.`));
            continue;
          }
          visit(m, depth + 1);
        }
      } else {
        const target = byName.find((f) => f !== file && reaches((t, from) => matchesPath(f.name, t, from), path, file.name));
        if (!target) { notes.push(`${file.name}:${ln.line}: ${path} was not pasted, so its rules are not checked.`); continue; }
        visit(target, depth + 1);
      }
    }
  }

  if (main) visit(main, 0);
  for (const f of byName) {
    if (reached.has(f.name) || ignored.has(f.name)) continue;
    // Without a main file, a file in a sudoers.d directory is read as if the
    // usual @includedir /etc/sudoers.d had pulled it in.
    if (!main && /(^|\/)sudoers\.d$/.test(dirname(normPath(f.name))) && skippedByIncludedir(f.name)) {
      findings.push(finding("includedir-file-ignored", "low", f.name, 1,
        "sudo never reads this file: the standard @includedir /etc/sudoers.d skips files whose names contain a '.' or end in '~', so none of its rules apply.",
        `Rename it without a dot, for example ${basename(f.name).replace(/\./g, "-").replace(/~$/, "")}, and check it with visudo -cf before it goes live.`));
      continue;
    }
    if (main) notes.push(`${f.name} is not included from ${main.name}; checked on its own, after it.`);
    visit(f, 0);
  }
  return { ordered, mainName: main ? main.name : null };
}

// ---------------------------------------------------------------- parsing

function finding(type, severity, file, line, detail, remediation) {
  return { type, severity, file, line, detail, remediation };
}

function parseDefaults(stmt, m) {
  const kind = m[1] || "";
  const binding = (m[2] || "").trim();
  const params = [];
  for (const raw of splitTop(m[3], ",")) {
    if (!raw) continue;
    const pm = raw.match(/^(!*)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:([+-]?=)\s*([\s\S]*))?$/);
    if (!pm) continue;
    params.push({ negated: pm[1].length % 2 === 1, name: pm[2], op: pm[3] || null, value: pm[4] !== undefined ? unquote(pm[4]) : null });
  }
  return { kind: "defaults", scope: kind, binding, params, file: stmt.file, line: stmt.line };
}

// Several aliases can share a line, separated by ':' -- but only a ':'
// followed by "NAME =" starts a new one (a digest such as sha224:... does not).
function splitAliasDefs(body) {
  const out = [];
  let last = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\") { i++; continue; }
    if (body[i] === ":" && /^\s*[A-Z][A-Z0-9_]*\s*=/.test(body.slice(i + 1))) {
      out.push(body.slice(last, i));
      last = i + 1;
    }
  }
  out.push(body.slice(last));
  return out.map((d) => d.trim());
}

function parseAliases(stmt, type, body, aliases) {
  for (const def of splitAliasDefs(body)) {
    const dm = def.match(/^([A-Z][A-Z0-9_]*)\s*=\s*([\s\S]*)$/);
    if (!dm) continue;
    aliases[type][dm[1]] = { items: splitTop(dm[2], ",").filter(Boolean), file: stmt.file, line: stmt.line };
  }
}

// Find ' : Host_List =' separators in the right-hand side of a user spec.
function splitHostGroups(rhs) {
  const groups = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < rhs.length; i++) {
    const c = rhs[i];
    if (c === "\\") { i++; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0) {
      const word = rhs.slice(last, i).match(/([A-Za-z0-9_]+)\s*$/)?.[1] || "";
      if (TAGS.has(word) || /^sha\d+$/.test(word)) continue;
      const after = rhs.slice(i + 1).match(/^\s*([^=/\s"(][^=/"(]*?)\s*=(?!=)/);
      if (!after || /\s\S/.test(after[1].replace(/\s*,\s*/g, ","))) continue;
      groups.push({ hosts: null, body: rhs.slice(last, i) });
      last = i + 1;
    }
  }
  groups.push({ hosts: null, body: rhs.slice(last) });
  for (let g = 1; g < groups.length; g++) {
    const eq = groups[g].body.indexOf("=");
    groups[g].hosts = groups[g].body.slice(0, eq).trim();
    groups[g].body = groups[g].body.slice(eq + 1);
  }
  return groups;
}

function expandList(items, aliasTable, seen = new Set()) {
  const out = [];
  for (let item of items) {
    let neg = false;
    while (item.startsWith("!")) { neg = !neg; item = item.slice(1).trim(); }
    if (aliasTable[item] && !seen.has(item)) {
      seen.add(item);
      for (const sub of expandList(aliasTable[item].items, aliasTable, seen)) out.push({ ...sub, neg: sub.neg !== neg, via: sub.via || item });
      seen.delete(item);
    } else out.push({ value: item, neg });
  }
  return out;
}

function parseCmndSpec(text) {
  let s = text.trim();
  const spec = { runas: undefined, tags: {}, cmd: null, digest: false };
  if (s.startsWith("(")) {
    const close = s.indexOf(")");
    spec.runas = s.slice(1, close);
    s = s.slice(close + 1).trim();
  }
  for (;;) {
    const om = s.match(OPTION_SPEC);
    if (om) { s = s.slice(om[0].length); continue; }
    const tm = s.match(/^([A-Z_]+)\s*:\s*/);
    if (tm && TAGS.has(tm[1])) { spec.tags[tm[1]] = true; s = s.slice(tm[0].length); continue; }
    const dm = s.match(DIGEST);
    if (dm) { s = s.slice(dm[0].length); spec.digest = true; continue; }
    break;
  }
  spec.cmd = s;
  return spec;
}

function parseCommand(raw) {
  let s = raw.trim();
  let neg = false;
  let digest = false;
  // A Cmnd_Alias item may carry its own digest: sha224:... /path.
  for (;;) {
    const dm = s.match(DIGEST);
    if (dm) { s = s.slice(dm[0].length); digest = true; continue; }
    if (s.startsWith("!")) { neg = !neg; s = s.slice(1).trim(); continue; }
    break;
  }
  const m = s.match(/^((?:\\.|[^\s\\])+)(?:\s+([\s\S]*))?$/);
  if (!m) return { neg, digest, path: s, args: null };
  return { neg, digest, path: m[1].replace(/\\(.)/g, "$1"), args: m[2] === undefined ? null : unescapeArgs(m[2].trim()) };
}

function runasInfo(runasText, aliases, runasDefault) {
  if (runasText === undefined) {
    return { text: `(${runasDefault})`, root: runasDefault === "root" || runasDefault === "#0" };
  }
  const [usersPart, groupPart] = runasText.split(":");
  const users = splitTop(usersPart || "", ",").filter(Boolean);
  const expanded = expandList(users, aliases.Runas_Alias);
  const groups = expandList(splitTop(groupPart || "", ",").filter(Boolean), aliases.Runas_Alias);
  const list = (xs) => xs.map((x) => (x.neg ? "!" : "") + unquote(x.value));
  const lists = { users: list(expanded), groups: list(groups) };
  // sudoers(5): in a list the last item that matches decides, so "(!root, ALL)" still allows root
  // and "(ALL, !root)" does not.
  let root = false;
  for (const u of expanded) if (u.value === "ALL" || u.value === "root" || u.value === "#0") root = !u.neg;
  // '(:group)' alone runs the command as the invoking user.
  if (!users.length && groupPart !== undefined) return { text: `(${runasText.trim()})`, root: false, self: true, ...lists };
  if (!users.length) return { text: `(${runasDefault})`, root: runasDefault === "root" || runasDefault === "#0", ...lists };
  return { text: `(${runasText.trim()})`, root, ...lists };
}

function parseStatements(ordered, notes) {
  const aliases = { User_Alias: {}, Runas_Alias: {}, Host_Alias: {}, Cmnd_Alias: {} };
  const defaults = [];
  const rules = [];
  for (const stmt of ordered) {
    const t = stmt.text;
    let m;
    // The binding is escapes or non-space characters. An earlier `|,\s*` branch never changed
    // a match (a comma already matched [^\s\\]) but let a run of commas split 2^n ways: 28 commas
    // with no space after took 1.4 s and 32 took over 20 s (ReDoS). scan.test.mjs pins this.
    if ((m = t.match(/^Defaults(?:([@:!>])\s*((?:\\.|[^\s\\])+))?\s+([\s\S]+)$/))) {
      defaults.push(parseDefaults(stmt, m));
      continue;
    }
    if (/^Defaults\s*$/.test(t)) continue;
    if ((m = t.match(/^(User_Alias|Runas_Alias|Host_Alias|Cmnd_Alias|Cmd_Alias)\s+([\s\S]+)$/))) {
      parseAliases(stmt, m[1] === "Cmd_Alias" ? "Cmnd_Alias" : m[1], m[2], aliases);
      continue;
    }
    const eq = indexTop(t, "=");
    if (eq < 0) {
      notes.push(`${stmt.file}:${stmt.line}: not read as a sudoers rule: ${t.slice(0, 60)}`);
      continue;
    }
    const lhs = t.slice(0, eq).replace(/\s*,\s*/g, ",").trim();
    const toks = [];
    let cur = "";
    let q = false;
    for (const c of lhs) {
      if (c === '"') q = !q;
      if (/\s/.test(c) && !q) { if (cur) toks.push(cur); cur = ""; } else cur += c;
    }
    if (cur) toks.push(cur);
    if (toks.length !== 2) {
      notes.push(`${stmt.file}:${stmt.line}: not read as a sudoers rule (expected "users hosts = commands"): ${t.slice(0, 60)}`);
      continue;
    }
    const users = splitTop(toks[0], ",").filter(Boolean).map(unquote);
    const groups = splitHostGroups(t.slice(eq + 1));
    groups[0].hosts = toks[1];
    rules.push({ file: stmt.file, line: stmt.line, text: t, users, groups });
  }
  return { aliases, defaults, rules };
}

// ---------------------------------------------------------------- analysis

function hasGlob(s) {
  return /(^|[^\\])[*?[]/.test(s);
}

function argsOpen(args) {
  if (args === null) return true;
  if (args === '""') return false;
  if (args.startsWith("^") && args.endsWith("$")) return /\.\*|\.\+|\\S\*|\[\^[^\]]*\]\*/.test(args);
  return hasGlob(args);
}

function classify(base) {
  if (EDITORS.has(base)) return "editor";
  if (PAGERS.has(base)) return "pager";
  if (INTERACTIVE.has(base)) return "interactive";
  if (SHELLS.has(base)) return "shell";
  if (INTERPRETER_RE.test(base)) return "interpreter";
  if (EXEC_WITH_ARGS.has(base)) return "exec";
  if (FILE_WRITE.has(base)) return "write";
  if (FILE_READ.has(base)) return "read";
  return null;
}

function underWritable(p, dirs) {
  const n = normPath(p);
  return p.startsWith("~") || dirs.some((d) => (n + "/").startsWith(d));
}

function who(users) {
  return users.join(", ");
}

function demote(sev) {
  return sev === "high" ? "medium" : "low";
}

function analyse({ aliases, defaults, rules }, mainName, findings, notes) {
  // Defaults that change how every rule reads. Global, host-bound and
  // user-bound settings apply in file order; the last one wins.
  const global = {};
  for (const d of defaults) {
    for (const p of d.params) {
      if (d.scope === "" || d.scope === "@") global[p.name] = p;
    }
  }
  const runasDefault = global.runas_default?.value || "root";
  const passwordPolicy = ["targetpw", "rootpw", "runaspw"].find((n) => global[n] && !global[n].negated);

  // Does a Defaults binding (a list, possibly naming aliases) match? Within a list the last
  // matching item decides, as in a runas list: "Defaults>!root,ALL" binds root, "ALL,!root" does not.
  function lastMatch(binding, table, matches) {
    let hit = false;
    for (const x of expandList(splitTop(binding, ","), table)) if (matches(unquote(x.value))) hit = !x.neg;
    return hit;
  }
  function userBound(binding, users) {
    // A binding can name a User_Alias (Defaults:ADMINS !authenticate), so expand it the way
    // the rule's own user list is expanded; a negated member excludes that user.
    const items = expandList(splitTop(binding, ","), aliases.User_Alias).map((x) => ({ ...x, value: unquote(x.value) }));
    const bound = items.filter((x) => !x.neg).map((x) => x.value);
    const excluded = items.filter((x) => x.neg).map((x) => x.value);
    return users.some((u) => !excluded.includes(u) && (bound.includes(u) || bound.includes("ALL")));
  }
  const runasBound = (binding, targets) => lastMatch(binding, aliases.Runas_Alias, (v) => v === "ALL" || targets.includes(v));
  // A command binding names paths or Cmnd_Aliases; it binds a rule's command when the path is
  // the same (sudoers(5) rejects arguments in a Defaults! binding) or the binding is ALL.
  const cmndBound = (binding, path) => lastMatch(binding, aliases.Cmnd_Alias, (v) => v === "ALL" || (path !== "ALL" && parseCommand(v).path === path));
  const authDefaults = [];
  for (const d of defaults) for (const p of d.params) if (p.name === "authenticate") authDefaults.push({ d, p });

  // Is the password check off for this rule? sudo 1.9.15 applies global, host, user and runas
  // Defaults in file order, then command Defaults (checked against real sudo: a
  // "Defaults>root authenticate" after "Defaults:daemon !authenticate" asks for a password, before
  // it does not; "Defaults!/usr/bin/id authenticate" wins over a later "Defaults>root !authenticate").
  function authOffFor(users, targets, path) {
    let off = false;
    for (const { d, p } of authDefaults) {
      if (d.scope === "" || d.scope === "@") off = p.negated;
      else if (d.scope === ":" && userBound(d.binding, users)) off = p.negated;
      else if (d.scope === ">" && runasBound(d.binding, targets)) off = p.negated;
    }
    for (const { d, p } of authDefaults) if (d.scope === "!" && cmndBound(d.binding, path)) off = p.negated;
    return off;
  }
  // Commands a Defaults!cmnd !authenticate makes passwordless inside a rule that grants ALL.
  function cmndAuthOff(users, targets) {
    const paths = new Set();
    for (const { d, p } of authDefaults) {
      if (d.scope !== "!" || !p.negated) continue;
      for (const x of expandList(splitTop(d.binding, ","), aliases.Cmnd_Alias)) {
        const c = parseCommand(unquote(x.value));
        if (!x.neg && c.path.startsWith("/") && authOffFor(users, targets, c.path)) paths.add(c.path);
      }
    }
    return [...paths];
  }

  // --- Defaults findings
  let sawSecurePath = false;
  for (const d of defaults) {
    const scope = d.scope ? ` (Defaults${d.scope}${d.binding})` : "";
    for (const p of d.params) {
      const where = [d.file, d.line];
      if (p.name === "secure_path" && !p.negated) sawSecurePath = true;
      if (p.name === "env_reset" && p.negated) {
        findings.push(finding("env-reset-off", "high", ...where,
          `!env_reset${scope} keeps the caller's whole environment, so variables such as LD_PRELOAD that are not in env_delete reach commands run as root, and every program's own config variables come with them.`,
          "Remove !env_reset; keep env_reset on (the default) and add the few variables you need to env_keep."));
      }
      if (p.name === "authenticate" && p.negated) {
        const reach = d.scope === ">"
          ? `anyone with a rule that runs commands as ${d.binding} gets those commands as ${d.binding} without a password`
          : d.scope === "!"
            ? `every user with a rule that allows ${d.binding} (an ALL rule included) runs it without a password`
            : `anyone who gets a shell as ${d.binding || "any user with a rule"} gets every command those rules allow without a password`;
        // A command binding switches the check off for those commands only: what they allow is
        // judged rule by rule (a shell escape in one of them is reported as passwordless root).
        findings.push(finding("authenticate-off", d.scope === "!" ? "medium" : "high", ...where,
          `!authenticate${scope} turns off the password check, as if every matching rule were NOPASSWD: ${reach}.`,
          "Remove !authenticate and put NOPASSWD: only on the specific commands automation needs."));
      }
      if (p.name === "setenv" && !p.negated) {
        findings.push(finding("defaults-setenv", "high", ...where,
          `setenv${scope} lets the user pass sudo -E and set variables on the command line that env_check, env_delete and env_keep would otherwise strip, so LD_PRELOAD=... sudo <any allowed command> runs their code as the target user.`,
          "Remove the setenv default; add only the variables you need to env_keep."));
      }
      if (p.name === "env_keep" || p.name === "env_check") {
        if (p.negated || p.op === "-=" || !p.value) continue;
        const vals = p.value.split(/\s+/).filter(Boolean);
        for (const v of vals) {
          const name = v.split("=")[0];
          const hit = DANGEROUS_ENV.find(([n]) => name === n || (name.endsWith("*") && n.startsWith(name.slice(0, -1))));
          if (!hit) continue;
          if (hit[0] === "PATH" && (global.secure_path && !global.secure_path.negated)) continue;
          const sev = hit[0] === "PATH" ? "medium" : ["EDITOR", "VISUAL", "SUDO_EDITOR", "PAGER", "HOME", "HOSTALIASES"].includes(hit[0]) ? "low" : "high";
          findings.push(finding("env-keep-dangerous", sev, ...where,
            `${p.name} ${p.op || "="} ${v}${scope}: ${hit[0]} ${hit[1]}, and it is kept from the caller's environment when they run a command as root.`,
            `Take ${v} out of ${p.name}. If a command needs it, set a fixed value in the command's own wrapper script owned by root.`));
        }
      }
      if (p.name === "timestamp_timeout" && !p.negated && p.value !== null && Number(p.value) < 0) {
        findings.push(finding("credential-cache-unbounded", "medium", ...where,
          `timestamp_timeout=${p.value}${scope}: a negative timeout means one password entry is remembered until reboot, so anything that later runs in the user's session can use sudo without asking.`,
          "Set a short timeout (the default is 5 minutes; 0 always asks)."));
      } else if (p.name === "timestamp_timeout" && !p.negated && p.value !== null && Number(p.value) > 60) {
        findings.push(finding("credential-cache-unbounded", "low", ...where,
          `timestamp_timeout=${p.value}${scope}: one password entry is remembered for ${p.value} minutes, a long window for anything else running as the user.`,
          "Use a short timeout (the default is 5 minutes)."));
      }
      if ((p.name === "tty_tickets" && p.negated) || (p.name === "timestamp_type" && !p.negated && (p.value || "").toLowerCase() === "global")) {
        findings.push(finding("credential-cache-shared", "low", ...where,
          `${p.negated ? "!" : ""}${p.name}${p.value ? "=" + p.value : ""}${scope}: one password entry is shared by every terminal and background job of the user, so a process in another session can use sudo without asking.`,
          "Remove it; the default timestamp_type=tty keeps one record per terminal."));
      }
      if (p.name === "use_pty" && p.negated) {
        findings.push(finding("use-pty-off", "low", ...where,
          `!use_pty${scope}: commands run on the user's own terminal, where a malicious program run under sudo can inject keystrokes into it or keep a background process attached after it exits (sudoers(5), use_pty; on by default since sudo 1.9.14).`,
          "Remove !use_pty."));
      }
      if (p.name === "visiblepw" && !p.negated) {
        findings.push(finding("visiblepw-on", "low", ...where,
          `visiblepw${scope}: sudo will prompt for a password even where it cannot turn echo off, so the password can be shown on screen or in logs (for example ssh host sudo ... without -t).`,
          "Remove visiblepw (off by default); use ssh -t, or a NOPASSWD rule for the one command automation needs."));
      }
      if (p.name === "pwfeedback" && !p.negated) {
        findings.push(finding("pwfeedback-on", "low", ...where,
          `pwfeedback${scope}: an onlooker can count the characters of the password as it is typed, and in sudo before 1.8.31 this option enabled a stack overflow (CVE-2019-18634).`,
          "Remove pwfeedback, or at least make sure sudo is 1.8.31 or later."));
      }
    }
  }
  if (mainName && !sawSecurePath) {
    findings.push(finding("secure-path-missing", "low", mainName, 1,
      "No Defaults secure_path is set, so commands named without a full path (sudo foo) are looked up in the caller's PATH, where a program they own can come first.",
      'Add Defaults secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" (the Debian and Ubuntu default).'));
  }

  // --- User specification findings
  const entries = [];
  const scoped = [];
  for (const rule of rules) {
    const userList = expandList(rule.users, aliases.User_Alias);
    const users = userList.filter((u) => !u.neg).map((u) => u.value);
    const userSpec = userList.map((u) => (u.neg ? "!" : "") + u.value);
    const allUsers = users.includes("ALL");
    for (const group of rule.groups) {
      const hostList = expandList(splitTop(group.hosts || "", ","), aliases.Host_Alias);
      const allHosts = hostList.some((h) => h.value === "ALL" && !h.neg);
      const hostSpec = hostList.map((h) => (h.neg ? "!" : "") + h.value);
      let runasText;
      let tags = {};
      const ruleEntries = [];
      for (const specText of splitTop(group.body, ",")) {
        if (!specText) continue;
        const spec = parseCmndSpec(specText);
        if (spec.runas !== undefined) runasText = spec.runas;
        for (const [k] of Object.entries(spec.tags)) { tags = { ...tags, [k]: true }; if (TAG_OPPOSITE[k]) delete tags[TAG_OPPOSITE[k]]; }
        const runas = runasInfo(runasText, aliases, runasDefault);
        const top = parseCommand(spec.cmd);
        const expanded = /^[A-Z][A-Z0-9_]*$/.test(top.path) && top.path !== "ALL"
          ? (aliases.Cmnd_Alias[top.path]
            ? expandList(aliases.Cmnd_Alias[top.path].items, aliases.Cmnd_Alias).map((x) => ({ ...parseCommand(x.value), neg: x.neg !== top.neg, via: x.via || top.path }))
            : (notes.push(`${rule.file}:${rule.line}: ${top.path} looks like a Cmnd_Alias but none of that name was found; sudo will refuse the file if it is undefined.`), []))
          : [{ ...top, digest: top.digest || spec.digest }];
        for (const c of expanded) {
          const e = { rule, users, userSpec, allUsers, hosts: group.hosts, hostSpec, allHosts, runas, tags: { ...tags }, ...c };
          const targets = runas.root ? ["root", "#0"] : (runas.users || []).filter((u) => !u.startsWith("!"));
          // root is never asked for a password by sudo, so a Defaults that switches the check off
          // changes nothing for a rule that names only root (the stock "root ALL=(ALL:ALL) ALL").
          const onlyRoot = users.length > 0 && users.every((u) => u === "root" || u === "#0");
          e.nopasswd = tags.NOPASSWD === true || (tags.PASSWD !== true && !onlyRoot && authOffFor(users, targets, c.path));
          ruleEntries.push(e);
          entries.push(e);
          // ALL with a password, but Defaults!/usr/bin/vim !authenticate: vim itself runs with none.
          if (c.path === "ALL" && !c.neg && !e.nopasswd && tags.PASSWD !== true && !onlyRoot) {
            for (const path of cmndAuthOff(users, targets)) {
              scoped.push({ ...e, path, args: null, digest: false, nopasswd: true, viaDefaults: true });
            }
          }
        }
      }
      checkRule(ruleEntries, rule, passwordPolicy, findings);
      if (scoped.length) checkRule(scoped.splice(0), rule, passwordPolicy, findings);
    }
  }

  // --- Ordering: a later rule that also matches overrides NOPASSWD.
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (!a.nopasswd || a.neg || a.tags.NOPASSWD !== true) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (b.rule === a.rule || b.neg || b.nopasswd || b.path !== "ALL") continue;
      if (!(b.allHosts || b.hosts === a.hosts)) continue;
      if (a.runas.root && !b.runas.root) continue;
      const sameUser = a.users.some((u) => b.users.includes(u));
      const groups = b.users.filter((u) => u.startsWith("%"));
      const userA = a.users.find((u) => !u.startsWith("%") && u !== "ALL" && !u.startsWith("+") && !u.startsWith("#"));
      let cond = null;
      if (b.allUsers || sameUser) cond = "";
      else if (userA && groups.length) cond = ` if ${userA} is in ${groups.join(" or ")}`;
      if (cond === null) continue;
      findings.push(finding("nopasswd-overridden", "low", a.rule.file, a.rule.line,
        `NOPASSWD on ${a.path}${a.args ? " " + a.args : ""} for ${who(a.users)} does not take effect${cond}: ${b.rule.file}:${b.rule.line} (${who(b.users)} ${b.hosts}=${b.runas.text} ALL) also matches and comes later, and sudo uses the last matching rule, which asks for a password.`,
        `Move this rule below ${b.rule.file}:${b.rule.line}, or into a file in /etc/sudoers.d, which sudo reads where the @includedir line is (by default the last line of /etc/sudoers).`));
      break;
    }
  }

  return entries;
}

function checkRule(entries, rule, passwordPolicy, allFindings) {
  const { file, line } = rule;
  let current = null;
  // Each finding remembers the entry it came from, for the root-path summary.
  const findings = { push: (f) => { Object.defineProperty(f, "entry", { value: current, enumerable: false }); allFindings.push(f); } };
  const grantsAll = entries.some((e) => !e.neg && e.path === "ALL");
  const negs = entries.filter((e) => e.neg);
  if (grantsAll && negs.length) {
    const list = negs.map((e) => "!" + e.path + (e.args ? " " + e.args : "")).join(", ");
    findings.push(finding("negated-command-bypass", "high", file, line,
      `ALL with ${list} for ${who(entries[0].users)}: subtracting commands from ALL does not hold, since the user can copy the program to another name, or run it from a shell, editor or script (sudoers(5), "Limitations of the '!' operator").`,
      "List the commands the user needs instead of ALL minus some; treat this user as full root until then."));
  }
  for (const e of entries) {
    if (e.neg) continue;
    current = e;
    const by = who(e.users);
    const target = e.runas.root ? "root" : e.runas.self ? "themselves (with another group)" : `the users in ${e.runas.text}`;
    const sevFor = (sev) => (e.runas.root ? sev : demote(sev));
    if (e.runas.self) continue;
    if (e.path === "ALL") {
      if (e.allUsers) {
        const soft = passwordPolicy ? "low" : "high";
        findings.push(finding("all-users-full-root", sevFor(soft), file, line,
          `Every user (ALL) may run any command as ${target}${passwordPolicy ? `; Defaults ${passwordPolicy} makes them type the target's password, so only people who know it get in` : ", with only their own password"}.`,
          passwordPolicy ? `Keep ${passwordPolicy} set, or name an admin group (%sudo, %wheel) instead of ALL.` : "Name an admin group (%sudo or %wheel) instead of ALL."));
      }
      if (e.nopasswd) {
        findings.push(finding("nopasswd-all", sevFor("high"), file, line,
          `${by} may run any command as ${target} without a password: whoever gets a shell or runs code as ${by} (a leaked SSH key, a web app bug, a malicious dependency) gets ${target} too.${e.tags.NOPASSWD ? "" : " The password check is off through Defaults !authenticate."}`,
          `Ask for a password (drop NOPASSWD), or give NOPASSWD only to the specific commands automation needs. Cloud images add this rule for the default user on purpose; on a shared or long-lived machine, revisit it.`));
      }
      continue;
    }
    if (e.path === "sudoedit" || e.path === "list") continue;
    const p = e.path;
    const label = `${p}${e.args !== null ? " " + e.args : ""}`;
    const pw = e.nopasswd ? " without a password" : "";
    if (!p.startsWith("/") && !p.startsWith("^")) continue;
    if (p.startsWith("/") && underWritable(p, USER_WRITABLE_DIRS) && e.digest) {
      findings.push(finding("writable-command-path", "low", file, line,
        `${by} may run ${label} as ${target}${pw} from a directory ordinary users can write to, but a digest pins its contents: an edited file is refused, not run. A user who can write there can still break the rule by replacing the file.`,
        "Move the program into a root-owned directory such as /usr/local/sbin when you can; keep the digest current when the program is updated."));
      continue;
    }
    if (p.startsWith("/") && underWritable(p, USER_WRITABLE_DIRS)) {
      findings.push(finding("writable-command-path", sevFor("high"), file, line,
        `${by} may run ${label} as ${target}${pw}, from a directory that ordinary users (often ${by}) can write to: whoever can edit or replace that file chooses what runs as ${target}.`,
        "Move the program into a root-owned directory (for example /usr/local/sbin), owned by root and not group- or world-writable, and point the rule there."));
      continue;
    }
    if (p.endsWith("/") || hasGlob(p) || p.startsWith("^")) {
      findings.push(finding("directory-or-glob-command", sevFor("high"), file, line,
        `${by} may run ${p.endsWith("/") ? "every program in" : "any program matching"} ${p} as ${target}${pw}; that includes shells, editors and interpreters if any are there now or later.`,
        "Name each program with its full path instead of a directory or pattern."));
      continue;
    }
    const base = basename(p);
    const cls = classify(base);
    const open = argsOpen(e.args);
    const scriptArg = (e.args || "").split(/\s+/).find((a) => a.startsWith("/") || a.startsWith("~"));
    if (cls === "editor") {
      findings.push(finding("shell-escape-command", sevFor("high"), file, line,
        `${by} may run ${label} as ${target}${pw}. An editor opens and writes any file (:e /etc/sudoers, :w) and starts a shell (:!sh)${e.tags.NOEXEC ? "; NOEXEC blocks the shell, not the file writes" : ""}, so this rule is ${target} access.`,
        "Use sudoedit <file> instead: it copies the file, runs the user's editor as the user, and writes the result back."));
    } else if (cls === "pager" || cls === "interactive") {
      const kind = cls === "pager" ? "A pager or man page viewer starts a shell with !sh and opens other files with :e" : `${base} has a shell escape (!sh, \\!, .shell or similar) in its interactive prompt`;
      const ne = Boolean(e.tags.NOEXEC);
      findings.push(finding("shell-escape-command", sevFor(ne ? "medium" : "high"), file, line,
        `${by} may run ${label} as ${target}${pw}. ${kind}, whatever the arguments${ne ? "; NOEXEC blocks the shell for a dynamically linked program, but reading other files still works" : ""}.`,
        cls === "pager" ? "For logs, give read access through a group (adm, systemd-journal) instead of sudo; otherwise add NOEXEC: and set SYSTEMD_PAGER= or --no-pager in a wrapper." : `Run ${base} non-interactively from a root-owned wrapper script with fixed arguments, and allow the wrapper.`));
    } else if ((cls === "shell" || cls === "interpreter" || cls === "exec") && open) {
      const what = SWITCH_USER.has(base) ? "switches to any account the arguments allow without that account's password (including accounts with sudo rights) and runs commands as it" : cls === "shell" ? "runs any command it is given" : cls === "interpreter" ? "runs any code it is given (-c, -e, a script)" : `has options that run commands or replace files (${base === "find" ? "-exec" : base === "tar" ? "--checkpoint-action" : base === "docker" || base === "podman" ? "run -v /:/host" : base === "systemctl" ? "edit, link, a unit with ExecStart" : base === "git" ? "-c core.pager, hooks" : base === "sed" ? "the e and w commands" : "options and arguments the rule leaves open"})`;
      findings.push(finding("runs-any-command", sevFor("high"), file, line,
        `${by} may run ${label} as ${target}${pw} with ${e.args === null ? "any arguments" : "arguments matched by a wildcard"}, and ${base} ${what}, so this rule is ${target} access.`,
        `Pin the arguments (sudo matches them exactly when they have no wildcard), or put the action in a root-owned wrapper script and allow only that.`));
    } else if (cls === "write" && open) {
      const effect = base === "passwd" || base === "chpasswd"
        ? `${base} can then reset another account's password (one with sudo rights, say) and the user logs in as it`
        : ACCOUNT_TOOLS.has(base)
          ? `${base} can then put an account in the sudo group or give it UID 0`
          : `${base} can then overwrite /etc/sudoers, /etc/passwd or a root-owned script`;
      findings.push(finding("writes-any-file", sevFor("high"), file, line,
        `${by} may run ${label} as ${target}${pw} with ${e.args === null ? "any arguments" : "arguments matched by a wildcard"}: ${effect}, which becomes ${target} access.`,
        "Pin the exact arguments, or use a root-owned wrapper script that writes only the one file."));
    } else if (cls === "read" && open) {
      findings.push(finding("reads-any-file", sevFor("medium"), file, line,
        `${by} may run ${label} as ${target}${pw} with ${e.args === null ? "any arguments" : "arguments matched by a wildcard"}: ${base} can then read /etc/shadow, SSH host keys and every secret on the machine.${e.args !== null ? " sudo matches arguments as one string, so * also matches spaces and ../ (sudoers(5), \"Wildcards in command arguments\")." : ""}`,
        e.args !== null ? "Pin the exact file names, or use a regular expression argument (sudo 1.9.10+) such as ^/var/log/app/[a-z0-9.-]+$." : "Pin the exact file names, or grant read access through a group instead of sudo."));
    } else if (open && e.args !== null) {
      findings.push(finding("wildcard-arguments", sevFor("medium"), file, line,
        `${label}: sudo matches arguments as one string, so the wildcard also matches spaces, extra options and ../ (sudoers(5), "Wildcards in command arguments"); ${by} can pass more than this rule seems to allow, as ${target}.`,
        "Pin the exact arguments, or use a regular expression argument (sudo 1.9.10+) that matches only the values you mean."));
    }
    if ((cls === "shell" || cls === "interpreter") && !open && scriptArg && underWritable(scriptArg, USER_WRITABLE_DIRS)) {
      findings.push(finding("writable-command-path", sevFor("high"), file, line,
        `${by} may run ${label} as ${target}${pw}; the script ${scriptArg} is in a directory ordinary users can write to, so whoever can edit it chooses what runs as ${target}.`,
        "Move the script into a root-owned directory such as /usr/local/sbin, mode 0755 owned by root, and point the rule there."));
    }
    if (e.tags.SETENV) {
      findings.push(finding("setenv-tag", sevFor("high"), file, line,
        `SETENV on ${label} for ${by}: variables set on the command line skip env_check, env_delete and env_keep, so LD_PRELOAD=... sudo ${base} loads the user's code as ${target}.`,
        "Drop SETENV; add only the variables the command needs to env_keep for it (Defaults!/path env_keep += ...)."));
    }
  }
}

// Who can become root, and through which rule.
function rootPathsFrom(findings, entries) {
  const out = [];
  for (const e of entries) {
    if (e.neg || !e.runas.root) continue;
    if (e.path === "ALL") out.push({ who: who(e.users), how: "any command (ALL)", password: !e.nopasswd, file: e.rule.file, line: e.rule.line });
  }
  const viaTypes = new Set(["shell-escape-command", "runs-any-command", "writes-any-file", "writable-command-path", "directory-or-glob-command", "setenv-tag"]);
  for (const f of findings) {
    if (!viaTypes.has(f.type) || f.severity !== "high") continue;
    const e = f.entry;
    if (!e || !e.runas.root || e.path === "ALL") continue;
    out.push({ who: who(e.users), how: `${e.path}${e.args !== null ? " " + e.args : ""} (${f.type})`, password: !e.nopasswd, file: f.file, line: f.line });
  }
  const seen = new Set();
  return out.filter((r) => { const k = `${r.who}|${r.how}|${r.file}|${r.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function scanFiles(files) {
  if (!Array.isArray(files)) throw new Error("scanFiles expects an array of { name, text }");
  const findings = [];
  const notes = [];
  const { ordered, mainName } = orderFiles(files, notes, findings);
  const parsed = parseStatements(ordered, notes);
  const entries = analyse(parsed, mainName, findings, notes);
  const order = new Map(files.map((f, i) => [f.name || "sudoers", i]));
  const rank = (sev) => (Object.hasOwn(SEVERITY_ORDER, sev) ? SEVERITY_ORDER[sev] : 3);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0) || a.line - b.line || a.type.localeCompare(b.type));
  const rootPaths = rootPathsFrom(findings, entries);
  return { findings, notes, rootPaths };
}

// The rules as sudo would read them, one entry per command after alias
// expansion: what the parity test compares with sudo's own cvtsudoers.
export function policyEntries(files) {
  const findings = [];
  const notes = [];
  const { ordered, mainName } = orderFiles(files, notes, findings);
  const entries = analyse(parseStatements(ordered, notes), mainName, [], notes);
  return {
    notes,
    entries: entries.map((e) => ({
      file: e.rule.file,
      line: e.rule.line,
      users: e.userSpec,
      hosts: e.hostSpec,
      runasUsers: e.runas.users || null,
      runasGroups: e.runas.groups || null,
      tags: Object.keys(e.tags).sort(),
      negated: e.neg,
      command: e.path + (e.args !== null ? " " + e.args : ""),
    })),
  };
}

export function hasRisk(findings) {
  return findings.some((f) => f.severity === "high" || f.severity === "medium");
}

export function summaryLine(findings) {
  if (!findings.length) return "No risky patterns found in what was pasted (not proof the policy is safe).";
  const c = { high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity]++;
  const parts = ["high", "medium", "low"].filter((s) => c[s]).map((s) => `${c[s]} ${s}`);
  return `${findings.length} finding${findings.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}
