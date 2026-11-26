// OWNER: onboarding+settings agent — organization profile (PATCH /profile).
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Field,
  Input,
  Select,
  toast,
} from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import type { OrgProfileDto } from "@shared/api/types";
import { ORG_TYPES, type OrgType } from "@shared/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { TagInput } from "./form-bits";
import { ORG_TYPE_LABELS } from "./labels";
import { ReadOnlyNotice, SavedHint, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail, orgKey } from "./use-org";

export function GeneralSettingsPage() {
  return (
    <SettingsPage
      tab="general"
      title="Settings"
      description="The basics funders ask for on almost every application. Keep them current and we'll fill them in for you."
    >
      {({ orgId, org }) => <ProfileForm orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

interface ProfileValues {
  name: string;
  legalName: string;
  dba: string;
  orgType: OrgType;
  ein: string;
  uei: string;
  websiteUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  foundedYear: string;
  focusAreas: string[];
  serviceAreas: string[];
}

const fromProfile = (p: OrgProfileDto, name: string): ProfileValues => ({
  name,
  legalName: p.legalName ?? "",
  dba: p.dba ?? "",
  orgType: p.orgType ?? "nonprofit_501c3",
  ein: p.ein ?? "",
  uei: p.uei ?? "",
  websiteUrl: p.websiteUrl ?? "",
  addressLine1: p.addressLine1 ?? "",
  addressLine2: p.addressLine2 ?? "",
  city: p.city ?? "",
  state: p.state ?? "",
  postalCode: p.postalCode ?? "",
  contactName: p.contactName ?? "",
  contactEmail: p.contactEmail ?? "",
  contactPhone: p.contactPhone ?? "",
  foundedYear: p.foundedYear ? String(p.foundedYear) : "",
  focusAreas: p.focusAreas ?? [],
  serviceAreas: p.serviceAreas ?? [],
});

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());
/** "123456789" -> "12-3456789" (the API requires the dash). */
export const normalizeEin = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : s.trim();
};

export function validateProfile(f: ProfileValues): Partial<Record<keyof ProfileValues, string>> {
  const e: Partial<Record<keyof ProfileValues, string>> = {};
  if (!f.name.trim()) e.name = "Organization name is required.";
  if (!f.legalName.trim()) e.legalName = "Legal name is required.";
  if (f.ein.trim() && !/^\d{2}-?\d{7}$/.test(f.ein.trim())) e.ein = "EINs look like 12-3456789.";
  if (f.uei && !/^[A-Za-z0-9]{12}$/.test(f.uei.trim()))
    e.uei = "A SAM.gov UEI is 12 letters and numbers.";
  if (f.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim()))
    e.contactEmail = "Enter a valid email address.";
  if (f.websiteUrl && !/^https?:\/\/\S+\.\S+/.test(f.websiteUrl.trim()))
    e.websiteUrl = "Start with https://";
  const year = Number(f.foundedYear);
  if (f.foundedYear && (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear()))
    e.foundedYear = "Enter a four-digit year.";
  return e;
}

function ProfileForm({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const canEdit = hasRole(org.role, "editor");
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileValues>(() => fromProfile(org.profile, org.org.name));
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(fromProfile(org.profile, org.org.name)), [org.profile, org.org.name]);

  const save = useMutation({
    mutationFn: (f: ProfileValues) =>
      api<OrgProfileDto>(orgApi(orgId, "/profile"), {
        method: "PATCH",
        body: {
          name: f.name.trim(),
          legalName: f.legalName.trim(),
          dba: blankToNull(f.dba),
          orgType: f.orgType,
          ein: blankToNull(normalizeEin(f.ein)),
          uei: blankToNull(f.uei)?.toUpperCase() ?? null,
          websiteUrl: blankToNull(f.websiteUrl),
          addressLine1: blankToNull(f.addressLine1),
          addressLine2: blankToNull(f.addressLine2),
          city: blankToNull(f.city),
          state: blankToNull(f.state),
          postalCode: blankToNull(f.postalCode),
          contactName: blankToNull(f.contactName),
          contactEmail: blankToNull(f.contactEmail),
          contactPhone: blankToNull(f.contactPhone),
          foundedYear: f.foundedYear ? Number(f.foundedYear) : null,
          focusAreas: f.focusAreas,
          serviceAreas: f.serviceAreas,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      toast.success("Organization details saved");
      qc.invalidateQueries({ queryKey: orgKey(orgId) });
    },
  });

  const errors = touched ? validateProfile(form) : {};
  const set = <K extends keyof ProfileValues>(k: K, v: ProfileValues[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const text = (k: Exclude<keyof ProfileValues, "focusAreas" | "serviceAreas" | "orgType">) => ({
    id: k,
    value: form[k],
    disabled: !canEdit,
    "aria-invalid": errors[k] ? true : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(validateProfile(form)).length > 0) return;
    save.mutate(form);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {!canEdit && <ReadOnlyNotice minRole="editors and admins" />}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-5 md:grid-cols-2">
          <Field
            label="Organization name"
            htmlFor="name"
            error={errors.name}
            hint="How your organization appears in Grant Autopilot."
          >
            <Input {...text("name")} required />
          </Field>
          <Field label="Legal name" htmlFor="legalName" error={errors.legalName}>
            <Input {...text("legalName")} required autoComplete="organization" />
          </Field>
          <Field label="Doing business as (optional)" htmlFor="dba">
            <Input {...text("dba")} />
          </Field>
          <Field label="Type of organization" htmlFor="orgType">
            <Select
              id="orgType"
              value={form.orgType}
              disabled={!canEdit}
              onChange={(e) => set("orgType", e.target.value as OrgType)}
            >
              {ORG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ORG_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Year founded"
            htmlFor="foundedYear"
            error={errors.foundedYear}
            hint="Optional"
          >
            <Input {...text("foundedYear")} inputMode="numeric" maxLength={4} />
          </Field>
          <Field
            label="EIN (federal tax ID)"
            htmlFor="ein"
            error={errors.ein}
            hint="Nine digits, from your IRS determination letter."
          >
            <Input {...text("ein")} placeholder="12-3456789" />
          </Field>
          <Field
            label="UEI (SAM.gov)"
            htmlFor="uei"
            error={errors.uei}
            hint="Needed for federal grants. Find it on your SAM.gov registration."
          >
            <Input {...text("uei")} placeholder="ABCDEF123456" className="uppercase" />
          </Field>
          <Field label="Website" htmlFor="websiteUrl" error={errors.websiteUrl}>
            <Input {...text("websiteUrl")} type="url" placeholder="https://" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address & contact</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-5 md:grid-cols-2">
          <Field label="Street address" htmlFor="addressLine1">
            <Input {...text("addressLine1")} autoComplete="address-line1" />
          </Field>
          <Field label="Suite, PO box (optional)" htmlFor="addressLine2">
            <Input {...text("addressLine2")} autoComplete="address-line2" />
          </Field>
          <div className="grid grid-cols-6 gap-3 md:col-span-2">
            <div className="col-span-6 sm:col-span-3">
              <Field label="City" htmlFor="city">
                <Input {...text("city")} autoComplete="address-level2" />
              </Field>
            </div>
            <div className="col-span-3 sm:col-span-1">
              <Field label="State" htmlFor="state">
                <Input
                  {...text("state")}
                  maxLength={2}
                  autoComplete="address-level1"
                  className="min-w-[4.5rem] uppercase"
                />
              </Field>
            </div>
            <div className="col-span-3 sm:col-span-2">
              <Field label="ZIP" htmlFor="postalCode">
                <Input {...text("postalCode")} autoComplete="postal-code" />
              </Field>
            </div>
          </div>
          <Field
            label="Grants contact name"
            htmlFor="contactName"
            hint="The person funders should reach."
          >
            <Input {...text("contactName")} autoComplete="name" />
          </Field>
          <Field label="Contact email" htmlFor="contactEmail" error={errors.contactEmail}>
            <Input {...text("contactEmail")} type="email" autoComplete="email" />
          </Field>
          <Field label="Contact phone" htmlFor="contactPhone">
            <Input {...text("contactPhone")} type="tel" autoComplete="tel" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What you do and where</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            Used to search for grants that fit. Press Enter after each one.
          </p>
        </CardHeader>
        <CardBody className="grid gap-5 md:grid-cols-2">
          <Field label="Focus areas" htmlFor="focusAreas" hint="e.g. workforce development, trades">
            <TagInput
              id="focusAreas"
              value={form.focusAreas}
              onChange={(v) => set("focusAreas", v)}
              disabled={!canEdit}
              placeholder="Workforce development"
            />
          </Field>
          <Field label="Service areas" htmlFor="serviceAreas" hint="Cities, counties, nations">
            <TagInput
              id="serviceAreas"
              value={form.serviceAreas}
              onChange={(v) => set("serviceAreas", v)}
              disabled={!canEdit}
              placeholder="McKinley County, NM"
            />
          </Field>
        </CardBody>
      </Card>

      {save.isError && <ErrorMessage error={save.error} />}
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          <SavedHint show={saved} />
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
