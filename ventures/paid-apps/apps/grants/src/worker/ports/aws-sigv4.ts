// AWS Signature Version 4 (header auth) with WebCrypto only: no AWS SDK, no Node built-ins, so it
// runs unchanged on Cloudflare Workers, Node 20+ and browsers. Used by the Claude Platform on AWS
// client (claude-on-aws.ts) and the SES email adapter (ses-email.ts).
//
// Spec: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
// Verified against AWS's published test vector `get-vanilla` and against signatures computed by
// botocore 1.44 for the two requests we make (aws-sigv4.test.ts).
//
// Self-contained on purpose (no app imports) so it can move to packages/saas-kit as is.

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  /** Temporary (STS / role) credentials only. */
  sessionToken?: string;
}

export type SignableBody = string | Uint8Array | ArrayBuffer | null | undefined;

export interface SignRequestInput {
  method: string;
  url: string | URL;
  headers?: HeadersInit;
  body?: SignableBody;
  /** Signing name, e.g. "ses" or "aws-external-anthropic". */
  service: string;
  region: string;
  credentials: AwsCredentials;
  /** Signing time; defaults to now. */
  date?: Date;
}

/**
 * Which request headers go into the signature. Besides `host` and the `x-amz-*` headers we sign
 * only what the services need to be protected from tampering (`content-type`, the `anthropic-*`
 * headers incl. the workspace id). Headers a runtime or proxy may rewrite after signing
 * (accept-encoding, user-agent, content-length, trace headers) are left out on purpose.
 */
export function isSignedHeader(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n === "host" ||
    n === "content-type" ||
    n === "content-md5" ||
    n.startsWith("x-amz-") ||
    n.startsWith("anthropic-")
  );
}

const enc = new TextEncoder();

function toBytes(body: SignableBody): Uint8Array {
  if (body == null) return new Uint8Array();
  if (typeof body === "string") return enc.encode(body);
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(body);
}

function hex(buf: ArrayBuffer): string {
  let out = "";
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(data: SignableBody): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", toBytes(data) as BufferSource));
}

async function hmac(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 percent-encoding as SigV4 wants it (unreserved: A-Z a-z 0-9 - _ . ~). */
export function uriEncode(s: string, keepSlash = false): string {
  let out = "";
  for (const byte of enc.encode(s)) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === "/")) out += c;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

/** "20261124T091530Z" */
export function amzDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** The derived signing key: HMAC chain over date, region, service and "aws4_request". */
export async function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function canonicalQuery(url: URL): string {
  const pairs: [string, string][] = [];
  for (const [k, v] of url.searchParams) pairs.push([uriEncode(k), uriEncode(v)]);
  pairs.sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Signs a request and returns the headers to send: the input headers (minus any Authorization /
 * x-api-key) plus `authorization`, `x-amz-date` and, with temporary credentials,
 * `x-amz-security-token`. The body must be sent byte-for-byte as given.
 */
export async function signRequest(input: SignRequestInput): Promise<Headers> {
  const url = new URL(input.url);
  const date = input.date ?? new Date();
  const stamp = amzDate(date);
  const dateStamp = stamp.slice(0, 8);
  const { credentials: creds } = input;

  const headers = new Headers(input.headers);
  headers.delete("authorization");
  headers.delete("x-api-key");
  headers.set("host", url.host);
  headers.set("x-amz-date", stamp);
  if (creds.sessionToken) headers.set("x-amz-security-token", creds.sessionToken);
  else headers.delete("x-amz-security-token");

  const signed: [string, string][] = [];
  headers.forEach((value, name) => {
    if (isSignedHeader(name)) signed.push([name.toLowerCase(), value.trim().replace(/\s+/g, " ")]);
  });
  signed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = signed.map(([n]) => n).join(";");

  // Non-S3 services: the (already percent-encoded) path is encoded once more.
  const canonicalUri = uriEncode(url.pathname || "/", true);
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery(url),
    `${signed.map(([n, v]) => `${n}:${v}`).join("\n")}\n`,
    signedHeaders,
    await sha256Hex(input.body),
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256Hex(canonicalRequest)].join(
    "\n",
  );
  const key = await signingKey(creds.secretAccessKey, dateStamp, input.region, input.service);
  const signature = hex(await hmac(key, stringToSign));

  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
  // `host` is set by the runtime from the URL; fetch implementations refuse to set it themselves.
  headers.delete("host");
  return headers;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface SigV4FetchOptions {
  service: string;
  region: string;
  credentials: AwsCredentials;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

/**
 * A `fetch` that SigV4-signs every request it sends (each retry is signed afresh, so the
 * timestamp is always current). Bodies must be strings or bytes; streams and FormData are refused,
 * since the payload hash needs the whole body up front.
 */
export function createSigV4Fetch(opts: SigV4FetchOptions): FetchLike {
  const doFetch: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  return async (input, init) => {
    let url: string;
    let method = init?.method ?? "GET";
    let headersInit: HeadersInit | undefined = init?.headers;
    let body: SignableBody;
    if (input instanceof Request) {
      url = input.url;
      method = init?.method ?? input.method;
      headersInit = init?.headers ?? input.headers;
      body = init?.body != null ? toSignableBody(init.body) : await input.clone().arrayBuffer();
    } else {
      url = String(input);
      body = toSignableBody(init?.body);
    }
    const headers = await signRequest({
      method,
      url,
      headers: headersInit,
      body,
      service: opts.service,
      region: opts.region,
      credentials: opts.credentials,
      date: opts.now?.(),
    });
    return doFetch(url, {
      ...init,
      method,
      headers,
      body: body == null || method === "GET" || method === "HEAD" ? undefined : (body as BodyInit),
    });
  };
}

function toSignableBody(body: unknown): SignableBody {
  if (body == null) return undefined;
  if (typeof body === "string" || body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return body;
  }
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new Error("SigV4 signing needs a string or byte body (streams and FormData unsupported)");
}

/** AWS region names only (e.g. us-east-1, eu-west-2, us-gov-west-1): they end up in a hostname. */
export const AWS_REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/;

export function assertAwsRegion(region: string): string {
  if (!AWS_REGION_RE.test(region)) throw new Error(`Invalid AWS region: ${JSON.stringify(region)}`);
  return region;
}
