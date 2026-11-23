// Deterministic generator of redis.conf cases for the parity run. Each case
// is a small tree of files under one directory; `__PORT__` is replaced by
// the runner with a free port. Same seed, same files.
import { CONFIGS } from "../redis70.mjs";

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Settings the runner cannot exercise safely or that need things it does not
// have (daemonizing, syslog, a log file, cluster bus, TLS certificates,
// cpu pinning, a process title the tool does not model).
const SKIP = new Set(["daemonize", "supervised", "logfile", "pidfile", "syslog-enabled", "syslog-ident", "syslog-facility", "cluster-enabled", "dir", "unixsocket", "aclfile", "proc-title-template", "server_cpulist", "bio_cpulist", "aof_rewrite_cpulist", "bgsave_cpulist", "tls-port", "port", "bind", "replicaof", "use-exit-on-panic", "watchdog-period", "rdb-key-save-delay", "key-load-delay", "io-threads", "oom-score-adj", "oom-score-adj-values", "disable-thp", "appendonly", "cluster-config-file", "socket-mark-id", "always-show-logo", "shutdown-on-sigint", "shutdown-on-sigterm"]);
const PICKABLE = CONFIGS.filter((c) => !SKIP.has(c.name) && !(c.tls && c.type === "string"));

const NUMS = ["0", "1", "-1", "7", "100", "007", "0x10", "", "1.5", "65535", "65536", "2147483647", "2147483648", "99999999999999999999", "10kb", "10k", "3mb", "3m", "1gb", "1g", "2GB", "5%", "150%", "-5%", "abc", "1 000", "+5", "1048576", "777", "0777", "8"];
const BOOLS = ["yes", "no", "YES", "No", "maybe", "", "1"];

export function makeCase(seed) {
  const r = rng(seed * 2654435761 + 7);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const chance = (p) => r() < p;
  const files = {};
  const lines = ["port __PORT__"];
  const n = 2 + Math.floor(r() * 6);
  const extra = {};
  for (let k = 0; k < n; k++) lines.push(line());
  if (chance(0.25)) {
    // glob includes, sometimes a file with no trailing newline
    const a = [line(), line()].join("\n"), b = [line(), line()].join("\n");
    files["inc/10-a.conf"] = a + (chance(0.7) ? "\n" : "");
    files["inc/20-b.conf"] = b + "\n";
    if (chance(0.3)) files["inc/.hidden.conf"] = "bogus-hidden yes\n";
    if (chance(0.3)) files["inc/30-c.conf.bak"] = "bogus-bak yes\n";
    lines.splice(1 + Math.floor(r() * lines.length), 0, pick(["include inc/*.conf", "include ./inc/*.conf", "include inc/[12]*.conf", "include inc/*.nomatch", "include inc/?0-a.conf"]));
  }
  if (chance(0.12)) {
    files["inc/plain.conf"] = [line(), line()].join("\n") + "\n";
    lines.splice(1 + Math.floor(r() * lines.length), 0, pick(["include inc/plain.conf", "include inc/missing.conf", "INCLUDE inc/plain.conf"]));
  }
  if (chance(0.1)) {
    files["data/rel.conf"] = line() + "\n";
    lines.push(pick(["dir data", "dir ./data", "dir missing"]), pick(["include rel.conf", "include data/rel.conf"]));
  }
  files["redis.conf"] = lines.join("\n") + (chance(0.9) ? "\n" : "");
  return { seed, files, dirs: ["data", "inc"] };

  function line() {
    const roll = r();
    if (roll < 0.30) return standard();
    if (roll < 0.40) return pick(["bind 127.0.0.1", "bind 127.0.0.1 -::1", "bind *", "bind * -::*", "bind 192.0.2.2", "bind 127.0.0.1 192.0.2.2", "bind 10.255.255.1", "bind 127.0.0.1 -10.255.255.1", 'bind ""', "bind ::1", "bind 0.0.0.0", "bind 127.0.0.1 # local only", 'bind "127.0.0.1 -::1"']);
    if (roll < 0.47) return pick(["protected-mode no", "protected-mode yes", "protected-mode no", "PROTECTED-MODE NO"]);
    if (roll < 0.55) return pick(["requirepass s3cr3t", "requirepass correct-horse-battery-staple-9f2c", 'requirepass ""', "requirepass foobared # change me", 'requirepass "with space"', "requirepass a b", "masterauth hunter2"]);
    if (roll < 0.62) return pick(["user default on nopass ~* &* +@all", "user default on >longpassword-0123456789 ~* &* +@all", "user default off", "user default on nopass ~* +@all -@dangerous", "user default on nopass ~* +@all -ping", "user app on >app-password-abcdefgh ~app:* +@read +@write", "user app on >x ~* +nosuchcmd", "user app on #0123 ~*", "user app on ~* allkeys ~foo", "user app on <notset", "user app on nopass +@all ~* (~bar +get)", "user default on nopass -@all +ping +config|get", "user app on %R~cache:* +get", "user app on +select|0", "user app on -select|0", "user app on +config|", "user default on nopass +@all ~* &* +@nosuchcat"]);
    if (roll < 0.68) return pick(["enable-protected-configs yes", "enable-protected-configs local", "enable-debug-command yes", "enable-debug-command local", "enable-module-command yes", "enable-module-command local", "enable-debug-command maybe"]);
    if (roll < 0.73) return pick(['rename-command CONFIG ""', "rename-command flushall wipe-it", "rename-command nosuch x", "rename-command get set", "rename-command DEBUG \"\"", 'rename-command config ""']);
    if (roll < 0.80) return pick(["save 60 1000", 'save ""', "save 900 1 300 10", "save 0 1", "save 60", 'save "60 100"', "save abc 1", "client-output-buffer-limit normal 0 0 0", "client-output-buffer-limit replica 256mb 64mb 60", "client-output-buffer-limit master 1 1 1", "client-output-buffer-limit pubsub 32mb 8mb -1", "client-output-buffer-limit pubsub 32mb", "notify-keyspace-events KEA", "notify-keyspace-events Ex", "notify-keyspace-events Kgz", "notify-keyspace-events Q", 'notify-keyspace-events ""', "replicaof no one", "slaveof NO ONE", "replicaof 127.0.0.1 abc", "latency-tracking-info-percentiles 50 99.9", "latency-tracking-info-percentiles 101", 'latency-tracking-info-percentiles ""', "oom-score-adj-values 0 200 800", "oom-score-adj-values 0 200", "oom-score-adj relative"]);
    if (roll < 0.83 && !extra.sock) { extra.sock = true; return pick(["unixsocket redis.sock", "unixsocket redis.sock\nunixsocketperm 777", "unixsocket redis.sock\nunixsocketperm 770", "unixsocket redis.sock\nport 0", "unixsocket redis.sock\nunixsocketperm 0777\nprotected-mode no"]); }
    if (roll < 0.86) return pick(["# a comment", "   # indented comment", "", "\t", "maxmemory 2gb\r", '"maxmemory" 100mb', "maxmemory '100mb'", "maxmemory \"100\"mb", "maxmemory \"unterminated", "maxmemory 'a'b", 'dbfilename "a\\x41.rdb"', 'dbfilename "x\\"y.rdb"', "dbfilename dir/x.rdb", "list-max-ziplist-entries 512", "lua-replicate-commands yes", "list-max-ziplist-value", "slave-read-only no", "hash-max-ziplist-entries 64", "Maxmemory-Policy ALLKEYS-LRU", "bogus-directive 1", "sentinel monitor m 127.0.0.1 6379 2", "mymodule.setting 1", "maxclients 0", "tls-port 6390", "port 0", "unixsocket redis.sock\nunixsocketperm 777", "unixsocketperm 999", "aclfile __DIR__/users.acl", "loglevel debug extra"]);
    return pick(["hz 0", "hz 1000", "hz 50", "timeout 300", "databases 0", "maxmemory-clients 10%", "maxmemory-clients 0", "unixsocketperm 700"]);
  }
  function standard() {
    const c = pick(PICKABLE);
    const name = chance(0.15) && c.alias ? c.alias : chance(0.1) ? c.name.toUpperCase() : c.name;
    let val;
    if (c.type === "bool") val = chance(0.85) ? pick(["yes", "no", "YES", "No"]) : pick(BOOLS);
    // databases at its maximum makes Redis allocate two billion databases.
    else if (c.type === "numeric") val = chance(0.8) ? pick([c.def, c.min, c.name === "databases" ? "64" : c.max, String(BigInt(c.def) + 1n)]) : pick(c.name === "databases" ? ["0", "-1", "abc", "16"] : NUMS);
    else if (c.type === "enum") val = chance(0.9) ? pick(c.values) : pick(["nope", c.values[0].toUpperCase(), ""]);
    else if (c.type === "string") val = chance(0.8) ? pick(["x", "file.name", "host-1.example"]) : pick(["a/b", "", "bad_host!"]);
    else val = c.def ?? "";
    if (c.name === "save" || c.type === "special") return `${name} ${val === "" ? '""' : val}`;
    return `${name} ${val === "" ? '""' : /\s/.test(val) ? `"${val}"` : val}`;
  }
}

// Short fingerprint of a case's files, stored in the recording so a test can
// show the recording is of the generator as it stands.
export function fingerprint(c) {
  const t = JSON.stringify(Object.entries(c.files).sort());
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}
