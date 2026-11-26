#!/usr/bin/env node
// Create a customer organization for a signed-in owner (POST /api/orgs), optionally invite
// teammates and grant the complimentary (pilot) plan. Node 22+, no dependencies. Run from apps/grants.
//
//   node scripts/bootstrap-org.mjs --base https://grants.example --email owner@swif.org \
//     --legal-name "Southwest Indian Foundation, Inc." --name "Southwest Indian Foundation" \
//     --org-type nonprofit_501c3 --city Gallup --state NM --accept-terms \
//     [--invite a@x.org:reviewer,b@y.org:editor] [--comp [--comp-note "Pilot partner"] [--admin-email you@x.org]]
//
// The person signing in becomes the org's owner and is the one accepting the Terms, Privacy Policy
// and Data Use Policy: they must have read them and be authorized to accept for the organization.
// Passwords are prompted for without echo; they are never accepted as flags.
import { parseArgs } from "node:util";
import {
  apiErrorText,
  createApiClient,
  ORG_TYPES,
  parseInviteList,
  promptPassword,
} from "./lib/import-helpers.mjs";

const USAGE = `Usage:
  node scripts/bootstrap-org.mjs --base <url> --email <owner email> --legal-name <name> --org-type <type>
      [--name <display name>] [--city <city>] [--state <state>] [--website <url>] --accept-terms
      [--invite a@x.org:reviewer,b@y.org:editor] [--comp [--comp-note <text>] [--admin-email <email>]]
      [--allow-duplicate]

  --org-type   one of: ${ORG_TYPES.join(", ")}
  --invite     comma-separated email:role (roles: admin, editor, reviewer, viewer; default viewer)
  --comp       grant the complimentary plan via POST /api/admin/orgs/:orgId/comp (platform admins only;
               use --admin-email to sign in as a separate admin account for that one call)

Run once without --accept-terms to print the terms summary.`;

const log = (...a) => console.error(...a);
const fail = (msg) => {
  log(`error: ${msg}`);
  process.exit(1);
};

const TERMS_SUMMARY = `
Before creating the organization, the owner accepts these policies (full text at the links below):

Terms of Service
  - The organization is the applicant: it reviews and certifies everything submitted to a funder,
    including anything Autopilot submits. Autopilot is off until an owner/admin turns it on and sets limits.
  - No guarantee of fit, deadlines or funding. Drafts use AI (Anthropic's Claude) and can be wrong.
  - No fraudulent or misleading applications; no uploading other people's confidential or personal
    information without the right to do so (Acceptable Use Policy).
  - The organization owns its content; the operator only hosts and processes it to provide the Service.

Data Use Policy
  - Documents and interview answers are used ONLY to build this organization's fact base, prepare its own
    applications, and match it to opportunities.
  - Never shared with other organizations, never used to train AI models, never sold or used for advertising,
    never used as examples for other customers.
  - Facts are proposed with a source quote and are not used as confirmed until a person confirms them.
  - Restricted facts (e.g. about individual clients) are never sent to drafting. Avoid uploading personal
    information about the people the organization serves.
  - Documents can be deleted at any time; deleting the organization deletes its files, index entries and records.
`;

function parseCli(argv) {
  if (argv.some((a) => /^--?(p|pw|pass|password|admin-password)(=|$)/i.test(a))) {
    fail("passwords are never accepted as flags; you will be prompted for them");
  }
  try {
    return parseArgs({
      args: argv,
      options: {
        base: { type: "string" },
        email: { type: "string" },
        name: { type: "string" },
        "legal-name": { type: "string" },
        "org-type": { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        website: { type: "string" },
        "accept-terms": { type: "boolean", default: false },
        invite: { type: "string" },
        comp: { type: "boolean", default: false },
        "comp-note": { type: "string", default: "Pilot partner (complimentary plan)" },
        "admin-email": { type: "string" },
        "allow-duplicate": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (e) {
    log(USAGE);
    fail(e.message);
  }
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  // Validate everything before asking for a password.
  for (const k of ["base", "email", "legal-name", "org-type"])
    if (!opts[k]) fail(`--${k} is required`);
  if (!ORG_TYPES.includes(opts["org-type"]))
    fail(`--org-type must be one of: ${ORG_TYPES.join(", ")}`);
  const { invites, errors: inviteErrors } = parseInviteList(opts.invite);
  if (inviteErrors.length) fail(`--invite: ${inviteErrors.join("; ")}`);
  const legalName = opts["legal-name"].trim();
  const name = (opts.name ?? legalName).trim();

  const client = createApiClient({
    base: opts.base,
    onRetry: ({ status, ms }) =>
      log(
        `  ${status === 429 ? "rate limited" : `HTTP ${status}`}; retrying in ${Math.ceil(ms / 1000)}s`,
      ),
  });

  // Current policy version from the deployment itself (createOrg rejects a stale version).
  const legal = await client.request("GET", "/api/legal");
  if (!legal.ok) fail(`GET /api/legal failed: ${apiErrorText(legal)}`);
  const docs = legal.data?.items ?? [];
  const policyVersion = docs.find((d) => d.key === "terms")?.version ?? docs[0]?.version;
  if (!policyVersion) fail("could not read the current policy version from /api/legal");

  console.log(TERMS_SUMMARY);
  for (const d of docs)
    console.log(`  ${d.title.padEnd(24)} v${d.version}  ${client.origin}/legal/${d.key}`);
  console.log("");
  if (!opts["accept-terms"]) {
    fail(
      "re-run with --accept-terms once the owner signing in has read the policies above and is authorized to accept them for the organization",
    );
  }

  const password = await promptPassword(`Password for ${opts.email} (becomes the owner): `);
  if (!password) fail("no password entered");
  let orgId;
  try {
    await client.signIn(opts.email, password);

    const me = await client.request("GET", "/api/me");
    if (!me.ok) throw new Error(`GET /api/me failed: ${apiErrorText(me)}`);
    const same = (me.data.memberships ?? []).find(
      (m) => m.orgName?.trim().toLowerCase() === name.toLowerCase(),
    );
    if (same && !opts["allow-duplicate"]) {
      throw new Error(
        `${opts.email} already belongs to "${same.orgName}" (${same.orgId}, ${same.role}). Use that org, or pass --allow-duplicate to create another.`,
      );
    }

    const body = {
      name,
      legalName,
      orgType: opts["org-type"],
      ...(opts.city ? { city: opts.city } : {}),
      ...(opts.state ? { state: opts.state } : {}),
      ...(opts.website ? { websiteUrl: opts.website } : {}),
      acceptTerms: true,
      policyVersion,
    };
    const created = await client.request("POST", "/api/orgs", { json: body });
    if (created.status !== 201) {
      const code = created.data?.error?.code;
      if (code === "policy_version_mismatch") {
        throw new Error(
          `policies changed (now ${created.data.error.details?.currentVersion}); re-run to review them`,
        );
      }
      throw new Error(`creating the organization failed: ${apiErrorText(created)}`);
    }
    orgId = created.data.orgId;
    log(
      `Created "${name}" (${orgId}); ${opts.email} is the owner. Terms v${policyVersion} accepted.`,
    );

    for (const inv of invites) {
      const r = await client.request(
        "POST",
        `/api/orgs/${encodeURIComponent(orgId)}/members/invitations`,
        { json: inv },
      );
      if (r.status === 201) log(`  invited ${inv.email} as ${inv.role} (they get an email link)`);
      else log(`  could not invite ${inv.email}: ${apiErrorText(r)}`);
    }
    // Same account for the comp call: reuse this session rather than asking for the password again.
    if (opts.comp && !opts["admin-email"])
      await requestComp(client, opts.email, orgId, opts["comp-note"]);
  } finally {
    await client.signOut();
  }

  if (opts.comp && opts["admin-email"]) await grantCompAsAdmin(opts, orgId);

  console.log(orgId);
  log(
    `\nNext: node scripts/import-documents.mjs --base ${client.origin} --email ${opts.email} --org ${orgId} --dir <folder> --dry-run`,
  );
}

/** POST /api/admin/orgs/:orgId/comp. The route may not exist yet: a 404 is reported, not fatal. */
async function requestComp(client, who, orgId, note) {
  const r = await client.request("POST", `/api/admin/orgs/${encodeURIComponent(orgId)}/comp`, {
    json: { note },
  });
  if (r.ok && r.data !== null) log(`Comp plan granted to ${orgId}.`);
  else if (r.status === 404) {
    log(
      "Comp plan NOT granted: this deployment has no POST /api/admin/orgs/:orgId/comp route yet.",
    );
    log(`  Ask an operator to grant it with the billing service's grantComp() for ${orgId}.`);
  } else if (r.status === 401 || r.status === 403) {
    log(
      `Comp plan NOT granted: ${who} is not a platform admin (${apiErrorText(r)}). Try --admin-email.`,
    );
  } else log(`Comp plan NOT granted: ${apiErrorText(r)}`);
}

/** Separate admin account for the comp call (the org owner is normally not a platform admin). */
async function grantCompAsAdmin(opts, orgId) {
  const who = opts["admin-email"];
  const client = createApiClient({ base: opts.base });
  try {
    const password = await promptPassword(
      `Password for ${who} (platform admin, for the comp plan): `,
    );
    if (!password) throw new Error("no password entered");
    await client.signIn(who, password);
    await requestComp(client, who, orgId, opts["comp-note"]);
  } catch (e) {
    log(`Comp plan NOT granted: ${e.message}`);
  } finally {
    await client.signOut();
  }
}

main().catch((e) => fail(e.message));
