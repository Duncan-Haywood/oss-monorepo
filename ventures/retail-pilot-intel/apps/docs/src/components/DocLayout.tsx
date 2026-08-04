import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { clearDocsSession, isDocsGateEnabled } from "../auth/docsAuth";
import { DocHead } from "./DocHead";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/demo", label: "Sales demo" },
  { to: "/roi", label: "ROI & priorities" },
  { to: "/business-plan", label: "Business plan" },
  { to: "/commercial-viability", label: "Commercial viability" },
  { to: "/gtm", label: "GTM" },
  { to: "/vision", label: "Vision" },
  { to: "/architecture", label: "Architecture" },
  { to: "/metrics", label: "Metrics" },
  { to: "/privacy", label: "Privacy & GDPR" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/dashboard", label: "Dashboard" },
] as const;

export function DocLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="wrap">
      <DocHead title={title} description={subtitle} />
      <nav className="doc-nav" aria-label="Documentation">
        {links.map(({ to, label, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={"end" in rest ? rest.end : false}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            {label}
          </NavLink>
        ))}
        {isDocsGateEnabled() ? (
          <button
            type="button"
            className="doc-nav-signout"
            onClick={() => {
              clearDocsSession();
              window.location.reload();
            }}
          >
            Sign out
          </button>
        ) : null}
      </nav>
      <h1>{title}</h1>
      {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      <div
        className="prototype-notice-banner"
        style={{
          background: "#fffbe6",
          border: "1px solid #ffe58f",
          padding: "8px 12px",
          borderRadius: "4px",
          marginBottom: "16px",
          fontSize: "13px",
        }}
      >
        <strong>Prototype Disclosure:</strong> Retail Pilot Intel is an active prototype stage
        venture. All figures, ROI projections, and pilot metrics presented represent illustrative
        models and pilot estimates.
      </div>
      {children}
      {footer ? <footer>{footer}</footer> : null}
    </div>
  );
}
