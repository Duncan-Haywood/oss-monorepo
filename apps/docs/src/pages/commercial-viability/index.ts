import { CommercialViabilityReportPage } from "./CommercialViabilityReportPage";
import { CommercialViabilityAssessmentPage } from "./CommercialViabilityAssessmentPage";
import { CommercialViabilityDeepAssessmentPage } from "./CommercialViabilityDeepAssessmentPage";
import { CommercialViabilityDeepDive2026Page } from "./CommercialViabilityDeepDive2026Page";
import { CommercialViabilityDeepDivePage } from "./CommercialViabilityDeepDivePage";

export {
  CommercialViabilityReportPage,
  CommercialViabilityAssessmentPage,
  CommercialViabilityDeepAssessmentPage,
  CommercialViabilityDeepDive2026Page,
  CommercialViabilityDeepDivePage,
};

export const commercialViabilityPages = [
  {
    "slug": "report",
    "title": "Commercial Viability Assessment",
    "exportName": "CommercialViabilityReportPage"
  },
  {
    "slug": "assessment",
    "title": "Commercial Viability Assessment",
    "exportName": "CommercialViabilityAssessmentPage"
  },
  {
    "slug": "deep-assessment",
    "title": "Commercial Viability Deep Assessment",
    "exportName": "CommercialViabilityDeepAssessmentPage"
  },
  {
    "slug": "deep-dive-2026",
    "title": "Commercial Viability Deep Dive — Retail Pilot Intel (2026)",
    "exportName": "CommercialViabilityDeepDive2026Page"
  },
  {
    "slug": "deep-dive",
    "title": "Deep Commercial Viability Assessment",
    "exportName": "CommercialViabilityDeepDivePage"
  }
] as const;
