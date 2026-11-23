# Parity run against redis-server 7.0.15

- `gen.mjs` makes seeded redis.conf cases (a small tree of files each);
  the same seed always gives the same files, and `fingerprint()` hashes them.
- `run-redis.mjs` starts a real `redis-server` on each case in its own
  directory, with an extra admin user appended on the command line (Redis
  appends command-line options after the file, so no line number moves), and
  records: the FATAL CONFIG FILE ERROR (line, text, message) or the last
  start-up log lines; `CONFIG GET *` read as the admin; and what an
  unauthenticated client gets from another address of the machine, from
  127.0.0.1 and over the unix socket (`PING`, `CONFIG SET dir .`,
  `DEBUG SLEEP 0`, `MODULE LOAD /nonexistent/...`). Paths are recorded under
  `/parity`.
- `compare.mjs` replays every case through the engine with the same files
  and lists each difference.
- `redis-7.0.json` is the recorded run, on Ubuntu 24.04's redis-server
  5:7.0.15-1ubuntu0.24.04.5 (no IPv6 in the machine that ran it, addresses
  127.0.0.1 and one private IPv4).

```sh
node parity/run-redis.mjs 800 <non-loopback IP of this machine> [work-dir] > parity/redis-7.0.json
node parity/compare.mjs parity/redis-7.0.json
```

The runner leaves each case's directory in the work directory for
inspection. Settings the runner cannot exercise safely (daemonize, syslog, a
log file, cluster mode, TLS certificates, CPU pinning, the process title, a
`databases` count in the billions) are left out of the generator; the
README lists what that leaves untested.
