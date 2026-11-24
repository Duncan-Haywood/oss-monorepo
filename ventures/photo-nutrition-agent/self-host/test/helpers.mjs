import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { openStore } from "../store.mjs";
import { fakeAnalyzer } from "../analyze.mjs";
import { Auth } from "../auth.mjs";
import { createApp } from "../app.mjs";

export const DEVICE = "device-token-for-tests-0123456789";
export const API = "api-token-for-tests-0123456789abcd";
export const PASSWORD = "owner-password-for-tests";

export const steak = {
  kind: "meal",
  consumed_likelihood: 0.95,
  relation_to_recent_meal: "none",
  meal_name: "Steak with potatoes",
  overall_confidence: 0.8,
  items: [
    { name: "sirloin steak", grams: 227, preparation: "grilled", confidence: 0.75, energy_low_kcal: 380, energy_high_kcal: 560, nutrients: { energy_kcal: 460, protein_g: 66, carbs_g: 0, fat_g: 21, fiber_g: null, sugar_g: null, sat_fat_g: 8, sodium_mg: 130 } },
    { name: "roast potatoes", grams: 150, preparation: "roasted in oil", confidence: 0.7, energy_low_kcal: 160, energy_high_kcal: 260, nutrients: { energy_kcal: 210, protein_g: 4, carbs_g: 30, fat_g: 8, fiber_g: 3, sugar_g: 1, sat_fat_g: 1, sodium_mg: 300 } },
  ],
  label: null,
  notes: "",
};

export function startApp({ fixtures = {}, fail, start = "2026-11-20T18:30:00Z", analyzer: useAnalyzer = true } = {}) {
  const clock = { t: new Date(start) };
  const store = openStore(":memory:", { now: () => new Date(clock.t) });
  const analyzer = useAnalyzer ? fakeAnalyzer(fixtures, { fail }) : null;
  return new Promise((resolve) => {
    const holder = {};
    const server = createServer((req, res) => holder.handler(req, res));
    server.listen(0, "127.0.0.1", () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const auth = new Auth(store, { baseUrl: base, ownerPassword: PASSWORD, apiTokens: [API], deviceTokens: [DEVICE] });
      holder.handler = createApp({ store, analyzer, auth, logger: { error() {} } });
      const call = async (method, path, body, token = API, headers = {}) => {
        const res = await fetch(base + path, {
          method,
          redirect: "manual",
          headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
          body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        });
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = text;
        }
        return { status: res.status, body: json, headers: res.headers };
      };
      const device = (method, path, body) => call(method, path, body, DEVICE);
      let rpcId = 0;
      const mcp = async (method, params) => {
        const r = await call("POST", "/mcp", { jsonrpc: "2.0", id: ++rpcId, method, params });
        return r.body;
      };
      const tool = async (name, args = {}) => {
        const r = await mcp("tools/call", { name, arguments: args });
        if (r.error) throw new Error(r.error.message);
        if (r.result.isError) throw new Error(r.result.content[0].text);
        return r.result.structuredContent;
      };
      resolve({ base, store, analyzer, auth, clock, call, device, mcp, tool, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export function photo(key, captured_at, extra = {}) {
  return {
    asset_id: extra.asset_id || `asset-${key}-${randomBytes(3).toString("hex")}`,
    captured_at,
    tz_offset_min: -300,
    time_zone: "America/New_York",
    food_score: 0.9,
    has_camera_exif: true,
    is_screenshot: false,
    image_base64: Buffer.from(key).toString("base64"),
    ...extra,
  };
}

export const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
