// The owner's daily digest: sign-ups, trials started and cancellations in the 24 hours before
// today 00:00 UTC, across every product, plus current MRR. Off unless DIGEST_ENABLED=on, a sender
// is configured (EMAIL + EMAIL_FROM) and PLATFORM_ADMIN_EMAILS names someone (ownerRecipients).
import {
  type AdminAccountDto,
  type AdminSignupDto,
  addMoney,
  type DigestProduct,
  dailyDigestEmail,
  type MoneyByCurrency,
  type OwnerEmail,
} from "../../../packages/admin-metrics/src/index.ts";
import type { ProductConfig } from "./config.ts";
import type { ProductClient } from "./products.ts";

const DAY_MS = 86_400_000;

export function digestWindow(now: Date): { from: Date; to: Date; day: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from: new Date(to.getTime() - DAY_MS), to, day: to.toISOString().slice(0, 10) };
}

const within = (iso: string | null, from: Date, to: Date) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= from.getTime() && t < to.getTime();
};

export async function buildDigest(
  products: { config: ProductConfig; client: ProductClient }[],
  now: Date,
): Promise<OwnerEmail> {
  const { from, to, day } = digestWindow(now);
  let mrr: MoneyByCurrency[] = [];
  const out: DigestProduct[] = await Promise.all(
    products.map(async ({ config, client }): Promise<DigestProduct> => {
      const fail = (error: string): DigestProduct => ({
        productName: config.name,
        ok: false,
        error,
        signups: [],
        trialsStarted: [],
        cancellations: [],
      });
      if (config.kind === "early_access") {
        const recent = await client.accounts("recent", 200);
        if (!recent.ok) return fail(recent.error);
        const items = recent.data.items as AdminSignupDto[];
        return {
          productName: config.name,
          ok: true,
          signups: items.filter((s) => within(s.createdAt, from, to)),
          trialsStarted: [],
          cancellations: [],
        };
      }
      const [metrics, recent, trials, churn] = await Promise.all([
        client.metrics(1),
        client.accounts("recent", 200),
        client.accounts("trials", 200),
        client.accounts("churn", 200),
      ]);
      const bad = [metrics, recent, trials, churn].find((r) => !r.ok);
      if (bad && !bad.ok) return fail(bad.error);
      if (metrics.ok && metrics.data.kind === "app")
        mrr = addMoney(mrr, metrics.data.mrr.byCurrency);
      const acc = (r: typeof recent) => (r.ok ? (r.data.items as AdminAccountDto[]) : []);
      return {
        productName: config.name,
        ok: true,
        signups: acc(recent).filter((a) => within(a.createdAt, from, to)),
        trialsStarted: acc(trials).filter((a) => within(a.trialStartedAt, from, to)),
        cancellations: acc(churn).filter((a) => within(a.canceledAt, from, to)),
      };
    }),
  );
  return dailyDigestEmail({ day, products: out, mrr });
}
