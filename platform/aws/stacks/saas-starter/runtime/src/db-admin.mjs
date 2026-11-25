// db-admin: the only code that uses the RDS master password (RDS-managed, in Secrets Manager).
// Invoked by `tofu apply` (aws_lambda_invocation) whenever the product list changes, so
// databases and roles are code, not console clicks. For each product it ensures:
//   role app_<p> (LOGIN, rds_iam: IAM tokens only), database <p> owned by it,
//   the platform schema (sql/) in that database, and grants:
//     app_<p>:            read entitlements, read/write push_devices
//     entitlement_writer: write paddle_events + entitlements (the SQS consumer)
// Idempotent; never drops anything.
import pg from "pg";
import { migrate, PLATFORM_SQL } from "./migrate.mjs";

export const NAME = /^[a-z][a-z0-9_]{1,40}$/;
const ident = (s) => { if (!NAME.test(s)) throw new Error(`bad identifier: ${s}`); return `"${s}"`; };

export async function ensureProducts({ connect, products, writer = "entitlement_writer", iam = true }) {
  const admin = await connect("postgres");
  const done = [];
  try {
    for (const role of [writer, ...products.map((p) => `app_${p}`)]) {
      const r = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role]);
      if (!r.rows.length) await admin.query(`CREATE ROLE ${ident(role)} LOGIN`);
      if (iam) await admin.query(`GRANT rds_iam TO ${ident(role)}`);
    }
    for (const p of products) {
      const app = `app_${p}`;
      const r = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [p]);
      if (!r.rows.length) {
        await admin.query(`GRANT ${ident(app)} TO CURRENT_USER`);   // RDS master is not superuser
        await admin.query(`CREATE DATABASE ${ident(p)} OWNER ${ident(app)}`);
      }
      await admin.query(`REVOKE ALL ON DATABASE ${ident(p)} FROM PUBLIC`);
      await admin.query(`GRANT CONNECT ON DATABASE ${ident(p)} TO ${ident(app)}, ${ident(writer)}`);
      const db = await connect(p);
      try {
        await migrate(db, PLATFORM_SQL, { table: "platform.migrations" });
        await db.query(`GRANT USAGE ON SCHEMA platform TO ${ident(app)}, ${ident(writer)}`);
        await db.query(`GRANT SELECT ON platform.entitlements TO ${ident(app)}`);
        await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON platform.push_devices TO ${ident(app)}`);
        await db.query(`GRANT SELECT, INSERT ON platform.paddle_events TO ${ident(writer)}`);
        await db.query(`GRANT SELECT, INSERT, UPDATE ON platform.entitlements TO ${ident(writer)}`);
      } finally { await db.end(); }
      done.push(p);
    }
  } finally { await admin.end(); }
  return done;
}

// Lambda entry. Event: { "products": ["grants", ...] }. Env: DB_HOST, DB_PORT, MASTER_SECRET_ARN.
export async function handler(event) {
  const products = event?.products || [];
  for (const p of products) if (!NAME.test(p)) throw new Error(`bad product name: ${p}`);
  const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const s = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.MASTER_SECRET_ARN }));
  const { username, password } = JSON.parse(s.SecretString);
  const connect = async (database) => {
    const c = new pg.Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database, user: username, password, ssl: { rejectUnauthorized: true } });
    await c.connect();
    return c;
  };
  return { ensured: await ensureProducts({ connect, products }) };
}
