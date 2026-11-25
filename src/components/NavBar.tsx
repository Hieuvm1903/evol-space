import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, LogIn, Music2, Map as MapIcon, Camera, KeyRound, type LucideIcon, Hammer, Terminal, UserRound, Orbit } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import GalaxyRing from "./ImperfectCircle";
import ThemeSwitcher from "./ThemeSwitcher";

const NAV_ITEMS: { label: string; path: string; icon: LucideIcon }[] = [
  { label: "Home", path: "/", icon: Sparkles },
  { label: "Music", path: "/music", icon: Music2 },
  { label: "Map", path: "/map", icon: MapIcon },
  { label: "Photobooth", path: "/photobooth", icon: Camera },
  { label: "Blank", path: "/blank", icon: KeyRound },
  { label: "Work", path: "/work", icon: Hammer },
  { label: "ASCII 3D", path: "/ascii", icon: Terminal },
  { label: "3D", path: "/3d", icon: Orbit },
];

export function NavBar() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const items = [
    NAV_ITEMS[0], // Home
    user
      ? { label: "Profile", path: "/profile", icon: UserRound }
      : { label: "Login", path: "/login", icon: LogIn },
    ...NAV_ITEMS.slice(1),
  ];
  return (
    <nav className="navbar">
      <span className="navbar-brand">
        <Sparkles size={16} style={{ verticalAlign: -2, marginRight: 6, color: "var(--evol-green-light)" }} />
        <span aria-label="EVOL Space">
          <span aria-hidden="true">
            EV
            <span className="navbar-logo-o">
              <GalaxyRing
                trigger={`${location.pathname}-${theme.id}`}
                size={16}
                strokeWidth={2}
                minRadius={4.4}
                duration={2.2}
                glowBlur={1}
                lineColor={theme.navRingLine}
                finalColor={theme.navRingFinal}
                className="navbar-o-ring"
                showGlow={false}
              />
            </span>
            L Space
          </span>
        </span>
      </span>
      <div className="navbar-links">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path} className={location.pathname === item.path ? "active" : ""}>
              <Icon size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="navbar-actions">
        <ThemeSwitcher />
        {user && <span className="navbar-user">{user.name}</span>}
      </div>
    </nav>
  );
}