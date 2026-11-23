# Fixtures

`ubuntu-24.04-redis7/redis.conf` is `/etc/redis/redis.conf` as Ubuntu 24.04
installs it (package redis-server 5:7.0.15-1ubuntu0.24.04.5), copied
unchanged. It is Redis's own example `redis.conf` with Ubuntu's edits, and is
distributed under the BSD 3-Clause licence (copyright Salvatore Sanfilippo
and the Redis contributors). The tests check the tool reads every line of it,
reports nothing, and agrees that it starts.
