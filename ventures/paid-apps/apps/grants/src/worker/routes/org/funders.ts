// OWNER: funders-crm — /api/orgs/:orgId/funders (funder relationship tracker)
//   GET    /                       ?stage=prospect,cultivating|all &q= &owner=
//                                  -> { items: FunderRelationSummaryDto[], counts, canEdit }
//   POST   /                       (editor+) CreateFunderRelationInput -> 201 FunderRelationDto
//   GET    /:id                    -> FunderDetailResponse (timeline, contacts, interactions, …)
//   PATCH  /:id                    (editor+) UpdateFunderRelationInput -> FunderRelationDto
//   GET    /:id/contacts           -> { items: FunderContactDto[] }
//   POST   /:id/contacts           (editor+) -> 201 FunderContactDto
//   PATCH  /:id/contacts/:cid      (editor+) -> FunderContactDto
//   DELETE /:id/contacts/:cid      (editor+) -> 204
//   GET    /:id/interactions       -> { items: FunderInteractionDto[] }
//   POST   /:id/interactions       (editor+) -> 201 FunderInteractionDto
//   PATCH  /:id/interactions/:iid  (editor+) -> FunderInteractionDto
//   DELETE /:id/interactions/:iid  (editor+) -> 204
// Contacts are personal data: they are served only here, to members of the org (requireOrg),
// and never put in logs, audit metadata or notifications.
import {
  CreateFunderRelationInput,
  FUNDER_STAGES,
  FunderContactInput,
  FunderContactPatch,
  FunderInteractionInput,
  FunderInteractionPatch,
  type FunderStage,
  UpdateFunderRelationInput,
} from "@shared/api/funders";
import { ROLE_RANK } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createContact,
  createInteraction,
  createRelation,
  deleteContact,
  deleteInteraction,
  getFunderDetail,
  listContacts,
  listInteractions,
  listRelations,
  updateContact,
  updateInteraction,
  updateRelation,
} from "../../services/funders-crm";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

const listQuery = z.object({
  stage: z.string().max(200).optional(),
  q: z.string().max(100).optional(),
  owner: z.string().max(100).optional(),
});

function parseStages(raw: string | undefined): FunderStage[] | undefined {
  if (!raw || raw === "all") return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = parts.filter((p) => !(FUNDER_STAGES as readonly string[]).includes(p));
  if (bad.length) throw badRequest(`Unknown stage: ${bad.join(", ")}`);
  return parts as FunderStage[];
}

const actorOf = (c: { var: AppEnv["Variables"] }) => ({
  userId: c.var.tenant.userId,
  requestId: c.var.requestId,
});
const canEdit = (c: { var: AppEnv["Variables"] }) =>
  ROLE_RANK[c.var.tenant.role] >= ROLE_RANK.editor;

routes.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const res = await listRelations(
    c.var.ctx,
    c.var.tenant.orgId,
    { stages: parseStages(q.stage), q: q.q, ownerId: q.owner },
    canEdit(c),
  );
  return c.json(res);
});

routes.post("/", editor, validate("json", CreateFunderRelationInput), async (c) => {
  const row = await createRelation(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"), actorOf(c));
  return c.json(row, 201);
});

routes.get("/:id", async (c) => {
  const detail = await getFunderDetail(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    canEdit(c),
  );
  return c.json(detail);
});

routes.patch("/:id", editor, validate("json", UpdateFunderRelationInput), async (c) => {
  const row = await updateRelation(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.valid("json"),
    actorOf(c),
  );
  return c.json(row);
});

// ---------------------------------------------------------------------------------- contacts

routes.get("/:id/contacts", async (c) => {
  const items = await listContacts(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return c.json({ items });
});

routes.post("/:id/contacts", editor, validate("json", FunderContactInput), async (c) => {
  const row = await createContact(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.valid("json"),
    actorOf(c),
  );
  return c.json(row, 201);
});

routes.patch("/:id/contacts/:cid", editor, validate("json", FunderContactPatch), async (c) => {
  const row = await updateContact(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.param("cid"),
    c.req.valid("json"),
    actorOf(c),
  );
  return c.json(row);
});

routes.delete("/:id/contacts/:cid", editor, async (c) => {
  await deleteContact(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.param("cid"),
    actorOf(c),
  );
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------------- interactions

routes.get("/:id/interactions", async (c) => {
  const items = await listInteractions(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return c.json({ items });
});

routes.post("/:id/interactions", editor, validate("json", FunderInteractionInput), async (c) => {
  const row = await createInteraction(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.valid("json"),
    actorOf(c),
  );
  return c.json(row, 201);
});

routes.patch(
  "/:id/interactions/:iid",
  editor,
  validate("json", FunderInteractionPatch),
  async (c) => {
    const row = await updateInteraction(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("id"),
      c.req.param("iid"),
      c.req.valid("json"),
      actorOf(c),
    );
    return c.json(row);
  },
);

routes.delete("/:id/interactions/:iid", editor, async (c) => {
  await deleteInteraction(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.param("iid"),
    actorOf(c),
  );
  return c.body(null, 204);
});

export default routes;
