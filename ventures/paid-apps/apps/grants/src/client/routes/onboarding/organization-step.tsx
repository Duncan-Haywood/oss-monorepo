// Onboarding step 1: create the organization (POST /api/orgs) with required policy acceptance.

import { Alert, Button, ErrorMessage, Field, Input, Select } from "@client/components/ui";
import { api } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import { TagInput } from "@client/routes/org/settings/form-bits";
import { ORG_TYPE_LABELS } from "@client/routes/org/settings/labels";
import { ORG_TYPES, type OrgType } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { type FormEvent, useState } from "react";

export interface OrganizationValues {
  name: string;
  legalName: string;
  orgType: OrgType;
  city: string;
  state: string;
  websiteUrl: string;
  focusAreas: string[];
  serviceAreas: string[];
  acceptTerms: boolean;
}

type Errors = Partial<Record<keyof OrganizationValues, string>>;

export function validateOrganization(v: OrganizationValues): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = "Tell us what your organization is called.";
  if (!v.legalName.trim()) e.legalName = "Enter the legal name on your IRS or tribal records.";
  if (v.state && !/^[A-Za-z]{2}$/.test(v.state.trim()))
    e.state = "Use the two-letter code, e.g. NM.";
  if (v.websiteUrl.trim() && !/^(https?:\/\/)?[^\s.]+\.\S+$/.test(v.websiteUrl.trim()))
    e.websiteUrl = "That doesn't look like a web address.";
  if (!v.acceptTerms)
    e.acceptTerms =
      "Please agree to the Terms of Service, Privacy Policy and Data Use Policy to continue.";
  return e;
}

const normalizeUrl = (u: string) => {
  const s = u.trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

const EMPTY: OrganizationValues = {
  name: "",
  legalName: "",
  orgType: "nonprofit_501c3",
  city: "",
  state: "",
  websiteUrl: "",
  focusAreas: [],
  serviceAreas: [],
  acceptTerms: false,
};

export function OrganizationStep({ onCreated }: { onCreated: (orgId: string) => unknown }) {
  const [v, setV] = useState<OrganizationValues>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [legalTouched, setLegalTouched] = useState(false);
  const errors = submitted ? validateOrganization(v) : {};

  const create = useMutation({
    mutationFn: async (values: OrganizationValues) => {
      const { orgId } = await api<{ orgId: string }>("/api/orgs", {
        method: "POST",
        body: {
          name: values.name.trim(),
          legalName: values.legalName.trim(),
          orgType: values.orgType,
          city: values.city.trim() || undefined,
          state: values.state.trim().toUpperCase() || undefined,
          websiteUrl: normalizeUrl(values.websiteUrl),
          focusAreas: values.focusAreas,
          serviceAreas: values.serviceAreas,
          acceptTerms: true,
          policyVersion: POLICY_VERSION,
        },
      });
      return orgId;
    },
    onSuccess: (orgId) => onCreated(orgId),
  });

  const set = <K extends keyof OrganizationValues>(k: K, val: OrganizationValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateOrganization(v)).length > 0) return;
    create.mutate(v);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-label="Organization details">
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label="Organization name"
          htmlFor="org-name"
          error={errors.name}
          hint="The name people know you by."
        >
          <Input
            id="org-name"
            value={v.name}
            autoComplete="organization"
            aria-invalid={errors.name ? true : undefined}
            onChange={(e) => {
              const name = e.target.value;
              setV((prev) => ({ ...prev, name, legalName: legalTouched ? prev.legalName : name }));
            }}
            placeholder="Southwest Indian Foundation"
          />
        </Field>
        <Field
          label="Legal name"
          htmlFor="org-legal-name"
          error={errors.legalName}
          hint="Exactly as on your IRS determination letter or charter."
        >
          <Input
            id="org-legal-name"
            value={v.legalName}
            aria-invalid={errors.legalName ? true : undefined}
            onChange={(e) => {
              setLegalTouched(true);
              set("legalName", e.target.value);
            }}
          />
        </Field>
        <Field label="Type of organization" htmlFor="org-type">
          <Select
            id="org-type"
            value={v.orgType}
            onChange={(e) => set("orgType", e.target.value as OrgType)}
          >
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website (optional)" htmlFor="org-website" error={errors.websiteUrl}>
          <Input
            id="org-website"
            type="url"
            inputMode="url"
            value={v.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            placeholder="https://www.example.org"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3 md:col-span-2 md:grid-cols-6">
          <div className="col-span-2 md:col-span-4">
            <Field label="City" htmlFor="org-city">
              <Input
                id="org-city"
                value={v.city}
                autoComplete="address-level2"
                onChange={(e) => set("city", e.target.value)}
                placeholder="Gallup"
              />
            </Field>
          </div>
          <div className="col-span-1 md:col-span-2">
            <Field label="State" htmlFor="org-state" error={errors.state}>
              <Input
                id="org-state"
                value={v.state}
                maxLength={2}
                className="uppercase"
                autoComplete="address-level1"
                onChange={(e) => set("state", e.target.value)}
                placeholder="NM"
              />
            </Field>
          </div>
        </div>
        <Field
          label="What do you work on?"
          htmlFor="org-focus"
          hint="Press Enter after each, e.g. workforce development, construction trades."
        >
          <TagInput
            id="org-focus"
            value={v.focusAreas}
            onChange={(t) => set("focusAreas", t)}
            placeholder="Workforce development"
          />
        </Field>
        <Field
          label="Where do you serve?"
          htmlFor="org-areas"
          hint="Cities, counties, tribal nations or regions."
        >
          <TagInput
            id="org-areas"
            value={v.serviceAreas}
            onChange={(t) => set("serviceAreas", t)}
            placeholder="McKinley County, NM"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
        <div className="flex gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
          <div className="text-sm text-neutral-700">
            <p className="font-medium text-neutral-900">How we use your information</p>
            <p className="mt-1">
              Your documents are used only to draft your own applications. Never shared with other
              organizations, never used to train AI. You can export or delete everything at any
              time.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-start gap-3">
          <input
            id="accept-terms"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-neutral-300 accent-brand-600"
            checked={v.acceptTerms}
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-describedby={errors.acceptTerms ? "accept-terms-error" : undefined}
            onChange={(e) => set("acceptTerms", e.target.checked)}
          />
          <label htmlFor="accept-terms" className="text-sm text-neutral-700">
            I agree to the{" "}
            <a
              href={appPath("/legal/terms")}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 underline"
            >
              Terms of Service
            </a>
            ,{" "}
            <a
              href={appPath("/legal/privacy")}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 underline"
            >
              Privacy Policy
            </a>{" "}
            and{" "}
            <a
              href={appPath("/legal/data-use")}
              target="_blank"
              rel="noreferrer"
              className="text-brand-700 underline"
            >
              Data Use Policy
            </a>{" "}
            on behalf of my organization.
          </label>
        </div>
        {errors.acceptTerms && (
          <p id="accept-terms-error" role="alert" className="pl-7 text-sm text-danger-700">
            {errors.acceptTerms}
          </p>
        )}
      </div>

      {create.isError && <ErrorMessage error={create.error} />}
      {submitted && Object.keys(errors).length > 0 && !errors.acceptTerms && (
        <Alert tone="warning">Please fix the highlighted fields above.</Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={create.isPending}>
          Create organization
        </Button>
      </div>
    </form>
  );
}
