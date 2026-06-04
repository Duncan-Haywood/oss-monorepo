import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

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
  { to: "/archive", label: "HTML archive" },
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
      </nav>
      <h1>{title}</h1>
      {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      {children}
      {footer ? <footer>{footer}</footer> : null}
    </div>
  );
}
