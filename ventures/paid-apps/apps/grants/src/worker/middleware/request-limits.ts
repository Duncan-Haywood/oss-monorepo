// Request body caps per route group + JSON content-type enforcement.
//
// - Declared Content-Length over the cap → 413 before the body is read.
// - Bodies without a (trusted) length are counted while streaming; the request fails with 413 as soon
//   as the cap is crossed, without buffering the body here.
// - JSON routes with a body must send `Content-Type: application/json` (415 otherwise). This also
//   blocks "simple" cross-site form posts (text/plain, x-www-form-urlencoded) at the API boundary.
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const MiB = 1024 * 1024;

export interface BodyRule {
  name: string;
  /** Full request path (e.g. /api/orgs/org_1/documents). Methods default to any body method. */
  path: RegExp;
  methods?: readonly string[];
  maxBytes: number;
  /** Require application/json (or +json) when a body is present. */
  requireJson: boolean;
}

const ORG = "^/api/orgs/[^/]+";

/** First matching rule wins; requests matching none use DEFAULT_JSON_RULE. */
export const BODY_RULES: readonly BodyRule[] = [
  // Multipart uploads: 25 MiB file (MAX_UPLOAD_BYTES) + 1 MiB multipart envelope.
  {
    name: "upload",
    path: new RegExp(`${ORG}/(documents|imports/rfp|interviews/transcript|transcribe)$`),
    methods: ["POST"],
    maxBytes: 26 * MiB,
    requireJson: false,
  },
  // Pasted documents are JSON but up to MAX_TEXT_CHARS (2M chars) of UTF-8.
  {
    name: "large_json",
    path: new RegExp(`${ORG}/documents/text$`),
    methods: ["POST"],
    maxBytes: 8 * MiB,
    requireJson: true,
  },
  // Signature-verified raw bodies; providers choose their own content types.
  // Slack slash commands: signed form posts (application/x-www-form-urlencoded).
  {
    name: "slack_command",
    path: /^\/api\/integrations\/slack\/command$/,
    methods: ["POST"],
    maxBytes: 16 * 1024,
    requireJson: false,
  },
  // Partner letter upload (public): 10 MiB file + 1 MiB multipart envelope.
  {
    name: "letter_upload",
    path: /^\/api\/letters\/[^/]+\/upload$/,
    methods: ["POST"],
    maxBytes: 11 * MiB,
    requireJson: false,
  },
  // RFC 8058 one-click unsubscribe: mail providers POST `List-Unsubscribe=One-Click` as a form
  // (x-www-form-urlencoded or multipart). The signed token in the URL is the credential.
  {
    name: "one_click_unsubscribe",
    path: /^\/api\/(newsletter|email)\/unsubscribe$/,
    methods: ["POST"],
    maxBytes: 16 * 1024,
    requireJson: false,
  },
  { name: "webhook", path: /^\/api\/billing\/webhook(\/|$)/, maxBytes: MiB, requireJson: false },
  // Better Auth parses its own bodies (JSON, and form posts for some OAuth flows).
  { name: "auth", path: /^\/api\/auth(\/|$)/, maxBytes: 64 * 1024, requireJson: false },
];

export const DEFAULT_JSON_RULE: BodyRule = {
  name: "json",
  path: /^\//,
  maxBytes: MiB,
  requireJson: true,
};

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function ruleFor(method: string, path: string, rules: readonly BodyRule[] = BODY_RULES) {
  return (
    rules.find((r) => (!r.methods || r.methods.includes(method)) && r.path.test(path)) ??
    DEFAULT_JSON_RULE
  );
}

export const isJsonContentType = (ct: string | undefined) => {
  const type = (ct ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "application/json" || (type.startsWith("application/") && type.endsWith("+json"));
};

const tooLarge = (c: Context<AppEnv>, maxBytes: number) =>
  c.json(
    {
      error: {
        code: "payload_too_large",
        message: `Request body is too large (max ${formatBytes(maxBytes)})`,
      },
    },
    413,
  );

const formatBytes = (n: number) => (n >= MiB ? `${Math.round(n / MiB)} MB` : `${n / 1024} KB`);

export interface RequestLimitsOptions {
  rules?: readonly BodyRule[];
}

export function requestLimits(opts: RequestLimitsOptions = {}) {
  const rules = opts.rules ?? BODY_RULES;
  return createMiddleware<AppEnv>(async (c, next) => {
    const method = c.req.method;
    if (!BODY_METHODS.has(method)) return next();
    const rule = ruleFor(method, c.req.path, rules);

    const lengthHeader = c.req.header("content-length");
    const declared = lengthHeader === undefined ? null : Number(lengthHeader);
    if (declared !== null && (!Number.isFinite(declared) || declared < 0)) {
      return c.json({ error: { code: "bad_request", message: "Invalid Content-Length" } }, 400);
    }
    if (declared !== null && declared > rule.maxBytes) return tooLarge(c, rule.maxBytes);

    const raw = c.req.raw;
    const hasBody = declared !== null ? declared > 0 : raw.body !== null;
    if (!hasBody) return next();

    if (rule.requireJson && !isJsonContentType(c.req.header("content-type"))) {
      return c.json(
        {
          error: {
            code: "unsupported_media_type",
            message: "Send the request body as JSON (Content-Type: application/json)",
          },
        },
        415,
      );
    }

    // Streaming enforcement for bodies whose length was not declared (chunked) — and as defence in
    // depth for declared ones: count bytes as the handler reads them.
    if (!raw.body) return next();
    let received = 0;
    let exceeded = false;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > rule.maxBytes) {
          exceeded = true;
          controller.error(new Error("payload_too_large"));
          return;
        }
        controller.enqueue(chunk);
      },
    });
    c.req.raw = new Request(raw, {
      body: raw.body.pipeThrough(counter),
      duplex: "half",
    } as RequestInit);

    await next();
    // However the handler surfaced the aborted read (400 malformed JSON, 500, ...), report a 413.
    if (exceeded) c.res = tooLarge(c, rule.maxBytes);
  });
}
