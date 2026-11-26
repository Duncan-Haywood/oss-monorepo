// Builds a complete export of one organization's data: every tenant table's rows as JSON plus the
// org's files from R2 (originals, extracted text, audio, submitted packages) under files/.
import { POLICY_VERSION } from "@shared/legal";
import { eq } from "drizzle-orm";
import { type Zippable, zipSync } from "fflate";
import type { AppContext } from "../../context";
import { member, organization, user } from "../../db/schema";
import { listKeys, orgPrefix } from "./r2";
import { tenantTables } from "./tenant-tables";

export interface ExportManifest {
  orgId: string;
  orgName: string;
  generatedAt: string;
  policyVersion: string;
  tables: Record<string, number>;
  files: { path: string; bytes: number }[];
}

const README = `Grant Autopilot data export

data/<table>.json  every database record belonging to your organization, one file per table
data/users.json    name and email of your organization's members
files/...          your files as stored (documents/<id>/original is the original upload)
manifest.json      row counts, file list and the policy version in effect

Dates are ISO-8601 (UTC). Money is in integer US cents.
Exports are deleted automatically 7 days after they are created.
`;

const enc = new TextEncoder();
const jsonBytes = (v: unknown) => enc.encode(`${JSON.stringify(v, null, 2)}\n`);

export async function buildOrgExport(ctx: AppContext, orgId: string) {
  const org = await ctx.db.select().from(organization).where(eq(organization.id, orgId)).get();
  if (!org) throw new Error("organization not found");

  const zip: Zippable = {};
  const manifest: ExportManifest = {
    orgId,
    orgName: org.name,
    generatedAt: ctx.now().toISOString(),
    policyVersion: POLICY_VERSION,
    tables: { organization: 1 },
    files: [],
  };
  zip["data/organization.json"] = jsonBytes([org]);

  for (const t of tenantTables()) {
    const rows = await ctx.db.select().from(t.table).where(eq(t.orgColumn, orgId)).all();
    zip[`data/${t.name}.json`] = jsonBytes(rows);
    manifest.tables[t.name] = rows.length;
  }

  // Join rather than an IN list of member ids (an org can have more than D1's 100 bound params).
  const users = await ctx.db
    .select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .all();
  zip["data/users.json"] = jsonBytes(users);
  manifest.tables.users = users.length;

  const prefix = orgPrefix(orgId);
  const exportsPrefix = `${prefix}exports/`;
  for (const key of await listKeys(ctx.env.FILES, prefix)) {
    if (key.startsWith(exportsPrefix)) continue;
    const obj = await ctx.env.FILES.get(key);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const path = `files/${key.slice(prefix.length)}`;
    // Files are often already compressed (PDF, DOCX, audio): store them as-is.
    zip[path] = [bytes, { level: 0 }];
    manifest.files.push({ path, bytes: bytes.byteLength });
  }

  zip["manifest.json"] = jsonBytes(manifest);
  zip["README.txt"] = enc.encode(README);
  return { bytes: zipSync(zip, { level: 6 }), manifest };
}
