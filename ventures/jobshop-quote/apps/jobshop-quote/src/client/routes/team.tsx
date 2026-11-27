// Team: members and invitation links (admins).

import { MEMBER_ROLES } from "@shared/enums";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input, Select } from "../components/ui";
import { api, orgApi, queryClient } from "../lib/api";
import { canAdmin, useOrg, useOrgId, useShopDay } from "./layout";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

export function TeamPage() {
  const orgId = useOrgId();
  const shopDayOf = useShopDay(orgId);
  const org = useOrg(orgId);
  const admin = canAdmin(org.data?.role);
  const members = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => api<{ items: MemberRow[] }>(orgApi(orgId, "/members")),
  });
  const invitations = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: () => api<{ items: InvitationRow[] }>(orgApi(orgId, "/members/invitations")),
    enabled: admin,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["members", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["invitations", orgId] });
  };
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("estimator");
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      api<{ acceptUrl: string }>(orgApi(orgId, "/members/invitations"), {
        method: "POST",
        body: { email, role },
      }),
    onSuccess: (r) => {
      setLink(r.acceptUrl);
      setEmail("");
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: ({ id, role: r }: { id: string; role: string }) =>
      api(orgApi(orgId, `/members/${id}`), { method: "PATCH", body: { role: r } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgApi(orgId, `/members/${id}`), { method: "DELETE" }),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(orgApi(orgId, `/members/invitations/${id}`), { method: "DELETE" }),
    onSuccess: refresh,
  });
  return (
    <div className="flex flex-col gap-4">
      <Card title="Members">
        <p className="mb-2 text-xs text-stone-500">
          Estimators create RFQs and quotes. Admins also set the rate card and manage members.
          Viewers can only look.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {members.data?.items.map((m) => (
                <tr key={m.id} className="border-t border-stone-100">
                  <td className="py-1.5">{m.name}</td>
                  <td className="text-stone-600">{m.email}</td>
                  <td>
                    {admin ? (
                      <Select
                        value={m.role}
                        onChange={(e) => change.mutate({ id: m.id, role: e.target.value })}
                        aria-label={`Role of ${m.email}`}
                      >
                        {MEMBER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge>{m.role}</Badge>
                    )}
                  </td>
                  <td className="text-right">
                    {admin && (
                      <Button variant="ghost" onClick={() => remove.mutate(m.id)}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ErrorText error={change.error ?? remove.error} />
      </Card>
      {admin && (
        <Card title="Invite">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={invite.isPending}>
              Create invitation link
            </Button>
          </form>
          {link && (
            <p className="mt-2 text-sm">
              Send this link to them (shown once, valid 7 days):{" "}
              <code className="break-all rounded bg-stone-100 px-1">{link}</code>
            </p>
          )}
          <ErrorText error={invite.error} />
          <ul className="mt-3 text-sm">
            {invitations.data?.items
              .filter((i) => i.status === "pending")
              .map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  {i.email} <Badge>{i.role}</Badge>{" "}
                  <span className="text-stone-500">expires {shopDayOf(i.expiresAt)}</span>
                  <Button variant="ghost" onClick={() => revoke.mutate(i.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
