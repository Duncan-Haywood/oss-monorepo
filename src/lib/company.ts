/**
 * @deprecated Import from `@/lib/brand` instead.
 * Re-exports for backward compatibility during migration.
 */
import { brand, legalEntityLine, marketingFooterLine, outreachSenderLine } from "./brand";

export const company = {
  get legalName(): string {
    return brand.legalEntity;
  },
  get productName(): string {
    return brand.name;
  },
  get location(): string {
    return brand.legalLocation;
  },
  get postalAddress(): string {
    return brand.postalAddress;
  },
  get supportEmail(): string {
    return brand.supportEmail;
  },
  get emailFrom(): string {
    return brand.emailFrom;
  },
} as const;

export { marketingFooterLine as legalFooterLine, legalEntityLine, outreachSenderLine };
