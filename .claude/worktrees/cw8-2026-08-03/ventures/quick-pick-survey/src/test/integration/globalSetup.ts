import { PrismaClient } from "@prisma/client";
import { applyTestEnv, TEST_DATABASE_URL } from "./env";

/**
 * Fails the run with an instruction rather than 40 identical connection
 * errors. The most common reason this suite fails is that nobody started the
 * database, and that should take one line to find out.
 */
export default async function setup() {
  applyTestEnv();

  const prisma = new PrismaClient();
  try {
    const surveys = await prisma.survey.count();
    if (surveys === 0) {
      throw new Error(
        `Connected to ${process.env.POSTGRES_PRISMA_URL} but it has no surveys.\n` +
          `Run: npx prisma db seed`
      );
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Integration tests need a database.\n\n` +
        `  scripts/test-db.sh start\n\n` +
        `That creates, migrates and seeds ${TEST_DATABASE_URL}. Point the suite\n` +
        `somewhere else by setting POSTGRES_PRISMA_URL. Underlying error:\n\n${detail}`
    );
  } finally {
    await prisma.$disconnect();
  }
}
