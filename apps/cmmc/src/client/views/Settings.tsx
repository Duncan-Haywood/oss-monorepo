import { MEMBER_ROLES, type MemberRole } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { Member, OrgInfo, Profile } from "../lib/types";
import { btnCls, Card, ErrorText, Field, inputCls } from "../ui";

const TEXT_FIELDS: { key: keyof Profile; label: string; rows?: number; hint?: string }[] = [
  { key: "legalName", label: "Legal name" },
  { key: "cageCode", label: "CAGE code" },
  { key: "systemName", label: "System name" },
  {
    key: "systemDescription",
    label: "System description",
    rows: 4,
    hint: "What the system does, who uses it, what FCI/CUI it handles (describe it; do not paste CUI).",
  },
  {
    key: "boundaryDescription",
    label: "System boundary",
    rows: 4,
    hint: "Locations, networks, cloud services and devices in scope.",
  },
  { key: "environmentDescription", label: "Environment of operation", rows: 3 },
  { key: "connectionsDescription", label: "Connections to other systems", rows: 3 },
  { key: "sspUpdateFrequency", label: "How often the SSP is reviewed" },
  { key: "affirmingOfficial", label: "Affirming official (name, title)" },
];

export function SettingsView({ orgId, info }: { orgId: string; info: OrgInfo }) {
  const qc = useQueryClient();
  const isAdmin = info.role === "admin" || info.role === "owner";
  const [profile, setProfile] = useState<Profile>(info.profile);
  const save = useMutation({
    mutationFn: () =>
      api<Profile>(`/api/orgs/${orgId}/profile`, { method: "PATCH", json: profile }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org", orgId] }),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="System profile">
        <p className="mb-3 text-sm text-stone-600">
          Used in the SSP, and the only facts AI drafting may use besides your per-control notes.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Target level">
            <select
              className={inputCls}
              disabled={!isAdmin}
              value={profile.targetLevel}
              onChange={(e) => setProfile({ ...profile, targetLevel: Number(e.target.value) })}
            >
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
            </select>
          </Field>
          {TEXT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.rows ? (
                <textarea
                  className={inputCls}
                  rows={f.rows}
                  disabled={!isAdmin}
                  value={String(profile[f.key])}
                  onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className={inputCls}
                  disabled={!isAdmin}
                  value={String(profile[f.key])}
                  onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
          <ErrorText error={save.error} />
          {isAdmin && (
            <button type="submit" className={btnCls} disabled={save.isPending}>
              {save.isSuccess ? "Saved" : "Save"}
            </button>
          )}
        </form>
      </Card>
      <Members orgId={orgId} isAdmin={isAdmin} />
    </div>
  );
}

function Members({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: Member[] }>(`/api/orgs/${orgId}/members`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["members", orgId] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const add = useMutation({
    mutationFn: () => api(`/api/orgs/${orgId}/members`, { method: "POST", json: { email, role } }),
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: (p: { id: string; role: MemberRole }) =>
      api(`/api/orgs/${orgId}/members/${p.id}`, { method: "PATCH", json: { role: p.role } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/members/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return (
    <Card title="Members">
      <ul className="mb-3 divide-y divide-stone-100 text-sm">
        {list.data?.items.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
            <span>
              {m.name} <span className="text-stone-500">{m.email}</span>
            </span>
            {isAdmin ? (
              <span className="flex gap-2">
                <select
                  className="rounded border border-stone-300 px-1 text-xs"
                  value={m.role}
                  onChange={(e) => change.mutate({ id: m.id, role: e.target.value as MemberRole })}
                  aria-label={`Role for ${m.email}`}
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={() => remove.mutate(m.id)}
                >
                  Remove
                </button>
              </span>
            ) : (
              <span className="text-xs">{m.role}</span>
            )}
          </li>
        ))}
      </ul>
      <ErrorText error={change.error ?? remove.error} />
      {isAdmin && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <input
            className={`${inputCls} flex-1`}
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email"
          />
          <select
            className="rounded border border-stone-300 px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            aria-label="Role"
          >
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" className={btnCls} disabled={add.isPending}>
            Add
          </button>
          <p className="w-full text-xs text-stone-500">
            They need to create an account first; emailed invitations are not built yet.
          </p>
          <ErrorText error={add.error} />
        </form>
      )}
    </Card>
  );
}
