import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, LogIn, Music2, Clock, Wind, Map as MapIcon, Camera, KeyRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS: { label: string; path: string; icon: React.ElementType }[] = [
  { label: "Home", path: "/", icon: Sparkles },
  { label: "Login", path: "/login", icon: LogIn },
  { label: "Music", path: "/music", icon: Music2 },
  { label: "His-tory", path: "/history", icon: Clock },
  { label: "Relax", path: "/relax", icon: Wind },
  { label: "Map", path: "/map", icon: MapIcon },
  { label: "Photobooth", path: "/photobooth", icon: Camera },
  { label: "???", path: "/secret", icon: KeyRound },
  { label: "Blank", path: "/blank", icon: KeyRound },
];

export function NavBar() {
  const { user } = useAuth();
  const location = useLocation();

  return (
    <nav className="navbar">
      <span className="navbar-brand">
        <Sparkles size={16} style={{ verticalAlign: -2, marginRight: 6, color: "#22d3ee" }} />
        EVOL Space
      </span>
      <div className="navbar-links">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={location.pathname === item.path ? "active" : ""}
            >
              <Icon size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              {item.label}
            </Link>
          );
        })}
      </div>
      {user && <span className="navbar-user">{user.username}</span>}
    </nav>
  );
}