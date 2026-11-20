/* global localStorage, document */
// Applies the saved theme before the first paint, so a dark-theme user never sees a light flash.
// Loaded as a blocking, same-origin script (no inline JS, so the default CSP allows it).
// Keep the storage key and values in sync with src/theme.ts.
(function () {
  try {
    var theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {
    // Storage blocked: follow the OS.
  }
})();
