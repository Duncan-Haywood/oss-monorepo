/**
 * @deprecated Import from `@/lib/brand` instead.
 * Re-exports for backward compatibility during migration.
 */
import { brand, legalEntityLine, marketingFooterLine, outreachSenderLine } from "./brand";

export const company = {
  legalName: brand.legalEntity,
  productName: brand.name,
  location: brand.legalLocation,
  postalAddress: brand.postalAddress,
  supportEmail: brand.supportEmail,
  emailFrom: brand.emailFrom,
} as const;

export { marketingFooterLine as legalFooterLine, legalEntityLine, outreachSenderLine };
