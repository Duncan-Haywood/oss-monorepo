"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "pairwise_theme";

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // localStorage might throw in restricted contexts
  }
  return "system";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark" || (theme === "system" && getSystemTheme() === "dark");
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = getStoredTheme();
    const effective = stored === "system" ? getSystemTheme() : stored;
    applyTheme(stored);
    requestAnimationFrame(() => {
      setThemeState(stored);
      setResolvedTheme(effective);
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    function handleSystemChange() {
      if (theme === "system") {
        const effective = getSystemTheme();
        setResolvedTheme(effective);
        applyTheme("system");
      }
    }

    function handleStorageChange(e: StorageEvent) {
      if (e.key === THEME_STORAGE_KEY) {
        const newTheme = getStoredTheme();
        setThemeState(newTheme);
        const effective = newTheme === "system" ? getSystemTheme() : newTheme;
        setResolvedTheme(effective);
        applyTheme(newTheme);
      }
    }

    mediaQuery?.addEventListener?.("change", handleSystemChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      mediaQuery?.removeEventListener?.("change", handleSystemChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [theme, mounted]);

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    const effective = nextTheme === "system" ? getSystemTheme() : nextTheme;
    setResolvedTheme(effective);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore storage access errors
    }
    applyTheme(nextTheme);
  }

  function toggleTheme() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }

  return {
    theme,
    resolvedTheme,
    isDark: resolvedTheme === "dark",
    setTheme,
    toggleTheme,
    mounted,
  };
}
