// Generates pg_hba.conf test cases for the parity run. Deterministic: the
// same seed always gives the same files.
//
// Two kinds of case:
//   parse: a main file (and sometimes include / @ files) full of odd but
//          plausible lines, valid and invalid, compared with the
//          pg_hba_file_rules view row by row;
//   match: a file of valid rules over a small universe of users, groups,
//          databases and loopback addresses, compared with real connections.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const chance = (r, p) => r() < p;

const TYPES = ["local", "host", "hostssl", "hostnossl", "hostgssenc", "hostnogssenc"];
const DBS = ["all", "sameuser", "samerole", "samegroup", "replication", "appdb", "postgres", "staff", '"all"', '"app db"', "/^app", "/db$", "/^(app|staff)db$", "/[", "+staff"];
const USERS = ["all", "alice", "bob", "postgres", "+staff", "+nosuch", '"+staff"', '"all"', "/^a", "/b$", "/^(alice|bob)$", "/(", "Alice"];
const ADDRS = ["127.0.0.1/32", "127.0.0.0/8", "::1/128", "0.0.0.0/0", "::/0", "all", "samehost", "samenet", "10.0.0.0/8", "192.168.1.5/24", "10.1/8", "010.0.0.1/32", "0x7f.1/32", "127.1", "300.1.1.1", "10.0.0.256/24", "db.example.com", ".example.com", "host.example.com/24", "127.0.0.1/33", "::1/129", "127.0.0.1/+8", "127.0.0.1/08", "127.0.0.1/x", '"all"', '"samehost"', "fe80::1/64", "::ffff:127.0.0.1/128", "2001:db8::/32", "1:2:3:4:5:6:7:8/64"];
const MASKS = ["255.255.255.255", "255.0.0.0", "255.255.0.255", "ffff:ffff::", "garbage", "0.0.0.0"];
const METHODS = ["trust", "reject", "scram-sha-256", "md5", "password", "peer", "ident", "gss", "sspi", "pam", "bsd", "ldap", "radius", "cert", "Trust", "scram"];
const OPTS = ["map=m1", "clientcert=verify-ca", "clientcert=verify-full", "clientcert=1", "clientname=CN", "clientname=xx", "pamservice=postgresql", "pam_use_hostname=1", "ldapserver=ldap.example.com", "ldapbasedn=dc=example,dc=com", "ldapprefix=cn=", "ldapsuffix=,dc=example", "ldapport=389", "ldapport=abc", "ldaptls=1", "ldapbinddn=cn=svc", "ldapbindpasswd=s3cret", "ldapsearchattribute=uid", "ldapsearchfilter=(uid=$username)", "krb_realm=EXAMPLE.COM", "include_realm=0", "radiusservers=127.0.0.1", "radiussecrets=abc", "radiussecrets=a,b", "radiusports=1812", "nosuchopt=1", "justaword"];

function ruleLine(r) {
  const type = chance(r, 0.03) ? pick(r, ["lokal", "hosts", "host,local"]) : pick(r, TYPES);
  const parts = [type];
  const list = (pool) => {
    const n = chance(r, 0.25) ? 2 : 1;
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(pick(r, pool));
    return xs.join(chance(r, 0.2) ? ", " : ",");
  };
  parts.push(list(DBS));
  parts.push(list(USERS));
  if (!type.startsWith("lo")) {
    if (chance(r, 0.03)) return parts.join(" ");
    const addr = pick(r, ADDRS);
    parts.push(addr);
    if (!addr.includes("/") && /^[0-9a-fx.:]+$/.test(addr) && chance(r, 0.8)) parts.push(pick(r, MASKS));
  }
  if (chance(r, 0.03)) return parts.join(" ");
  parts.push(pick(r, METHODS));
  const nopt = chance(r, 0.35) ? 1 + Math.floor(r() * 3) : 0;
  for (let i = 0; i < nopt; i++) parts.push(pick(r, OPTS));
  let line = parts.join(chance(r, 0.2) ? "\t" : "  ");
  if (chance(r, 0.1)) line += "   # trailing comment";
  if (chance(r, 0.05)) line = line.replace("  ", " \\\n    ");
  return line;
}

export function parseCase(seed) {
  const r = rng(seed);
  const files = { "pg_hba.conf": [] };
  const n = 3 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.06) files["pg_hba.conf"].push("# a comment line");
    else if (k < 0.09) files["pg_hba.conf"].push("");
    else if (k < 0.13) {
      files["conf.d/10-app.conf"] ||= [];
      files["conf.d/10-app.conf"].push(ruleLine(r));
      if (!files["pg_hba.conf"].includes("include_dir conf.d")) files["pg_hba.conf"].push("include_dir conf.d");
      if (chance(r, 0.3)) files["conf.d/old.conf.bak"] = [ruleLine(r)];
    } else if (k < 0.16) {
      files["extra.conf"] = [ruleLine(r), ruleLine(r)];
      files["pg_hba.conf"].push(pick(r, ["include extra.conf", "include_if_exists extra.conf", "include missing.conf", "include_if_exists missing.conf"]));
    } else if (k < 0.2) {
      files["users.txt"] = ["alice, bob", "# staff", "carol"];
      files["pg_hba.conf"].push(`host all ${pick(r, ["@users.txt", "\"@users.txt\"", "@nosuch.txt", "alice,@users.txt"])} 127.0.0.1/32 scram-sha-256`);
    } else files["pg_hba.conf"].push(ruleLine(r));
  }
  if (!files["pg_hba.conf"].some((l) => l && !l.startsWith("#"))) files["pg_hba.conf"].push("local all all peer");
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.join("\n") + "\n"]));
}

// Rules for the match run: all valid, methods whose outcome a connection
// shows (scram-sha-256, md5 and password log the line that authenticated;
// reject has its own error), over the IPv4 loopback (the recorded run's container had no IPv6).
const M_DBS = ["all", "sameuser", "samerole", "replication", "appdb", "postgres", "staff", "/^app", "/^(app|staff)", "\"all\""];
const M_USERS = ["all", "alice", "bob", "postgres", "+staff", "/^a", "/b$", "\"all\""];
const M_ADDRS = ["127.0.0.1/32", "127.0.0.0/8", "::1/128", "0.0.0.0/0", "::/0", "all", "samehost", "samenet", "10.0.0.0/8", "127.0.0.2/32", "127.1/32", "::ffff:127.0.0.1/128", "127.0.0.1 255.255.255.255", "127.0.0.9 255.0.0.0"];
const M_TYPES = ["local", "host", "hostssl", "hostnossl", "hostnogssenc", "hostgssenc"];
const M_METHODS = ["scram-sha-256", "scram-sha-256", "md5", "password", "reject"];

export function matchCase(seed) {
  const r = rng(seed);
  const lines = [];
  const n = 2 + Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const t = pick(r, M_TYPES);
    const list = (pool) => (chance(r, 0.25) ? `${pick(r, pool)},${pick(r, pool)}` : pick(r, pool));
    const parts = [t, list(M_DBS), list(M_USERS)];
    if (t !== "local") parts.push(pick(r, M_ADDRS));
    parts.push(pick(r, M_METHODS));
    lines.push(parts.join(" "));
  }
  return { "pg_hba.conf": lines.join("\n") + "\n" };
}

export const MATCH_CONNECTIONS = (() => {
  const out = [];
  const nets = [
    { type: "local" },
    { type: "host", address: "127.0.0.1" },
    { type: "host", address: "127.0.0.1", ssl: true },
  ];
  for (const net of nets) for (const user of ["alice", "bob", "postgres"]) for (const db of ["appdb", "staff", "postgres", "<replication>"]) {
    out.push({ ...net, user, database: db === "<replication>" ? "postgres" : db, ...(db === "<replication>" ? { replication: "physical" } : {}) });
  }
  return out;
})();

export const ROLES = { alice: { memberOf: ["staff"] }, bob: {}, postgres: { superuser: true }, staff: {} };
