// Shop settings: rename (admins), download all of the shop's data as one JSON file (admins), and delete
// the shop (the owner, by typing its name; the server refuses while a paid plan will renew).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api, orgPath } from "../lib/api";
import { apiUrl } from "../lib/base-path";
import { useOrgId } from "./org";
import { ErrorText, useMe } from "./public";

const isAdminRole = (role: string) => role === "admin" || role === "owner";

export function SettingsPage() {
  const orgId = useOrgId();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const membership = me.data?.memberships.find((m) => m.orgId === orgId);
  const role = membership?.role ?? "viewer";
  const isAdmin = isAdminRole(role);
  const isOwner = role === "owner";

  const [name, setName] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (n: string) => api(orgPath(orgId), { method: "PATCH", body: { name: n } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  const [confirmName, setConfirmName] = useState("");
  const remove = useMutation({
    mutationFn: () => api(orgPath(orgId), { method: "DELETE", body: { confirmName } }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      void navigate({ to: "/orgs" });
    },
  });

  if (!membership) return null;
  const shopName = membership.orgName;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Shop settings</h1>

      {!isAdmin && (
        <p className="text-sm text-stone-600">
          Only the shop's owner and admins can change these settings.
        </p>
      )}

      {isAdmin && (
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name?.trim()) rename.mutate(name.trim());
          }}
        >
          <h2 className="font-medium">Shop name</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="input max-w-xs"
              aria-label="Shop name"
              maxLength={120}
              value={name ?? shopName}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn" type="submit" disabled={rename.isPending || !name?.trim()}>
              Rename
            </button>
          </div>
          {rename.isSuccess && <p className="text-sm text-brand-800">Saved.</p>}
          <ErrorText error={rename.error} />
        </form>
      )}

      {isAdmin && (
        <section className="card space-y-2">
          <h2 className="font-medium">Download all of this shop's data</h2>
          <p className="text-sm text-stone-700">
            One JSON file with every record the shop holds: imports, sales and their fees, platform
            charges, inventory lots and items, mileage, expenses, the home office and filed
            inventory figures, and the members. Money is in cents. Keep it for your records, or take
            your books elsewhere. It includes members' email addresses, so only admins and the owner
            can download it.
          </p>
          <a className="btn inline-block" href={apiUrl(orgPath(orgId, "/export"))} download>
            Download (JSON)
          </a>
          <p className="text-xs text-stone-600">
            For your accountant, the Schedule C worksheet, the sales ledger and the QuickBooks
            journal download as CSV from their own pages.
          </p>
        </section>
      )}

      {isOwner && (
        <form
          className="card space-y-2 border-red-200"
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <h2 className="font-medium text-red-800">Delete this shop</h2>
          <p className="text-sm text-stone-700">
            Deletes the shop and everything in it, for every member: sales, inventory, mileage,
            expenses and reports. It cannot be undone. Download the data above first if you may need
            it. A paid plan that will renew must be cancelled on the{" "}
            <Link to="/o/$orgId/billing" params={{ orgId }} className="underline">
              Billing page
            </Link>{" "}
            first.
          </p>
          <label className="block text-sm">
            Type <strong>{shopName}</strong> to confirm
            <input
              className="input mt-1 max-w-xs"
              aria-label="Shop name to confirm deletion"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </label>
          <button
            className="btn bg-red-700 hover:bg-red-800"
            type="submit"
            disabled={remove.isPending || confirmName.trim() !== shopName}
          >
            Delete shop
          </button>
          <ErrorText error={remove.error} />
        </form>
      )}
    </div>
  );
}
