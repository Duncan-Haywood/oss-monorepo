/**
 * The connection the integration suite uses, and the one `scripts/test-db.sh`
 * creates. Defined in one place so the two cannot drift: if the script's
 * defaults change, this is the file to change with them.
 */

const HOST = "127.0.0.1";
const PORT = process.env.QP_TEST_DB_PORT ?? "5544";
const NAME = process.env.QP_TEST_DB_NAME ?? "quickpick_test";

export const TEST_DATABASE_URL = `postgresql://postgres@${HOST}:${PORT}/${NAME}?schema=public`;

/**
 * Fills in the environment the app expects, without overriding anything a
 * caller has already set — CI points these at its own service container.
 */
export function applyTestEnv(): void {
  process.env.POSTGRES_PRISMA_URL ??= TEST_DATABASE_URL;
  process.env.POSTGRES_URL_NON_POOLING ??= process.env.POSTGRES_PRISMA_URL;
  process.env.ADMIN_KEY ??= "integration-admin-key";
  process.env.ADMIN_SESSION_SECRET ??= "integration-session-secret";
  process.env.RATE_LIMIT_SECRET ??= "integration-rate-limit-secret";
}
