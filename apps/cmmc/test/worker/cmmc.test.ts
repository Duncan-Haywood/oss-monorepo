import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { acceptLegalDocs, addToOrg, api, BASE, createTestUser, setupTenant } from "./helpers";

const json = async <T>(res: Response) => (await res.json()) as T;

describe("orgs and auth", () => {
  it("requires sign-in", async () => {
    expect((await api("/api/me")).status).toBe(401);
    expect((await api("/api/orgs")).status).toBe(401);
  });

  it("creates an org with the creator as owner", async () => {
    const u = await createTestUser();
    await acceptLegalDocs(u.id);
    const res = await api("/api/orgs", {
      method: "POST",
      as: u.id,
      json: { name: "Precision Parts LLC", targetLevel: 1 },
    });
    expect(res.status).toBe(201);
    const { orgId } = await json<{ orgId: string }>(res);
    const org = await json<{ role: string; profile: { targetLevel: number } }>(
      await api(`/api/orgs/${orgId}`, { as: u.id }),
    );
    expect(org.role).toBe("owner");
    expect(org.profile.targetLevel).toBe(1);
  });

  it("signs up with Better Auth and uses the session cookie", async () => {
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE },
      json: {
        email: "owner@shop.example",
        password: "correct-horse-battery-staple",
        name: "Owner",
      },
    });
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const me = await api("/api/me", { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
  });

  it("blocks cross-origin writes", async () => {
    const u = await createTestUser();
    const res = await api("/api/orgs", {
      method: "POST",
      as: u.id,
      headers: { Origin: "https://evil.example" },
      json: { name: "x" },
    });
    expect(res.status).toBe(403);
  });
});

describe("controls, score and SSP", () => {
  it("lists the 110 Level 2 controls and 15 Level 1 controls", async () => {
    const t = await setupTenant();
    const l2 = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${t.orgId}/controls?level=2`, { as: t.userId }),
    );
    const l1 = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${t.orgId}/controls?level=1`, { as: t.userId }),
    );
    expect(l2.items).toHaveLength(110);
    expect(l1.items).toHaveLength(15);
  });

  it("updates status and recomputes the SPRS score", async () => {
    const t = await setupTenant();
    const patch = (id: string, body: unknown) =>
      api(`/api/orgs/${t.orgId}/controls/${id}`, { method: "PATCH", as: t.userId, json: body });
    expect((await patch("CA.L2-3.12.4", { status: "implemented" })).status).toBe(200);
    expect(
      (
        await patch("IA.L2-3.5.3", {
          status: "partially_implemented",
          partialCredit: "mfa_remote_and_privileged_only",
        })
      ).status,
    ).toBe(200);
    // partial credit that does not belong to this control is refused
    expect(
      (
        await patch("AC.L2-3.1.1", {
          status: "partially_implemented",
          partialCredit: "encryption_not_fips",
        })
      ).status,
    ).toBe(400);
    const s = await json<{ level2: { score: number; counts: { implemented: number } } }>(
      await api(`/api/orgs/${t.orgId}/score?level=2`, { as: t.userId }),
    );
    // Only the SSP (0 points) and 3.5.3 (partial, 3 instead of 5) are recorded: 110 - 313 + 5 - 3 = -201
    expect(s.level2.score).toBe(-201);
    expect(s.level2.counts.implemented).toBe(1);
  });

  it("rejects unknown controls and objectives", async () => {
    const t = await setupTenant();
    expect((await api(`/api/orgs/${t.orgId}/controls/XX.L2-9.9.9`, { as: t.userId })).status).toBe(
      404,
    );
    const res = await api(`/api/orgs/${t.orgId}/controls/AC.L2-3.1.1`, {
      method: "PATCH",
      as: t.userId,
      json: { objectiveResults: { "3.1.2[a]": "met" } },
    });
    expect(res.status).toBe(400);
  });

  it("viewers cannot edit", async () => {
    const t = await setupTenant();
    const v = await createTestUser();
    await addToOrg(t.orgId, v.id, "viewer");
    const res = await api(`/api/orgs/${t.orgId}/controls/AC.L2-3.1.1`, {
      method: "PATCH",
      as: v.id,
      json: { status: "implemented" },
    });
    expect(res.status).toBe(403);
  });

  it("drafts a statement as an unreviewed draft; the SSP only prints accepted text", async () => {
    const t = await setupTenant();
    const base = `/api/orgs/${t.orgId}/controls/AC.L2-3.1.1`;
    await api(base, {
      method: "PATCH",
      as: t.userId,
      json: { notes: "Accounts are created by the office manager on request." },
    });
    const drafted = await json<{
      draftStatement: string;
      statement: string;
      draftQuestions: string[];
    }>(await api(`${base}/draft`, { method: "POST", as: t.userId }));
    expect(drafted.draftStatement).toContain("office manager");
    expect(drafted.statement).toBe("");
    let ssp = await json<{ markdown: string }>(
      await api(`/api/orgs/${t.orgId}/ssp?level=2`, { as: t.userId }),
    );
    expect(ssp.markdown).not.toContain("office manager");
    expect(ssp.markdown).toContain("AI draft awaiting review");
    const accepted = await json<{ statement: string; draftStatement: string | null }>(
      await api(`${base}/draft/accept`, {
        method: "POST",
        as: t.userId,
        json: { statement: "Edited: accounts are approved by the office manager." },
      }),
    );
    expect(accepted.statement).toBe("Edited: accounts are approved by the office manager.");
    expect(accepted.draftStatement).toBeNull();
    ssp = await json<{ markdown: string }>(
      await api(`/api/orgs/${t.orgId}/ssp?level=2`, { as: t.userId }),
    );
    expect(ssp.markdown).toContain("Edited: accounts are approved by the office manager.");
    expect(ssp.markdown).toContain("not a CMMC certification");
  });
});

describe("evidence", () => {
  const upload = (
    orgId: string,
    as: string,
    opts: { noCui?: boolean; type?: string; controlId?: string } = {},
  ) => {
    const fd = new FormData();
    fd.set(
      "file",
      new File(["MFA policy v1"], "../../mfa policy.pdf", { type: opts.type ?? "application/pdf" }),
    );
    fd.set("title", "MFA policy");
    if (opts.controlId) fd.set("controlId", opts.controlId);
    if (opts.noCui !== false) fd.set("noCui", "true");
    return api(`/api/orgs/${orgId}/evidence`, { method: "POST", as, body: fd });
  };

  it("stores files under orgs/{orgId}/ and serves them as attachments", async () => {
    const t = await setupTenant();
    const res = await upload(t.orgId, t.userId, { controlId: "IA.L2-3.5.3" });
    expect(res.status).toBe(201);
    const dto = await json<{ id: string; fileName: string; sha256: string; r2Key?: string }>(res);
    expect(dto.r2Key).toBeUndefined();
    expect(dto.fileName).toBe("mfa policy.pdf");
    const obj = await env.FILES.get(`orgs/${t.orgId}/evidence/${dto.id}`);
    expect(await obj?.text()).toBe("MFA policy v1");
    const dl = await api(`/api/orgs/${t.orgId}/evidence/${dto.id}/download`, { as: t.userId });
    expect(dl.headers.get("Content-Disposition")).toContain("attachment");
    expect(dl.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(await dl.text()).toBe("MFA policy v1");
    const del = await api(`/api/orgs/${t.orgId}/evidence/${dto.id}`, {
      method: "DELETE",
      as: t.userId,
    });
    expect(del.status).toBe(200);
    expect(await env.FILES.get(`orgs/${t.orgId}/evidence/${dto.id}`)).toBeNull();
  });

  it("requires the no-CUI attestation and an allowed file type", async () => {
    const t = await setupTenant();
    expect((await upload(t.orgId, t.userId, { noCui: false })).status).toBe(400);
    expect((await upload(t.orgId, t.userId, { type: "text/html" })).status).toBe(415);
  });
});

describe("POA&M", () => {
  it("creates items, flags eligibility per 32 CFR 170.21, exports CSV", async () => {
    const t = await setupTenant();
    const mk = (controlId: string) =>
      api(`/api/orgs/${t.orgId}/poam`, {
        method: "POST",
        as: t.userId,
        json: { controlId, weakness: '=HYPERLINK("x")', scheduledCompletion: "2026-01-15" },
      });
    const one = await json<{ id: string; eligible: boolean; overdue: boolean }>(
      await mk("AC.L2-3.1.8"),
    );
    const five = await json<{ eligible: boolean }>(await mk("AC.L2-3.1.1"));
    const excluded = await json<{ eligible: boolean }>(await mk("PE.L2-3.10.3"));
    expect(one.eligible).toBe(true);
    expect(one.overdue).toBe(true);
    expect(five.eligible).toBe(false);
    expect(excluded.eligible).toBe(false);
    const closed = await json<{ status: string; closedAt: string | null }>(
      await api(`/api/orgs/${t.orgId}/poam/${one.id}`, {
        method: "PATCH",
        as: t.userId,
        json: { status: "closed" },
      }),
    );
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    const csv = await (await api(`/api/orgs/${t.orgId}/poam/export.csv`, { as: t.userId })).text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split("\r\n")[0]).toContain("POA&M eligible");
  });
});

describe("tenant isolation", () => {
  it("a member of org A cannot read or change anything in org B", async () => {
    const a = await setupTenant("owner", "Org A");
    const b = await setupTenant("owner", "Org B");
    // seed B with a control record, evidence and a POA&M item
    await api(`/api/orgs/${b.orgId}/controls/AC.L2-3.1.1`, {
      method: "PATCH",
      as: b.userId,
      json: { notes: "B secret", status: "implemented" },
    });
    const fd = new FormData();
    fd.set("file", new File(["B evidence"], "b.txt", { type: "text/plain" }));
    fd.set("noCui", "true");
    const ev = await json<{ id: string }>(
      await api(`/api/orgs/${b.orgId}/evidence`, { method: "POST", as: b.userId, body: fd }),
    );
    const po = await json<{ id: string }>(
      await api(`/api/orgs/${b.orgId}/poam`, {
        method: "POST",
        as: b.userId,
        json: { controlId: "AC.L2-3.1.8", weakness: "w", scheduledCompletion: "2027-01-01" },
      }),
    );

    const asA = (path: string, init: RequestInit & { json?: unknown } = {}) =>
      api(path, { ...init, as: a.userId });
    const reads = [
      `/api/orgs/${b.orgId}`,
      `/api/orgs/${b.orgId}/controls`,
      `/api/orgs/${b.orgId}/controls/AC.L2-3.1.1`,
      `/api/orgs/${b.orgId}/evidence`,
      `/api/orgs/${b.orgId}/evidence/${ev.id}/download`,
      `/api/orgs/${b.orgId}/poam`,
      `/api/orgs/${b.orgId}/poam/export.csv`,
      `/api/orgs/${b.orgId}/score`,
      `/api/orgs/${b.orgId}/ssp`,
      `/api/orgs/${b.orgId}/members`,
    ];
    for (const p of reads) expect((await asA(p)).status, p).toBe(404);
    expect(
      (
        await asA(`/api/orgs/${b.orgId}/controls/AC.L2-3.1.1`, {
          method: "PATCH",
          json: { notes: "x" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await asA(`/api/orgs/${b.orgId}/controls/AC.L2-3.1.1/draft`, { method: "POST" })).status,
    ).toBe(404);
    expect((await asA(`/api/orgs/${b.orgId}/evidence/${ev.id}`, { method: "DELETE" })).status).toBe(
      404,
    );
    expect((await asA(`/api/orgs/${b.orgId}/poam/${po.id}`, { method: "DELETE" })).status).toBe(
      404,
    );

    // B's ids used inside A's own org resolve to nothing
    expect((await asA(`/api/orgs/${a.orgId}/evidence/${ev.id}/download`)).status).toBe(404);
    expect((await asA(`/api/orgs/${a.orgId}/evidence/${ev.id}`, { method: "DELETE" })).status).toBe(
      404,
    );
    expect(
      (
        await asA(`/api/orgs/${a.orgId}/poam/${po.id}`, {
          method: "PATCH",
          json: { status: "closed" },
        })
      ).status,
    ).toBe(404);
    const aControl = await json<{ record: unknown }>(
      await asA(`/api/orgs/${a.orgId}/controls/AC.L2-3.1.1`),
    );
    expect(aControl.record).toBeNull();

    // A cannot assign a control to a user outside A
    expect(
      (
        await asA(`/api/orgs/${a.orgId}/controls/AC.L2-3.1.1`, {
          method: "PATCH",
          json: { ownerUserId: b.userId },
        })
      ).status,
    ).toBe(400);

    // B's data is unchanged and still B's
    const bView = await json<{ record: { notes: string } }>(
      await api(`/api/orgs/${b.orgId}/controls/AC.L2-3.1.1`, { as: b.userId }),
    );
    expect(bView.record.notes).toBe("B secret");
    expect(await env.FILES.get(`orgs/${b.orgId}/evidence/${ev.id}`)).not.toBeNull();
  });
});
