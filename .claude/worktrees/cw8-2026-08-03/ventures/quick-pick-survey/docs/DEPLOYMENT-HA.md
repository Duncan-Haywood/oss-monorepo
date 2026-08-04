# High Availability (2-Node) Deployment Guide

This document describes the high-availability (HA) architecture for **Quick Pick**, specifically optimized for running on **two small cloud nodes** (e.g. AWS `t4g.small` or GCP `e2-small` instances with 2 vCPUs and 2GiB RAM each).

---

## 1. Architectural Overview

```
                          [ Internet / Users ]
                                   │
                                   ▼
                  [ Ingress / Load Balancer (Nginx) ]
                       /                       \
                      /                         \
             [ App Node 1 ]               [ App Node 2 ]
          (Pod 1: 250m CPU)           (Pod 2: 250m CPU)
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                    [ Postgres Database + Pooler ]
                       (Prisma Connection Pool)
```

---

## 2. High Availability Guarantees

### Dual-Node Pod Anti-Affinity
The Kubernetes deployment defines `podAntiAffinity` targeting `kubernetes.io/hostname`. This guarantees that Kubernetes places the two application replicas on **distinct physical/virtual nodes**. If one node crashes, hardware fails, or undergoes OS patching:
- The second node continues serving 100% of user traffic without interruption.
- Traffic fails over automatically via the ingress controller in <100ms.

### Zero-Downtime Rolling Updates
The deployment uses `strategy: RollingUpdate` with `maxSurge: 1` and `maxUnavailable: 0`.
During deployments:
1. A 3rd pod is started on the node with remaining capacity.
2. The readiness probe (`/api/health/ready`) verifies health before traffic is routed.
3. The old pod is terminated cleanly.

### PodDisruptionBudget (PDB)
The `quick-pick-survey-pdb` resource defines `minAvailable: 1`. This prevents cluster auto-scaler or node drains from taking down both pods simultaneously.

---

## 3. Database Connection Pooling

With 2 app nodes making concurrent requests:
1. `POSTGRES_PRISMA_URL` uses PgBouncer connection pooling (`pgBouncer=true`).
2. `POSTGRES_URL_NON_POOLING` is used exclusively for Prisma schema migrations (`npx prisma migrate deploy`).
3. App instances run stateless — user authentication relies on SHA-256 session token hashes in PostgreSQL (`UserSession`), allowing any node to service any request transparently.

---

## 4. Local HA Validation

To test the dual-node load balancer setup locally:

```bash
docker compose -f docker-compose.ha.yml up --build
```

Access `http://localhost:8080` — Nginx load balances requests between `app-node-1` and `app-node-2` with round-robin health checking and automated failover.
