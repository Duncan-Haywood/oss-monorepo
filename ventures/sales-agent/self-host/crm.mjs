// Sales Agent M8a: write what the agent read back into the deployer's own CRM. Off unless a CRM token is set.
// Only ever *records or reduces contact*: it adds a note to a person who already exists (found by exact email) and,
// for an unsubscribe, sets that CRM's own opt-out flag. It never creates people or deals, moves a stage, deletes or sends.
// Failures are returned, not thrown: the CRM being down must not stop triage.
//
// Env: PIPEDRIVE_API_TOKEN [PIPEDRIVE_BASE=https://api.pipedrive.com]   (v1 API, x-api-token header)
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
  if (env.PIPEDRIVE_API_TOKEN) targets.push(pipedrive(env.PIPEDRIVE_API_TOKEN, (env.PIPEDRIVE_BASE || "https://api.pipedrive.com").replace(/\/$/, ""), fetchImpl));
  if (env.HUBSPOT_TOKEN) targets.push(hubspot(env.HUBSPOT_TOKEN, (env.HUBSPOT_BASE || "https://api.hubapi.com").replace(/\/$/, ""), fetchImpl));
  if (!targets.length) return null;
  return {
    names: targets.map((t) => t.name),
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

function pipedrive(token, base, fetchImpl) {
  const h = { "x-api-token": token, "content-type": "application/json", accept: "application/json" };
  return { name: "pipedrive", secret: token, async log(email, r) {
    const s = await call(fetchImpl, `${base}/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&limit=1`, { headers: h });
    const id = s?.data?.items?.[0]?.item?.id;
    if (id == null) return { found: false };
    await call(fetchImpl, `${base}/v1/notes`, { method: "POST", headers: h, body: JSON.stringify({ content: noteText(r), person_id: id }) });
    let optedOut = false;
    if (r.optOut) { await call(fetchImpl, `${base}/v1/persons/${id}`, { method: "PUT", headers: h, body: JSON.stringify({ marketing_status: "unsubscribed" }) }); optedOut = true; }
    return { found: true, noted: true, optedOut };
  } };
}

function hubspot(token, base, fetchImpl) {
  const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return { name: "hubspot", secret: token, async log(email, r) {
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
