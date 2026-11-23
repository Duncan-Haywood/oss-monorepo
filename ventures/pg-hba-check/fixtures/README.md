# Fixtures

`ubuntu-24.04-pg16/pg_hba.conf` is the file `pg_createcluster 16` writes on
Ubuntu 24.04 (package postgresql-16 16.15-0ubuntu0.24.04.1), copied unchanged.
Its comment text comes from PostgreSQL's `pg_hba.conf.sample`, which is
distributed under the PostgreSQL Licence (a permissive licence; copyright the
PostgreSQL Global Development Group and the Regents of the University of
California). The tests check the tool reports nothing on it.
