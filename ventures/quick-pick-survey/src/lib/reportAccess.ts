// Decides whether the paid branded results report may be served. Pure and injectable so
// the route stays thin. While CHECKOUT_URL is empty the report does not exist (404) and
// nothing about it is offered; the ranking, its intervals and the CSV are free either way.
import { buyLink, checkLicence } from "./licence";

export type Gate = { ok: true } | { ok: false; status: 402 | 403 | 404; error: string };

export async function reportGate(
  key: string | null | undefined,
  o: { checkoutUrl: string; validateUrl: string; fetch?: typeof fetch },
): Promise<Gate> {
  if (!buyLink(o.checkoutUrl)) return { ok: false, status: 404, error: "The branded report is not on sale yet" };
  if (!key) return { ok: false, status: 402, error: "A licence key is needed for the branded report" };
  const r = await checkLicence(key, { fetch: o.fetch, url: o.validateUrl });
  return r.valid ? { ok: true } : { ok: false, status: 403, error: r.reason };
}
