/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme';

const getInitialTheme = (): ThemeMode => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  return prefersDark ? 'dark' : 'light';
};

const applyThemeClass = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
};

export function ThemeProvider(props: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      theme,
      setTheme: (t) => setThemeState(t),
      toggleTheme: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    };
  }, [theme]);

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
