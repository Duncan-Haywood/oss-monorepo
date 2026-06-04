import { NavLink } from "react-router-dom";
import { commercialViabilityPages } from "../pages/commercial-viability";

export function CommercialViabilitySubnav() {
  return (
    <nav className="cv-subnav" aria-label="Commercial viability reports">
      <NavLink
        to="/commercial-viability"
        end
        className={({ isActive }) => (isActive ? "active" : undefined)}
      >
        Hub
      </NavLink>
      {commercialViabilityPages.map((page) => (
        <NavLink
          key={page.slug}
          to={`/commercial-viability/${page.slug}`}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {page.title.replace(/ — Retail Pilot Intel.*$/i, "").replace(/ \(2026\)$/, "")}
        </NavLink>
      ))}
    </nav>
  );
}
