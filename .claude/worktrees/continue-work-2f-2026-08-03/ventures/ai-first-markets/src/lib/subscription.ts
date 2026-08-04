/**
 * Newsletter signup.
 *
 * The rule this file exists to enforce: a visitor is told they are subscribed
 * only when their address has actually been handed to something that keeps it.
 * There is no subscriber store in this venture — signups are forwarded to
 * whatever list provider `SUBSCRIBER_WEBHOOK_URL` points at, and until that is
 * set the honest answer to a signup is "not yet", not a confirmation.
 *
 * The shape below is what keeps that true. `processSubscription` cannot return
 * a confirmation, because a confirmation is only reachable through
 * `submitSubscription`, which needs a sink and a delivery that succeeded.
 */

export type SubscriptionTier = "weekly_free" | "premium_29";

export interface SubscriptionRequest {
  email: string;
  tier: SubscriptionTier;
  interestSector?: string;
}

/** A request that passed validation. Not yet recorded anywhere. */
export interface ValidatedSubscription {
  email: string;
  tier: SubscriptionTier;
  interestSector?: string;
}

/**
 * Where a validated address is sent to be kept.
 *
 * Deliberately a generic webhook rather than one provider's SDK: the venture
 * has no list provider chosen yet, and this is the smallest contract that a
 * hosted list, a Worker, or an automation step can all satisfy.
 */
export interface SubscriberSink {
  endpoint: string;
  token?: string;
}

export type SubscriptionOutcome =
  | { status: "invalid_email"; httpStatus: 400; message: string; error: "INVALID_EMAIL" }
  | {
      status: "not_configured";
      httpStatus: 501;
      message: string;
      error: "SUBSCRIPTIONS_NOT_CONFIGURED";
      operatorAction: string;
    }
  | { status: "sink_failed"; httpStatus: 502; message: string; error: "SUBSCRIBER_SINK_FAILED" }
  | {
      status: "recorded";
      httpStatus: 200;
      message: string;
      data: { email: string; tier: SubscriptionTier; subscribedAt: string };
    };

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  // RFC 5321 caps the whole address at 254 octets.
  if (trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/** Unrecognized tiers fall back to the free list rather than to the paid one. */
export function resolveTier(tier: unknown): SubscriptionTier {
  return tier === "premium_29" ? "premium_29" : "weekly_free";
}

/**
 * Validates and normalizes a signup. This is all that can be decided without
 * talking to the sink — in particular it does not, and cannot, confirm a
 * subscription.
 */
export function processSubscription(
  req: SubscriptionRequest,
): { ok: true; value: ValidatedSubscription } | { ok: false; outcome: SubscriptionOutcome } {
  const email = normalizeEmail(req.email);

  if (!validateEmail(email)) {
    return {
      ok: false,
      outcome: {
        status: "invalid_email",
        httpStatus: 400,
        message: "Please enter a valid email address.",
        error: "INVALID_EMAIL",
      },
    };
  }

  return {
    ok: true,
    value: {
      email,
      tier: resolveTier(req.tier),
      interestSector: req.interestSector?.trim() || undefined,
    },
  };
}

/** The configured sink, or null when this venture cannot accept signups yet. */
export function configuredSink(
  env: Record<string, string | undefined> = process.env,
): SubscriberSink | null {
  const endpoint = env.SUBSCRIBER_WEBHOOK_URL?.trim();
  if (!endpoint) return null;
  return { endpoint, token: env.SUBSCRIBER_WEBHOOK_TOKEN?.trim() || undefined };
}

/**
 * What a visitor is told once their address has been kept.
 *
 * The free list is a subscription. The premium tier is not: nothing takes
 * payment in this venture, so signing up for it registers interest and the
 * copy has to say so — including that no charge was made. Promising a paid
 * product that cannot be bought is the failure this wording exists to avoid.
 */
function recordedMessage(tier: SubscriptionTier): string {
  return tier === "premium_29"
    ? "You're on the waitlist for the $29/mo Premium Market Efficiency Report. It isn't on sale yet and you have not been charged — we'll email you when it opens."
    : "You're on the list for Weekly Market Intelligence. The next issue goes out to this address.";
}

export type DeliverToSink = (sink: SubscriberSink, payload: ValidatedSubscription) => Promise<boolean>;

/** Forwards a signup to the sink over HTTP. Any non-2xx is a failure. */
export const deliverOverHttp: DeliverToSink = async (sink, payload) => {
  const response = await fetch(sink.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sink.token ? { Authorization: `Bearer ${sink.token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return response.ok;
};

/**
 * The whole signup, end to end. `recorded` is returned only after `deliver`
 * reports the sink took the address.
 */
export async function submitSubscription(
  req: SubscriptionRequest,
  deps: {
    sink: SubscriberSink | null;
    deliver: DeliverToSink;
    now?: () => Date;
  },
): Promise<SubscriptionOutcome> {
  const validated = processSubscription(req);
  if (!validated.ok) return validated.outcome;

  if (!deps.sink) {
    return {
      status: "not_configured",
      httpStatus: 501,
      message:
        "Signups aren't open yet — this list has no home to send your address to, so we haven't kept it. Please check back.",
      error: "SUBSCRIPTIONS_NOT_CONFIGURED",
      operatorAction:
        "Set SUBSCRIBER_WEBHOOK_URL to a list provider endpoint (see .env.example) to start accepting signups.",
    };
  }

  let delivered = false;
  try {
    delivered = await deps.deliver(deps.sink, validated.value);
  } catch {
    delivered = false;
  }

  if (!delivered) {
    return {
      status: "sink_failed",
      httpStatus: 502,
      message: "We couldn't save your address just now. Please try again in a moment.",
      error: "SUBSCRIBER_SINK_FAILED",
    };
  }

  const now = deps.now ?? (() => new Date());
  return {
    status: "recorded",
    httpStatus: 200,
    message: recordedMessage(validated.value.tier),
    data: {
      email: validated.value.email,
      tier: validated.value.tier,
      subscribedAt: now().toISOString(),
    },
  };
}
