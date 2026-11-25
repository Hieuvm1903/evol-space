import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { theme as antdTheme, type ThemeConfig } from "antd";

export type ThemeId = "evol" | "light" | "warm" | "hc-dark" | "hc-light";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  shortLabel: string;
  description: string;
  mode: "dark" | "light";
  highContrast: boolean;
  swatches: [string, string, string];
  navRingLine: string;
  navRingFinal: string;
  playerPanelBg: string;
  playerGlowColors: string[];
  pillTitleColor: string;
  antd: ThemeConfig;
}

export const THEME_STORAGE_KEY = "evol.theme";
const FONT_FAMILY = `"Be Vietnam Pro", sans-serif`;

export const THEMES: ThemeMeta[] = [
  {
    id: "evol",
    label: "EVOL Dark",
    shortLabel: "EVOL",
    description: "Cosmic dark",
    mode: "dark",
    highContrast: false,
    swatches: ["#07060f", "#14121f", "#8b6ff5"],
    navRingLine: "#432aff",
    navRingFinal: "#ffffff",
    playerPanelBg: "#120f17",
    playerGlowColors: ["#c084fc", "#f472b6", "#38bdf8"],
    pillTitleColor: "#f7f2e8",
    antd: {
      algorithm: antdTheme.darkAlgorithm,
      token: {
        colorPrimary: "#8b6ff5",
        colorInfo: "#22d3ee",
        colorBgContainer: "#14121f",
        colorBgElevated: "#1a1830",
        colorBorder: "#2a2740",
        colorTextBase: "#e8e6f5",
        borderRadius: 10,
        fontFamily: FONT_FAMILY,
      },
    },
  },
  {
    id: "light",
    label: "Daylight",
    shortLabel: "Light",
    description: "Crisp cool light",
    mode: "light",
    highContrast: false,
    swatches: ["#f4f6fb", "#ffffff", "#5b3df5"],
    navRingLine: "#5b3df5",
    navRingFinal: "#111024",
    playerPanelBg: "#ffffff",
    playerGlowColors: ["#6d4aff", "#0284c7", "#a855f7"],
    pillTitleColor: "#111024",
    antd: {
      algorithm: antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: "#5b3df5",
        colorInfo: "#0284c7",
        colorBgContainer: "#ffffff",
        colorBgElevated: "#ffffff",
        colorBorder: "#d7dcef",
        colorTextBase: "#111024",
        colorTextSecondary: "#4b486b",
        borderRadius: 10,
        fontFamily: FONT_FAMILY,
      },
    },
  },
  {
    id: "warm",
    label: "Warm Paper",
    shortLabel: "Paper",
    description: "Soft warm light",
    mode: "light",
    highContrast: false,
    swatches: ["#f6f2ea", "#fffdf8", "#4338ca"],
    navRingLine: "#4338ca",
    navRingFinal: "#1c1917",
    playerPanelBg: "#fffdf8",
    playerGlowColors: ["#4338ca", "#0f766e", "#d97706"],
    pillTitleColor: "#1c1917",
    antd: {
      algorithm: antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: "#4338ca",
        colorInfo: "#0f766e",
        colorBgContainer: "#fffdf8",
        colorBgElevated: "#fffdf8",
        colorBorder: "#dbd3c3",
        colorTextBase: "#1c1917",
        colorTextSecondary: "#57534e",
        borderRadius: 10,
        fontFamily: FONT_FAMILY,
      },
    },
  },
  {
    id: "hc-dark",
    label: "High Contrast Dark",
    shortLabel: "HC Dark",
    description: "WCAG AAA dark",
    mode: "dark",
    highContrast: true,
    swatches: ["#000000", "#0b0b0f", "#fde047"],
    navRingLine: "#fde047",
    navRingFinal: "#ffffff",
    playerPanelBg: "#0a0a0d",
    playerGlowColors: ["#fde047", "#38bdf8", "#ffffff"],
    pillTitleColor: "#ffffff",
    antd: {
      algorithm: antdTheme.darkAlgorithm,
      token: {
        colorPrimary: "#facc15",
        colorInfo: "#38bdf8",
        colorBgContainer: "#0a0a0d",
        colorBgElevated: "#121218",
        colorBorder: "#a1a1aa",
        colorTextBase: "#ffffff",
        colorTextSecondary: "#e4e4e7",
        borderRadius: 8,
        fontFamily: FONT_FAMILY,
      },
    },
  },
  {
    id: "hc-light",
    label: "High Contrast Light",
    shortLabel: "HC Light",
    description: "WCAG AAA light",
    mode: "light",
    highContrast: true,
    swatches: ["#ffffff", "#f8fafc", "#003ecb"],
    navRingLine: "#003ecb",
    navRingFinal: "#000000",
    playerPanelBg: "#ffffff",
    playerGlowColors: ["#003ecb", "#0f766e", "#1e293b"],
    pillTitleColor: "#000000",
    antd: {
      algorithm: antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: "#003ecb",
        colorInfo: "#0f766e",
        colorBgContainer: "#ffffff",
        colorBgElevated: "#ffffff",
        colorBorder: "#0f172a",
        colorTextBase: "#000000",
        colorTextSecondary: "#1e293b",
        borderRadius: 8,
        fontFamily: FONT_FAMILY,
      },
    },
  },
];

const THEME_MAP = new Map<ThemeId, ThemeMeta>(THEMES.map((t) => [t.id, t]));

export function isValidThemeId(val: unknown): val is ThemeId {
  return typeof val === "string" && THEME_MAP.has(val as ThemeId);
}

export function readStoredTheme(): ThemeId {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidThemeId(raw)) return raw;
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return "evol";
}

export function applyThemeToDocument(themeId: ThemeId) {
  const meta = THEME_MAP.get(themeId) ?? THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = meta.id;
  root.classList.toggle("dark", meta.mode === "dark");
  root.style.colorScheme = meta.mode;
}

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeMeta;
  themes: ThemeMeta[];
  setTheme: (id: ThemeId) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const initial = readStoredTheme();
    if (typeof document !== "undefined") applyThemeToDocument(initial);
    return initial;
  });

  useEffect(() => {
    applyThemeToDocument(themeId);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // Ignore storage quota/privacy errors
    }
  }, [themeId]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeId((curr) => {
      const idx = THEMES.findIndex((t) => t.id === curr);
      return THEMES[(idx + 1) % THEMES.length].id;
    });
  }, []);

  const theme = useMemo(() => THEME_MAP.get(themeId) ?? THEMES[0], [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, theme, themes: THEMES, setTheme, cycleTheme }),
    [themeId, theme, setTheme, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
