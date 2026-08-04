"use client";

import type { UsageEventName } from "@/lib/usage";

type UsageContext = {
  path?: string;
  perspective?: "SELF" | "PARTNER" | "PARTNER_GUESS";
  domain?: string;
  durationMs?: number;
  statusCode?: number;
  success?: boolean;
};
type QueuedEvent = UsageContext & {
  clientEventId: string;
  sequence: number;
  occurredAt: number;
  event: UsageEventName;
};

const SESSION_KEY = "pairwise:usage-session";
const SEQUENCE_KEY = "pairwise:usage-sequence";
const PENDING_KEY = "pairwise:usage-pending";
const MAX_BATCH = 25;
const MAX_PENDING = 100;
let queue: QueuedEvent[] | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function storageGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function storageSet(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* telemetry must never interrupt the app */ }
}

export function createUsageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionKey(): string {
  const existing = storageGet(SESSION_KEY);
  if (existing && /^[A-Za-z0-9_-]{16,100}$/.test(existing)) return existing;
  const created = createUsageId();
  storageSet(SESSION_KEY, created);
  return created;
}

export function getUsageSessionKey(): string | undefined {
  return typeof window === "undefined" ? undefined : sessionKey();
}

function pending(): QueuedEvent[] {
  if (queue) return queue;
  try {
    const parsed = JSON.parse(storageGet(PENDING_KEY) ?? "[]");
    queue = Array.isArray(parsed) ? parsed.slice(-MAX_PENDING) : [];
  } catch {
    queue = [];
  }
  return queue;
}

function persist() {
  storageSet(PENDING_KEY, JSON.stringify(pending()));
}

function nextSequence(): number {
  const current = Number(storageGet(SEQUENCE_KEY) ?? "0");
  const next = Number.isSafeInteger(current) && current >= 0 ? current + 1 : 1;
  storageSet(SEQUENCE_KEY, String(next));
  return next;
}

export function recordUsage(event: UsageEventName, context: UsageContext = {}) {
  if (typeof window === "undefined") return;
  const events = pending();
  events.push({
    clientEventId: createUsageId(),
    sequence: nextSequence(),
    occurredAt: Date.now(),
    event,
    path: context.path ?? location.pathname,
    ...context,
  });
  if (events.length > MAX_PENDING) events.splice(0, events.length - MAX_PENDING);
  persist();
  if (events.length >= 10) void flushUsage();
  else if (!timer) timer = setTimeout(() => void flushUsage(), 5000);
}

export async function flushUsage(useBeacon = false) {
  if (typeof window === "undefined" || pending().length === 0 || flushing) return;
  if (timer) clearTimeout(timer);
  timer = null;
  const events = pending().slice(0, MAX_BATCH);
  const sentIds = new Set(events.map((event) => event.clientEventId));
  const body = JSON.stringify({ sessionKey: sessionKey(), events });

  if (useBeacon && navigator.sendBeacon) {
    // `true` only means the browser queued the request, not that the server
    // accepted it. Keep these idempotent events until a normal fetch can
    // acknowledge them; otherwise a rejected unload beacon is silent loss.
    navigator.sendBeacon("/api/usage", new Blob([body], { type: "application/json" }));
    return;
  }

  flushing = true;
  try {
    const response = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
    if (response.ok) {
      queue = pending().filter((event) => !sentIds.has(event.clientEventId));
      persist();
      if (pending().length) void flushUsage();
    }
  } catch {
    // The persisted batch will be retried when the browser comes online or the next event arrives.
  } finally {
    flushing = false;
  }
}
