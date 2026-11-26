# ADR 0008: Better Auth for identity, our own org, member and invitation tables

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

We need email and password sign-in and Google OAuth, secure sessions, and rate limiting on
authentication endpoints, all running inside the Worker with data in D1. Tenancy (ADR 0003) needs an
`organization` row that every tenant table cascades from, a five-level role model (`owner` > `admin` >
`editor` > `reviewer` > `viewer`), and rules like "only owners can grant owner" and "the last owner can't
be removed". Every row has to be covered by org export and deletion. Identity is a commodity. Tenancy
is core to the product and to its liability.

## Decision

- **Better Auth** (`better-auth/minimal` with the Drizzle adapter, `services/auth/auth.ts`) handles
  identity and sessions only. It owns the tables `user`, `session`, `account` and `verification`, and is
  mounted at `/api/auth/*`. Passwords use PBKDF2-SHA256 through WebCrypto (`services/auth/password.ts`),
  because the default scrypt can go over the Workers CPU budget. Cookies are HttpOnly and SameSite=Lax.
  Secure cookies and rate limits apply whenever the app is served over HTTPS (`isHardened`).
- **Orgs, members and invitations are our own tables and code.** `organization`, `member` and
  `invitation` in `db/schema/auth.ts` are shaped like Better Auth's organization plugin but are written
  by us (`services/auth/members.ts`, `services/orgs`). Better Auth's organization plugin is **not**
  used. Membership is checked by `requireOrg()` and roles by `requireRole()`
  (`middleware/tenant.ts`, ranks in `shared/enums.ts#ROLE_RANK`).
- Invitations are emailed links, valid for 7 days (`INVITATION_TTL_MS`). Only a signed-in user with the
  invited email address can accept one, through `POST /api/me/invitations/:id/accept`. The SPA page is
  `/invite/$invitationId`.

## Consequences

- We control the tenant root, its foreign keys and cascades, its audit entries (`audit()` on every
  membership change) and its export and deletion coverage. There is no plugin schema to work around.
- We maintain the invitation flow and the role rules ourselves, with their tests
  (`test/worker/auth-members.test.ts`).
- In the Better Auth tables, JavaScript property names must match Better Auth's field names. Upgrades
  can change what Better Auth expects from the schema, so check its migration notes when you upgrade.
- Users are personal and exist outside any org. Deleting an org never deletes user accounts.

## Alternatives considered

- **Better Auth's organization plugin.** Less code, but the plugin would own the tenant root's shape,
  role names and cascade behaviour. That doesn't fit our five roles, our 404-not-403 rule or our
  export and deletion code.
- **A hosted identity provider** (Clerk, Auth0, WorkOS). Polished, but it adds a cost per active user
  (which hurts cost-plus pricing), puts personal data with another vendor, and makes the auth path
  depend on an external network call.
- **Cloudflare Access.** Built for staff or zero-trust access, not for customer sign-up.
- **Writing our own auth.** Sessions, OAuth and password handling are easy to get wrong.
