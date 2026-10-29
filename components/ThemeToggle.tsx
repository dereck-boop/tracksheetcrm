"use client";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/** Flips the staff app between dark and light, remembered on this device for a year. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next: Theme = theme === "dark" ? "light" : "dark";
  function flip() {
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.getElementById("qh-app")?.setAttribute("data-theme", next);
    setTheme(next);
  }
  return (
    <button type="button" onClick={flip} title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`} className="text-side-dim hover:text-side-bright">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
