import { parsePerspective, type PerspectiveValue } from "@/lib/perspective";

export const USAGE_EVENTS = [
  "route_view",
  "route_exit",
  "survey_start",
  "question_load",
  "answer_save",
  "question_skip",
  "answer_undo",
  "insight_break",
  "insight_view",
  "feedback_open",
  "feedback_submit",
  "couple_invite_created",
  "couple_joined",
  "card_shared",
  "nps_submitted",
  "streak_milestone",
  "insight_shared",
  "retention_return_visit",
] as const;

export type UsageEventName = (typeof USAGE_EVENTS)[number];
const EVENT_NAMES = new Set<string>(USAGE_EVENTS);

export type ParsedUsageEvent = {
  clientEventId: string;
  sequence: number;
  occurredAt: Date;
  event: UsageEventName;
  path: string | null;
  perspective: PerspectiveValue | null;
  domain: string | null;
  durationMs: number | null;
  success: boolean | null;
};

function boundedSlug(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9-]{1,60}$/.test(value) ? value : null;
}

export function parseUsageBatch(value: unknown): { sessionKey: string; events: ParsedUsageEvent[] } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const sessionKey = typeof body.sessionKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(body.sessionKey)
    ? body.sessionKey
    : null;
  if (!sessionKey || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > 25) return null;

  const events: ParsedUsageEvent[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.event !== "string" || !EVENT_NAMES.has(item.event)) return null;
    if (typeof item.clientEventId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(item.clientEventId)) return null;
    if (!Number.isInteger(item.sequence) || (item.sequence as number) < 0 || (item.sequence as number) > 10_000_000) return null;
    if (!Number.isInteger(item.occurredAt) || Math.abs((item.occurredAt as number) - Date.now()) > 24 * 60 * 60 * 1000) return null;
    const path = typeof item.path === "string" && /^\/[A-Za-z0-9/_-]{0,299}$/.test(item.path) ? item.path : null;
    const durationMs = Number.isInteger(item.durationMs) && (item.durationMs as number) >= 0 && (item.durationMs as number) <= 300_000
      ? item.durationMs as number
      : null;
    events.push({
      clientEventId: item.clientEventId,
      sequence: item.sequence as number,
      occurredAt: new Date(item.occurredAt as number),
      event: item.event as UsageEventName,
      path,
      perspective: parsePerspective(item.perspective),
      domain: boundedSlug(item.domain),
      durationMs,
      success: typeof item.success === "boolean" ? item.success : null,
    });
  }
  return { sessionKey, events };
}
