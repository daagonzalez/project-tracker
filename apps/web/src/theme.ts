/** The user's theme choice; "system" follows the OS colour scheme. */
export type Theme = "system" | "light" | "dark";

// Keep in sync with public/theme-init.js, which applies the saved theme before first paint.
const STORAGE_KEY = "theme";

/** The saved choice, or "system" when nothing valid is saved or storage is unavailable. */
export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice for the next visit; silently skipped when storage is unavailable. */
export function saveTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** Pins the page to a theme, or lets it follow the OS when the choice is "system". */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
