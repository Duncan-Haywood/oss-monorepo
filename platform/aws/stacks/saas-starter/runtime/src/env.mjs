// Builds the `env` a product's fetch() receives. Names mirror Workers bindings where one exists.
//   env.DB           D1-shaped Postgres (src/d1.mjs)          env.pg        the raw pg Pool
//   env.BUCKET       R2-shaped S3 bucket (src/r2.mjs)         env.user      verified Cognito claims or null
//   env.entitlement()  { entitled, status, plan, ... } for env.user in this product
//   env.push         { register(platform, token), send(userSub, message) } (SNS mobile push)
//   env.secret(name) a Secrets Manager value, cached per container (name must be granted to the app)
//   env.VARS         plain JSON config from the module's `vars` (no secrets)
import { getPool } from "./pg.mjs";
import { D1Shim } from "./d1.mjs";
import { claimsOf } from "./adapter.mjs";
import { entitlementFor } from "./entitlements.mjs";
import { makePush } from "./push.mjs";

const secretCache = new Map();
let s3, sm, sns;

export async function makeEnv(event, deps = {}, procEnv = process.env) {
  const pool = deps.pool || (await getPool(procEnv));
  const product = procEnv.PRODUCT;
  const user = claimsOf(event);
  const env = {
    PRODUCT: product,
    VARS: JSON.parse(procEnv.APP_VARS || "{}"),
    pg: pool,
    DB: new D1Shim(pool),
    user,
    entitlement: () => entitlementFor(pool, product, user?.sub),
    async secret(name) {
      if (!secretCache.has(name)) {
        if (!sm) { const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager"); sm = deps.secretsManager || new SecretsManagerClient({}); }
        const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
        const r = await sm.send(new GetSecretValueCommand({ SecretId: name }));
        secretCache.set(name, r.SecretString);
      }
      return secretCache.get(name);
    },
  };
  if (procEnv.BUCKET_NAME) {
    const { R2Shim } = await import("./r2.mjs");
    if (!s3) { const { S3Client } = await import("@aws-sdk/client-s3"); s3 = deps.s3 || new S3Client({}); }
    env.BUCKET = new R2Shim(deps.s3 || s3, procEnv.BUCKET_NAME);
  }
  if (procEnv.PUSH_PLATFORM_APPS) {
    if (!sns && !deps.sns) { const { SNSClient } = await import("@aws-sdk/client-sns"); sns = new SNSClient({}); }
    env.push = makePush({ pool, sns: deps.sns || sns, platformApps: JSON.parse(procEnv.PUSH_PLATFORM_APPS), userSub: user?.sub });
  }
  return env;
}
