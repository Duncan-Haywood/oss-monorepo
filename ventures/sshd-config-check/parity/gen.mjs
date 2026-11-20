// Seeded generator of sshd_config trees for the parity run against real sshd.
// Each case is a main /etc/ssh/sshd_config, zero to three drop-ins under
// /etc/ssh/sshd_config.d/, and a few connections (user, host, addresses,
// port) to evaluate Match blocks for. The generator leans on the corners the
// engine claims to follow: first value wins, Include order, Match inside and
// around included files, keyword aliases, `=` and quoting, value case,
// comments, negated and CIDR patterns, and lines that stop sshd starting.

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (xs) => xs[int(xs.length)];
  const chance = (p) => next() < p;
  return { next, int, pick, chance };
}

// Keywords compared with sshd -T, with the values the generator writes.
// Names include the aliases servconf.c accepts.
export const COMPARED = {
  permitrootlogin: { names: ["PermitRootLogin"], values: ["yes", "no", "prohibit-password", "without-password", "forced-commands-only"], match: true },
  passwordauthentication: { names: ["PasswordAuthentication"], values: ["yes", "no"], match: true },
  kbdinteractiveauthentication: { names: ["KbdInteractiveAuthentication", "ChallengeResponseAuthentication"], values: ["yes", "no"], match: true },
  permitemptypasswords: { names: ["PermitEmptyPasswords"], values: ["yes", "no"], match: true },
  usepam: { names: ["UsePAM"], values: ["yes", "no"], match: false },
  pubkeyauthentication: { names: ["PubkeyAuthentication"], values: ["yes", "no"], match: true },
  x11forwarding: { names: ["X11Forwarding"], values: ["yes", "no"], match: true },
  permituserenvironment: { names: ["PermitUserEnvironment"], values: ["yes", "no", "LANG,LC_*", "LD_PRELOAD"], match: false, exactCase: true },
  strictmodes: { names: ["StrictModes"], values: ["yes", "no"], match: false },
  ignorerhosts: { names: ["IgnoreRhosts"], values: ["yes", "no", "shosts-only"], match: true },
  hostbasedauthentication: { names: ["HostbasedAuthentication"], values: ["yes", "no"], match: true },
  gatewayports: { names: ["GatewayPorts"], values: ["yes", "no", "clientspecified"], match: true },
  permittunnel: { names: ["PermitTunnel"], values: ["yes", "no", "point-to-point", "ethernet"], match: true },
  allowtcpforwarding: { names: ["AllowTcpForwarding"], values: ["yes", "no", "all", "local", "remote"], match: true },
  allowagentforwarding: { names: ["AllowAgentForwarding"], values: ["yes", "no"], match: true },
  maxauthtries: { names: ["MaxAuthTries"], values: ["3", "6", "20", "011"], match: true, numeric: true },
  logingracetime: { names: ["LoginGraceTime"], values: ["0", "30", "120", "0s", "1m", "2m30s", "1h", "90S", "00"], match: false, numeric: true },
};

const USERS = ["alice", "bob", "deploy", "Deploy", "sftpuser"];
const HOSTS = ["laptop.example.org", "build.internal", "Gateway.Example.Org"];
const ADDRS = ["10.1.2.3", "10.20.0.7", "192.168.1.50", "203.0.113.9"];
const LADDRS = ["10.0.0.1", "172.16.5.5"];
const PORTS = ["22", "2222"];

function caseOf(r, s) {
  const k = r.int(4);
  if (k === 0) return s.toLowerCase();
  if (k === 1) return s.toUpperCase();
  return s;
}

function quoteOf(r, v) {
  if (!r.chance(0.12)) return v;
  return r.chance(0.5) ? `"${v}"` : `'${v}'`;
}

function settingLine(r, { inMatch }) {
  const keys = Object.keys(COMPARED).filter((k) => !inMatch || COMPARED[k].match || r.chance(0.04));
  const k = r.pick(keys);
  const c = COMPARED[k];
  let v = r.pick(c.values);
  if (!c.exactCase && !c.numeric && r.chance(0.3)) v = caseOf(r, v);
  if (c.exactCase && r.chance(0.15)) v = v[0].toUpperCase() + v.slice(1); // "Yes" is a pattern list
  const name = r.chance(0.25) ? caseOf(r, r.pick(c.names)) : r.pick(c.names);
  const sep = r.chance(0.15) ? (r.chance(0.5) ? "=" : " = ") : r.pick([" ", "\t", "  "]);
  const tail = r.chance(0.08) ? " # trailing comment" : "";
  return `${name}${sep}${quoteOf(r, v)}${tail}`;
}

function listLine(r) {
  const n = 1 + r.int(2);
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(r.pick(USERS.concat(["*", "b*", "?lice"])));
  return `${r.pick(["AllowUsers", "DenyUsers"])} ${xs.join(" ")}`;
}

function pattern(r, pool, extra) {
  const n = 1 + r.int(3);
  const xs = [];
  for (let i = 0; i < n; i++) {
    let p = r.chance(0.6) ? r.pick(pool) : r.pick(extra);
    if (r.chance(0.18)) p = "!" + p;
    xs.push(p);
  }
  return xs.join(",");
}

function matchLine(r) {
  if (r.chance(0.1)) return "Match all";
  const crit = [];
  const n = 1 + r.int(2);
  const attrs = ["User", "Address", "Host", "LocalPort", "LocalAddress", "Group"];
  for (let i = 0; i < n; i++) {
    const a = r.pick(attrs);
    let v;
    switch (a) {
      case "User": v = pattern(r, USERS, ["*", "b*", "dep*", "?lice", "DEPLOY"]); break;
      case "Address": v = pattern(r, ADDRS, ["10.0.0.0/8", "10.1.2.0/24", "192.168.*", "*", "10.20.0.7/32", "0.0.0.0/0", "10.1.2.3/24"]); break;
      case "Host": v = pattern(r, HOSTS, ["*.example.org", "*.EXAMPLE.ORG", "build.*", "*"]); break;
      case "LocalPort": v = r.pick(PORTS); break;
      case "LocalAddress": v = pattern(r, LADDRS, ["10.0.0.0/8", "172.16.*"]); break;
      case "Group": v = r.pick(["sftp", "admin,!wheel", "*"]); break;
    }
    crit.push(`${r.chance(0.2) ? caseOf(r, a) : a} ${v}`);
  }
  return `Match ${crit.join(" ")}`;
}

// A line sshd refuses: each kind the engine says it catches.
function brokenLine(r, { inMatch }) {
  const kinds = [
    () => "PermitRootLogn no",
    () => "PasswordAuthentication maybe",
    () => "PermitRootLogin",
    () => 'PermitRootLogin "no',
    () => "Match all User bob",
    () => "Match Colour blue",
    () => "Match User",
    () => "PasswordAuthentication no yes",
    () => "MaxAuthTries abc",
    () => "LoginGraceTime 2x",
    () => "MaxAuthTries 4 5",
  ];
  if (inMatch) kinds.push(() => "UsePAM yes", () => "StrictModes no", () => "LoginGraceTime 30");
  return r.pick(kinds)();
}

function body(r, n, { inMatch, broken }) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const ind = inMatch && r.chance(0.8) ? "  " : "";
    if (r.chance(0.07)) { lines.push(`${ind}# ${r.pick(["PasswordAuthentication no", "a comment", ""])}`); continue; }
    if (r.chance(0.04)) { lines.push(""); continue; }
    if (broken && r.chance(0.08)) { lines.push(ind + brokenLine(r, { inMatch })); continue; }
    if (r.chance(0.08)) { lines.push(ind + listLine(r)); continue; }
    lines.push(ind + settingLine(r, { inMatch }));
  }
  return lines;
}

// A file: settings, then maybe Match blocks with bodies.
function fileText(r, { includes, broken }) {
  const out = [];
  if (includes.length && r.chance(0.7)) out.push(...includes.splice(0));
  out.push(...body(r, 1 + r.int(5), { inMatch: false, broken }));
  if (includes.length && r.chance(0.6)) out.push(...includes.splice(0));
  const blocks = r.chance(0.6) ? 1 + r.int(3) : 0;
  for (let b = 0; b < blocks; b++) {
    out.push(matchLine(r));
    out.push(...body(r, 1 + r.int(4), { inMatch: true, broken }));
    if (includes.length && r.chance(0.3)) out.push("  " + includes.splice(0).join("\n  "));
  }
  if (includes.length) out.push(...includes.splice(0));
  return out.join("\n") + "\n";
}

export function genCase(seed) {
  const r = rng(seed);
  const broken = r.chance(0.25);
  const files = [];
  const nDrop = r.int(4);
  const names = ["00-first.conf", "10-hardening.conf", "50-cloud-init.conf", "60-extra.conf", "hardening", "99-z.conf", "Z.conf", "a.conf"];
  const chosen = [];
  while (chosen.length < nDrop) { const n = r.pick(names); if (!chosen.includes(n)) chosen.push(n); }
  let nested = false;
  for (const n of chosen) {
    const inc = !nested && r.chance(0.25) ? ["Include sshd_config.d/sub/*.conf"] : [];
    if (inc.length) nested = true;
    files.push({ name: `/etc/ssh/sshd_config.d/${n}`, text: fileText(r, { includes: inc, broken }) });
  }
  if (nested) files.push({ name: "/etc/ssh/sshd_config.d/sub/10-inner.conf", text: fileText(r, { includes: [], broken }) });
  const inc = [];
  if (nDrop || r.chance(0.5)) {
    const form = r.pick([
      "Include /etc/ssh/sshd_config.d/*.conf",
      "Include sshd_config.d/*.conf",
      "include /etc/ssh/sshd_config.d/*",
      "Include /etc/ssh/sshd_config.d/0*.conf /etc/ssh/sshd_config.d/[5-9]*.conf",
    ]);
    inc.push(form);
  }
  files.unshift({ name: "/etc/ssh/sshd_config", text: fileText(r, { includes: inc, broken }) });
  const conns = [];
  const nc = 3;
  for (let i = 0; i < nc; i++) conns.push({ user: r.pick(USERS), host: r.pick(HOSTS), addr: r.pick(ADDRS), laddr: r.pick(LADDRS), lport: r.pick(PORTS) });
  return { seed, files, conns };
}
