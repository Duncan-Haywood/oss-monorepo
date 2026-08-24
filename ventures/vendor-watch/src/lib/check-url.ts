import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { diffWords, type DiffOp } from "./diff";
import { getSnapshot, saveSnapshot } from "./watch-store";

export type CheckOutcome = "first_snapshot" | "unchanged" | "changed" | "inconclusive";

export type SnapshotRef = { fetchedAt: string; httpStatus: number | null };

export type CheckResult = {
  outcome: CheckOutcome;
  url: string;
  fetchedAt: string;
  httpStatus: number | null;
  errorMessage?: string;
  previous?: SnapshotRef;
  diff?: DiffOp[];
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
// Cap normalized text length so the store and the diff stay bounded — this
// is a demo tool, not an archival service. Very long pages are truncated.
const MAX_TEXT_LENGTH = 20_000;
// Raw response cap applied while reading the body, so a huge download cannot
// allocate the full payload before the text truncation above runs.
const MAX_BODY_BYTES = 256_000;

const BLOCKED_ADDRESSES = new BlockList();
BLOCKED_ADDRESSES.addSubnet("0.0.0.0", 8, "ipv4");
BLOCKED_ADDRESSES.addSubnet("10.0.0.0", 8, "ipv4");
BLOCKED_ADDRESSES.addSubnet("100.64.0.0", 10, "ipv4");
BLOCKED_ADDRESSES.addSubnet("127.0.0.0", 8, "ipv4");
BLOCKED_ADDRESSES.addSubnet("169.254.0.0", 16, "ipv4");
BLOCKED_ADDRESSES.addSubnet("172.16.0.0", 12, "ipv4");
BLOCKED_ADDRESSES.addSubnet("192.168.0.0", 16, "ipv4");
BLOCKED_ADDRESSES.addSubnet("224.0.0.0", 3, "ipv4");
BLOCKED_ADDRESSES.addAddress("::", "ipv6");
BLOCKED_ADDRESSES.addAddress("::1", "ipv6");
BLOCKED_ADDRESSES.addSubnet("fc00::", 7, "ipv6");
BLOCKED_ADDRESSES.addSubnet("fe80::", 10, "ipv6");
BLOCKED_ADDRESSES.addSubnet("ff00::", 8, "ipv6");

function hostnameOf(parsed: URL): string {
  return parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

function isBlockedIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return BLOCKED_ADDRESSES.check(address, "ipv4");
  if (version === 6) return BLOCKED_ADDRESSES.check(address, "ipv6");
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return true;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return true;
  }
  return isIP(hostname) !== 0 && isBlockedIpAddress(hostname);
}

async function urlTargetsBlockedAddress(input: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return true;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
  const hostname = hostnameOf(parsed);
  if (isBlockedHostname(hostname)) return true;
  if (isIP(hostname) !== 0) return false;
  try {
    const answers = await lookup(hostname, { all: true });
    return answers.some((answer) => isBlockedIpAddress(answer.address));
  } catch {
    // DNS failure is handled by the later fetch as inconclusive.
    return false;
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const remaining = maxBytes - received;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        await reader.cancel();
        break;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() may already have released the lock
    }
  }
  return new TextDecoder("utf-8").decode(concatBytes(chunks));
}

async function fetchPublicUrl(
  url: string,
  fetchImpl: FetchFn,
  signal: AbortSignal,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (await urlTargetsBlockedAddress(current)) {
      throw new Error("URL is not a public http(s) address");
    }
    // Never let fetch follow redirects itself: a public first hop can 30x
    // into loopback, RFC1918, or link-local (including cloud metadata).
    const response = await fetchImpl(current, { signal, redirect: "manual" });
    if (!REDIRECT_STATUS.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = new URL(location, current).href;
  }
  throw new Error("Too many redirects");
}

export function isPlausibleHttpUrl(input: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return !isBlockedHostname(hostnameOf(parsed));
}

export function normalizeHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_TEXT_LENGTH);
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch a URL, compare it against the previously stored snapshot (if any),
 * and return what happened. Never reports "no change" for a failed or
 * blocked fetch — that outcome is always "inconclusive".
 *
 * Caller is expected to have already validated the URL with
 * isPlausibleHttpUrl(); this function assumes a well-formed http(s) URL
 * and still refuses private/loopback/link-local targets on each hop.
 */
export async function checkUrl(url: string, fetchImpl: FetchFn = fetch): Promise<CheckResult> {
  const now = new Date();
  const previousSnapshot = getSnapshot(url);
  const previousRef: SnapshotRef | undefined = previousSnapshot
    ? { fetchedAt: previousSnapshot.fetchedAt, httpStatus: previousSnapshot.httpStatus }
    : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let response: Response;
    let body: string;
    try {
      response = await fetchPublicUrl(url, fetchImpl, controller.signal);
      const status = response.status;
      if (status < 200 || status >= 300) {
        return {
          outcome: "inconclusive",
          url,
          fetchedAt: now.toISOString(),
          httpStatus: status,
          errorMessage: `Fetch returned HTTP ${status}`,
          previous: previousRef,
        };
      }
      body = await readBoundedText(response, MAX_BODY_BYTES);
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? `Fetch timed out after ${FETCH_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : "Unknown fetch error";
      return {
        outcome: "inconclusive",
        url,
        fetchedAt: now.toISOString(),
        httpStatus: null,
        errorMessage: message,
        previous: previousRef,
      };
    }

    const status = response.status;
    const normalizedText = normalizeHtmlToText(body);
    const hash = createHash("sha256").update(normalizedText).digest("hex");
    const fetchedAt = now.toISOString();

    if (!previousSnapshot) {
      saveSnapshot({ url, normalizedText, hash, fetchedAt, httpStatus: status });
      return { outcome: "first_snapshot", url, fetchedAt, httpStatus: status };
    }

    if (previousSnapshot.hash === hash) {
      saveSnapshot({ url, normalizedText, hash, fetchedAt, httpStatus: status });
      return { outcome: "unchanged", url, fetchedAt, httpStatus: status, previous: previousRef };
    }

    const diff = diffWords(previousSnapshot.normalizedText, normalizedText);
    saveSnapshot({ url, normalizedText, hash, fetchedAt, httpStatus: status });
    return { outcome: "changed", url, fetchedAt, httpStatus: status, previous: previousRef, diff };
  } finally {
    clearTimeout(timeout);
  }
}
