// Polite outbound HTTP for crawling org websites and reading public grant listings.
// Implementations MUST honor robots.txt, identify with CRAWLER_USER_AGENT and rate-limit per host.
export interface FetchResult {
  url: string; // final URL after redirects
  status: number;
  contentType: string;
  body: string;
  /** "base64" when body holds binary content (e.g. PDF). Defaults to utf8 text. */
  encoding?: "utf8" | "base64";
}

export interface WebFetcher {
  /** Returns null when robots.txt disallows the URL. */
  fetchPage(url: string): Promise<FetchResult | null>;
  /** JSON API call (official APIs such as Grants.gov). Not subject to robots.txt. */
  fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
}
