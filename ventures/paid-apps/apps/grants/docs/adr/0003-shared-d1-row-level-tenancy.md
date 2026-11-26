# ADR 0003: One shared D1 database with row-level tenancy

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The app is multi-tenant from day one. The first tenant is Southwest Indian Foundation, and we expect tens
to hundreds of small organizations, each with megabytes to low gigabytes of data. Tenant data is
sensitive (applications, finances, sometimes client information). Each org must be able to export all of
its data and delete it for real (DATA_POLICY.md). Some data is global: users and sessions, and the public
opportunity catalog that every org is matched against.

## Decision

All tenants share one D1 database (`DB`, `grant-autopilot`). Tenancy is enforced row by row:

- `organization` is the tenant root. Every tenant table has an org column (`org_id`; Better Auth-shaped
  `member` and `invitation` use `organization_id`; private opportunities use `private_to_org_id`). Each
  org column references `organization.id` with `ON DELETE CASCADE`.
- Global tables: `user`, `session`, `account`, `verification`, `funders`, `discovery_runs`, and
  `opportunities` rows whose `private_to_org_id` is NULL (`visibleTo(orgId)` in discovery).
- Tenant routes live under `/api/orgs/:orgId/*` behind `requireOrg()`, which checks membership and
  returns 404 to non-members so org ids cannot be probed. Writes add `requireRole(...)`.
- **Every query on a tenant table filters by `c.var.tenant.orgId`**, and lookups by id also match
  `orgId`. An `orgId` from a request body is never trusted.
- Other stores follow the same rule: R2 keys start with `orgs/{orgId}/`, and the Vectorize namespace is
  the orgId.
- `services/privacy/tenant-tables.ts` finds every table with an org column from the Drizzle schema, so
  export and deletion include new tables automatically.

## Consequences

- One schema and one migration stream. Cross-tenant operations (cron fan-out, the global LLM spend cap,
  re-scoring every org after discovery) are plain queries.
- Cheapest option: one database, no per-tenant provisioning.
- **One missing `orgId` filter leaks data.** Mitigations: `requireOrg` on the whole org router,
  `and(eq(t.id, id), eq(t.orgId, orgId))` on lookups by id, a cross-tenant test for every router
  (`test/worker/tenant.test.ts` and each module's tests), and code review.
- Every org shares one database's size limit and one writer. Heavy jobs for one org (a large crawl or
  extraction) can slow everyone. Jobs are batched (queue `max_batch_size: 5`) to keep this down.
- Deleting an org means deleting rows table by table, dependents first (`privacy/deletion.ts`). This
  works, but it is slower than dropping a database.

## Alternatives considered

- **A D1 database per tenant.** Gives physical isolation, a size limit per tenant and simple deletion.
  But Workers bind D1 databases statically in `wrangler.jsonc`, so N tenants would need N bindings or the
  D1 HTTP API. Migrations would have to run N times, and cross-tenant jobs would fan out over databases.
  Too much operational work for our tenant count.
- **A Durable Object per tenant with SQLite storage** (`idFromName(orgId)`). This is the natural per-tenant
  design on Cloudflare: one class, an embedded SQLite database per org, no per-tenant bindings, strongly
  consistent, and Drizzle supports it (`drizzle-orm/durable-sqlite`). The costs today: migrations run
  inside each object, cross-tenant queries need fan-out, and all data access goes through DO RPC. It is
  the planned upgrade path, not the default.
- **Postgres with row-level security.** RLS enforces the filter in the database. But it means leaving D1
  for a hosted Postgres reached through Hyperdrive, which adds cost and another vendor.

## Migration path (shared D1 to Durable Object SQLite, when needed)

Triggers: a large tenant is near the database size limit, one tenant's load slows others, or a customer
contract requires physical isolation.

1. **Keep the `org_id` columns.** They cost nothing in a single-tenant store and keep export, delete and
   audit code unchanged.
2. **Resolve the database per tenant in the composition root.** After `requireOrg`, `context.ts` sets
   `ctx.db` to the tenant's store: a Drizzle client over the org's Durable Object for moved orgs, the
   shared D1 for everyone else. Services already receive `ctx.db` and filter by orgId, so they don't
   change.
3. **Split the global tables.** Auth tables, `organization`/`member`/`invitation`, the public catalog,
   `discovery_runs`, billing and `llm_calls` stay in shared D1. Everything that `tenantTables()` returns
   moves.
4. **Move one org at a time.** Copy rows with the same table list the export job uses, check row counts
   and hashes, switch a per-org flag (for example an `org_settings` column), then delete the org's shared
   rows.
5. **Rewrite the cross-tenant queries as fan-out:** `followups.run_due`, `privacy.retention_sweep`,
   `enqueueRescoreAllOrgs` and the dashboard aggregates.
6. Leave R2 prefixes and Vectorize namespaces as they are. They are already per tenant.
