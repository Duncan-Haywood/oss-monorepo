// Sales Agent M8a: write what the agent read back into the deployer's own CRM. Off unless a CRM token is set.
// Only ever *records or reduces contact*: it adds a note to a person who already exists (found by exact email) and,
// for an unsubscribe, sets that CRM's own opt-out flag. It never creates people or deals, moves a stage, deletes or sends.
// M8b adds one more write, and only on a person's click: `moveStage` moves the contact's single open deal to the
// stage the deployer named in env. It does nothing when there are zero or several open deals (no guessing which).
// Failures are returned, not thrown: the CRM being down must not stop triage.
//
// Env: PIPEDRIVE_API_TOKEN [PIPEDRIVE_BASE=https://api.pipedrive.com]   (v1 API, x-api-token header)
//      PIPEDRIVE_MEETING_STAGE_ID / HUBSPOT_MEETING_STAGE   the stage a person-approved "interested" reply moves a deal to
//      HUBSPOT_TOKEN       [HUBSPOT_BASE=https://api.hubapi.com]        (private-app token, scopes crm.objects.contacts.read/write)
const EMAIL = /[\w.+'-]+@[\w.-]+/;

/** The note text: what was read, the words it was read from, and that an agent wrote it. */
export function noteText({ category, evidence, subject, date, suppressed }) {
  return [`Sales Agent read a reply${subject ? ` to "${subject}"` : ""} on ${date}: ${category}.`,
    evidence ? `Their words: "${String(evidence).slice(0, 300)}"` : "",
    suppressed ? "Added to the suppression list; do not contact." : "",
    "Written by Sales Agent; check it against the reply."].filter(Boolean).join("\n");
}

export function crmFromEnv(env = process.env, { fetchImpl = fetch } = {}) {
  const targets = [];
  if (env.PIPEDRIVE_API_TOKEN) targets.push(pipedrive(env.PIPEDRIVE_API_TOKEN, (env.PIPEDRIVE_BASE || "https://api.pipedrive.com").replace(/\/$/, ""), fetchImpl, env.PIPEDRIVE_MEETING_STAGE_ID));
  if (env.HUBSPOT_TOKEN) targets.push(hubspot(env.HUBSPOT_TOKEN, (env.HUBSPOT_BASE || "https://api.hubapi.com").replace(/\/$/, ""), fetchImpl, env.HUBSPOT_MEETING_STAGE));
  if (!targets.length) return null;
  return {
    names: targets.map((t) => t.name),
    /** Stage ids the deployer set; empty means stage moves are off. */
    stages: Object.fromEntries(targets.filter((t) => t.stageId).map((t) => [t.name, t.stageId])),
    /** @returns {Promise<Array<{crm, ok, moved?, reason?, error?}>>} call only after a person approved the move */
    async moveStage({ from }) {
      const email = ((String(from || "").match(EMAIL) || [""])[0]).toLowerCase();
      if (!email) return [];
      const out = [];
      for (const t of targets.filter((x) => x.stageId)) {
        try { out.push({ crm: t.name, ok: true, ...(await t.stage(email)) }); }
        catch (e) { out.push({ crm: t.name, ok: false, error: String(e.message || e).split(t.secret).join("***") }); }
      }
      return out;
    },
    /** @returns {Promise<Array<{crm, ok, found?, noted?, optedOut?, error?}>>} one result per CRM */
    async logReply({ from, ...rest }) {
      const email = ((String(from || "").match(EMAIL) || [""])[0]).toLowerCase();
      if (!email) return [];
      const out = [];
      for (const t of targets) {
        try { out.push({ crm: t.name, ok: true, ...(await t.log(email, rest)) }); }
        catch (e) { out.push({ crm: t.name, ok: false, error: String(e.message || e).split(t.secret).join("***") }); }
      }
      return out;
    },
  };
}

async function call(fetchImpl, url, init, secret) {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${new URL(url).pathname} answered ${res.status}`);
  return res.status === 204 ? {} : res.json();
}

function pipedrive(token, base, fetchImpl, stageId) {
  const h = { "x-api-token": token, "content-type": "application/json", accept: "application/json" };
  return { name: "pipedrive", secret: token, stageId, async stage(email) {
    const s = await call(fetchImpl, `${base}/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&limit=1`, { headers: h });
    const id = s?.data?.items?.[0]?.item?.id;
    if (id == null) return { moved: false, reason: "no such contact" };
    const d = (await call(fetchImpl, `${base}/v1/persons/${id}/deals?status=open`, { headers: h }))?.data || [];
    if (d.length !== 1) return { moved: false, reason: d.length ? "several open deals: move it yourself" : "no open deal" };
    await call(fetchImpl, `${base}/v1/deals/${d[0].id}`, { method: "PUT", headers: h, body: JSON.stringify({ stage_id: Number(stageId) }) });
    return { moved: true, deal: d[0].id };
  }, async log(email, r) {
    const s = await call(fetchImpl, `${base}/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&limit=1`, { headers: h });
    const id = s?.data?.items?.[0]?.item?.id;
    if (id == null) return { found: false };
    await call(fetchImpl, `${base}/v1/notes`, { method: "POST", headers: h, body: JSON.stringify({ content: noteText(r), person_id: id }) });
    let optedOut = false;
    if (r.optOut) { await call(fetchImpl, `${base}/v1/persons/${id}`, { method: "PUT", headers: h, body: JSON.stringify({ marketing_status: "unsubscribed" }) }); optedOut = true; }
    return { found: true, noted: true, optedOut };
  } };
}

function hubspot(token, base, fetchImpl, stageId) {
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return { name: "hubspot", secret: token, stageId, async stage(email) {
    const s = await call(fetchImpl, `${base}/crm/v3/objects/contacts/search`, { method: "POST", headers: h, body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], limit: 1 }) });
    const id = s?.results?.[0]?.id;
    if (id == null) return { moved: false, reason: "no such contact" };
    const a = (await call(fetchImpl, `${base}/crm/v4/objects/contacts/${id}/associations/deals`, { headers: h }))?.results || [];
    if (a.length !== 1) return { moved: false, reason: a.length ? "several deals: move it yourself" : "no deal" };
    const deal = a[0].toObjectId;
    await call(fetchImpl, `${base}/crm/v3/objects/deals/${deal}`, { method: "PATCH", headers: h, body: JSON.stringify({ properties: { dealstage: stageId } }) });
    return { moved: true, deal };
  }, async log(email, r) {
    const s = await call(fetchImpl, `${base}/crm/v3/objects/contacts/search`, { method: "POST", headers: h, body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], limit: 1 }) });
    const id = s?.results?.[0]?.id;
    if (id == null) return { found: false };
    await call(fetchImpl, `${base}/crm/v3/objects/notes`, { method: "POST", headers: h, body: JSON.stringify({
      properties: { hs_timestamp: new Date(r.date + "T12:00:00Z").toISOString(), hs_note_body: noteText(r).replace(/\n/g, "<br>") },
      associations: [{ to: { id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }] }) });
    let optedOut = false;
    if (r.optOut) { await call(fetchImpl, `${base}/crm/v3/objects/contacts/${id}`, { method: "PATCH", headers: h, body: JSON.stringify({ properties: { hs_email_optout: "true" } }) }); optedOut = true; }
    return { found: true, noted: true, optedOut };
  } };
}
