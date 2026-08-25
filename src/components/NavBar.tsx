import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// Mirrors config.MENU_OPTIONS from the Python app. Routes for pages not
// yet ported (Music, His-tory, Relax, Map, Photobooth, ???) point
// nowhere real yet — they'll light up as each step ports that page.
const NAV_ITEMS: { label: string; path: string }[] = [
  { label: "Home", path: "/" },
  { label: "Login", path: "/login" },
  { label: "Music", path: "/music" },
  { label: "His-tory", path: "/history" },
  { label: "Relax", path: "/relax" },
  { label: "???", path: "/secret" },
];

export function NavBar() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <nav className="navbar">
      <span className="navbar-brand">🌙 EVOL Space</span>
      <div className="navbar-links">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={location.pathname === item.path ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
      </div>
      {user && <span className="navbar-user">{user.username}</span>}
    </nav>
  );
}
