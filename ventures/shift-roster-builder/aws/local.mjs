// Run the hosted hub locally with no AWS: an in-memory store and a stand-in for API Gateway's JWT authorizer.
//   node aws/local.mjs            -> http://127.0.0.1:8788 (sign-in is faked: any Bearer token is its own user id)
// Used by aws/app.test.mjs and aws/console-browser.check.mjs. Not for production: nothing is saved, and the fake
// authorizer trusts every token.
import http from "node:http";
import { pathToFileURL } from "node:url";
import { makeApp } from "./app.mjs";

// The same contract as pgStore in app.mjs, in memory (one process, so no row lock is needed).
export function memoryStore() {
  const rows = [];
  let seq = 0;
  return {
    rows,
    async withTeam(kind, hash, _lock, fn) {
      const row = rows.find((r) => (kind === "admin" ? r.admin_hash : r.team_hash) === hash);
      if (!row) return null;
      return fn({ id: row.id, state: structuredClone(row.state), settings: row.settings }, async (s) => { row.state = structuredClone(s); });
    },
    async countTeams(owner) { return rows.filter((r) => r.owner_sub === owner).length; },
    async createTeam({ owner, name, adminHash, teamHash, state, settings }) {
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
      rows.push({ id, owner_sub: owner, name, admin_hash: adminHash, team_hash: teamHash, state: structuredClone(state), settings });
      return { id };
    },
    async listTeams(owner) { return rows.filter((r) => r.owner_sub === owner).map(({ id, name, settings }) => ({ id, name, settings })); },
    async updateTeam(owner, id, { adminHash, teamHash, settings, name }) {
      const r = rows.find((x) => x.owner_sub === owner && x.id === id);
      if (!r) return false;
      if (adminHash) r.admin_hash = adminHash;
      if (teamHash) r.team_hash = teamHash;
      if (settings) r.settings = settings;
      if (name) r.name = name;
      return true;
    },
    async deleteTeam(owner, id) { const i = rows.findIndex((x) => x.owner_sub === owner && x.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
  };
}

export function serveLocal({ port = 8788, auth = { domain: null, webClientId: null }, vars = {}, entitled = () => false, store = memoryStore() } = {}) {
  const app = makeApp({ store: () => store });
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = `http://${req.headers.host}${req.url}`;
    const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined });
    let user = null;
    if (new URL(url).pathname.startsWith("/api/")) {                 // what the JWT authorizer does in AWS
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!m) { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"message":"Unauthorized"}'); }
      user = { sub: m[1] };
    }
    const out = await app.fetch(request, { VARS: vars, AUTH: auth, user, entitlement: async () => ({ entitled: !!entitled(user), status: entitled(user) ? "active" : "none" }) });
    const headers = {};
    out.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(out.status, headers);
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r({ server, store, url: `http://127.0.0.1:${server.address().port}` })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await serveLocal({ port: Number(process.env.PORT || 8788) });
  console.log(`hosted hub (local, in memory) on ${url}`);
}
