import React, { useState } from "react";
import { Popover } from "antd";
import { Check, ChevronDown, Contrast, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMeta } from "../contexts/ThemeContext";

function ThemeIcon({ theme, size = 14 }: { theme: ThemeMeta; size?: number }) {
  if (theme.highContrast) return <Contrast size={size} aria-hidden="true" />;
  return theme.mode === "light" ? (
    <Sun size={size} aria-hidden="true" />
  ) : (
    <Moon size={size} aria-hidden="true" />
  );
}

export function ThemeSwitcher({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { themeId, theme, themes, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const menu = (
    <div className="theme-menu" role="menu" aria-label="Color themes">
      <div className="theme-menu-heading">Appearance</div>
      <div className="theme-menu-list">
        {themes.map((t) => {
          const active = t.id === themeId;
          return (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              className={`theme-option${active ? " is-active" : ""}`}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <span className="theme-swatches" aria-hidden="true">
                {t.swatches.map((hex, i) => (
                  <span
                    key={i}
                    className="theme-swatch-dot"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
              <span className="theme-option-copy">
                <span className="theme-option-label">{t.label}</span>
                <span className="theme-option-desc">{t.description}</span>
              </span>
              {active && <Check size={14} className="theme-option-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      zIndex={1400}
      overlayClassName="theme-switcher-popover"
      content={menu}
    >
      <button
        type="button"
        className={`theme-trigger-btn${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`}
        aria-label={`Theme: ${theme.label}. Click to switch theme.`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Theme: ${theme.label}`}
      >
        <ThemeIcon theme={theme} size={14} />
        {!compact && <span className="theme-trigger-label">{theme.shortLabel}</span>}
        <ChevronDown size={12} className="theme-trigger-chev" aria-hidden="true" />
      </button>
    </Popover>
  );
}

export default ThemeSwitcher;
