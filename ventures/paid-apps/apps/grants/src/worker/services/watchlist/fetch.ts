// Conditional, polite page fetching for the watchlist. Same rules as ports/polite-fetcher.ts
// (robots.txt per RFC 9309 for our product token, SSRF guard on every hop, identifying User-Agent,
// per-origin min delay incl. Crawl-delay, timeouts, body cap) plus:
//  - conditional GET (If-None-Match / If-Modified-Since) → `not_modified` on 304
//  - RSS / Atom content types
//  - robots.txt that cannot be read (5xx / network) is a transient error, not a permanent block,
//    so a flaky server backs off instead of being marked blocked_by_robots.
import type { AppContext } from "../../context";
import {
  mimeOf,
  type PoliteFetchResult,
  PoliteWebFetcher,
  toBase64,
  WebFetchError,
} from "../../ports/polite-fetcher";
import type { FetchResult, WebFetcher } from "../../ports/web-fetcher";
import {
  isAllowedByPolicy,
  parseRobotsTxt,
  productToken,
  ROBOTS_MAX_BYTES,
  type RobotsPolicy,
  selectGroup,
} from "../imports/robots";
import { assertSafeUrl } from "../imports/url-safety";

export interface Validators {
  etag?: string | null;
  lastModified?: string | null;
}

export type ConditionalFetchOutcome =
  | { kind: "robots_disallowed"; url: string }
  | { kind: "not_modified"; url: string }
  | { kind: "http_error"; url: string; status: number }
  | {
      kind: "ok";
      url: string;
      status: number;
      contentType: string;
      body: string;
      encoding: "utf8" | "base64";
      etag: string | null;
      lastModified: string | null;
    };

/** Capability: a WebFetcher that can do conditional GETs and standalone robots checks. */
export interface ConditionalWebFetcher {
  fetchPageConditional(url: string, validators?: Validators): Promise<ConditionalFetchOutcome>;
  /** true/false from robots.txt; throws WebFetchError when robots.txt cannot be read. */
  robotsAllows(url: string): Promise<boolean>;
}

export function supportsConditional(
  web: WebFetcher | ConditionalWebFetcher,
): web is WebFetcher & ConditionalWebFetcher {
  const w = web as Partial<ConditionalWebFetcher>;
  return typeof w.fetchPageConditional === "function" && typeof w.robotsAllows === "function";
}

export const WATCH_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/pdf",
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
] as const;

export interface ConditionalFetcherOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  minDelayMs?: number;
  maxCrawlDelaySec?: number;
  robotsTtlMs?: number;
}

const DEFAULTS = {
  timeoutMs: 15_000,
  maxBytes: 3 * 1024 * 1024,
  maxRedirects: 5,
  minDelayMs: 1_000,
  maxCrawlDelaySec: 30,
  robotsTtlMs: 6 * 60 * 60 * 1000,
};

interface OriginState {
  robots?: { policy: RobotsPolicy; expiresAt: number; crawlDelayMs: number };
  nextAllowedAt: number;
}

const sharedOrigins = new Map<string, OriginState>();

function safe(url: string | URL): URL {
  try {
    return assertSafeUrl(url);
  } catch (e) {
    throw new WebFetchError("blocked_url", (e as Error).message);
  }
}

export class ConditionalPoliteFetcher implements WebFetcher, ConditionalWebFetcher {
  private readonly token: string;
  private readonly opts: typeof DEFAULTS;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly origins: Map<string, OriginState>;

  constructor(
    private readonly userAgent: string,
    options: ConditionalFetcherOptions = {},
  ) {
    this.token = productToken(userAgent || "GrantAutopilotBot");
    const defined = Object.fromEntries(
      Object.entries(options).filter(([, v]) => v !== undefined && typeof v === "number"),
    );
    this.opts = { ...DEFAULTS, ...defined };
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.now ?? (() => Date.now());
    this.origins = options.fetch ? new Map() : sharedOrigins;
  }

  async robotsAllows(url: string): Promise<boolean> {
    const u = safe(url);
    const robots = await this.robotsFor(u);
    return isAllowedByPolicy(robots.policy, this.token, u.pathname + u.search);
  }

  async fetchPageConditional(
    url: string,
    validators: Validators = {},
  ): Promise<ConditionalFetchOutcome> {
    let current = safe(url);
    for (let hop = 0; hop <= this.opts.maxRedirects; hop++) {
      const robots = await this.robotsFor(current);
      if (!isAllowedByPolicy(robots.policy, this.token, current.pathname + current.search)) {
        return { kind: "robots_disallowed", url: current.href };
      }
      await this.waitTurn(current, robots.crawlDelayMs);
      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,text/plain;q=0.8,application/pdf;q=0.8,*/*;q=0.1",
      };
      if (validators.etag) headers["If-None-Match"] = validators.etag;
      if (validators.lastModified) headers["If-Modified-Since"] = validators.lastModified;
      const res = await this.withTimeout((signal) =>
        this.doFetch(current.href, { method: "GET", redirect: "manual", signal, headers }),
      );
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && res.status !== 304 && location) {
        discard(res);
        current = safe(new URL(location, current));
        continue;
      }
      if (res.status === 304) {
        discard(res);
        return { kind: "not_modified", url: current.href };
      }
      if (!res.ok) {
        discard(res);
        return { kind: "http_error", url: current.href, status: res.status };
      }
      const contentType = res.headers.get("content-type") ?? "";
      const mime = mimeOf(contentType) || "text/html";
      if (!(WATCH_CONTENT_TYPES as readonly string[]).includes(mime)) {
        discard(res);
        throw new WebFetchError("unsupported_content_type", `Unsupported content type: ${mime}`);
      }
      const bytes = await readCapped(res, this.opts.maxBytes);
      const binary = mime === "application/pdf";
      return {
        kind: "ok",
        url: current.href,
        status: res.status,
        contentType,
        body: binary ? toBase64(bytes) : decodeText(bytes, contentType),
        encoding: binary ? "base64" : "utf8",
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
      };
    }
    throw new WebFetchError("too_many_redirects", "Too many redirects");
  }

  // WebFetcher compatibility (so the fetcher can be injected as ctx.web in tests).
  async fetchPage(url: string): Promise<PoliteFetchResult | null> {
    const r = await this.fetchPageConditional(url);
    if (r.kind === "robots_disallowed") return null;
    if (r.kind === "ok") {
      return {
        url: r.url,
        status: r.status,
        contentType: r.contentType,
        body: r.body,
        encoding: r.encoding,
      };
    }
    const status = r.kind === "http_error" ? r.status : 304;
    return { url: r.url, status, contentType: "text/plain", body: "" };
  }

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const u = safe(url);
    const res = await this.withTimeout((signal) =>
      this.doFetch(u.href, {
        ...init,
        signal,
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      }),
    );
    if (!res.ok) throw new Error(`GET ${u.host} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  private state(url: URL): OriginState {
    let s = this.origins.get(url.origin);
    if (!s) {
      s = { nextAllowedAt: 0 };
      this.origins.set(url.origin, s);
    }
    return s;
  }

  private async waitTurn(url: URL, crawlDelayMs: number) {
    const s = this.state(url);
    const now = this.now();
    const at = Math.max(now, s.nextAllowedAt);
    s.nextAllowedAt = at + Math.max(this.opts.minDelayMs, crawlDelayMs);
    if (at > now) await this.sleep(at - now);
  }

  private async robotsFor(url: URL): Promise<NonNullable<OriginState["robots"]>> {
    const s = this.state(url);
    if (s.robots && s.robots.expiresAt > this.now()) return s.robots;
    let target = new URL("/robots.txt", url.origin);
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
        target = safe(new URL(loc, target));
        continue;
      }
      res = r;
      break;
    }
    let policy: RobotsPolicy;
    if (!res) {
      policy = { kind: "allow_all" }; // too many redirects = unavailable (RFC 9309 §2.3.1.2)
    } else if (res.ok) {
      const bytes = await readCapped(res, ROBOTS_MAX_BYTES, false);
      policy = { kind: "rules", robots: parseRobotsTxt(new TextDecoder().decode(bytes)) };
    } else if (res.status >= 400 && res.status < 500) {
      discard(res);
      policy = { kind: "allow_all" }; // RFC 9309 §2.3.1.3
    } else {
      discard(res);
      // RFC 9309 says assume complete disallow while unreachable: we do not fetch, and report a
      // transient error so the source backs off instead of being blocked permanently.
      throw new WebFetchError("network", `robots.txt unavailable (HTTP ${res.status})`);
    }
    const group = policy.kind === "rules" ? selectGroup(policy.robots, this.token) : null;
    const crawlDelaySec = Math.min(group?.crawlDelay ?? 0, this.opts.maxCrawlDelaySec);
    s.robots = {
      policy,
      expiresAt: this.now() + this.opts.robotsTtlMs,
      crawlDelayMs: crawlDelaySec * 1000,
    };
    return s.robots;
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

/** Adapts a plain WebFetcher (e.g. the FakeWebFetcher) to the conditional interface. */
export class PlainConditionalAdapter implements ConditionalWebFetcher {
  constructor(private readonly web: WebFetcher) {}

  async robotsAllows(url: string): Promise<boolean> {
    return (await this.web.fetchPage(safe(url).href)) !== null;
  }

  async fetchPageConditional(url: string): Promise<ConditionalFetchOutcome> {
    const target = safe(url);
    const res: FetchResult | null = await this.web.fetchPage(target.href);
    if (!res) return { kind: "robots_disallowed", url: target.href };
    const finalUrl = res.url || target.href;
    if (res.status === 304) return { kind: "not_modified", url: finalUrl };
    if (res.status >= 400) return { kind: "http_error", url: finalUrl, status: res.status };
    return {
      kind: "ok",
      url: finalUrl,
      status: res.status,
      contentType: res.contentType,
      body: res.body,
      encoding: res.encoding ?? "utf8",
      etag: null,
      lastModified: null,
    };
  }
}

const realFetchers = new Map<string, ConditionalPoliteFetcher>();

/**
 * The fetcher the watchlist uses for `ctx`: ctx.web itself when it supports conditional GETs; our
 * own polite conditional fetcher in production (ctx.web is the PoliteWebFetcher, whose fixed
 * headers cannot carry validators); otherwise an adapter over ctx.web (fakes: no validators).
 */
export function watchFetcher(ctx: AppContext): ConditionalWebFetcher {
  const web = ctx.web;
  if (supportsConditional(web)) return web;
  if (web instanceof PoliteWebFetcher) {
    const ua = ctx.env.CRAWLER_USER_AGENT || "GrantAutopilotBot";
    let f = realFetchers.get(ua);
    if (!f) {
      f = new ConditionalPoliteFetcher(ua);
      realFetchers.set(ua, f);
    }
    return f;
  }
  return new PlainConditionalAdapter(web);
}

/** Conditional GET honoring robots/SSRF/UA for `url` (see watchFetcher). */
export function fetchPageConditional(
  ctx: AppContext,
  url: string,
  validators: Validators = {},
): Promise<ConditionalFetchOutcome> {
  return watchFetcher(ctx).fetchPageConditional(url, validators);
}

async function readCapped(res: Response, max: number, strict = true): Promise<ArrayBuffer> {
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

function discard(res: Response) {
  res.body?.cancel().catch(() => {});
}

function decodeText(bytes: ArrayBuffer, contentType: string): string {
  const charset = contentType.match(/charset\s*=\s*"?([\w-]+)/i)?.[1]?.toLowerCase();
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // unsupported label: fall back to utf-8
    }
  }
  return new TextDecoder().decode(bytes);
}
