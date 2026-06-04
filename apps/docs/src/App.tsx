import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { VisionPage } from "./pages/VisionPage";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { MetricsPage } from "./pages/MetricsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { RoiPage } from "./pages/RoiPage";
import { BusinessPlanPage } from "./pages/BusinessPlanPage";
import { GtmPage } from "./pages/GtmPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DemoPage } from "./pages/DemoPage";
import { CommercialViabilityPage } from "./pages/CommercialViabilityPage";
import {
  CommercialViabilityReportPage,
  CommercialViabilityAssessmentPage,
  CommercialViabilityDeepAssessmentPage,
  CommercialViabilityDeepDive2026Page,
  CommercialViabilityDeepDivePage,
} from "./pages/commercial-viability";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/business-plan" element={<BusinessPlanPage />} />
      <Route path="/gtm" element={<GtmPage />} />
      <Route path="/roi" element={<RoiPage />} />
      <Route path="/priorities" element={<Navigate to="/roi" replace />} />
      <Route path="/vision" element={<VisionPage />} />
      <Route path="/architecture" element={<ArchitecturePage />} />
      <Route path="/metrics" element={<MetricsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/commercial-viability" element={<CommercialViabilityPage />} />
      <Route path="/commercial-viability/report" element={<CommercialViabilityReportPage />} />
      <Route path="/commercial-viability/assessment" element={<CommercialViabilityAssessmentPage />} />
      <Route path="/commercial-viability/deep-assessment" element={<CommercialViabilityDeepAssessmentPage />} />
      <Route path="/commercial-viability/deep-dive-2026" element={<CommercialViabilityDeepDive2026Page />} />
      <Route path="/commercial-viability/deep-dive" element={<CommercialViabilityDeepDivePage />} />
      {/* Legacy HTML routes → TSX equivalents */}
      <Route path="/reports/*" element={<Navigate to="/commercial-viability/report" replace />} />
      <Route path="/archive/*" element={<Navigate to="/commercial-viability" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
