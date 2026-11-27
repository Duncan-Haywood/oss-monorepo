// Paddle notification destination as code: the deploy finds or creates the destination that sends
// billing events to `<APP_URL>/api/billing/webhook`, and hands its signing secret to the Worker as
// BILLING_WEBHOOK_SECRET. Before this, that was a dashboard step plus a pasted secret (owner,
// 2026-11-24: minimal click ops; docs/reports/2026-11-27-one-paddle-key-for-every-deploy.md, "For the
// next run", step 2).
//
// Identity is the destination URL: a destination of type "url" whose destination equals the app's
// webhook URL is ours. The sync never deletes, never removes an event the owner added by hand, and
// never touches a destination with another URL (one Paddle account serves several apps).
//
// Active follows the app's checkout switch: while BILLING_PROVIDER is not "paddle" the Worker answers
// the webhook 503, so the destination is kept inactive (no retry storms, no failure emails) and turns
// active on the first deploy with BILLING_PROVIDER=paddle. The secret exists either way, so flipping
// the switch needs nothing else.
//
// The planner is pure (planWebhookDestination); PaddleWebhookClient does the I/O with plain fetch.
// The signing secret is returned to the caller and never logged here.
import { paddleBaseUrl } from "./paddle.ts";

/**
 * The events PayApps reads. subscription.* drive the plan (services/billing.ts); transaction.completed
 * and transaction.payment_failed are recorded for the admin metrics (services/admin/metrics.ts).
 */
export const WEBHOOK_EVENTS = [
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
  "transaction.completed",
  "transaction.payment_failed",
] as const;

export const WEBHOOK_PATH = "/api/billing/webhook";

export interface PaddleNotificationSetting {
  id: string;
  description: string;
  type: string;
  destination: string;
  active: boolean;
  api_version: number;
  include_sensitive_fields: boolean;
  traffic_source?: string;
  /** Paddle answers with objects ({name, …}); a request sends names. */
  subscribed_events: ({ name: string } | string)[];
  endpoint_secret_key?: string;
}

export type WebhookAction =
  | { kind: "create"; body: Record<string, unknown> }
  | { kind: "update"; id: string; body: Record<string, unknown>; reasons: string[] }
  | { kind: "none"; id: string };

export interface WebhookWant {
  /** Short app id ("payapps"), for the description only. */
  app: string;
  /** The app's public URL, e.g. https://payapps.marisstella.app */
  appUrl: string;
  active: boolean;
  events?: readonly string[];
}

/**
 * The webhook URL for an app URL. Only https on a real host name: Paddle refuses http, and a
 * typo here would send billing events (with customer emails) to someone else's server.
 */
export function webhookUrl(appUrl: string): string {
  let u: URL;
  try {
    u = new URL(appUrl.trim());
  } catch {
    throw new Error(`app URL ${JSON.stringify(appUrl)} is not a URL`);
  }
  if (u.protocol !== "https:") throw new Error("app URL must be https");
  if (u.username || u.password || u.search || u.hash)
    throw new Error("app URL must be a bare origin (no credentials, query or fragment)");
  // A domain name with a letter-led top-level label: no IP literals, no single-label hosts.
  if (!/^([a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(u.hostname))
    throw new Error(`app URL host ${JSON.stringify(u.hostname)} is not a public host name`);
  if (u.pathname !== "/" && u.pathname !== "")
    throw new Error("app URL must have no path (the webhook path is added here)");
  return `${u.origin}${WEBHOOK_PATH}`;
}

const eventName = (e: { name: string } | string) => (typeof e === "string" ? e : e.name);

/** What to change in Paddle so one destination sends `want.events` to the app's webhook URL. */
export function planWebhookDestination(
  settings: readonly PaddleNotificationSetting[],
  want: WebhookWant,
): WebhookAction {
  const destination = webhookUrl(want.appUrl);
  const events = [...(want.events ?? WEBHOOK_EVENTS)];
  const ours = settings.filter((s) => s.type === "url" && s.destination === destination);
  // Several destinations for the same URL (one made by hand, say): prefer an active one, then the
  // oldest listed. The others are left as they are; the log names them.
  const current = ours.find((s) => s.active) ?? ours[0];
  if (!current) {
    return {
      kind: "create",
      body: {
        description: `${want.app} billing webhook (managed by the ${want.app} deploy)`,
        type: "url",
        destination,
        subscribed_events: events,
        api_version: 1,
        include_sensitive_fields: false,
        traffic_source: "all",
        active: want.active,
      },
    };
  }
  const have = new Set(current.subscribed_events.map(eventName));
  const missing = events.filter((e) => !have.has(e));
  const reasons: string[] = [];
  const body: Record<string, unknown> = {};
  if (missing.length) {
    reasons.push(`subscribe ${missing.join(", ")}`);
    // Keep what is already subscribed (an event the owner added by hand stays).
    body.subscribed_events = [...have, ...missing];
  }
  if (current.active !== want.active) {
    reasons.push(want.active ? "activate (checkout is on)" : "deactivate (checkout is off)");
    body.active = want.active;
  }
  if (current.api_version !== 1) {
    reasons.push(`api_version ${current.api_version} -> 1`);
    body.api_version = 1;
  }
  if (!reasons.length) return { kind: "none", id: current.id };
  return { kind: "update", id: current.id, body, reasons };
}

export function describeWebhookAction(a: WebhookAction): string {
  switch (a.kind) {
    case "create":
      return `create notification destination ${String(a.body.destination)} (${(a.body.subscribed_events as string[]).length} events, ${a.body.active ? "active" : "inactive"})`;
    case "update":
      return `update notification destination ${a.id}: ${a.reasons.join("; ")}`;
    case "none":
      return `notification destination ${a.id} already matches`;
  }
}

/** True for a value shaped like a Paddle notification secret (pdl_ntfset_…). */
export function isEndpointSecret(v: unknown): v is string {
  return typeof v === "string" && /^pdl_ntfset_[A-Za-z0-9_]{16,}$/.test(v);
}

type Json = Record<string, unknown>;

/** Minimal Paddle notification-settings client (plain fetch). Never logs the key or the secret. */
export class PaddleWebhookClient {
  private readonly apiKey: string;
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  constructor(apiKey: string, opts: { fetch?: typeof fetch; baseUrl?: string } = {}) {
    this.apiKey = apiKey;
    this.base = opts.baseUrl ?? paddleBaseUrl(apiKey);
    this.fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
  }

  private async call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
    const res = await this.fetchFn(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const err = (json.error ?? {}) as Json;
      const perm = method === "GET" ? "notification_setting.read" : "notification_setting.write";
      const hint = res.status === 403 ? ` (give the key ${perm})` : "";
      throw new Error(
        `Paddle ${method} ${path.split("?")[0]} failed: ${res.status} ${String(err.code ?? "")}${hint}`.trim(),
      );
    }
    return json;
  }

  async list(): Promise<PaddleNotificationSetting[]> {
    const out: PaddleNotificationSetting[] = [];
    let next: string | null = "/notification-settings";
    for (let page = 0; next && page < 20; page++) {
      const json = await this.call("GET", next);
      out.push(...((json.data as PaddleNotificationSetting[]) ?? []));
      const pagination = ((json.meta as Json)?.pagination ?? {}) as Json;
      const url = pagination.has_more ? String(pagination.next ?? "") : "";
      next = url ? url.replace(this.base, "") : null;
    }
    return out;
  }

  async create(body: Json): Promise<PaddleNotificationSetting> {
    return (await this.call("POST", "/notification-settings", body))
      .data as PaddleNotificationSetting;
  }

  async update(id: string, body: Json): Promise<PaddleNotificationSetting> {
    return (await this.call("PATCH", `/notification-settings/${encodeURIComponent(id)}`, body))
      .data as PaddleNotificationSetting;
  }
}

export interface WebhookSyncResult {
  action: WebhookAction;
  /** The destination id after the sync ("" on a plan-only run that would create one). */
  id: string;
  destination: string;
  active: boolean;
  /** The destination's signing secret, for BILLING_WEBHOOK_SECRET. Null on a plan-only create. */
  secret: string | null;
}

/** Brings Paddle's destination for the app in line with `want`. apply=false only reads. */
export async function syncWebhookDestination(
  client: PaddleWebhookClient,
  want: WebhookWant,
  opts: { apply: boolean },
): Promise<WebhookSyncResult> {
  const settings = await client.list();
  const action = planWebhookDestination(settings, want);
  const destination = webhookUrl(want.appUrl);
  const existing = action.kind === "create" ? null : settings.find((s) => s.id === action.id);
  let after: PaddleNotificationSetting | null = existing ?? null;
  if (opts.apply && action.kind === "create") after = await client.create(action.body);
  if (opts.apply && action.kind === "update") after = await client.update(action.id, action.body);
  const secret = after?.endpoint_secret_key ?? existing?.endpoint_secret_key ?? null;
  if (after && !isEndpointSecret(secret)) {
    throw new Error(
      `Paddle returned destination ${after.id} without a notification secret (pdl_ntfset_…)`,
    );
  }
  return {
    action,
    id: after?.id ?? "",
    destination,
    active: opts.apply || action.kind === "none" ? want.active : (existing?.active ?? false),
    secret: after ? (secret as string) : null,
  };
}
