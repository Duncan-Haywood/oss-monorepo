import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { pipeline, Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { diffWords, type DiffOp } from "./diff";
import { getSnapshot, saveSnapshot, type StoredSnapshot } from "./watch-store";

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
  // The snapshot this check produced, present on every successful fetch so a
  // caller keeping its own baseline can store it. Absent on "inconclusive",
  // where there is no page text to become the next baseline — replacing a
  // good baseline with a failed fetch is how a monitor loses the evidence it
  // exists to hold.
  snapshot?: StoredSnapshot;
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

export type DnsLookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DnsLookupFn = (hostname, options) => lookup(hostname, options);

let dnsLookup = defaultDnsLookup;
let checkTimeoutMs = FETCH_TIMEOUT_MS;

export function configureCheckUrlForTests(options?: {
  lookup?: DnsLookupFn;
  timeoutMs?: number;
}): void {
  dnsLookup = options?.lookup ?? defaultDnsLookup;
  checkTimeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
}

function createAbortError(): Error {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  return error;
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

type PublicHop = { parsed: URL; address: string };

async function resolvePublicHop(input: string, signal: AbortSignal): Promise<PublicHop | null> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const hostname = hostnameOf(parsed);
  if (isBlockedHostname(hostname)) return null;
  if (isIP(hostname) !== 0) return { parsed, address: hostname };
  const answers = await raceAbort(dnsLookup(hostname, { all: true }), signal);
  if (answers.length === 0) return null;
  if (answers.some((answer) => isBlockedIpAddress(answer.address))) return null;
  const preferred = answers.find((answer) => answer.family === 4) ?? answers[0];
  if (!preferred) return null;
  return { parsed, address: preferred.address };
}

function discardIncoming(incoming: http.IncomingMessage): void {
  incoming.on("error", () => {});
  incoming.resume();
}

async function discardResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // Already closed or locked by a cancelled reader.
  }
}

function decodeIncoming(incoming: http.IncomingMessage): Readable {
  const encoding = String(incoming.headers["content-encoding"] ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const decoder =
    encoding === "gzip" || encoding === "x-gzip"
      ? createGunzip()
      : encoding === "deflate"
        ? createInflate()
        : encoding === "br"
          ? createBrotliDecompress()
          : undefined;
  if (!decoder) return incoming;
  // pipeline attaches error handlers on every stream. incoming.pipe(decoder)
  // does not, so a mid-body socket error would be an unhandled 'error' on
  // IncomingMessage and could terminate the process.
  pipeline(incoming, decoder, () => {});
  return decoder;
}

function incomingToResponse(incoming: http.IncomingMessage): Response {
  const headers = new Headers();
  for (const [key, values] of Object.entries(incoming.headersDistinct ?? {})) {
    if (!values) continue;
    for (const value of values) headers.append(key, value);
  }
  const status = incoming.statusCode ?? 0;
  // Drain bodies we will not read so keep-alive sockets return to the agent.
  if (status < 200 || status >= 300 || status === 204 || status === 205) {
    discardIncoming(incoming);
    return new Response(null, { status, statusText: incoming.statusMessage ?? "", headers });
  }
  const encoding = String(incoming.headers["content-encoding"] ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const needsDecode =
    encoding === "gzip" || encoding === "x-gzip" || encoding === "deflate" || encoding === "br";
  if (needsDecode) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return new Response(Readable.toWeb(needsDecode ? decodeIncoming(incoming) : incoming) as ReadableStream, {
    status,
    statusText: incoming.statusMessage ?? "",
    headers,
  });
}

function fetchPinnedHop(hop: PublicHop, signal: AbortSignal): Promise<Response> {
  const { parsed, address } = hop;
  const isHttps = parsed.protocol === "https:";
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;
  const requestOptions: https.RequestOptions = {
    protocol: parsed.protocol,
    hostname: address,
    family: isIP(address) === 6 ? 6 : 4,
    port,
    path: `${parsed.pathname}${parsed.search}`,
    method: "GET",
    headers: {
      host: parsed.host,
      accept: "*/*",
    },
    signal,
  };
  if (isHttps) requestOptions.servername = hostnameOf(parsed);

  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).request(requestOptions, (incoming) => {
      try {
        resolve(incomingToResponse(incoming));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
    req.end();
  });
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
    const resolved = await resolvePublicHop(current, signal);
    if (!resolved) {
      throw new Error("URL is not a public http(s) address");
    }
    // Pin the default fetch to the address we just validated so a short-TTL
    // or rebinding name cannot pass the private-IP check and then resolve to
    // loopback / RFC1918 / link-local (including cloud metadata) on connect.
    // Injected fetch implementations (tests) still receive the original URL.
    const response =
      fetchImpl === fetch
        ? await fetchPinnedHop(resolved, signal)
        : await fetchImpl(current, { signal, redirect: "manual" });
    if (!REDIRECT_STATUS.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    await discardResponseBody(response);
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
 *
 * `baseline` lets the caller supply the snapshot to compare against instead
 * of using the shared server-side store. Browsers pass their own, kept in
 * localStorage: the baseline then survives a deploy and belongs to one
 * visitor rather than to whoever last checked the same URL. Passing it —
 * including as an explicit null, meaning "I am tracking this myself and have
 * nothing yet" — bypasses the module store entirely in both directions, so
 * one visitor's snapshot can never answer another's check. Omitting it keeps
 * the original server-store behaviour for callers that have nowhere to keep
 * state of their own.
 */
export async function checkUrl(
  url: string,
  fetchImpl: FetchFn = fetch,
  baseline?: StoredSnapshot | null,
): Promise<CheckResult> {
  const callerTracksBaseline = baseline !== undefined;
  const now = new Date();
  const previousSnapshot = callerTracksBaseline ? baseline : getSnapshot(url);
  const previousRef: SnapshotRef | undefined = previousSnapshot
    ? { fetchedAt: previousSnapshot.fetchedAt, httpStatus: previousSnapshot.httpStatus }
    : undefined;
  // Only the store-backed path writes back. A caller holding its own baseline
  // gets the new snapshot in the result and persists it itself.
  const remember = (snapshot: StoredSnapshot) => {
    if (!callerTracksBaseline) saveSnapshot(snapshot);
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), checkTimeoutMs);

  try {
    let response: Response;
    let body: string;
    try {
      response = await fetchPublicUrl(url, fetchImpl, controller.signal);
      const status = response.status;
      // 204/205 are 2xx but carry no page body — same as incomingToResponse,
      // which already drops those bodies. Saving an empty snapshot would
      // lock in empty evidence or later report a real 200 as "changed".
      if (status < 200 || status >= 300 || status === 204 || status === 205) {
        await discardResponseBody(response);
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
          ? `Fetch timed out after ${checkTimeoutMs}ms`
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

    const snapshot: StoredSnapshot = { url, normalizedText, hash, fetchedAt, httpStatus: status };

    if (!previousSnapshot) {
      remember(snapshot);
      return { outcome: "first_snapshot", url, fetchedAt, httpStatus: status, snapshot };
    }

    if (previousSnapshot.hash === hash) {
      remember(snapshot);
      return { outcome: "unchanged", url, fetchedAt, httpStatus: status, previous: previousRef, snapshot };
    }

    const diff = diffWords(previousSnapshot.normalizedText, normalizedText);
    remember(snapshot);
    return { outcome: "changed", url, fetchedAt, httpStatus: status, previous: previousRef, diff, snapshot };
  } finally {
    clearTimeout(timeout);
  }
}
