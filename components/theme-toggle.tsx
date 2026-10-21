"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Theme lives as a `dark` class on <html>, set before paint by the inline
 * script in the root layout and remembered here.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const root = document.documentElement.classList;
    const next = !root.contains("dark");
    // `light` is not a Tailwind variant; the map primitive reads either class
    // to know the theme, so both must be explicit.
    root.toggle("dark", next);
    root.toggle("light", !next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode: the class still applies for this visit.
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="border-input bg-background hover:bg-accent focus-visible:ring-ring flex size-10 shrink-0 items-center justify-center rounded-md border transition active:scale-95 focus-visible:ring-2 focus-visible:outline-none"
    >
      {dark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
