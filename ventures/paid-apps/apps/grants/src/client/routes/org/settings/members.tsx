// OWNER: onboarding+settings agent — members, roles, invitations.
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  toast,
} from "@client/components/ui";
import { api, formatDate, orgApi } from "@client/lib/api";
import { useMe } from "@client/lib/session";
import type { ListResponse } from "@shared/api/types";
import { MEMBER_ROLES, type MemberRole } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "./labels";
import { ReadOnlyNotice, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail } from "./use-org";

export interface MemberRow {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  createdAt: string;
}
export interface InvitationRow {
  id: string;
  email: string;
  role: MemberRole;
  status?: string;
  expiresAt?: string | null;
  createdAt?: string;
}

const INVITABLE: MemberRole[] = MEMBER_ROLES.filter((r) => r !== "owner");

export function MembersSettingsPage() {
  return (
    <SettingsPage
      tab="members"
      title="Settings"
      description="Invite the people who help with grants. Each person only gets the access they need."
    >
      {({ orgId, org }) => <Members orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

function Members({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const qc = useQueryClient();
  const isAdmin = hasRole(org.role, "admin");
  const isOwner = org.role === "owner";
  const me = useMe();
  const members = useQuery({
    queryKey: ["org", orgId, "members"],
    queryFn: () => api<ListResponse<MemberRow>>(orgApi(orgId, "/members")),
  });
  const invitations = useQuery({
    queryKey: ["org", orgId, "invitations"],
    queryFn: () => api<ListResponse<InvitationRow>>(orgApi(orgId, "/members/invitations")),
    enabled: isAdmin,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org", orgId, "members"] });
    qc.invalidateQueries({ queryKey: ["org", orgId, "invitations"] });
  };

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: MemberRole }) =>
      api(orgApi(orgId, `/members/${encodeURIComponent(id)}`), {
        method: "PATCH",
        body: { role },
      }),
    onSuccess: (_d, v) => toast.success(`Role changed to ${ROLE_LABELS[v.role]}`),
    onSettled: invalidate,
  });
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(orgApi(orgId, `/members/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast.success("Access removed");
    },
    onSettled: invalidate,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(orgApi(orgId, `/members/invitations/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: () => toast.success("Invitation revoked"),
    onSettled: invalidate,
  });

  const pending = (invitations.data?.items ?? []).filter(
    (i) => !i.status || i.status === "pending",
  );
  const owners = (members.data?.items ?? []).filter((m) => m.role === "owner").length;

  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice minRole="admins" />}
      {isAdmin && <InviteForm orgId={orgId} onInvited={invalidate} />}

      <Card>
        <CardHeader>
          <CardTitle>People with access</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {members.isPending ? (
            <div className="p-5">
              <Spinner label="Loading members" />
            </div>
          ) : members.isError ? (
            <div className="p-5">
              <ErrorMessage error={members.error} />
            </div>
          ) : members.data.items.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No members yet" />
            </div>
          ) : (
            <Table className="border-0">
              <thead className="bg-neutral-50">
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Joined</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {members.data.items.map((m) => {
                  const isMe = me.data?.user.id === m.userId;
                  const lastOwner = m.role === "owner" && owners <= 1;
                  // Only owners may grant or change ownership; nobody demotes the last owner.
                  const editable = isAdmin && !lastOwner && (m.role !== "owner" || isOwner);
                  const roleOptions = isOwner ? MEMBER_ROLES : INVITABLE;
                  return (
                    <tr key={m.id}>
                      <Td>
                        <p className="font-medium text-neutral-900">
                          {m.name || m.email}
                          {isMe && (
                            <Badge tone="brand" className="ml-2">
                              You
                            </Badge>
                          )}
                        </p>
                        {m.name && <p className="text-xs text-neutral-500">{m.email}</p>}
                      </Td>
                      <Td>
                        {editable ? (
                          <>
                            <label htmlFor={`role-${m.id}`} className="sr-only">
                              Role for {m.name || m.email}
                            </label>
                            <Select
                              id={`role-${m.id}`}
                              className="h-8 w-36"
                              value={m.role}
                              disabled={changeRole.isPending}
                              onChange={(e) =>
                                changeRole.mutate({ id: m.id, role: e.target.value as MemberRole })
                              }
                            >
                              {roleOptions.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </Select>
                          </>
                        ) : (
                          <Badge tone={m.role === "owner" ? "brand" : "neutral"}>
                            {ROLE_LABELS[m.role]}
                          </Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{formatDate(m.createdAt)}</Td>
                      <Td className="text-right">
                        {editable && !isMe && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRemoving(m)}
                            aria-label={`Remove ${m.name || m.email}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Remove
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {changeRole.isError && (
            <div className="p-5">
              <ErrorMessage error={changeRole.error} />
            </div>
          )}
        </CardBody>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardBody>
            {invitations.isPending ? (
              <Spinner label="Loading invitations" />
            ) : invitations.isError ? (
              <ErrorMessage error={invitations.error} />
            ) : pending.length === 0 ? (
              <p className="text-sm text-neutral-500">No invitations waiting.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {pending.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{inv.email}</p>
                      <p className="text-xs text-neutral-500">
                        {ROLE_LABELS[inv.role] ?? inv.role}
                        {inv.expiresAt ? ` · expires ${formatDate(inv.expiresAt)}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={revoke.isPending && revoke.variables === inv.id}
                      onClick={() => revoke.mutate(inv.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {revoke.isError && <ErrorMessage error={revoke.error} />}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What each role can do</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-3 sm:grid-cols-2">
            {MEMBER_ROLES.map((r) => (
              <div key={r}>
                <dt className="text-sm font-medium text-neutral-900">{ROLE_LABELS[r]}</dt>
                <dd className="text-sm text-neutral-500">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={removing != null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
        }}
        title="Remove this person?"
        description={
          removing
            ? `${removing.name || removing.email} will lose access right away. Their past work stays in the record.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
      >
        {remove.isError ? <ErrorMessage error={remove.error} /> : null}
      </ConfirmDialog>
    </div>
  );
}

function InviteForm({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const invite = useMutation({
    mutationFn: () =>
      api(orgApi(orgId, "/members/invitations"), {
        method: "POST",
        body: { email: email.trim(), role },
      }),
    onSuccess: () => {
      toast.success("Invitation sent", `We emailed ${email.trim()} a link to join.`);
      setSentTo(email.trim());
      setEmail("");
      onInvited();
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    setSentTo(undefined);
    invite.mutate();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Email" htmlFor="invite-email" error={error}>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                placeholder="you@yourorganization.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
              >
                {INVITABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={invite.isPending} className={error ? "sm:mb-7" : ""}>
              <MailPlus className="h-4 w-4" aria-hidden />
              Send invite
            </Button>
          </div>
          <p className="text-sm text-neutral-500">{ROLE_DESCRIPTIONS[role]}</p>
          {invite.isError && <ErrorMessage error={invite.error} />}
          {sentTo && (
            <output className="block text-sm text-success-700">Invitation sent to {sentTo}.</output>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
