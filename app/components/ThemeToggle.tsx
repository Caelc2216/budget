"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "budget:theme";

export default function ThemeToggle() {
  // Mirrors whatever the anti-flash inline script (in layout.tsx) already
  // applied to <html> before hydration, so this doesn't cause a flash itself.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setTheme(stored === "light" || stored === "dark" ? stored : null);
  }, []);

  function toggle() {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (systemDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }

  const systemDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === null && systemDark);

  return (
    <button
      className="icon theme-toggle"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
