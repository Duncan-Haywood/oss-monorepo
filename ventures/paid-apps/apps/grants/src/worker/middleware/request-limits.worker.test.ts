// Same body-limit behaviour as request-limits.test.ts, but inside workerd (its Request/stream
// implementation differs from Node's), with a JSON body parsed the way zValidator does.
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../types";
import { MiB, requestLimits } from "./request-limits";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestLimits());
  app.post("*", async (c) => c.json({ keys: Object.keys(await c.req.json()) }));
  app.onError((_e, c) => c.json({ error: { code: "bad_request", message: "x" } }, 400));
  return app;
}

function jsonStream(payloadBytes: number) {
  const enc = new TextEncoder();
  const parts = [enc.encode('{"a":"'), new Uint8Array(payloadBytes).fill(0x61), enc.encode('"}')];
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = parts.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
}

const req = (bytes: number) =>
  new Request("http://localhost/api/orgs/o/facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: jsonStream(bytes),
  });

describe("requestLimits in workerd", () => {
  it("streams small bodies through untouched", async () => {
    const res = await makeApp().fetch(req(1000));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: ["a"] });
  });

  it("turns an oversized streamed body into a 413", async () => {
    const res = await makeApp().fetch(req(MiB + 1));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "payload_too_large",
    );
  });
});
