// The team hub on Cloudflare's free Workers plan: the same handler as server.mjs (hub.mjs), with the state in one
// Durable Object instead of a JSON file. Its self-deploy route was withdrawn on 2026-11-27 (README, "The Worker
// build of the hub"); the hub is offered only as the hosted team hub (aws/app.mjs).
//
// Why a Durable Object: one instance holds the team's state and handles one request at a time, so two staff members
// sending a call-out in the same second cannot overwrite each other (KV is eventually consistent and could).
// Why the build happens in the manager's browser: a free Worker gets about 10 ms of CPU a request and one roster
// search takes hundreds of ms, so BUILD_IN_BROWSER is always on here and the Worker only checks and prices the roster
// the browser sends (rosterFromOwner). calc.mjs and bnp.mjs reach the browser as static assets.
import { handler, emptyState } from "./hub.mjs";
import { trimPunches } from "./timeclock.mjs";

const MAX_STATE = 1_500_000; // bytes of JSON; a Durable Object value can hold about 2 MB

// Run a Node-style (req, res) handler on a fetch Request and return the Response.
export async function serve(hub, request) {
  const u = new URL(request.url);
  const body = request.body;
  const req = {
    method: request.method,
    url: u.pathname + u.search,
    headers: Object.fromEntries(request.headers),
    async *[Symbol.asyncIterator]() { if (body) for await (const c of body) yield c; },
  };
  let status = 500, headers = {}, out = "";
  const res = { writeHead(code, h) { status = code; headers = h || {}; }, end(b) { out = b ?? ""; } };
  await hub(req, res);
  return new Response(status === 204 || status === 304 ? null : out, { status, headers });
}

// The state a Worker keeps: a fresh state with whatever was saved laid over it.
export const loadState = (saved) => ({ ...emptyState(), ...(saved && typeof saved === "object" ? saved : {}) });

export class RosterHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    this.ready = ctx.blockConcurrencyWhile(async () => { this.state = loadState(await ctx.storage.get("state")); });
  }
  async fetch(request) {
    await this.ready;
    if (!this.hub) {
      const save = () => {
        // Requests are already capped (64 KB, 200 replies, 100 of each request list, 12 weeks of history); this is a
        // last guard so one oversized state cannot wedge the hub.
        if (JSON.stringify(this.state).length > MAX_STATE) { this.state.history = (this.state.history || []).slice(-4); trimPunches(this.state, 1500, Date.now()); }
        return this.ctx.storage.put("state", this.state);
      };
      this.hub = handler(this.state, save, { ...this.env, BUILD_IN_BROWSER: "1" });
    }
    return serve(this.hub, request);
  }
}

export default {
  async fetch(request, env) {
    // One team per deploy: every request goes to the same Durable Object.
    return env.HUB.get(env.HUB.idFromName("team")).fetch(request);
  },
};
