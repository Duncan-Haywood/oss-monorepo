// Runs the D1 → Postgres load script inside the VPC (docs/AWS.md, cutover step 4). RDS is private
// and IAM-only, and the starter has no bastion, so the owner uploads load.sql to the product
// bucket under ops/cutover/ and invokes the Lambda directly:
//   {"__scheduled": "grants-load:ops/cutover/load.sql"}
// API Gateway never produces __scheduled, so only principals with lambda:InvokeFunction (the owner,
// CI) can start it. The script is one transaction (d1-dump.ts toLoadScript); on any error it is
// rolled back. The object holds tenant data, so it is deleted after a successful load.
import type { PgPool } from "./pg-d1";

export const LOAD_PREFIX = "grants-load:";
const LOAD_KEY = /^ops\/cutover\/[A-Za-z0-9._-]+\.sql$/;

/** The bucket key in a `grants-load:<key>` schedule string, or null. */
export function loadKeyOf(expression: string): string | null {
  if (!expression.startsWith(LOAD_PREFIX)) return null;
  const key = expression.slice(LOAD_PREFIX.length);
  if (!LOAD_KEY.test(key)) throw new Error("load key must be ops/cutover/<name>.sql");
  return key;
}

/** psql meta-commands (\set ...) are not SQL; the server runs the rest as one script. */
export function stripPsqlMeta(script: string): string {
  return script
    .split("\n")
    .filter((l) => !l.startsWith("\\"))
    .join("\n");
}

export async function runLoadScript(pool: PgPool, script: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query({ text: stripPsqlMeta(script) });
  } catch (e) {
    await client.query({ text: "ROLLBACK" }).catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
