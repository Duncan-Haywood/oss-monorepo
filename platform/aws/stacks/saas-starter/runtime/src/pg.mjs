// pg Pools, one per (database, user) per Lambda container. In AWS a pool signs in with a
// 15-minute IAM token (rds-db:connect, no stored password) over TLS verified against the RDS CA
// bundle the Node.js Lambda runtime ships (NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem, set by
// the module). Locally and in tests DATABASE_URL wins (its database name is swapped per product).
import pg from "pg";

const pools = new Map();

export async function getPool(env = process.env, { database = env.DB_NAME, user = env.DB_USER, password } = {}) {
  const key = `${env.DATABASE_URL || env.DB_HOST}|${database}|${user}`;
  if (pools.has(key)) return pools.get(key);
  let pool;
  if (env.DATABASE_URL) {
    const u = new URL(env.DATABASE_URL);
    if (database) u.pathname = `/${database}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 2 });
  } else {
    let pw = password;
    if (!pw) {
      const { Signer } = await import("@aws-sdk/rds-signer");
      const signer = new Signer({ hostname: env.DB_HOST, port: Number(env.DB_PORT || 5432), username: user, region: env.AWS_REGION });
      pw = () => signer.getAuthToken();
    }
    pool = new pg.Pool({
      host: env.DB_HOST, port: Number(env.DB_PORT || 5432), database, user, password: pw,
      ssl: { rejectUnauthorized: true },
      max: Number(env.DB_POOL_MAX || 2),     // one request per container: keep RDS connections low
      idleTimeoutMillis: 60_000,
    });
  }
  pools.set(key, pool);
  return pool;
}

export async function closePools() { const all = [...pools.values()]; pools.clear(); await Promise.all(all.map((p) => p.end())); }
