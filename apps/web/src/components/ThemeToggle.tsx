import { useState, type ReactNode } from "react";
import { applyTheme, loadTheme, saveTheme, type Theme } from "../theme";

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const options: { value: Theme; label: string; icon: ReactNode }[] = [
  {
    value: "system",
    label: "System",
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>,
    ),
  },
  {
    value: "light",
    label: "Light",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>,
    ),
  },
  { value: "dark", label: "Dark", icon: icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />) },
];

/** System / Light / Dark switch shown in the page header. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => choose(o.value)}
          className={`px-2 py-1 ${theme === o.value ? "bg-surface-muted text-fg" : "hover:bg-surface-hover"}`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
