# Pairwise database protection and recovery

Pairwise PostgreSQL data has three protection layers:

1. Terraform `prevent_destroy` guards both the primary node and Pairwise PVC.
2. The live persistent volume uses the `Retain` reclaim policy, so deleting its
   claim does not delete the underlying data.
3. `backup-pairwise-db.sh` creates a compressed logical dump every six hours.
   Server copies are kept for 30 days. Running `backup-cluster.sh` also copies a
   checksum-verified dump to `.backups/pairwise/` on the operator workstation,
   where copies are kept for 90 days.

The K3s filesystem archive is useful for whole-node recovery, but it is not a
substitute for the logical PostgreSQL dump. A filesystem archive taken while
PostgreSQL is running may only be crash-consistent.

## Verify backups

Run the end-to-end backup and off-server copy from the repository root:

```bash
platform/infrastructure/backup-cluster.sh
```

On the server, confirm the schedule and newest non-empty archive:

```bash
crontab -l | grep backup-pairwise-db
find /var/backups/pairwise -name 'pairwise_*.dump' -type f -size +0c -ls
```

Periodically restore the newest archive into a disposable database. Merely
checking that a file exists or has a valid checksum does not prove it restores.

## Restore after data loss

1. Stop Pairwise writes by scaling the web deployment to zero.
2. Preserve the damaged PVC and take a fresh dump if PostgreSQL is readable.
3. Select a checksum-verified backup from a time before the incident.
4. Run `restore-pairwise-db.sh /path/to/pairwise_TIMESTAMP.dump`.
5. Run health checks and a Pairwise read/write smoke test.
6. Scale the web deployment back to its normal minimum.

The restore script requires the operator to type a database-specific
confirmation and restores in one transaction. Never remove `prevent_destroy`
or change the PV reclaim policy as part of routine recovery.

## Remaining failure domain

The automated six-hour dumps stored on the server share its failure domain.
The workstation copy is independent but only refreshes when
`backup-cluster.sh` runs. Provider-side Hetzner backups are declared with
`backups = true`; apply that Terraform change with the production secret
variable file, then verify backups in the Hetzner console. For stronger
unattended disaster recovery, add encrypted object-storage replication and
alerting on backup age.
