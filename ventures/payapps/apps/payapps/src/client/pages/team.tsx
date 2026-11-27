// People in one company: members (roles, remove) and invitations (invite by email, cancel).
import type { InvitationDto, MemberDto } from "@shared/api/types";
import { MEMBER_ROLES, type MemberRole, ROLE_RANK } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { meQuery } from "../components/layout";
import { api, orgPath } from "../lib/api";

const ROLE_HELP: Record<MemberRole, string> = {
  owner: "everything, including ownership",
  admin: "people and billing",
  editor: "prepares pay applications",
  viewer: "reads jobs and downloads pay applications",
};

const INVITE_ROLES = MEMBER_ROLES.filter((r) => r !== "owner");

const day = (iso: string) => new Date(iso).toLocaleDateString();

export function TeamPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/team" });
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const myRole = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? "viewer";
  const isAdmin = ROLE_RANK[myRole] >= ROLE_RANK.admin;
  const isOwner = myRole === "owner";

  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: MemberDto[] }>(orgPath(orgId, "/members")),
  });
  const invitations = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: () => api<{ items: InvitationDto[] }>(orgPath(orgId, "/members/invitations")),
    enabled: isAdmin,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["members", orgId] }),
      qc.invalidateQueries({ queryKey: ["invitations", orgId] }),
      qc.invalidateQueries({ queryKey: ["billing", orgId] }),
    ]);

  const [form, setForm] = useState<{ email: string; role: MemberRole }>({
    email: "",
    role: "editor",
  });
  const [sent, setSent] = useState<InvitationDto | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      api<InvitationDto>(orgPath(orgId, "/members/invitations"), { method: "POST", body: form }),
    onSuccess: async (inv) => {
      setSent(inv);
      setForm({ email: "", role: form.role });
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(orgPath(orgId, `/members/invitations/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: MemberRole }) =>
      api(orgPath(orgId, `/members/${encodeURIComponent(v.id)}`), {
        method: "PATCH",
        body: { role: v.role },
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(orgPath(orgId, `/members/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card space-y-4 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">People</h1>
          <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm underline">
            Back to projects
          </Link>
        </div>
        {members.isLoading && <p>Loading…</p>}
        <ErrorText error={members.error ?? changeRole.error ?? remove.error} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {members.data?.items.map((m) => {
                const self = m.userId === me.data?.user.id;
                const canEdit = isAdmin && (isOwner || m.role !== "owner");
                return (
                  <tr key={m.id}>
                    <td className="td">
                      <div className="font-medium">
                        {m.name}
                        {self && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                      </div>
                      <div className="text-xs text-slate-500">{m.email}</div>
                    </td>
                    <td className="td">
                      {canEdit ? (
                        <select
                          className="input"
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          disabled={changeRole.isPending}
                          onChange={(e) =>
                            changeRole.mutate({ id: m.id, role: e.target.value as MemberRole })
                          }
                        >
                          {MEMBER_ROLES.filter((r) => isOwner || r !== "owner").map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm">{m.role}</span>
                      )}
                    </td>
                    <td className="td text-right">
                      {canEdit && !self && (
                        <button
                          type="button"
                          className="text-sm text-red-700 underline"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${m.name} from this company?`))
                              remove.mutate(m.id);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isAdmin && (
          <div>
            <h2 className="mb-2 font-semibold">Pending invitations</h2>
            <ErrorText error={invitations.error ?? cancel.error} />
            {invitations.data?.items.length === 0 && (
              <p className="text-sm text-slate-600">None.</p>
            )}
            <ul className="space-y-2">
              {invitations.data?.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {i.email} <span className="text-xs text-slate-500">({i.role})</span>
                    <span className="ml-2 text-xs text-slate-500">expires {day(i.expiresAt)}</span>
                  </span>
                  <button
                    type="button"
                    className="text-sm underline"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(i.id)}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {isAdmin ? (
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(null);
            invite.mutate();
          }}
        >
          <h2 className="font-semibold">Invite someone</h2>
          <p className="text-sm text-slate-600">
            Your project manager, bookkeeper or office manager. They don't need an account yet: they
            create one with this address and accept.
          </p>
          <label className="block text-sm">
            <span className="text-slate-600">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Role</span>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as MemberRole })}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}: {ROLE_HELP[r]}
                </option>
              ))}
            </select>
          </label>
          <ErrorText error={invite.error} />
          {sent && (
            <p role="status" className="text-sm text-slate-700">
              {sent.emailSent
                ? `Invitation sent to ${sent.email}.`
                : `Invitation saved for ${sent.email}, but no email went out. Tell them to sign up with that address and open Invitations.`}{" "}
              It expires {day(sent.expiresAt)}.
            </p>
          )}
          <button className="btn" type="submit" disabled={invite.isPending}>
            Send invitation
          </button>
          <p className="text-xs text-slate-500">
            Pending invitations count toward your plan's users.{" "}
            <Link to="/orgs/$orgId/billing" params={{ orgId }} className="underline">
              Plan and billing
            </Link>
          </p>
        </form>
      ) : (
        <div className="card text-sm text-slate-600">
          Ask an admin of this company to invite people or change roles.
        </div>
      )}
    </div>
  );
}
