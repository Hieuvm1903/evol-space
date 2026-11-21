export type WorldNodeId =
  | "home"
  | "music"
  | "map"
  | "photobooth"
  | "work"
  | "ascii"
  | "blank"
  | "profile";

export interface WorldRouteNode {
  id: WorldNodeId;
  label: string;
  path: string;
  subtitle: string;
  accentHex: string;
  position: [number, number, number];
  /** Radial angle on the plaza (radians), null for center dais */
  angle: number | null;
}

export function buildWorldNodes(isAuthenticated: boolean, username?: string): WorldRouteNode[] {
  const ringRadius = 11.2;
  const outerSpecs: Array<Omit<WorldRouteNode, "position" | "angle">> = [
    {
      id: "music",
      label: "Music",
      path: "/music",
      subtitle: "Playlists & player",
      accentHex: "#8b6ff5",
    },
    {
      id: "map",
      label: "Map",
      path: "/map",
      subtitle: "Atlas & saved places",
      accentHex: "#22d3ee",
    },
    {
      id: "photobooth",
      label: "Photobooth",
      path: "/photobooth",
      subtitle: "Camera & filters",
      accentHex: "#e879f9",
    },
    {
      id: "work",
      label: "Work",
      path: "/work",
      subtitle: "3D robotics studio",
      accentHex: "#38bdf8",
    },
    {
      id: "ascii",
      label: "ASCII 3D",
      path: "/ascii",
      subtitle: "Orbital trench shader",
      accentHex: "#34d399",
    },
    {
      id: "blank",
      label: "Blank",
      path: "/blank",
      subtitle: "Vault & notes",
      accentHex: "#f59e0b",
    },
    {
      id: "profile",
      label: isAuthenticated ? "Profile" : "Login",
      path: isAuthenticated ? "/profile" : "/login",
      subtitle: isAuthenticated && username ? `@${username}` : "Account access",
      accentHex: "#a78bfa",
    },
  ];

  const nodes: WorldRouteNode[] = [
    {
      id: "home",
      label: "Home",
      path: "/",
      subtitle: "EVOL Space hub",
      accentHex: "#22d3ee",
      position: [0, 0, 0],
      angle: null,
    },
  ];

  const count = outerSpecs.length;
  // Arrange in a balanced ring starting from front-right clockwise so all 7 are visible from hero camera
  const startAngle = -Math.PI * 0.68;
  outerSpecs.forEach((spec, idx) => {
    const angle = startAngle + (idx / count) * Math.PI * 2;
    const x = Math.cos(angle) * ringRadius;
    const z = Math.sin(angle) * ringRadius;
    nodes.push({
      ...spec,
      position: [x, 0, z],
      angle,
    });
  });

  return nodes;
}
