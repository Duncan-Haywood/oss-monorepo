# Data Policy (engineering)

How Grant Autopilot handles customer data in code. Customer-facing versions: `docs/legal/privacy.md` and
`docs/legal/data-use.md` (served at `/api/legal/*`). If you change behaviour described here, update those
documents, run `node docs/legal/sync-documents.mjs`, and bump `POLICY_VERSION` in `src/shared/legal.ts`.

## Where data lives

| Data | Store | Key / scope |
| --- | --- | --- |
| All tenant rows | D1 | `org_id` (Better Auth tables: `organization_id`; private opportunities: `private_to_org_id`), `ON DELETE CASCADE` from `organization` |
| Original uploads, extracted text, voice audio, submission packages, exports | R2 `FILES` | `orgs/{orgId}/...` only |
| Chunk embeddings | Vectorize | namespace = `orgId`, vector id = chunk id |
| Drafting / extraction prompts | Anthropic API (not used for training) | per request, nothing stored by us beyond `llm_calls` usage rows |

## Rules

- Every query on a tenant table filters by `c.var.tenant.orgId`; lookups by id also match `orgId`.
- No document contents, interview answers or PII in logs, queue messages or audit metadata.
- IPs are stored only as salted SHA-256 (`services/privacy/consents.ts#hashIp`).
- `restricted` facts never reach drafting prompts.
- Website crawling and stored voice recordings require the org-level consents `website_crawl` /
  `voice_recording`; recording a consent flips `org_settings.allowWebsiteCrawl` / `storeVoiceRecordings`.
  Revoking `autopilot_submission` turns `autopilotEnabled` off. Org-level scopes need admin+.
- Consent records and the audit log are append-only (rows disappear only with the whole org).

## Export (`POST /api/orgs/:orgId/privacy/exports`, admin+)

Job `privacy.export_org` writes `orgs/{orgId}/exports/{id}.zip`: `data/<table>.json` for **every** table with
an org column (discovered from the Drizzle schema, so new tables are included automatically),
`data/users.json` (members' name/email), `files/<path>` for every R2 object under the org prefix, `manifest.json`,
`README.txt`. Expires after 7 days (retention sweep deletes it).

## Deletion (`DELETE /api/orgs/:orgId/privacy/org`, owner, `{ confirmName }`)

Job `privacy.delete_org`: delete all R2 objects under `orgs/{orgId}/` (paginated list), delete vectors for all
chunk ids (batches of 100), delete rows table by table (dependents first, retrying around `RESTRICT` FKs), then
the `organization` row. A receipt with ids and counts only is logged and written to `audit_log` with
`org_id = NULL`. User accounts are personal and are not deleted with an org.

## Retention (`privacy.retention_sweep`, daily cron)

For orgs with `raw_file_retention_days`: delete originals of `ready` documents processed more than N days ago
(extracted text is kept; recorded in `purged_files`), delete stored voice audio older than N days
(`audio_r2_key` set to NULL, transcript kept). Expire ready exports past `expires_at`.
