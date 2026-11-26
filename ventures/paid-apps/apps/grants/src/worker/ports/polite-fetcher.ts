// Polite web fetcher (OWNER: imports). Used for org-website crawls and grant-page imports.
//  - robots.txt (RFC 9309) fetched once per origin and cached in-isolate; obeyed for our product
//    token (from CRAWLER_USER_AGENT, e.g. "GrantAutopilotBot") and `*`
//  - per-host minimum delay: max(1s, Crawl-delay)
//  - 15 s timeout, 3 MB body cap, max 5 redirects (each hop re-validated + robots-checked)
//  - content-type allowlist: HTML, plain text, PDF (PDF bodies are returned base64 with
//    `encoding: "base64"`; use fetchBinary() for raw bytes)
//  - SSRF guard on every hop (services/imports/url-safety.ts)
import {
  isAllowedByPolicy,
  parseRobotsTxt,
  productToken,
  ROBOTS_MAX_BYTES,
  type RobotsPolicy,
  selectGroup,
} from "../services/imports/robots";
import { assertSafeUrl } from "../services/imports/url-safety";
import type { FetchResult, WebFetcher } from "./web-fetcher";

export type WebFetchErrorCode =
  | "blocked_url"
  | "too_large"
  | "unsupported_content_type"
  | "too_many_redirects"
  | "timeout"
  | "network";

export class WebFetchError extends Error {
  constructor(
    public readonly code: WebFetchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WebFetchError";
  }
}

/** FetchResult plus how `body` is encoded (absent = utf8 text). Backward compatible with FetchResult. */
export interface PoliteFetchResult extends FetchResult {
  encoding?: "utf8" | "base64";
}

export interface BinaryFetchResult {
  url: string;
  status: number;
  contentType: string;
  bytes: ArrayBuffer;
}

/** Optional capability: fetchers that can return raw bytes (PDF RFPs). */
export interface BinaryWebFetcher extends WebFetcher {
  fetchBinary(url: string): Promise<BinaryFetchResult | null>;
}

export function supportsBinary(web: WebFetcher): web is BinaryWebFetcher {
  return typeof (web as Partial<BinaryWebFetcher>).fetchBinary === "function";
}

export interface PoliteFetcherOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  minDelayMs?: number;
  /** Crawl-delay values above this are clamped (seconds). */
  maxCrawlDelaySec?: number;
  robotsTtlMs?: number;
}

export const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/pdf",
] as const;

const DEFAULTS = {
  timeoutMs: 15_000,
  maxBytes: 3 * 1024 * 1024,
  maxRedirects: 5,
  minDelayMs: 1_000,
  maxCrawlDelaySec: 30,
  robotsTtlMs: 6 * 60 * 60 * 1000,
};

interface HostState {
  robots?: { policy: RobotsPolicy; expiresAt: number; crawlDelayMs: number };
  robotsPending?: Promise<HostState["robots"]>;
  nextAllowedAt: number;
}

/** In-isolate cache shared by all PoliteWebFetcher instances (keyed by origin). */
const sharedHostState = new Map<string, HostState>();

export function mimeOf(contentType: string): string {
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

export class PoliteWebFetcher implements BinaryWebFetcher {
  private readonly token: string;
  private readonly opts: typeof DEFAULTS;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly hosts: Map<string, HostState>;

  constructor(
    private readonly userAgent: string,
    options: PoliteFetcherOptions = {},
  ) {
    this.token = productToken(userAgent || "GrantAutopilotBot");
    this.opts = { ...DEFAULTS, ...stripUndefined(options) };
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? (() => Date.now());
    // Injected fetch = test/isolated instance: keep its own cache.
    this.hosts = options.fetch ? new Map() : sharedHostState;
  }

  async fetchPage(url: string): Promise<PoliteFetchResult | null> {
    const res = await this.fetchRaw(url);
    if (!res) return null;
    const mime = mimeOf(res.contentType);
    if (mime === "application/pdf") {
      return { ...res.meta, body: toBase64(res.bytes), encoding: "base64" };
    }
    return { ...res.meta, body: decodeText(res.bytes, res.contentType), encoding: "utf8" };
  }

  async fetchBinary(url: string): Promise<BinaryFetchResult | null> {
    const res = await this.fetchRaw(url);
    return res ? { ...res.meta, bytes: res.bytes } : null;
  }

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    // Official JSON APIs: not subject to robots.txt, but still SSRF-guarded and time-limited.
    assertSafe(url);
    const res = await this.withTimeout((signal) =>
      this.doFetch(url, {
        ...init,
        // Never follow redirects blindly: a 3xx could point at an internal address (SSRF).
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
      }),
    );
    if (!res.ok) throw new Error(`GET ${new URL(url).host} failed: ${res.status}`);
    const bytes = await readCapped(res, this.opts.maxBytes * 4, true);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  /** Robots-checked, rate-limited GET following up to maxRedirects safe redirects. */
  private async fetchRaw(
    url: string,
  ): Promise<{ meta: Omit<FetchResult, "body">; contentType: string; bytes: ArrayBuffer } | null> {
    let current = assertSafe(url);
    for (let hop = 0; hop <= this.opts.maxRedirects; hop++) {
      const robots = await this.robotsFor(current);
      if (!isAllowedByPolicy(robots.policy, this.token, current.pathname + current.search)) {
        return null;
      }
      await this.waitTurn(current, robots.crawlDelayMs);
      const res = await this.withTimeout((signal) =>
        this.doFetch(current.href, {
          method: "GET",
          redirect: "manual",
          signal,
          headers: {
            "User-Agent": this.userAgent,
            Accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.1",
          },
        }),
      );
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        discard(res);
        current = assertSafe(new URL(res.headers.get("location") ?? "", current));
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      const meta = { url: current.href, status: res.status, contentType };
      if (!res.ok) {
        // Error pages: return status with a small text body so callers can report it.
        const bytes = await readCapped(res, 64 * 1024, false);
        return { meta, contentType: "text/plain", bytes };
      }
      const mime = mimeOf(contentType);
      if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(mime)) {
        discard(res);
        throw new WebFetchError(
          "unsupported_content_type",
          `Unsupported content type: ${mime || "unknown"}`,
        );
      }
      const bytes = await readCapped(res, this.opts.maxBytes, true);
      return { meta, contentType, bytes };
    }
    throw new WebFetchError("too_many_redirects", "Too many redirects");
  }

  private hostState(url: URL): HostState {
    let s = this.hosts.get(url.origin);
    if (!s) {
      s = { nextAllowedAt: 0 };
      this.hosts.set(url.origin, s);
    }
    return s;
  }

  private async waitTurn(url: URL, crawlDelayMs: number) {
    const state = this.hostState(url);
    const delay = Math.max(this.opts.minDelayMs, crawlDelayMs);
    const now = this.now();
    const at = Math.max(now, state.nextAllowedAt);
    state.nextAllowedAt = at + delay; // reserve the slot before sleeping (concurrent callers queue up)
    if (at > now) await this.sleep(at - now);
  }

  private async robotsFor(url: URL): Promise<NonNullable<HostState["robots"]>> {
    const state = this.hostState(url);
    if (state.robots && state.robots.expiresAt > this.now()) return state.robots;
    if (!state.robotsPending) {
      state.robotsPending = this.loadRobots(url).finally(() => {
        state.robotsPending = undefined;
      });
    }
    const loaded = await state.robotsPending;
    if (!loaded) throw new WebFetchError("network", "robots.txt unavailable");
    state.robots = loaded;
    return loaded;
  }

  private async loadRobots(url: URL): Promise<NonNullable<HostState["robots"]>> {
    const robotsUrl = new URL("/robots.txt", url.origin);
    let policy: RobotsPolicy;
    try {
      let target = robotsUrl;
      let res: Response | null = null;
      for (let hop = 0; hop <= this.opts.maxRedirects; hop++) {
        await this.waitTurn(target, 0);
        const r = await this.withTimeout((signal) =>
          this.doFetch(target.href, {
            redirect: "manual",
            signal,
            headers: { "User-Agent": this.userAgent, Accept: "text/plain,*/*;q=0.1" },
          }),
        );
        const loc = r.headers.get("location");
        if (r.status >= 300 && r.status < 400 && loc) {
          discard(r);
          target = assertSafe(new URL(loc, target));
          continue;
        }
        res = r;
        break;
      }
      if (!res) {
        policy = { kind: "allow_all" }; // RFC 9309: >5 redirects → treat as unavailable (4xx)
      } else if (res.ok) {
        const bytes = await readCapped(res, ROBOTS_MAX_BYTES, false);
        policy = { kind: "rules", robots: parseRobotsTxt(new TextDecoder().decode(bytes)) };
      } else if (res.status >= 400 && res.status < 500) {
        discard(res);
        policy = { kind: "allow_all" }; // RFC 9309 §2.3.1.3: unavailable → crawl freely
      } else {
        discard(res);
        policy = { kind: "disallow_all" }; // 5xx: unreachable → assume complete disallow
      }
    } catch (e) {
      if (e instanceof WebFetchError && e.code === "blocked_url") throw e;
      policy = { kind: "disallow_all" }; // network error / timeout
    }
    const group = policy.kind === "rules" ? selectGroup(policy.robots, this.token) : null;
    const crawlDelaySec = Math.min(group?.crawlDelay ?? 0, this.opts.maxCrawlDelaySec);
    // Failures are cached briefly so a transient 5xx does not block a host for hours.
    const ttl = policy.kind === "disallow_all" ? 5 * 60 * 1000 : this.opts.robotsTtlMs;
    return { policy, expiresAt: this.now() + ttl, crawlDelayMs: crawlDelaySec * 1000 };
  }

  private async withTimeout(run: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      return await run(controller.signal);
    } catch (e) {
      if (controller.signal.aborted) throw new WebFetchError("timeout", "Request timed out");
      if (e instanceof WebFetchError) throw e;
      throw new WebFetchError("network", `Fetch failed: ${String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function assertSafe(url: string | URL): URL {
  try {
    return assertSafeUrl(url);
  } catch (e) {
    throw new WebFetchError("blocked_url", (e as Error).message);
  }
}

/** Reads at most `max` bytes; throws too_large (strict) or truncates (lenient). */
async function readCapped(res: Response, max: number, strict: boolean): Promise<ArrayBuffer> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (strict && Number.isFinite(declared) && declared > max) {
    discard(res);
    throw new WebFetchError("too_large", `Response larger than ${max} bytes`);
  }
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > max) {
      reader.cancel().catch(() => {});
      if (strict) throw new WebFetchError("too_large", `Response larger than ${max} bytes`);
      chunks.push(value.slice(0, max - total));
      total = max;
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out.buffer;
}

/** Releases an unread body without awaiting (cancel on a tee'd stream can wait for the other branch). */
function discard(res: Response) {
  res.body?.cancel().catch(() => {});
}

function decodeText(bytes: ArrayBuffer, contentType: string): string {
  const charset = contentType.match(/charset\s*=\s*"?([\w-]+)/i)?.[1]?.toLowerCase();
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // unsupported label: fall through to utf-8
    }
  }
  return new TextDecoder().decode(bytes);
}

export function toBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) {
    bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
